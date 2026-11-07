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
    SITE_OVERRIDES: 'tc_guardian_siteOverrides'
  };

  const CATEGORIES = [
    'DATA_SALE',
    'AI_TRAINING',
    'AUTO_RENEW',
    'NO_DELETE',
    'WAIVE_RIGHTS'
  ];

  const CATEGORY_META = {
    DATA_SALE: {
      name: 'Data Sale & Third-Party Brokers',
      icon: '📊',
      defaultSummary: 'Sells or shares your personal identity, browsing telemetry, and behavior with third-party ad brokers and marketing syndicates.'
    },
    AI_TRAINING: {
      name: 'AI Model Training on User Data',
      icon: '🤖',
      defaultSummary: 'Uses your uploaded content, documents, prompts, and assets to train generative AI and machine learning models without opt-out.'
    },
    AUTO_RENEW: {
      name: 'Auto-Renewal & No-Refund Policy',
      icon: '💳',
      defaultSummary: 'Automatically renews subscriptions with recurring billing and enforces strict non-refundable terms upon renewal.'
    },
    NO_DELETE: {
      name: 'Indefinite Data Retention',
      icon: '🗄️',
      defaultSummary: 'Retains your personal records, database logs, and telemetry indefinitely even after you request account deletion.'
    },
    WAIVE_RIGHTS: {
      name: 'Mandatory Arbitration & Class Action Waiver',
      icon: '⚖️',
      defaultSummary: 'Forces dispute resolution via private binding arbitration and strips your legal rights to jury trial or class action participation.'
    }
  };

  const HIGH_RISK_REGEX = /arbitration|third party|sell|broker|train|artificial intelligence|machine learning|renew|cancel|refund|retain|delete|waive|class action/i;
  // URL/title match; `tos` only as a standalone token so "photos"/"autos" don't match
  const TERMS_REGEX = /terms|privacy|(^|[^a-z])tos([^a-z]|$)|conditions|legal|eula/i;
  // Anchor text match for terms/privacy links
  const TERMS_LINK_REGEX = /terms of|terms &|terms and|privacy policy|user agreement|conditions of use|eula/i;
  const SIGNUP_LINK_REGEX = /sign ?up|register|create (an )?account|join|get started|log ?in|sign ?in|checkout|check out|place order|subscribe/i;

  // State
  let analysisData = null;
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
      // Prefer extension storage. Never write to the host page's localStorage
      // when it is available: page scripts could read or tamper with it.
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

      // Standalone fallback (no extension context, e.g. local test pages)
      try {
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
        localStorage.setItem(STORAGE_KEYS.SITE_OVERRIDES, JSON.stringify(overrides));
      } catch (e) {
        // localStorage might fail if quota exceeded
      }
      resolve();
    });
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

  function hasSignupIndicators() {
    // Sign-up, login (password field) and checkout flows
    if (document.querySelector('form, input[type="checkbox"], input[type="password"], button[type="submit"], input[type="submit"]')) {
      return true;
    }
    return Array.from(document.querySelectorAll('a, button')).some(
      (el) => SIGNUP_LINK_REGEX.test((el.textContent || '').trim())
    );
  }

  function findTermsLink() {
    const links = Array.from(document.querySelectorAll('a[href]'));
    for (const a of links) {
      const text = (a.textContent || '').trim();
      const label = a.getAttribute('aria-label') || a.getAttribute('title') || '';
      if (TERMS_LINK_REGEX.test(text) || TERMS_LINK_REGEX.test(label)) {
        if (/^https?:/i.test(a.href)) return a.href;
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
   * Message Passing & Standalone Fallback
   */
  async function requestAnalysis(filteredText, domain, remoteUrl) {
    // Cross-origin terms: background.js fetches (no page CORS) and analyzes in one step
    const payload = remoteUrl
      ? { action: 'FETCH_AND_ANALYZE_TC', url: remoteUrl, text: '', domain: domain }
      : { action: 'ANALYZE_TC', text: filteredText, domain: domain };

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
          // Background may chain ToS;DR (2s) -> local AI -> Gemini; allow for all tiers.
          setTimeout(() => reject(new Error('Timeout waiting for background response')), 20000);
        });

        const result = await Promise.race([sendPromise, timeoutPromise]);
        if (result && (result.data || result.categories || result.analysis)) {
          return normalizeAnalysisResult(result);
        }
      } catch (err) {
        console.info('[TC-Guardian] Falling back to local standalone analyzer:', err.message || err);
      }
    }

    // Local Standalone Mock Fallback (needs text; remote-only requests use a generic prompt)
    return generateLocalMockResponse(filteredText || '');
  }

  function generateLocalMockResponse(text) {
    // Stricter phrase-level patterns to limit false positives.
    const hasDataSale = /\b(sell|sold|selling)\b[^.]{0,60}(personal|data|information)|data brokers?|sale of (your )?(personal )?(data|information)/i.test(text);
    const hasAiTraining = /train(ing)?\b[^.]{0,60}\b(models?|artificial intelligence|machine learning|\bAI\b)|\b(artificial intelligence|machine learning)\b[^.]{0,60}\btrain/i.test(text);
    const hasAutoRenew = /auto(matic(ally)?)?[- ]?renew|renews? automatically|recurring (billing|subscription|charge)/i.test(text);
    const hasNoDelete = /(retain|keep|preserve|store)[^.]{0,80}(indefinite(ly)?|after (you )?(delet|terminat|clos))|backups?[^.]{0,60}(indefinite|retain)/i.test(text);
    const hasWaiveRights = /binding arbitration|class[- ]action (waiver|waive)|waive[^.]{0,60}(jury|class action)/i.test(text);

    const note = ' (Keyword match only; review the original terms to confirm.)';
    return {
      success: true,
      engine: 'Keyword Heuristic (Standalone Fallback)',
      categories: {
        DATA_SALE: {
          present: hasDataSale,
          summary: 'The terms appear to mention selling or sharing personal data with third parties.' + note
        },
        AI_TRAINING: {
          present: hasAiTraining,
          summary: 'The terms appear to mention training AI or machine learning models.' + note
        },
        AUTO_RENEW: {
          present: hasAutoRenew,
          summary: 'The terms appear to mention automatic renewal or recurring billing.' + note
        },
        NO_DELETE: {
          present: hasNoDelete,
          summary: 'The terms appear to mention retaining data indefinitely or after deletion.' + note
        },
        WAIVE_RIGHTS: {
          present: hasWaiveRights,
          summary: 'The terms appear to mention binding arbitration or a class action / jury waiver.' + note
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
        normalized[catKey] = {
          present: Boolean(catData.present),
          summary: catData.summary || CATEGORY_META[catKey].defaultSummary
        };
      } else {
        normalized[catKey] = {
          present: false,
          summary: CATEGORY_META[catKey].defaultSummary
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

      /* Subheader Meta Bar */
      .tc-subbar {
        padding: 8px 18px;
        background: rgba(15, 23, 42, 0.7);
        border-bottom: 1px solid #1e293b;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
      }

      .tc-engine-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: #38bdf8;
      }

      .tc-engine-pill::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #38bdf8;
      }

      .tc-reset-btn {
        background: transparent;
        border: 1px solid #475569;
        color: #cbd5e1;
        font-size: 10px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .tc-reset-btn:hover {
        background: #ef4444;
        border-color: #ef4444;
        color: #ffffff;
      }

      /* Alert Banner for Dealbreakers */
      .tc-dealbreaker-banner {
        background: rgba(239, 68, 68, 0.15);
        border-left: 4px solid #ef4444;
        padding: 10px 18px;
        font-size: 12px;
        font-weight: 600;
        color: #fca5a5;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: pulse-border 2s infinite;
      }

      /* Card List */
      .tc-body {
        padding: 14px 18px;
        overflow-y: auto;
        max-height: calc(100vh - 220px);
        display: flex;
        flex-direction: column;
        gap: 12px;
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
        border-radius: 10px;
        padding: 14px;
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

      .tc-card-title {
        font-size: 13px;
        font-weight: 600;
        color: #f1f5f9;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      /* Badges */
      .tc-badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.3;
        margin-bottom: 8px;
      }

      .tc-badge.dealbreaker {
        background: #ef4444;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
      }

      .tc-badge.assumed-yes {
        background: #059669;
        color: #ecfdf5;
      }

      .tc-badge.override-yes {
        background: #047857;
        color: #d1fae5;
        border: 1px solid #10b981;
      }

      .tc-badge.override-no {
        background: #b91c1c;
        color: #fee2e2;
        border: 1px solid #ef4444;
      }

      .tc-badge.new-question {
        background: #d97706;
        color: #fffbeb;
      }

      .tc-card-summary {
        font-size: 12px;
        color: #cbd5e1;
        line-height: 1.5;
        margin-bottom: 12px;
      }

      /* Card Actions */
      .tc-card-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .tc-btn {
        flex: 1;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.15s ease;
        border: 1px solid transparent;
      }

      .tc-btn-yes {
        background: #14532d;
        color: #86efac;
        border-color: #166534;
      }

      .tc-btn-yes:hover {
        background: #16a34a;
        color: #ffffff;
      }

      .tc-btn-yes.active {
        background: #15803d;
        color: #ffffff;
        border-color: #22c55e;
        box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
      }

      .tc-btn-no {
        background: #7f1d1d;
        color: #fca5a5;
        border-color: #991b1b;
      }

      .tc-btn-no:hover {
        background: #dc2626;
        color: #ffffff;
      }

      .tc-btn-no.active {
        background: #b91c1c;
        color: #ffffff;
        border-color: #ef4444;
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
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
        if (analysis.categories[catKey] && analysis.categories[catKey].present) {
          const st = calculateStatus(catKey, currentDomain, profile, overrides);
          if (st.code === 'DEALBREAKER') dealbreakerCount++;
        }
      });

      root.innerHTML = `
        <style>${getCSS()}</style>
        <button class="tc-bubble ${dealbreakerCount > 0 ? 'tc-bubble-dealbreaker' : ''}" id="tc-expand-btn">
          <span>🛡️</span>
          <span>TC Guardian</span>
          ${dealbreakerCount > 0 ? `<span style="color: #ef4444;">(${dealbreakerCount} ⚠️)</span>` : ''}
        </button>
      `;

      root.getElementById('tc-expand-btn').addEventListener('click', () => {
        isMinimized = false;
        renderUI(analysis, profile, overrides);
      });
      return;
    }

    // Filter categories where present === true
    const presentCategories = CATEGORIES.filter(
      (catKey) => analysis.categories[catKey] && analysis.categories[catKey].present
    );

    let hasDealbreaker = false;
    const categoryCardsHtml = presentCategories.map((catKey) => {
      const meta = CATEGORY_META[catKey];
      const data = analysis.categories[catKey];
      const status = calculateStatus(catKey, currentDomain, profile, overrides);

      if (status.code === 'DEALBREAKER') {
        hasDealbreaker = true;
      }

      const isCurrentYes = status.overrideValue === true;
      const isCurrentNo = status.overrideValue === false;

      return `
        <div class="tc-card ${status.code === 'DEALBREAKER' ? 'tc-card-dealbreaker' : ''}">
          <div class="tc-card-header">
            <span class="tc-card-title">${meta.icon} ${meta.name}</span>
          </div>
          <div>
            <span class="tc-badge ${status.badgeType}">${status.badgeText}</span>
          </div>
          <div class="tc-card-summary">${escapeHtml(data.summary)}</div>
          <div class="tc-card-actions">
            <button class="tc-btn tc-btn-yes ${isCurrentYes ? 'active' : ''}" data-cat="${catKey}" data-choice="yes">
              ${isCurrentYes ? '✓ ' : ''}Accept (Yes)
            </button>
            <button class="tc-btn tc-btn-no ${isCurrentNo ? 'active' : ''}" data-cat="${catKey}" data-choice="no">
              ${isCurrentNo ? '✕ ' : ''}Unacceptable (No)
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

    root.innerHTML = `
      <style>${getCSS()}</style>
      <div class="tc-widget">
        <!-- Header -->
        <div class="tc-header">
          <div class="tc-header-title-row">
            <span class="tc-logo-badge">TCG</span>
            <div class="tc-title">
              <span>TC Guardian</span>
              <span class="tc-domain-tag">${escapeHtml(currentDomain)}</span>
            </div>
          </div>
          <div class="tc-header-actions">
            <button class="tc-icon-btn" id="tc-minimize-btn" title="Minimize">—</button>
            <button class="tc-icon-btn" id="tc-close-btn" title="Close">&times;</button>
          </div>
        </div>

        <!-- Subheader Meta -->
        <div class="tc-subbar">
          <span class="tc-engine-pill">${escapeHtml(analysis.engine)}</span>
          <button class="tc-reset-btn" id="tc-reset-btn">Reset Learned History</button>
        </div>

        <!-- Dealbreaker Alert Banner -->
        ${hasDealbreaker ? `
          <div class="tc-dealbreaker-banner">
            <span>🚨</span>
            <span>Caution: Agreement contains terms you routinely reject!</span>
          </div>
        ` : ''}

        <!-- Cards List -->
        <div class="tc-body">
          ${presentCategories.length > 0 ? categoryCardsHtml : emptyHtml}
        </div>

        <!-- Footer -->
        <div class="tc-footer">
          <span>Preferences learn automatically as you answer.</span>
          <span>${presentCategories.length} clause${presentCategories.length === 1 ? '' : 's'} flagged</span>
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

    root.getElementById('tc-reset-btn').addEventListener('click', async () => {
      if (confirm('Reset all learned preference history and site overrides?')) {
        const freshProfile = getDefaultProfile();
        const freshOverrides = {};
        await saveStorageData(freshProfile, freshOverrides);
        renderUI(analysis, freshProfile, freshOverrides);
      }
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
    let rawText = '';
    let remoteUrl = null;

    if (isTermsPage()) {
      // Analyze current page text
      rawText = (document.body && (document.body.innerText || document.body.textContent)) || '';
    } else if (hasSignupIndicators()) {
      // Sign-up context: silently pre-fetch the linked terms
      const termsUrl = findTermsLink();
      if (termsUrl) {
        if (new URL(termsUrl).origin === window.location.origin) {
          rawText = await fetchTermsUrl(termsUrl);
        } else {
          remoteUrl = termsUrl; // CORS-blocked here; let background.js fetch it
        }
      }
    }

    let filtered = '';
    if (!remoteUrl) {
      if (!rawText || rawText.trim().length === 0) {
        // No terms page or terms link found on this page
        return;
      }
      filtered = filterHighRiskText(rawText);
      if (!filtered || filtered.trim().length === 0) {
        return;
      }
    }

    // Run analysis via message passing or standalone fallback
    analysisData = await requestAnalysis(filtered, currentDomain, remoteUrl);

    // Fetch stored user profile and overrides
    const { profile, overrides } = await getStorageData();

    // Only surface the pop-up when at least one red flag is active
    const hasFlags = CATEGORIES.some((c) => analysisData.categories[c] && analysisData.categories[c].present);
    if (!hasFlags) return;

    renderUI(analysisData, profile, overrides);
  }

  // Run when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

