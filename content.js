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

  // Risk weighting: HIGH = dealbreaker-class, others = medium/low
  const CATEGORY_RISK = {
    DATA_SALE: 'high',
    WAIVE_RIGHTS: 'high',
    AI_TRAINING: 'medium',
    AUTO_RENEW: 'medium',
    NO_DELETE: 'medium'
  };

  // Used to locate the source clause for each category in the terms text
  const CLAUSE_PATTERNS = {
    DATA_SALE: /\b(sell|sold|selling|data brokers?|third[- ]part(y|ies)|advertis\w*|share[sd]?\b[^.]{0,40}(personal|data))/gi,
    AI_TRAINING: /\b(train(ing|ed)?|artificial intelligence|machine learning|AI|models?)\b/gi,
    AUTO_RENEW: /\b(renew\w*|recurring|subscription|refund\w*|cancel\w*)\b/gi,
    NO_DELETE: /\b(retain\w*|retention|delet\w*|backups?|archiv\w*|indefinite\w*)\b/gi,
    WAIVE_RIGHTS: /\b(arbitration|class[- ]action|jury|waive[sd]?)\b/gi
  };

  // Fallback single-keyword text fragments when only a URL is known
  const CLAUSE_FRAGMENT_KEYWORDS = {
    DATA_SALE: 'third part',
    AI_TRAINING: 'train',
    AUTO_RENEW: 'renew',
    NO_DELETE: 'retain',
    WAIVE_RIGHTS: 'arbitration'
  };

  // State
  const clauseRefs = {};      // category -> { el } (on-page) or { snippet } (fetched text)
  let clauseSourceUrl = null; // URL of the terms document when it is not the current page
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

    // 2. Explicit-choice model: never assume an answer. Show history only.
    let historyText = '';
    if (total > 0) {
      const rejectPct = Math.round((no / total) * 100);
      historyText = ` — Historically rejected ${rejectPct}% of the time (${total} ${total === 1 ? 'answer' : 'answers'})`;
    }
    return {
      code: 'NEW_QUESTION',
      badgeText: 'Needs Your Answer' + historyText,
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

  /**
   * Clause location ("Read That Clause")
   */
  function scoreText(text, category) {
    const matches = text.match(CLAUSE_PATTERNS[category]);
    return matches ? matches.length : 0;
  }

  function buildClauseRefsFromDom() {
    const host = document.getElementById('tc-guardian-host');
    const sel = 'p, li, blockquote, td, dd, section, div, article';
    const blocks = Array.from(document.querySelectorAll(sel))
      .filter((el) => !(host && host.contains(el)))
      .filter((el) => !el.querySelector(sel + ', h1, h2, h3'))
      .map((el) => ({ el, text: (el.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((b) => b.text.length >= 40 && b.text.length <= 3000);

    CATEGORIES.forEach((cat) => {
      let best = null;
      let bestScore = 0;
      blocks.forEach((b) => {
        const s = scoreText(b.text, cat);
        if (s > bestScore) { best = b; bestScore = s; }
      });
      if (best) clauseRefs[cat] = { el: best.el };
    });
  }

  function buildClauseRefsFromText(rawText) {
    const paragraphs = rawText.split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 40 && p.length <= 3000);

    CATEGORIES.forEach((cat) => {
      let best = null;
      let bestScore = 0;
      paragraphs.forEach((p) => {
        const s = scoreText(p, cat);
        if (s > bestScore) { best = p; bestScore = s; }
      });
      if (best) clauseRefs[cat] = { snippet: best };
    });
  }

  function encodeFragmentPart(str) {
    return encodeURIComponent(str).replace(/-/g, '%2D');
  }

  function buildTextFragment(cat) {
    const ref = clauseRefs[cat];
    if (ref && ref.snippet) {
      const words = ref.snippet.split(' ');
      if (words.length > 8) {
        return `#:~:text=${encodeFragmentPart(words.slice(0, 4).join(' '))},${encodeFragmentPart(words.slice(-4).join(' '))}`;
      }
      return `#:~:text=${encodeFragmentPart(ref.snippet)}`;
    }
    return `#:~:text=${encodeFragmentPart(CLAUSE_FRAGMENT_KEYWORDS[cat])}`;
  }

  function flashElement(el) {
    const prev = {
      bg: el.style.backgroundColor,
      tr: el.style.transition,
      ol: el.style.outline
    };
    el.style.transition = 'background-color 0.3s ease';
    el.style.backgroundColor = '#fde047';
    el.style.outline = '2px solid #f59e0b';
    setTimeout(() => {
      el.style.backgroundColor = prev.bg;
      el.style.outline = prev.ol;
      setTimeout(() => { el.style.transition = prev.tr; }, 400);
    }, 2500);
  }

  function canJumpToClause(cat) {
    return Boolean(clauseRefs[cat] && clauseRefs[cat].el) || Boolean(clauseSourceUrl);
  }

  function jumpToClause(cat) {
    const ref = clauseRefs[cat];
    if (ref && ref.el && document.contains(ref.el)) {
      ref.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashElement(ref.el);
      return;
    }
    if (clauseSourceUrl) {
      // Terms live on another page: open it with a native text-fragment highlight
      const base = clauseSourceUrl.split('#')[0];
      window.open(base + buildTextFragment(cat), '_blank', 'noopener');
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
          if (isPlaceholderFallback(result)) {
            // Backend gave up and flagged everything: that is not a real finding.
            console.info('[TC-Guardian] Ignoring placeholder fallback payload; using local keyword check.');
            return generateLocalMockResponse(filteredText || '');
          }
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

  // background.js's "guaranteed fallback" marks all 5 categories present with one generic summary
  function isPlaceholderFallback(raw) {
    const src = raw.data || raw.categories || raw.analysis;
    if (!src || Array.isArray(src)) return false;
    const entries = CATEGORIES.map((c) => src[c]);
    if (entries.some((e) => !e || !isActiveFlag(e.present))) return false;
    const summaries = new Set(entries.map((e) => String(e.summary || '')));
    return summaries.size === 1 && /^fallback detection/i.test([...summaries][0]);
  }

  // Strict flag check: LLMs sometimes return "false"/"no" strings, which Boolean() would treat as true
  function isActiveFlag(v) {
    return v === true || (typeof v === 'string' && /^(true|yes)$/i.test(v.trim()));
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
          present: isActiveFlag(catData.present),
          question: typeof catData.question === 'string' ? catData.question.trim() : '',
          snippet: String(catData.snippet || catData.quote || '').trim(),
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
        height: auto; /* grows/shrinks with the number of flagged clauses */
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
        flex: 1 1 auto;
        min-height: 0; /* lets the body shrink and scroll inside the capped widget */
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

      .tc-question {
        font-size: 13px;
        font-weight: 600;
        color: #f8fafc;
        line-height: 1.45;
        margin-bottom: 8px;
      }

      .tc-quote {
        font-size: 11px;
        color: #94a3b8;
        font-style: italic;
        border-left: 2px solid #475569;
        padding-left: 8px;
        margin-bottom: 12px;
      }

      mark {
        background: rgba(250, 204, 21, 0.25);
        color: #fde68a;
        padding: 0 2px;
        border-radius: 3px;
      }

      .tc-subbar-right {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .tc-autoread {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        color: #94a3b8;
      }

      .tc-settings {
        padding: 10px 18px;
        background: rgba(15, 23, 42, 0.9);
        border-bottom: 1px solid #1e293b;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12px;
        color: #cbd5e1;
      }
      .tc-set-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .tc-set-main { font-weight: 600; color: #f8fafc; }
      .tc-set-row select, .tc-set-row input[type="range"] { max-width: 150px; }
      .tc-set-row select { background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 3px 6px; }
      .tc-set-test { align-self: flex-start; }

      .tc-voice-notice {
        padding: 6px 18px;
        font-size: 11px;
        color: #fde68a;
        background: rgba(245, 158, 11, 0.12);
      }

      .tc-speak-btn {
        margin-left: auto;
        padding: 0 4px;
        font-size: 12px;
      }

      .tc-risk-tag {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }

      .tc-risk-high { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
      .tc-risk-medium { background: rgba(245, 158, 11, 0.2); color: #fcd34d; }

      .tc-btn-view {
        flex: 0 0 auto;
        background: #1e293b;
        color: #93c5fd;
        border-color: #334155;
      }

      .tc-btn-view:hover { background: #334155; color: #ffffff; }

      /* Recommendation Bar */
      .tc-reco {
        padding: 10px 18px;
        font-size: 12px;
        font-weight: 600;
        border-top: 1px solid #1e293b;
      }

      .tc-reco-danger { background: rgba(220, 38, 38, 0.2); color: #fecaca; border-top-color: #dc2626; }
      .tc-reco-warn { background: rgba(245, 158, 11, 0.15); color: #fde68a; border-top-color: #f59e0b; }
      .tc-reco-safe { background: rgba(16, 185, 129, 0.15); color: #a7f3d0; border-top-color: #10b981; }
      .tc-reco-pending { background: rgba(148, 163, 184, 0.1); color: #cbd5e1; }

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

  /**
   * Dynamic, site-specific question content (no hardcoded per-category questions)
   */
  function firstSentence(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    const m = clean.match(/^.+?[.!?](?=\s|$)/);
    const sentence = (m ? m[0] : clean).replace(/[.!?]+$/, '');
    return sentence.length > 180 ? sentence.slice(0, 177) + '...' : sentence;
  }

  // Wrap amounts, durations and percentages in <mark>. Input must already be HTML-escaped.
  function highlightKeyTerms(escaped) {
    return escaped.replace(
      /(\$\s?\d[\d,.]*(?:\/\w+)?|\b\d+[- ]?(?:day|days|month|months|year|years|hour|hours)\b|\b\d+%)/gi,
      '<mark>$1</mark>'
    );
  }

  function getHeadlineText(data) {
    return data.question || `Do you accept this on ${currentDomain}: "${firstSentence(data.summary)}"?`;
  }

  function getClauseQuote(cat, data) {
    let quote = data.snippet || '';
    if (!quote) {
      const ref = clauseRefs[cat];
      if (ref && ref.el) quote = (ref.el.textContent || '');
      else if (ref && ref.snippet) quote = ref.snippet;
    }
    quote = quote.replace(/\s+/g, ' ').trim();
    return quote.length > 240 ? quote.slice(0, 237) + '...' : quote;
  }

  function buildQuestionHtml(cat, data) {
    const headline = getHeadlineText(data);
    const summary = String(data.summary || '').trim();
    const showDetail = !data.question
      ? summary.replace(/\s+/g, ' ').length > firstSentence(summary).length + 1
      : summary.length > 0;
    const quote = getClauseQuote(cat, data);

    return `
      <div class="tc-question">${highlightKeyTerms(escapeHtml(headline))}</div>
      ${showDetail ? `<div class="tc-card-summary">${highlightKeyTerms(escapeHtml(summary))}</div>` : ''}
      ${quote ? `<div class="tc-quote">From the terms: &ldquo;${escapeHtml(quote)}&rdquo;</div>` : ''}
    `;
  }

  function getRecommendation(presentCategories, overrides) {
    const domainOverrides = (overrides && overrides[currentDomain]) || {};
    const rejected = presentCategories.filter((c) => domainOverrides[c] === false);
    const answered = presentCategories.filter((c) => Object.prototype.hasOwnProperty.call(domainOverrides, c));

    if (rejected.some((c) => CATEGORY_RISK[c] === 'high')) {
      return { cls: 'tc-reco-danger', text: '🛑 High-Risk Violation Detected: Proceeding is strongly discouraged.', spoken: "Honestly, I'd think twice before agreeing to this one." };
    }
    if (rejected.length > 0) {
      return { cls: 'tc-reco-warn', text: '⚠️ Minor Risk Detected: Review highlighted clauses before proceeding.', spoken: "Nothing too scary, but take a quick look at the flagged parts before you go on." };
    }
    if (answered.length === presentCategories.length) {
      return { cls: 'tc-reco-safe', text: '✅ Safe to Proceed.', spoken: "Looks fine to me, you're good to go." };
    }
    return { cls: 'tc-reco-pending', text: 'Answer each flagged clause to get a recommendation.', spoken: '' };
  }

  function buildRecommendationHtml(presentCategories, overrides) {
    const r = getRecommendation(presentCategories, overrides);
    return `<div class="tc-reco ${r.cls}">${r.text}</div>`;
  }

  /**
   * Voice assistant: free, keyless, built on the browser's Web Speech API.
   * - Read aloud: speechSynthesis
   * - Answer by voice: SpeechRecognition (Chrome sends the audio to Google's speech service)
   */
  const VOICE_KEY = 'tc_guardian_voice';
  let voiceAutoRead = false;
  let voiceMode = null;          // null | 'reading' | 'listening'
  let voiceCancelled = false;
  let activeRecognition = null;
  let voiceNotice = '';
  let currentAnalysis = null;

  function voiceSupported() {
    return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  }

  function recognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  // User-customisable voice settings (persisted in chrome.storage.local)
  let voiceEnabled = true;
  let voiceEngineChoice = 'auto';   // 'auto' = ElevenLabs then browser, 'browser' = browser voice only
  let voiceRate = 1;
  let voiceName = '';               // preferred browser voice name ('' = best available)
  let settingsOpen = false;

  function voiceOn() {
    return voiceEnabled && voiceSupported();
  }

  function loadVoiceSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.get([VOICE_KEY], (res) => {
            const v = (res && res[VOICE_KEY]) || {};
            voiceAutoRead = Boolean(v.autoRead);
            voiceEnabled = v.enabled !== false;
            voiceEngineChoice = v.engine === 'browser' ? 'browser' : 'auto';
            const r = Number(v.rate);
            voiceRate = r >= 0.7 && r <= 1.5 ? r : 1;
            voiceName = typeof v.voiceName === 'string' ? v.voiceName : '';
            resolve();
          });
          return;
        } catch (e) { /* fall through */ }
      }
      resolve();
    });
  }

  function saveVoiceSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.set({ [VOICE_KEY]: {
          autoRead: voiceAutoRead, enabled: voiceEnabled, engine: voiceEngineChoice, rate: voiceRate, voiceName
        } });
      } catch (e) { /* ignore */ }
    }
  }

  function setVoiceMode(mode, notice) {
    voiceMode = mode;
    if (notice !== undefined) voiceNotice = notice;
    applyVoiceButtonState();
  }

  function applyVoiceButtonState() {
    if (!shadowRoot) return;
    const readBtn = shadowRoot.getElementById('tc-voice-read');
    const answerBtn = shadowRoot.getElementById('tc-voice-answer');
    if (readBtn) {
      readBtn.textContent = voiceMode === 'reading' ? '⏹' : '🔊';
      readBtn.title = voiceMode === 'reading' ? 'Stop' : 'Read flagged clauses aloud';
    }
    if (answerBtn) {
      answerBtn.textContent = voiceMode === 'listening' ? '⏹' : '🎤';
      answerBtn.title = voiceMode === 'listening' ? 'Stop' : 'Answer by voice (say yes / no / skip)';
    }
    const notice = shadowRoot.getElementById('tc-voice-notice');
    if (notice) {
      notice.textContent = voiceNotice;
      notice.style.display = voiceNotice ? 'block' : 'none';
    }
  }

  function stopVoice() {
    voiceCancelled = true;
    stopTtsAudio();
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    if (activeRecognition) {
      try { activeRecognition.abort(); } catch (e) { /* ignore */ }
      activeRecognition = null;
    }
    setVoiceMode(null, '');
  }

  // ElevenLabs playback (audio is fetched by background.js via TTS_SPEAK).
  // Any failure resolves false so speak() falls back to the browser voice.
  let ttsAudio = null;
  let ttsDisabled = false; // set after a hard failure (no key / quota) to avoid retry delays

  function stopTtsAudio() {
    if (ttsAudio) {
      try { ttsAudio.pause(); } catch (e) { /* ignore */ }
      ttsAudio = null;
    }
  }

  function speakElevenLabs(text) {
    return new Promise((resolve) => {
      if (ttsDisabled || voiceEngineChoice === 'browser' || !chrome.runtime || !chrome.runtime.sendMessage) { resolve(false); return; }
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      const timer = setTimeout(() => done(false), 10000);
      try {
        chrome.runtime.sendMessage({ action: 'TTS_SPEAK', text: text.slice(0, 1000) }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError || !res || !res.success || !res.audio) {
            if (res && res.fatal) ttsDisabled = true;
            done(false);
            return;
          }
          if (voiceCancelled) { done(true); return; }
          const audio = new Audio('data:' + (res.mime || 'audio/mpeg') + ';base64,' + res.audio);
          audio.playbackRate = voiceRate;
          try { audio.preservesPitch = true; } catch (e) { /* ignore */ }
          ttsAudio = audio;
          audio.onended = () => { ttsAudio = null; done(true); };
          audio.onerror = () => { ttsAudio = null; done(false); };
          audio.play().catch(() => { ttsAudio = null; done(false); });
        });
      } catch (e) {
        clearTimeout(timer);
        done(false);
      }
    });
  }

  // One fixed browser voice for the whole session (used only when ElevenLabs is unavailable).
  let pinnedBrowserVoice = null;
  function pickBrowserVoice() {
    if (pinnedBrowserVoice) return pinnedBrowserVoice;
    const all = window.speechSynthesis.getVoices() || [];
    const chosen = voiceName && all.find((v) => v.name === voiceName);
    if (chosen) { pinnedBrowserVoice = chosen; return chosen; }
    const voices = all.filter((v) => /^en/i.test(v.lang));
    // Prefer neural / premium voices, which sound far less robotic than the defaults
    const score = (v) => {
      let n = 0;
      if (/natural|neural|online/i.test(v.name)) n += 50;
      if (/premium|enhanced/i.test(v.name)) n += 40;
      if (/google (us|uk)/i.test(v.name)) n += 30;
      if (/samantha|ava|allison|serena|daniel|karen|aria|jenny|guy/i.test(v.name)) n += 20;
      if (/^en[-_]US/i.test(v.lang)) n += 10;
      if (/compact|espeak|fred|zarvox|trinoids|bad news|bells|boing|whisper/i.test(v.name)) n -= 100;
      return n;
    };
    voices.sort((x, y) => score(y) - score(x));
    pinnedBrowserVoice = voices[0] || null;
    return pinnedBrowserVoice;
  }

  function speakBrowser(text) {
    return new Promise((resolve) => {
      if (!voiceSupported() || !text) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = voiceRate * 0.97;
      u.pitch = 1;
      const v = pickBrowserVoice();
      if (v) u.voice = v;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  // The voice must stay constant: the first engine that works is locked in for
  // the whole page session. Once ElevenLabs has spoken, we never switch to the
  // browser voice mid-conversation (a failed line is retried once, then skipped).
  let voiceEngine = null; // null | 'eleven' | 'browser'

  async function speak(text) {
    if (!text || !voiceEnabled) return;
    if (voiceEngine !== 'browser') {
      let ok = await speakElevenLabs(text);
      if (!ok && voiceEngine === 'eleven' && !ttsDisabled && !voiceCancelled) ok = await speakElevenLabs(text);
      if (ok) { voiceEngine = 'eleven'; return; }
      if (voiceEngine === 'eleven') {
        if (!voiceCancelled) setVoiceMode(voiceMode, 'Voice unavailable right now — skipped to keep the same voice.');
        return;
      }
      voiceEngine = 'browser'; // ElevenLabs never worked on this page: use one browser voice throughout
    }
    if (voiceCancelled) return;
    await speakBrowser(text);
  }

  function buildSettingsHtml() {
    const voices = (window.speechSynthesis.getVoices() || []).filter((v) => /^en/i.test(v.lang));
    const voiceOptions = ['<option value="">Best available</option>']
      .concat(voices.map((v) => `<option value="${escapeHtml(v.name)}" ${v.name === voiceName ? 'selected' : ''}>${escapeHtml(v.name)}</option>`))
      .join('');
    const dis = voiceEnabled ? '' : 'disabled';
    return `
      <div class="tc-settings" id="tc-settings">
        <label class="tc-set-row tc-set-main">
          <span>Voice assistant</span>
          <input type="checkbox" id="tc-set-enabled" ${voiceEnabled ? 'checked' : ''}>
        </label>
        <label class="tc-set-row"><span>Auto-read on page load</span>
          <input type="checkbox" id="tc-set-autoread" ${voiceAutoRead ? 'checked' : ''} ${dis}></label>
        <label class="tc-set-row"><span>Voice</span>
          <select id="tc-set-engine" ${dis}>
            <option value="auto" ${voiceEngineChoice === 'auto' ? 'selected' : ''}>Natural (ElevenLabs)</option>
            <option value="browser" ${voiceEngineChoice === 'browser' ? 'selected' : ''}>Browser voice only</option>
          </select></label>
        <label class="tc-set-row"><span>Browser voice</span>
          <select id="tc-set-voice" ${dis}>${voiceOptions}</select></label>
        <label class="tc-set-row"><span>Speed <b id="tc-set-rate-val">${voiceRate.toFixed(2)}x</b></span>
          <input type="range" id="tc-set-rate" min="0.7" max="1.5" step="0.05" value="${voiceRate}" ${dis}></label>
        <button class="tc-btn tc-set-test" id="tc-set-test" ${dis}>▶ Test voice</button>
      </div>`;
  }

  function bindSettingsHandlers(root) {
    const rerender = () => { if (currentAnalysis) renderUI(currentAnalysis, lastProfile, lastOverrides); };
    const resetEngine = () => { voiceEngine = null; pinnedBrowserVoice = null; ttsDisabled = false; };

    const gear = root.getElementById('tc-settings-btn');
    if (gear) gear.addEventListener('click', () => { settingsOpen = !settingsOpen; rerender(); });

    const on = (id, evt, fn) => { const el = root.getElementById(id); if (el) el.addEventListener(evt, fn); };
    on('tc-set-enabled', 'change', (e) => {
      voiceEnabled = e.target.checked;
      if (!voiceEnabled) stopVoice();
      saveVoiceSettings();
      rerender();
    });
    on('tc-set-autoread', 'change', (e) => { voiceAutoRead = e.target.checked; saveVoiceSettings(); });
    on('tc-set-engine', 'change', (e) => { voiceEngineChoice = e.target.value; resetEngine(); saveVoiceSettings(); });
    on('tc-set-voice', 'change', (e) => { voiceName = e.target.value; resetEngine(); saveVoiceSettings(); });
    on('tc-set-rate', 'input', (e) => {
      voiceRate = Number(e.target.value) || 1;
      const lbl = root.getElementById('tc-set-rate-val');
      if (lbl) lbl.textContent = voiceRate.toFixed(2) + 'x';
    });
    on('tc-set-rate', 'change', () => saveVoiceSettings());
    on('tc-set-test', 'click', async () => {
      stopVoice();
      voiceCancelled = false;
      await speak("Hi, this is how I'll sound when I read the terms to you.");
    });
  }

  function getPresentCategories() {
    if (!currentAnalysis) return [];
    return CATEGORIES.filter((c) => currentAnalysis.categories[c] && currentAnalysis.categories[c].present === true);
  }

  function spokenClause(cat) {
    const data = currentAnalysis.categories[cat];
    const lead = CATEGORY_RISK[cat] === 'high' ? 'Heads up, this one matters.' : 'Worth knowing.';
    const body = firstSentence(data.question ? '' : data.summary) || data.question || CATEGORY_META[cat].name;
    const clean = String(body).replace(/[“”"]/g, '').replace(/[.?!]+$/, '');
    return `${lead} ${clean}. Are you okay with that?`;
  }

  async function readAllAloud() {
    const cats = getPresentCategories();
    if (cats.length === 0) return;
    voiceCancelled = false;
    setVoiceMode('reading', '');
    await speak(`I read the terms on ${currentDomain} and found ${cats.length === 1 ? 'one thing' : cats.length + ' things'} worth a look.`);
    for (const cat of cats) {
      if (voiceCancelled) return;
      await speak(spokenClause(cat));
    }
    if (!voiceCancelled) setVoiceMode(null, '');
  }

  async function readOneAloud(cat) {
    stopVoice();
    voiceCancelled = false;
    setVoiceMode('reading', '');
    await speak(spokenClause(cat));
    if (!voiceCancelled) setVoiceMode(null, '');
  }

  function listenOnce(timeoutMs) {
    return new Promise((resolve) => {
      const Ctor = recognitionCtor();
      if (!Ctor) { resolve({ transcript: null, error: 'unsupported' }); return; }
      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      let done = false;
      let timer = null;
      const finish = (transcript, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (activeRecognition === rec) activeRecognition = null;
        resolve({ transcript, error: error || null });
      };
      rec.onresult = (e) => {
        const alts = Array.from(e.results[0] || []).map((a) => a.transcript).join(' ');
        finish(alts.toLowerCase());
      };
      rec.onerror = (ev) => finish(null, ev.error || 'error');
      rec.onend = () => finish(null);
      timer = setTimeout(() => { try { rec.stop(); } catch (e) { /* ignore */ } finish(null); }, timeoutMs);
      activeRecognition = rec;
      try { rec.start(); } catch (e) { finish(null, 'start-failed'); }
    });
  }

  function parseVoiceAnswer(t) {
    if (!t) return null;
    if (/\b(skip|next|later|pass)\b/.test(t)) return 'skip';
    if (/\b(no|not|reject|unacceptable|decline|disagree|never)\b/.test(t)) return 'no';
    if (/\b(yes|yeah|yep|accept|okay|ok|agree|fine|sure)\b/.test(t)) return 'yes';
    return null;
  }

  async function answerByVoice() {
    const cats = getPresentCategories();
    if (cats.length === 0) return;
    if (!recognitionCtor()) {
      setVoiceMode(null, 'Voice answers are not supported in this browser.');
      return;
    }
    voiceCancelled = false;
    setVoiceMode('listening', '');
    await speak(`Let's go through ${cats.length === 1 ? 'it' : 'them one by one'}. After each, just say yes, no, or skip.`);

    for (const cat of cats) {
      if (voiceCancelled) return;
      await speak(spokenClause(cat));
      let answer = null;
      for (let attempt = 0; attempt < 2 && !answer && !voiceCancelled; attempt++) {
        setVoiceMode('listening', '🎤 Listening… say yes, no or skip');
        const { transcript, error } = await listenOnce(8000);
        if (voiceCancelled) return;
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          setVoiceMode(null, 'Microphone access was blocked for this site. Allow it in the address bar to answer by voice.');
          return;
        }
        answer = parseVoiceAnswer(transcript);
        if (!answer && attempt === 0) await speak("Sorry, I missed that. Just say yes, no, or skip.");
      }
      if (voiceCancelled) return;
      if (answer === 'yes' || answer === 'no') {
        await recordChoice(cat, answer === 'yes');
        await speak(answer === 'yes' ? "Got it, noted." : "Okay, I've marked that as a no.");
      }
    }

    if (voiceCancelled) return;
    const reco = getRecommendation(getPresentCategories(), lastOverrides);
    if (reco.spoken) await speak(reco.spoken);
    if (!voiceCancelled) setVoiceMode(null, '');
  }

  let lastProfile = null;
  let lastOverrides = null;

  let choiceBusy = false;
  async function recordChoice(catKey, isYes) {
    if (choiceBusy) return; // ignore rapid double-clicks
    choiceBusy = true;
    try {
      const { profile: currentProfile, overrides: currentOverrides } = await getStorageData();
      const prev = currentOverrides[currentDomain] && currentOverrides[currentDomain][catKey];

      // Re-clicking the same answer must not inflate history counts
      if (prev !== isYes) {
        if (!currentProfile[catKey]) currentProfile[catKey] = { yes: 0, no: 0 };
        const st = currentProfile[catKey];
        // Changing an answer on this site replaces the earlier vote
        if (prev === true) st.yes = Math.max(0, (st.yes || 0) - 1);
        if (prev === false) st.no = Math.max(0, (st.no || 0) - 1);
        if (isYes) st.yes = (st.yes || 0) + 1; else st.no = (st.no || 0) + 1;

        if (!currentOverrides[currentDomain]) currentOverrides[currentDomain] = {};
        currentOverrides[currentDomain][catKey] = isYes;
        await saveStorageData(currentProfile, currentOverrides);
      }
      renderUI(currentAnalysis, currentProfile, currentOverrides);
    } finally {
      choiceBusy = false;
    }
  }

  async function renderUI(analysis, profile, overrides) {
    const root = ensureShadowRoot();
    currentAnalysis = analysis;
    lastProfile = profile;
    lastOverrides = overrides;

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
            <span class="tc-risk-tag tc-risk-${CATEGORY_RISK[catKey]}">${CATEGORY_RISK[catKey] === 'high' ? 'High risk' : 'Medium risk'}</span>
            ${voiceOn() ? `<button class="tc-icon-btn tc-speak-btn" data-cat="${catKey}" title="Read this clause aloud">🔊</button>` : ''}
          </div>
          <div>
            <span class="tc-badge ${status.badgeType}">${status.badgeText}</span>
          </div>
          ${buildQuestionHtml(catKey, data)}
          <div class="tc-card-actions">
            <button class="tc-btn tc-btn-yes ${isCurrentYes ? 'active' : ''}" data-cat="${catKey}" data-choice="yes">
              ${isCurrentYes ? '✓ ' : ''}Accept (Yes)
            </button>
            <button class="tc-btn tc-btn-no ${isCurrentNo ? 'active' : ''}" data-cat="${catKey}" data-choice="no">
              ${isCurrentNo ? '✕ ' : ''}Unacceptable (No)
            </button>
            ${canJumpToClause(catKey) ? `<button class="tc-btn tc-btn-view tc-view-btn" data-cat="${catKey}" title="Jump to this clause in the terms">📖 View Clause</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const recommendationHtml = presentCategories.length > 0
      ? buildRecommendationHtml(presentCategories, overrides)
      : '';

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
            ${voiceOn() ? `<button class="tc-icon-btn" id="tc-voice-read" title="Read flagged clauses aloud">🔊</button>` : ''}
            ${voiceOn() && recognitionCtor() ? `<button class="tc-icon-btn" id="tc-voice-answer" title="Answer by voice (say yes / no / skip)">🎤</button>` : ''}
            ${voiceSupported() ? `<button class="tc-icon-btn" id="tc-settings-btn" title="Voice settings" aria-expanded="${settingsOpen}">⚙️</button>` : ''}
            <button class="tc-icon-btn" id="tc-minimize-btn" title="Minimize">—</button>
            <button class="tc-icon-btn" id="tc-close-btn" title="Close">&times;</button>
          </div>
        </div>

        <!-- Subheader Meta -->
        <div class="tc-subbar">
          <span class="tc-engine-pill">${escapeHtml(analysis.engine)}</span>
          <span class="tc-subbar-right">
            <button class="tc-reset-btn" id="tc-reset-btn">Reset Learned History</button>
          </span>
        </div>
        ${settingsOpen && voiceSupported() ? buildSettingsHtml() : ''}
        <div class="tc-voice-notice" id="tc-voice-notice" style="display: none;"></div>

        <!-- Dealbreaker Alert Banner -->
        ${hasDealbreaker ? `
          <div class="tc-dealbreaker-banner">
            <span>🚨</span>
            <span>Caution: Agreement contains terms you routinely reject!</span>
          </div>
        ` : ''}

        <!-- Cards List -->
        <div class="tc-body">
          ${categoryCardsHtml}
        </div>

        <!-- Recommendation Bar -->
        ${recommendationHtml}

        <!-- Footer -->
        <div class="tc-footer">
          <span>Preferences learn automatically as you answer.</span>
          <span>${presentCategories.length} clause${presentCategories.length === 1 ? '' : 's'} flagged</span>
        </div>
      </div>
    `;

    // Event Handlers
    root.getElementById('tc-minimize-btn').addEventListener('click', () => {
      stopVoice();
      isMinimized = true;
      renderUI(analysis, profile, overrides);
    });

    root.getElementById('tc-close-btn').addEventListener('click', () => {
      stopVoice();
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

    // View Clause buttons
    root.querySelectorAll('.tc-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => jumpToClause(btn.getAttribute('data-cat')));
    });

    // Voice controls
    const readBtn = root.getElementById('tc-voice-read');
    if (readBtn) {
      readBtn.addEventListener('click', () => {
        if (voiceMode) stopVoice(); else readAllAloud();
      });
    }
    const answerBtn = root.getElementById('tc-voice-answer');
    if (answerBtn) {
      answerBtn.addEventListener('click', () => {
        if (voiceMode) stopVoice(); else answerByVoice();
      });
    }
    bindSettingsHandlers(root);
    root.querySelectorAll('.tc-speak-btn').forEach((btn) => {
      btn.addEventListener('click', () => readOneAloud(btn.getAttribute('data-cat')));
    });
    applyVoiceButtonState();

    // Accept / Reject Buttons
    root.querySelectorAll('.tc-btn-yes, .tc-btn-no').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget;
        await recordChoice(target.getAttribute('data-cat'), target.getAttribute('data-choice') === 'yes');
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
  let initStarted = false;
  async function init() {
    if (initStarted) return;
    initStarted = true;
    try {
      await runInit();
    } catch (e) {
      console.warn('[T&C Guardian] init failed:', e);
    }
  }

  async function runInit() {
    let rawText = '';
    let remoteUrl = null;

    if (isTermsPage()) {
      // Analyze current page text
      rawText = (document.body && (document.body.innerText || document.body.textContent)) || '';
      buildClauseRefsFromDom();
    } else if (hasSignupIndicators()) {
      // Sign-up context: silently pre-fetch the linked terms
      const termsUrl = findTermsLink();
      if (termsUrl) {
        clauseSourceUrl = termsUrl;
        if (new URL(termsUrl).origin === window.location.origin) {
          rawText = await fetchTermsUrl(termsUrl);
          if (rawText) buildClauseRefsFromText(rawText);
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
    const hasFlags = CATEGORIES.some((c) => analysisData.categories[c] && analysisData.categories[c].present === true);
    if (!hasFlags) return;

    await loadVoiceSettings();
    renderUI(analysisData, profile, overrides);

    // Chrome only allows speech after user activation on the page, so this may stay silent
    if (voiceAutoRead && voiceOn()) readAllAloud();
  }

  // Voices load asynchronously in Chrome: refresh the settings list when they arrive
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        if (settingsOpen && currentAnalysis && lastProfile) renderUI(currentAnalysis, lastProfile, lastOverrides);
      });
    }
  } catch (e) { /* ignore */ }

  // Stop any speech when leaving the page
  window.addEventListener('pagehide', () => {
    stopTtsAudio();
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  });

  // Run when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

