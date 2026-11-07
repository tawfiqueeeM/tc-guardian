/**
 * TC Guardian - Content Script (Vanilla JS)
 * Developer B: T&C Detection, Pre-Fetcher, Shadow DOM Pop-up UI & Preference Engine
 */

(function () {
  'use strict';

  // Guard against multiple injections
  if (window.__TC_GUARDIAN_INITIALIZED__) {
    return;
  }
  window.__TC_GUARDIAN_INITIALIZED__ = true;

  // Constants
  const STORAGE_KEYS = {
    USER_PROFILE: 'tc_guardian_userProfile',
    SITE_OVERRIDES: 'tc_guardian_siteOverrides',
    ANALYSIS_CACHE: 'tc_guardian_analysis_cache'
  };

  const CATEGORIES = [
    'DATA_SALE',
    'AI_TRAINING',
    'AUTO_RENEW',
    'NO_DELETE',
    'WAIVE_RIGHTS'
  ];

  const HIGH_RISK_CATEGORIES = ['DATA_SALE', 'WAIVE_RIGHTS'];
  const MEDIUM_LOW_RISK_CATEGORIES = ['AI_TRAINING', 'AUTO_RENEW', 'NO_DELETE'];

  const CATEGORY_MATCHERS = {
    DATA_SALE: /sell|broker|third party|commercialize|monetiz/i,
    AI_TRAINING: /train|artificial intelligence|machine learning|neural network|large language model/i,
    AUTO_RENEW: /renew|subscription|\$99|recurring|refund|cancel/i,
    NO_DELETE: /retain|delete|indefinitely|archive|preserv/i,
    WAIVE_RIGHTS: /arbitration|waive|class action|jury trial|dispute/i
  };

  const CATEGORY_META = {
    DATA_SALE: {
      name: 'Data Sale & Third-Party Sharing',
      question: 'Do you want to allow Data Sale / Third-Party Sharing?',
      icon: '📊',
      riskLevel: 'HIGH',
      defaultSummary: 'Sells or shares your personal identity, browsing telemetry, and behavior with third-party ad brokers and marketing syndicates.'
    },
    AI_TRAINING: {
      name: 'AI Model Training',
      question: 'Do you want to allow AI Model Training on Your Data?',
      icon: '🤖',
      riskLevel: 'MEDIUM',
      defaultSummary: 'Uses your uploaded content, documents, prompts, and assets to train generative AI and machine learning models without opt-out.'
    },
    AUTO_RENEW: {
      name: 'Auto-Renewal & Recurring Billing',
      question: 'Do you accept Auto-Renewal / Non-Refundable Billing?',
      icon: '💳',
      riskLevel: 'MEDIUM',
      defaultSummary: 'Automatically renews subscriptions with recurring billing and enforces strict non-refundable terms upon renewal.'
    },
    NO_DELETE: {
      name: 'Indefinite Data Retention',
      question: 'Do you allow Indefinite Retention After Account Deletion?',
      icon: '🗄️',
      riskLevel: 'LOW',
      defaultSummary: 'Retains your personal records, database logs, and telemetry indefinitely even after you request account deletion.'
    },
    WAIVE_RIGHTS: {
      name: 'Mandatory Arbitration & Class Action Waiver',
      question: 'Do you agree to Mandatory Arbitration & Rights Waiver?',
      icon: '⚖️',
      riskLevel: 'HIGH',
      defaultSummary: 'Forces dispute resolution via private binding arbitration and strips your legal rights to jury trial or class action participation.'
    }
  };

  const HIGH_RISK_REGEX = /arbitration|third party|sell|broker|train|artificial intelligence|machine learning|renew|cancel|refund|retain|delete|waive|class action/i;
  const TERMS_REGEX = /terms|privacy|tos|conditions|legal/i;

  // State
  let analysisData = null;
  let sourceClauses = {};
  let isMinimized = false;
  let shadowRoot = null;
  const currentDomain = (window.location.hostname || 'localhost').replace(/^www\./, '');

  /**
   * Safe Storage Adapter: Supports chrome.storage.local with localStorage fallback
   */
  function getDefaultProfile() {
    return {
      DATA_SALE: { yes: 0, no: 0 },
      AI_TRAINING: { yes: 0, no: 0 },
      AUTO_RENEW: { yes: 0, no: 0 },
      NO_DELETE: { yes: 0, no: 0 },
      WAIVE_RIGHTS: { yes: 0, no: 0 }
    };
  }

  function getStorageData() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.get([STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.SITE_OVERRIDES], (res) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              console.warn('[TC-Guardian] Storage read error, using fallback:', chrome.runtime.lastError);
              resolve(getFromLocalStorage());
            } else {
              resolve(normalizeStorage(res));
            }
          });
          return;
        } catch (e) {
          console.warn('[TC-Guardian] chrome.storage.local failed, falling back to localStorage:', e);
        }
      }
      resolve(getFromLocalStorage());
    });
  }

  function getFromLocalStorage() {
    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_PROFILE));
      const o = JSON.parse(localStorage.getItem(STORAGE_KEYS.SITE_OVERRIDES));
      return normalizeStorage({ [STORAGE_KEYS.USER_PROFILE]: p, [STORAGE_KEYS.SITE_OVERRIDES]: o });
    } catch (e) {
      return { profile: getDefaultProfile(), overrides: {} };
    }
  }

  function normalizeStorage(raw) {
    const defaultProf = getDefaultProfile();
    const rawProfile = (raw && raw[STORAGE_KEYS.USER_PROFILE]) || {};
    const profile = {};

    CATEGORIES.forEach((cat) => {
      profile[cat] = {
        yes: Number((rawProfile[cat] && rawProfile[cat].yes) || defaultProf[cat].yes) || 0,
        no: Number((rawProfile[cat] && rawProfile[cat].no) || defaultProf[cat].no) || 0
      };
    });

    const overrides = (raw && raw[STORAGE_KEYS.SITE_OVERRIDES]) || {};
    return { profile, overrides };
  }

  function saveStorageData(profile, overrides) {
    return new Promise((resolve) => {
      // Always sync to localStorage as well for standalone resiliency
      try {
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
        localStorage.setItem(STORAGE_KEYS.SITE_OVERRIDES, JSON.stringify(overrides));
      } catch (e) {
        // localStorage might fail if quota exceeded
      }

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.set({
            [STORAGE_KEYS.USER_PROFILE]: profile,
            [STORAGE_KEYS.SITE_OVERRIDES]: overrides
          }, () => {
            resolve();
          });
          return;
        } catch (e) {
          console.warn('[TC-Guardian] chrome.storage.local save failed:', e);
        }
      }
      resolve();
    });
  }

  /**
   * Cache Invalidation:
   * Clears cached analysis results on page load so new sites or navigations
   * trigger fresh, site-specific API evaluations instead of holding stale state.
   * Explicitly preserves user preference history and per-site overrides.
   */
  function clearCachedAnalysis() {
    try {
      const localKeysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          key !== STORAGE_KEYS.USER_PROFILE &&
          key !== STORAGE_KEYS.SITE_OVERRIDES &&
          (key.startsWith('tc_guardian_analysis') ||
           key.startsWith('tc_analysis') ||
           key.startsWith('tc_cache_') ||
           key === 'tc_guardian_cache')
        ) {
          localKeysToRemove.push(key);
        }
      }
      localKeysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      // Ignore localStorage errors
    }

    try {
      const sessionKeysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (
          key &&
          (key.startsWith('tc_guardian_analysis') ||
           key.startsWith('tc_analysis') ||
           key.startsWith('tc_cache_') ||
           key === 'tc_guardian_cache')
        ) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {
      // Ignore sessionStorage errors
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get(null, (items) => {
          if (!items) return;
          const chromeKeysToRemove = Object.keys(items).filter(
            (k) =>
              k !== STORAGE_KEYS.USER_PROFILE &&
              k !== STORAGE_KEYS.SITE_OVERRIDES &&
              (k.startsWith('tc_guardian_analysis') ||
               k.startsWith('tc_analysis') ||
               k.startsWith('tc_cache_') ||
               k === 'tc_guardian_cache')
          );
          if (chromeKeysToRemove.length > 0) {
            chrome.storage.local.remove(chromeKeysToRemove);
          }
        });
      } catch (e) {
        // Ignore chrome.storage errors
      }
    }
  }

  /**
   * Status Logic calculation according to Step 1.3
   */
  function calculateStatus(categoryKey, domain, profile, overrides) {
    const domainOverrides = (overrides && overrides[domain]) || {};

    // 1. Site override check
    if (Object.prototype.hasOwnProperty.call(domainOverrides, categoryKey)) {
      const isYes = Boolean(domainOverrides[categoryKey]);
      return {
        code: isYes ? 'OVERRIDE_YES' : 'OVERRIDE_NO',
        badgeText: isYes ? 'Site Override: Accepted (YES)' : 'Site Override: Rejected (NO)',
        badgeType: isYes ? 'override-yes' : 'override-no',
        overrideValue: isYes
      };
    }

    const catStats = (profile && profile[categoryKey]) || { yes: 0, no: 0 };
    const yes = Number(catStats.yes) || 0;
    const no = Number(catStats.no) || 0;
    const total = yes + no;

    // 2. ASSUMED_YES: yes >= 3 AND yes / (yes + no) >= 0.75
    if (total > 0 && yes >= 3 && (yes / total) >= 0.75) {
      return {
        code: 'ASSUMED_YES',
        badgeText: `Auto-Assumed YES based on your behavior (Accepted ${yes} times)`,
        badgeType: 'assumed-yes',
        overrideValue: null
      };
    }

    // 3. DEALBREAKER: no >= 2 AND no / (yes + no) >= 0.60
    if (total > 0 && no >= 2 && (no / total) >= 0.60) {
      return {
        code: 'DEALBREAKER',
        badgeText: '⚠️ DEALBREAKER — You normally reject this',
        badgeType: 'dealbreaker',
        overrideValue: null
      };
    }

    // 4. Default: NEW_QUESTION
    return {
      code: 'NEW_QUESTION',
      badgeText: 'Important Question — Needs Your Answer',
      badgeType: 'new-question',
      overrideValue: null
    };
  }

  /**
   * Detection & Background Pre-Fetcher
   */
  function isTermsPage() {
    const url = window.location.href;
    const title = document.title || '';
    const textLen = (document.body && (document.body.innerText || document.body.textContent || '').trim().length) || 0;
    const isNameMatch = TERMS_REGEX.test(url) || TERMS_REGEX.test(title);
    return isNameMatch && textLen > 1000;
  }

  function findTermsLink() {
    const links = Array.from(document.querySelectorAll('a'));
    for (const a of links) {
      const text = (a.textContent || '').trim();
      const href = a.getAttribute('href') || '';
      if (TERMS_REGEX.test(text) || TERMS_REGEX.test(href)) {
        return a.href;
      }
    }
    return null;
  }

  async function fetchTermsUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Strip non-content scripts & headers
      doc.querySelectorAll('script, style, noscript, svg, nav, footer, header').forEach(el => el.remove());

      return (doc.body ? (doc.body.innerText || doc.body.textContent) : '') || '';
    } catch (err) {
      console.warn('[TC-Guardian] Pre-fetch failed for:', url, err);
      return null;
    }
  }

  function filterHighRiskText(rawText) {
    if (!rawText) return '';
    const paragraphs = rawText.split(/\n\s*\n|\r\n\s*\r\n/);
    const matchedBlocks = [];
    let currentLength = 0;
    const MAX_LENGTH = 12000;

    for (let p of paragraphs) {
      p = p.replace(/\s+/g, ' ').trim();
      if (!p || p.length < 25) continue;

      if (HIGH_RISK_REGEX.test(p)) {
        if (currentLength + p.length > MAX_LENGTH) {
          const room = MAX_LENGTH - currentLength;
          if (room > 100) {
            matchedBlocks.push(p.slice(0, room) + '...');
          }
          break;
        }
        matchedBlocks.push(p);
        currentLength += p.length + 2;
      }
    }

    if (matchedBlocks.length > 0) {
      return matchedBlocks.join('\n\n');
    }

    // Fallback: Return raw text up to limit if no paragraphs matched specific keyword regex
    return rawText.slice(0, MAX_LENGTH);
  }

  /**
   * Source Text Reference Extraction & DOM Highlighting
   */
  function extractSourceClauses(text) {
    const map = {};
    if (!text) return map;
    const blocks = text.split(/\n\s*\n|\r\n\s*\r\n/);

    CATEGORIES.forEach((catKey) => {
      const matcher = CATEGORY_MATCHERS[catKey];
      if (!matcher) return;
      for (const b of blocks) {
        const clean = b.replace(/\s+/g, ' ').trim();
        if (clean.length >= 25 && matcher.test(clean)) {
          map[catKey] = clean;
          break;
        }
      }
    });

    return map;
  }

  function findDomElementForCategory(catKey) {
    const matcher = CATEGORY_MATCHERS[catKey];
    if (!matcher) return null;

    // Search document for matching paragraph or container (excluding our Shadow DOM host)
    const elements = Array.from(document.querySelectorAll('.flag-clause, p, li, blockquote, div'));
    for (const el of elements) {
      if (el.closest('#tc-guardian-host')) continue;
      const txt = el.innerText || el.textContent || '';
      if (txt.length >= 30 && txt.length <= 1600 && matcher.test(txt)) {
        return el;
      }
    }
    return null;
  }

  function flashHighlightElement(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const prevBg = element.style.backgroundColor;
    const prevShadow = element.style.boxShadow;
    const prevRadius = element.style.borderRadius;
    const prevTransition = element.style.transition;

    element.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease';
    element.style.backgroundColor = 'rgba(250, 204, 21, 0.45)'; // Flash yellow highlight
    element.style.boxShadow = '0 0 0 5px rgba(250, 204, 21, 0.7)';
    element.style.borderRadius = '6px';

    setTimeout(() => {
      element.style.backgroundColor = prevBg;
      element.style.boxShadow = prevShadow;
      element.style.borderRadius = prevRadius;
      setTimeout(() => {
        element.style.transition = prevTransition;
      }, 350);
    }, 2200);
  }

  /**
   * Message Passing & Standalone Fallback
   */
  async function requestAnalysis(filteredText, domain) {
    const payload = {
      action: 'ANALYZE_TC',
      text: filteredText,
      domain: domain
    };

    // Try chrome.runtime.sendMessage if available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const sendPromise = new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(payload, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'runtime.lastError'));
              } else if (!response) {
                reject(new Error('Null response from background script'));
              } else {
                resolve(response);
              }
            });
          } catch (e) {
            reject(e);
          }
        });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout waiting for background response')), 2500);
        });

        const result = await Promise.race([sendPromise, timeoutPromise]);
        if (result && (result.data || result.categories || result.analysis)) {
          return normalizeAnalysisResult(result);
        }
      } catch (err) {
        console.info('[TC-Guardian] Falling back to local standalone analyzer:', err.message || err);
      }
    }

    // Local Standalone Mock Fallback
    return generateLocalMockResponse(filteredText);
  }

  /**
   * Subscription Cancellation Guides Helper
   * Provides step-by-step instructions and direct settings links for popular subscription domains.
   */
  function getDefaultCancellationGuide(domain = '') {
    const cleanDomain = String(domain || currentDomain || 'current site').toLowerCase().replace(/^www\./, '');
    const known = {
      'netflix.com': {
        domain: 'netflix.com',
        url: 'https://www.netflix.com/youraccount',
        steps: [
          'Go to your Netflix Account page (netflix.com/youraccount)',
          'Under the "Membership & Billing" section, click "Cancel Membership"',
          'Select "Finish Cancellation" to confirm and stop recurring billing'
        ]
      },
      'spotify.com': {
        domain: 'spotify.com',
        url: 'https://www.spotify.com/account/overview/',
        steps: [
          'Log in to your Spotify Account page',
          'Scroll down to "Your plan" and click "Change plan"',
          'Scroll to "Cancel Spotify" and click "Cancel Premium"'
        ]
      },
      'adobe.com': {
        domain: 'adobe.com',
        url: 'https://account.adobe.com/plans',
        steps: [
          'Sign in to account.adobe.com/plans',
          'Select "Manage plan" for your subscription',
          'Choose "Cancel your plan" and complete the cancellation steps'
        ]
      },
      'amazon.com': {
        domain: 'amazon.com',
        url: 'https://www.amazon.com/mc/manage',
        steps: [
          'Go to Amazon Account -> "Your Memberships & Subscriptions"',
          'Select "Manage Subscription" next to the recurring service',
          'Click "End Subscription" and follow the confirmation prompts'
        ]
      },
      'quora.com': {
        domain: 'quora.com',
        url: 'https://www.quora.com/settings/subscription',
        steps: [
          'Navigate to your Quora profile settings -> "Subscriptions"',
          'Find Quora+ subscription and click "Cancel Subscription"',
          'Follow the prompts to stop recurring charges'
        ]
      },
      'reddit.com': {
        domain: 'reddit.com',
        url: 'https://www.reddit.com/settings/premium',
        steps: [
          'Go to Reddit User Settings -> "Subscriptions"',
          'Under Reddit Premium, click "Manage Subscription"',
          'Click "Cancel" to deactivate recurring auto-renewal'
        ]
      }
    };

    for (const [k, g] of Object.entries(known)) {
      if (cleanDomain === k || cleanDomain.endsWith('.' + k)) {
        return { ...g };
      }
    }

    return {
      domain: cleanDomain || 'this service',
      url: cleanDomain && cleanDomain !== 'localhost' ? `https://${cleanDomain}` : null,
      steps: [
        'Locate your Profile or Avatar icon in the top navigation bar',
        'Go to "Account Settings", "Billing", or "Subscriptions"',
        'Look for "Manage Plan", "Auto-Renew", or "Payment Methods"',
        'Select "Cancel Subscription" or toggle off "Auto-Renew" before your next billing cycle'
      ]
    };
  }

  function generateLocalMockResponse(text) {
    const hasDataSale = /sell|broker|third party/i.test(text);
    const hasAiTraining = /train|artificial intelligence|machine learning/i.test(text);
    const hasAutoRenew = /renew|cancel|refund/i.test(text);
    const hasNoDelete = /retain|delete/i.test(text);
    const hasWaiveRights = /arbitration|waive|class action/i.test(text);

    return {
      success: true,
      engine: 'Keyword Heuristic (Standalone Fallback)',
      categories: {
        DATA_SALE: {
          present: hasDataSale,
          summary: 'Sells or discloses your behavioral telemetry and profile to commercial third-party data brokers and marketing networks.',
          shortSummary: 'Shares personal telemetry and data with third-party advertising brokers.',
          snippet: hasDataSale ? 'We may share or sell collected browsing data with third-party advertising partners.' : ''
        },
        AI_TRAINING: {
          present: hasAiTraining,
          summary: 'Grants an irrevocable license to train proprietary artificial intelligence and neural network models using your uploads and prompts.',
          shortSummary: 'Uses uploaded files, text, and user data to train AI and machine learning models.',
          snippet: hasAiTraining ? 'User submissions and interactions may be used to train and refine AI and machine learning systems.' : ''
        },
        AUTO_RENEW: {
          present: hasAutoRenew,
          summary: 'Enforces automatic recurring subscription renewals ($99/mo) accompanied by strict non-refundable cancellation terms.',
          shortSummary: 'Subscriptions renew automatically with non-refundable recurring billing terms.',
          snippet: hasAutoRenew ? 'Subscription terms automatically renew each billing period and fees are strictly non-refundable.' : '',
          cancellationGuide: hasAutoRenew ? getDefaultCancellationGuide(currentDomain) : null
        },
        NO_DELETE: {
          present: hasNoDelete,
          summary: 'Preserves customer data and activity logs indefinitely in persistent archives even after explicit account deletion requests.',
          shortSummary: 'Retains your activity logs and account data indefinitely even after deletion.',
          snippet: hasNoDelete ? 'We retain personal records and database logs indefinitely following account deletion.' : ''
        },
        WAIVE_RIGHTS: {
          present: hasWaiveRights,
          summary: 'Mandates individual binding arbitration and forces you to waive all rights to trial by jury and class action participation.',
          shortSummary: 'Mandates binding dispute arbitration and waives your rights to jury trials or class actions.',
          snippet: hasWaiveRights ? 'Disputes are resolved exclusively by binding arbitration; class actions and jury trials are waived.' : ''
        }
      }
    };
  }

  function normalizeAnalysisResult(raw) {
    const engine = raw.engine || 'AI Engine';
    const categoriesSource = raw.data || raw.categories || raw.analysis || {};
    const normalized = {};

    CATEGORIES.forEach((catKey) => {
      let catData = null;
      if (Array.isArray(categoriesSource)) {
        catData = categoriesSource.find(item => item.id === catKey || item.category === catKey);
      } else {
        catData = categoriesSource[catKey];
      }

      if (catData) {
        const isPresent = Boolean(catData.present);
        normalized[catKey] = {
          present: isPresent,
          summary: catData.summary || CATEGORY_META[catKey].defaultSummary,
          shortSummary: catData.shortSummary || catData.summary || CATEGORY_META[catKey].defaultSummary,
          snippet: catData.snippet || '',
          cancellationGuide: catData.cancellationGuide || (catKey === 'AUTO_RENEW' && isPresent ? getDefaultCancellationGuide(currentDomain) : null)
        };
      } else {
        normalized[catKey] = {
          present: false,
          summary: CATEGORY_META[catKey].defaultSummary,
          shortSummary: '',
          snippet: '',
          cancellationGuide: null
        };
      }
    });

    return {
      engine,
      categories: normalized
    };
  }

  /**
   * Shadow DOM UI Injection & Management
   */
  function ensureShadowRoot() {
    const HOST_ID = 'tc-guardian-host';
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      (document.body || document.documentElement).appendChild(host);
    }
    if (!shadowRoot) {
      shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
    }
    return shadowRoot;
  }

  function getCSS() {
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        color: #f8fafc;
        line-height: 1.5;
        box-sizing: border-box;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      .tc-widget {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 440px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px);
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 14px;
        box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: tc-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(12px);
      }

      @keyframes tc-slide-in {
        from {
          opacity: 0;
          transform: translateY(-16px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* Minimized Floating Bubble */
      .tc-bubble {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #3b82f6;
        border-radius: 30px;
        padding: 8px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        font-weight: 600;
        font-size: 13px;
        transition: transform 0.15s ease, background 0.15s ease;
      }

      .tc-bubble:hover {
        transform: translateY(-2px);
        background: #1e293b;
      }

      .tc-bubble-dealbreaker {
        border-color: #ef4444;
        animation: pulse-danger 2s infinite;
      }

      @keyframes pulse-danger {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
      }

      /* Header */
      .tc-header {
        padding: 14px 18px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .tc-header-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .tc-logo-badge {
        background: #3b82f6;
        color: #ffffff;
        font-weight: 700;
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 6px;
        letter-spacing: 0.5px;
      }

      .tc-title {
        font-size: 15px;
        font-weight: 700;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tc-domain-tag {
        font-size: 11px;
        color: #94a3b8;
        background: #0f172a;
        padding: 2px 8px;
        border-radius: 4px;
        border: 1px solid #334155;
        font-family: monospace;
      }

      .tc-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tc-icon-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: background 0.15s, color 0.15s;
      }

      .tc-icon-btn:hover {
        background: #334155;
        color: #f8fafc;
      }

      /* Card List */
      .tc-body {
        padding: 14px 18px;
        overflow-y: auto;
        max-height: calc(100vh - 160px);
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .tc-body::-webkit-scrollbar {
        width: 6px;
      }

      .tc-body::-webkit-scrollbar-track {
        background: #0f172a;
      }

      .tc-body::-webkit-scrollbar-thumb {
        background: #334155;
        border-radius: 3px;
      }

      /* Card */
      .tc-card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 14px 16px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .tc-card-dealbreaker {
        border-color: #ef4444;
        background: rgba(239, 68, 68, 0.05);
      }

      .tc-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }

      .tc-card-question {
        font-size: 13.5px;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.4;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .tc-cat-icon {
        font-size: 16px;
        line-height: 1.2;
        flex-shrink: 0;
      }

      .tc-risk-pill {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.5px;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        flex-shrink: 0;
      }

      .tc-risk-pill.risk-high {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.4);
      }

      .tc-risk-pill.risk-med {
        background: rgba(245, 158, 11, 0.2);
        color: #fde68a;
        border: 1px solid rgba(245, 158, 11, 0.35);
      }

      .tc-risk-pill.risk-low {
        background: rgba(59, 130, 246, 0.2);
        color: #93c5fd;
        border: 1px solid rgba(59, 130, 246, 0.35);
      }

      .tc-card-summary {
        font-size: 12px;
        color: #cbd5e1;
        line-height: 1.55;
        margin-bottom: 12px;
        background: rgba(15, 23, 42, 0.6);
        padding: 8px 10px;
        border-radius: 6px;
        border-left: 3px solid #3b82f6;
      }

      /* Stat Line */
      .tc-card-statline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
        margin-bottom: 12px;
        padding: 0 2px;
      }

      .tc-stat-pill {
        color: #38bdf8;
        font-weight: 600;
        font-size: 12px;
        background: rgba(56, 189, 248, 0.1);
        padding: 2px 8px;
        border-radius: 4px;
        border: 1px solid rgba(56, 189, 248, 0.25);
        font-family: monospace;
      }

      .tc-btn-view-clause {
        background: rgba(59, 130, 246, 0.15);
        border: 1px solid rgba(59, 130, 246, 0.35);
        color: #93c5fd;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
      }

      .tc-btn-view-clause:hover {
        background: rgba(59, 130, 246, 0.3);
        color: #ffffff;
        border-color: #60a5fa;
      }

      .tc-btn-how-to-cancel {
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.4);
        color: #fde68a;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
      }

      .tc-btn-how-to-cancel:hover,
      .tc-btn-how-to-cancel.active {
        background: rgba(245, 158, 11, 0.3);
        color: #ffffff;
        border-color: #fbbf24;
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.35);
      }

      .tc-cancel-guide-panel {
        background: rgba(24, 20, 10, 0.95);
        border: 1px solid rgba(245, 158, 11, 0.35);
        border-radius: 8px;
        padding: 12px 14px;
        margin-bottom: 12px;
        font-size: 12px;
        animation: tc-fade-in 0.2s ease;
      }

      .tc-cancel-guide-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        color: #fde68a;
        margin-bottom: 8px;
        font-size: 12px;
      }

      .tc-cancel-guide-steps {
        margin: 0;
        padding-left: 20px;
        color: #f1f5f9;
        font-size: 11.5px;
        line-height: 1.55;
      }

      .tc-cancel-step {
        margin-bottom: 4px;
      }

      .tc-cancel-guide-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 10px;
        padding: 6px 12px;
        background: rgba(245, 158, 11, 0.2);
        color: #fde68a;
        text-decoration: none;
        border-radius: 6px;
        border: 1px solid rgba(245, 158, 11, 0.45);
        font-weight: 600;
        font-size: 11.5px;
        transition: all 0.15s ease;
      }

      .tc-cancel-guide-link:hover {
        background: rgba(245, 158, 11, 0.35);
        color: #ffffff;
        border-color: #fbbf24;
      }

      .tc-source-preview {
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 12px;
        font-size: 12px;
        animation: tc-fade-in 0.2s ease;
      }

      @keyframes tc-fade-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .tc-preview-bullet-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: #f1f5f9;
        font-size: 12px;
        line-height: 1.45;
        margin-bottom: 8px;
      }

      .tc-bullet-dot {
        color: #38bdf8;
        font-size: 16px;
        line-height: 1.1;
        user-select: none;
      }

      .tc-bullet-content {
        flex: 1;
      }

      .tc-bullet-label {
        font-weight: 700;
        color: #93c5fd;
        margin-right: 4px;
      }

      .tc-bullet-text {
        color: #e2e8f0;
      }

      /* Raw Legal Snippet Accordion */
      .tc-raw-accordion {
        margin-top: 6px;
        border-top: 1px solid #1e293b;
        padding-top: 6px;
      }

      .tc-accordion-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        padding: 4px 2px;
        user-select: none;
        list-style: none;
        transition: color 0.15s ease;
      }

      .tc-accordion-toggle::-webkit-details-marker {
        display: none;
      }

      .tc-accordion-toggle:hover {
        color: #e2e8f0;
      }

      .tc-accordion-chevron {
        font-size: 11px;
        transition: transform 0.2s ease;
        display: inline-block;
      }

      .tc-raw-accordion[open] .tc-accordion-chevron {
        transform: rotate(180deg);
      }

      .tc-raw-accordion[open] .tc-accordion-toggle {
        color: #38bdf8;
        margin-bottom: 6px;
      }

      .tc-source-preview-body {
        color: #cbd5e1;
        font-style: italic;
        font-size: 11.5px;
        line-height: 1.45;
        background: rgba(15, 23, 42, 0.7);
        padding: 8px 10px;
        border-radius: 6px;
        border-left: 3px solid #38bdf8;
        word-break: break-word;
        white-space: pre-wrap;
      }

      .tc-override-pill {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 4px;
      }

      .tc-override-pill.pill-yes {
        background: rgba(16, 185, 129, 0.2);
        color: #86efac;
        border: 1px solid rgba(16, 185, 129, 0.4);
      }

      .tc-override-pill.pill-no {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.4);
      }

      .tc-dealbreaker-pill {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 4px;
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.4);
      }

      /* Prominent Action Buttons */
      .tc-card-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .tc-btn {
        flex: 1;
        padding: 9px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        letter-spacing: 0.5px;
        transition: all 0.15s ease;
        border: 1.5px solid transparent;
      }

      .tc-btn-yes {
        background: rgba(16, 185, 129, 0.15);
        color: #86efac;
        border-color: #059669;
      }

      .tc-btn-yes:hover {
        background: #059669;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
      }

      .tc-btn-yes.active {
        background: #059669;
        color: #ffffff;
        border-color: #34d399;
        box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
      }

      .tc-btn-no {
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
        border-color: #dc2626;
      }

      .tc-btn-no:hover {
        background: #dc2626;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
      }

      .tc-btn-no.active {
        background: #dc2626;
        color: #ffffff;
        border-color: #f87171;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
      }

      /* Empty State */
      .tc-empty {
        text-align: center;
        padding: 24px;
        color: #94a3b8;
      }

      .tc-empty-icon {
        font-size: 28px;
        margin-bottom: 8px;
      }

      /* Recommendation Verdict Bar */
      .tc-verdict-bar {
        padding: 11px 18px;
        font-size: 12.5px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        border-top: 1px solid #334155;
        letter-spacing: 0.3px;
        line-height: 1.35;
        transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      }

      /* Strict Crimson Alert for High Risk */
      .tc-verdict-bar.verdict-high-risk {
        background: rgba(220, 38, 38, 0.22);
        color: #fca5a5;
        border-top: 1.5px solid #ef4444;
      }

      /* Softer Amber Warning for Medium/Low Risk */
      .tc-verdict-bar.verdict-minor-risk {
        background: rgba(217, 119, 6, 0.22);
        color: #fde68a;
        border-top: 1.5px solid #f59e0b;
      }

      /* Safe to Proceed */
      .tc-verdict-bar.verdict-safe {
        background: rgba(16, 185, 129, 0.2);
        color: #86efac;
        border-top: 1.5px solid #10b981;
      }

      /* Footer */
      .tc-footer {
        padding: 10px 18px;
        background: #0f172a;
        border-top: 1px solid #1e293b;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #64748b;
      }
    `;
  }

  async function renderUI(analysis, profile, overrides) {
    const root = ensureShadowRoot();

    if (isMinimized) {
      // Count dealbreakers
      let dealbreakerCount = 0;
      CATEGORIES.forEach((catKey) => {
        if (analysis && analysis.categories && analysis.categories[catKey] && analysis.categories[catKey].present === true) {
          const catStats = (profile && profile[catKey]) || { yes: 0, no: 0 };
          const no = Number(catStats.no) || 0;
          const total = Number(catStats.yes || 0) + no;
          if (total > 0 && no >= 2 && (no / total) >= 0.60) dealbreakerCount++;
        }
      });

      root.innerHTML = `
        <style>${getCSS()}</style>
        <button class="tc-bubble ${dealbreakerCount > 0 ? 'tc-bubble-dealbreaker' : ''}" id="tc-expand-btn">
          <span>🛡️</span>
          <span>T&C Guardian</span>
          ${dealbreakerCount > 0 ? `<span style="color: #ef4444;">(${dealbreakerCount} ⚠️)</span>` : ''}
        </button>
      `;

      root.getElementById('tc-expand-btn').addEventListener('click', () => {
        isMinimized = false;
        renderUI(analysis, profile, overrides);
      });
      return;
    }

    // Conditional Filtering: Only create and render cards where present === true
    const presentCategories = CATEGORIES.filter(
      (catKey) => Boolean(analysis && analysis.categories && analysis.categories[catKey] && analysis.categories[catKey].present === true)
    );

    const domainOverrides = (overrides && overrides[currentDomain]) || {};

    let dealbreakerCount = 0;
    const categoryCardsHtml = presentCategories.map((catKey) => {
      const meta = CATEGORY_META[catKey];
      const data = analysis.categories[catKey];

      const catStats = (profile && profile[catKey]) || { yes: 0, no: 0 };
      const yes = Number(catStats.yes) || 0;
      const no = Number(catStats.no) || 0;
      const total = yes + no;

      // Stat Line: e.g. "Stat: 12.3% Yes"
      let statText = 'Stat: No history yet';
      if (total > 0) {
        const pctYes = ((yes / total) * 100).toFixed(1);
        statText = `Stat: ${pctYes}% Yes`;
      }

      // Check current site override
      const hasOverride = Object.prototype.hasOwnProperty.call(domainOverrides, catKey);
      const isCurrentYes = hasOverride && domainOverrides[catKey] === true;
      const isCurrentNo = hasOverride && domainOverrides[catKey] === false;

      let overrideBadgeHtml = '';
      if (hasOverride) {
        overrideBadgeHtml = `<span class="tc-override-pill ${isCurrentYes ? 'pill-yes' : 'pill-no'}">${isCurrentYes ? '✓ Chosen: YES' : '✕ Chosen: NO'}</span>`;
      } else if (total > 0 && no >= 2 && (no / total) >= 0.60) {
        overrideBadgeHtml = `<span class="tc-dealbreaker-pill">⚠️ Normally Rejected</span>`;
        dealbreakerCount++;
      }

      const isDealbreaker = !hasOverride && total > 0 && no >= 2 && (no / total) >= 0.60;
      const sourceSnippet = (sourceClauses && sourceClauses[catKey]) || data.snippet || data.summary || 'Clause text detected in agreement terms.';
      const cancellationGuide = (catKey === 'AUTO_RENEW') ? (data.cancellationGuide || getDefaultCancellationGuide(currentDomain)) : null;

      const riskBadgeClass = meta.riskLevel === 'HIGH' ? 'risk-high' : (meta.riskLevel === 'LOW' ? 'risk-low' : 'risk-med');
      const riskBadgeText = meta.riskLevel === 'HIGH' ? 'HIGH RISK' : (meta.riskLevel === 'LOW' ? 'LOW RISK' : 'MEDIUM RISK');

      return `
        <div class="tc-card ${isDealbreaker ? 'tc-card-dealbreaker' : ''}">
          <div class="tc-card-header">
            <div class="tc-card-question">
              <span class="tc-cat-icon">${meta.icon}</span>
              <span>${escapeHtml(meta.question || meta.name)}</span>
            </div>
            <span class="tc-risk-pill ${riskBadgeClass}">${riskBadgeText}</span>
          </div>

          <div class="tc-card-summary">${escapeHtml(data.shortSummary || data.summary)}</div>

          <div class="tc-card-statline">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="tc-stat-pill">${escapeHtml(statText)}</span>
              ${overrideBadgeHtml}
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${catKey === 'AUTO_RENEW' ? `
                <button class="tc-btn-how-to-cancel" data-cat="${catKey}" title="View cancellation guide">
                  💡 How to Stop Auto-Pay
                </button>
              ` : ''}
              <button class="tc-btn-view-clause" data-cat="${catKey}" title="View source clause on page">
                📖 View Clause
              </button>
            </div>
          </div>

          <div class="tc-source-preview" id="source-preview-${catKey}" style="display: none;">
            <div class="tc-preview-bullet-row">
              <span class="tc-bullet-dot">•</span>
              <div class="tc-bullet-content">
                <span class="tc-bullet-label">Key Finding:</span>
                <span class="tc-bullet-text">${escapeHtml(data.shortSummary || data.summary)}</span>
              </div>
            </div>
            <details class="tc-raw-accordion">
              <summary class="tc-accordion-toggle">
                <span>📜 View Full Legal Snippet</span>
                <span class="tc-accordion-chevron">▾</span>
              </summary>
              <div class="tc-source-preview-body">"${escapeHtml(sourceSnippet)}"</div>
            </details>
          </div>

          ${catKey === 'AUTO_RENEW' && cancellationGuide ? `
            <div class="tc-cancel-guide-panel" id="cancel-guide-${catKey}" style="display: none;">
              <div class="tc-cancel-guide-header">
                <span>🛑</span>
                <span>How to Stop Auto-Pay (${escapeHtml(cancellationGuide.domain || currentDomain)})</span>
              </div>
              <ol class="tc-cancel-guide-steps">
                ${cancellationGuide.steps.map(s => `<li class="tc-cancel-step">${escapeHtml(s)}</li>`).join('')}
              </ol>
              ${cancellationGuide.url ? `
                <a class="tc-cancel-guide-link" href="${escapeHtml(cancellationGuide.url)}" target="_blank" rel="noopener noreferrer">
                  🔗 Direct Subscription Settings &rarr;
                </a>
              ` : ''}
            </div>
          ` : ''}

          <div class="tc-card-actions">
            <button class="tc-btn tc-btn-yes ${isCurrentYes ? 'active' : ''}" data-cat="${catKey}" data-choice="yes" title="Accept this clause">
              ${isCurrentYes ? '✓ ' : ''}[ Yes ]
            </button>
            <button class="tc-btn tc-btn-no ${isCurrentNo ? 'active' : ''}" data-cat="${catKey}" data-choice="no" title="Reject this clause">
              ${isCurrentNo ? '✕ ' : ''}[ No ]
            </button>
          </div>
        </div>
      `;
    }).join('');

    const emptyHtml = `
      <div class="tc-empty">
        <div class="tc-empty-icon">🎉</div>
        <div style="font-weight: 600; color: #f8fafc; margin-bottom: 4px;">No Critical Red Flags Found</div>
        <div>This agreement did not trigger any of the monitored high-risk categories.</div>
      </div>
    `;

    // Evaluate Recommendation Bar with Risk Weighting:
    // 1. DATA_SALE & WAIVE_RIGHTS are HIGH risk (Dealbreakers) -> Crimson alert
    // 2. AI_TRAINING, AUTO_RENEW, NO_DELETE are MEDIUM/LOW risk -> Amber warning
    // 3. If all accepted -> Safe to proceed
    const isCategoryRejected = (catKey) => {
      if (domainOverrides[catKey] === false) return true;
      if (domainOverrides[catKey] === true) return false;
      const catStats = (profile && profile[catKey]) || { yes: 0, no: 0 };
      const noCount = Number(catStats.no) || 0;
      const totalVotes = Number(catStats.yes || 0) + noCount;
      return totalVotes > 0 && noCount >= 2 && (noCount / totalVotes) >= 0.60;
    };

    const hasHighRiskRejection = presentCategories.some(
      (catKey) => HIGH_RISK_CATEGORIES.includes(catKey) && isCategoryRejected(catKey)
    );
    const hasMinorRiskRejection = presentCategories.some(
      (catKey) => MEDIUM_LOW_RISK_CATEGORIES.includes(catKey) && isCategoryRejected(catKey)
    );

    let verdictClass = 'verdict-safe';
    let verdictText = '✅ Safe to Proceed.';

    if (presentCategories.length === 0) {
      verdictClass = 'verdict-safe';
      verdictText = '✅ Safe to Proceed — Zero Risk Clauses Detected';
    } else if (hasHighRiskRejection) {
      verdictClass = 'verdict-high-risk';
      verdictText = '🛑 High-Risk Violation Detected: Proceeding is strongly discouraged.';
    } else if (hasMinorRiskRejection) {
      verdictClass = 'verdict-minor-risk';
      verdictText = '⚠️ Minor Risk Detected: Review highlighted clauses before proceeding.';
    }

    root.innerHTML = `
      <style>${getCSS()}</style>
      <div class="tc-widget">
        <!-- Header -->
        <div class="tc-header">
          <div class="tc-header-title-row">
            <span class="tc-logo-badge">🛡️ T&C Guardian</span>
            <span class="tc-domain-tag">${escapeHtml(currentDomain)}</span>
          </div>
          <div class="tc-header-actions">
            <button class="tc-icon-btn" id="tc-minimize-btn" title="Minimize">—</button>
            <button class="tc-icon-btn" id="tc-close-btn" title="Close">&times;</button>
          </div>
        </div>

        <!-- Cards List -->
        <div class="tc-body">
          ${presentCategories.length > 0 ? categoryCardsHtml : emptyHtml}
        </div>

        <!-- Risk-Weighted Proceed / Stop Recommendation Bar -->
        <div class="tc-verdict-bar ${verdictClass}">
          <span>${verdictText}</span>
        </div>

        <!-- Footer -->
        <div class="tc-footer">
          <span>${presentCategories.length} active question${presentCategories.length === 1 ? '' : 's'}</span>
          <span style="color: #38bdf8;">Choices save instantly</span>
        </div>
      </div>
    `;

    // Event Handlers
    root.getElementById('tc-minimize-btn').addEventListener('click', () => {
      isMinimized = true;
      renderUI(analysis, profile, overrides);
    });

    root.getElementById('tc-close-btn').addEventListener('click', () => {
      isMinimized = true;
      renderUI(analysis, profile, overrides);
    });

    // View Clause Jump & Highlight Listeners
    root.querySelectorAll('.tc-btn-view-clause').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const catKey = e.currentTarget.getAttribute('data-cat');
        const el = findDomElementForCategory(catKey);
        if (el) {
          flashHighlightElement(el);
        } else {
          // If on a sign-up page where terms were pre-fetched, highlight the terms link
          const link = document.querySelector('a#terms-link') || Array.from(document.querySelectorAll('a')).find(a => TERMS_REGEX.test(a.textContent || ''));
          if (link) {
            flashHighlightElement(link);
          }
        }

        // Toggle the inline source preview accordion on the card
        const preview = root.getElementById(`source-preview-${catKey}`);
        if (preview) {
          const isHidden = (preview.style.display === 'none' || !preview.style.display);
          preview.style.display = isHidden ? 'block' : 'none';
        }
      });
    });

    // How to Stop Auto-Pay Guide Listeners
    root.querySelectorAll('.tc-btn-how-to-cancel').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const catKey = e.currentTarget.getAttribute('data-cat');
        const panel = root.getElementById(`cancel-guide-${catKey}`);
        if (panel) {
          const isHidden = (panel.style.display === 'none' || !panel.style.display);
          panel.style.display = isHidden ? 'block' : 'none';
          if (isHidden) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        }
      });
    });

    // Accept / Reject Buttons
    root.querySelectorAll('.tc-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget;
        const catKey = target.getAttribute('data-cat');
        const choice = target.getAttribute('data-choice');
        const isYes = (choice === 'yes');

        const { profile: currentProfile, overrides: currentOverrides } = await getStorageData();

        // Increment global counter
        if (!currentProfile[catKey]) {
          currentProfile[catKey] = { yes: 0, no: 0 };
        }
        if (isYes) {
          currentProfile[catKey].yes = (currentProfile[catKey].yes || 0) + 1;
        } else {
          currentProfile[catKey].no = (currentProfile[catKey].no || 0) + 1;
        }

        // Set per-site override for domain
        if (!currentOverrides[currentDomain]) {
          currentOverrides[currentDomain] = {};
        }
        currentOverrides[currentDomain][catKey] = isYes;

        // Save & immediately re-render live
        await saveStorageData(currentProfile, currentOverrides);
        renderUI(analysis, currentProfile, currentOverrides);
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Main Controller Initialization
   */
  async function init() {
    // Cache Invalidation: Clear local storage/cached analysis results on page load
    clearCachedAnalysis();

    let rawText = '';

    if (isTermsPage()) {
      // Analyze current page text
      rawText = (document.body && (document.body.innerText || document.body.textContent)) || '';
    } else {
      // Look for a link to terms
      const termsUrl = findTermsLink();
      if (termsUrl) {
        rawText = await fetchTermsUrl(termsUrl);
      }
    }

    if (!rawText || rawText.trim().length === 0) {
      // No terms page or terms link found on this page
      return;
    }

    const filtered = filterHighRiskText(rawText);
    if (!filtered || filtered.trim().length === 0) {
      return;
    }

    // Extract and map source paragraph excerpts for deep-linking
    sourceClauses = extractSourceClauses(rawText);

    // Run analysis via message passing or standalone fallback
    analysisData = await requestAnalysis(filtered, currentDomain);

    // Fetch stored user profile and overrides
    const { profile, overrides } = await getStorageData();

    // Render Shadow DOM UI
    renderUI(analysisData, profile, overrides);
  }

  // Run when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

