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
    ANALYSIS_CACHE: 'tc_guardian_analysis_cache',
    ALWAYS_SHOW_WIDGET: 'tc_always_show_widget'
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
  let sourceClauses = {};
  let isMinimized = null;
  let isDismissedForSession = false;
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

  function getAlwaysShowWidgetSetting() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.get([STORAGE_KEYS.ALWAYS_SHOW_WIDGET], (res) => {
            resolve(Boolean(res && res[STORAGE_KEYS.ALWAYS_SHOW_WIDGET]));
          });
          return;
        } catch (e) {
          console.warn('[TC-Guardian] Error reading alwaysShowWidget:', e);
        }
      }
      try {
        resolve(localStorage.getItem(STORAGE_KEYS.ALWAYS_SHOW_WIDGET) === 'true');
      } catch {
        resolve(false);
      }
    });
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
  // Names that also mark a legal page (e.g. "User Agreement", "/policies/", "Acceptable Use")
  const LEGAL_NAME_REGEX = /user[\s_-]*agreement|service[\s_-]*agreement|agreement|polic(y|ies)|acceptable[\s_-]*use|content[\s_-]*rules|guidelines|disclaimer|cookies?[\s_-]*notice|data[\s_-]*processing/i;
  const LEGAL_PHRASE_REGEX = /\b(arbitration|governing law|class action|limitation of liability|you agree (to|that)|terminate your account|personal information|indemnif\w+|jurisdiction|warranty|license to)\b/gi;

  function isTermsPage() {
    const url = window.location.href;
    const title = document.title || '';
    const text = (document.body && (document.body.innerText || document.body.textContent || '').trim()) || '';
    const textLen = text.length;
    if (textLen <= 1000) return false;

    // 1. Obvious names in the URL or title (terms, privacy, legal, ...)
    if (TERMS_REGEX.test(url) || TERMS_REGEX.test(title)) return true;

    // 2. Other legal names (user agreement, policies, ...) need a long page to avoid false positives
    if ((LEGAL_NAME_REGEX.test(url) || LEGAL_NAME_REGEX.test(title)) && textLen > 3000) return true;

    // 3. Content-based: a long page dense with legal wording is a terms page whatever it is called
    if (textLen > 5000) {
      const hits = new Set((text.slice(0, 60000).match(LEGAL_PHRASE_REGEX) || []).map((m) => m.toLowerCase()));
      if (hits.size >= 4) return true;
    }
    return false;
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

  const SIGNUP_CHECKOUT_LEGAL_URL_REGEX = /(?:sign-?up|register|registration|join|create-?account|create_account|checkout|check-out|cart|billing|subscription|subscribe|order|purchase|payment|pay|terms|privacy|(?:^|[^a-z])tos(?:[^a-z]|$)|conditions|legal|eula|policy|policies)/i;
  const SIGNUP_CHECKOUT_LEGAL_TITLE_META_REGEX = /(?:sign\s*up|register|registration|create\s*(?:an\s*)?account|join\s*(?:today|us|now)?|checkout|check\s*out|place\s*order|billing|subscription|subscribe|payment|terms\s*of|privacy\s*policy|legal\s*terms|user\s*agreement|conditions\s*of\s*use|eula)/i;
  const SIGNUP_CHECKOUT_ACTION_BTN_REGEX = /^(?:sign\s*up|create\s*(?:an\s*)?account|register|complete\s*(?:registration|sign\s*up|order)|place\s*order|checkout|subscribe|start\s*(?:free\s*)?trial|pay\s*now)$/i;

  /**
   * Check if current page is a Signup, Checkout, or Legal page
   */
  function isSignupCheckoutOrLegalPage() {
    // 1. Direct Terms/Legal page detection
    if (isTermsPage()) return true;

    // 2. URL Path, Hash, Search, or Full URL Match
    try {
      const url = window.location.href || '';
      const pathname = window.location.pathname || '';
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      if (
        SIGNUP_CHECKOUT_LEGAL_URL_REGEX.test(pathname) ||
        SIGNUP_CHECKOUT_LEGAL_URL_REGEX.test(hash) ||
        SIGNUP_CHECKOUT_LEGAL_URL_REGEX.test(search) ||
        SIGNUP_CHECKOUT_LEGAL_URL_REGEX.test(url)
      ) {
        return true;
      }
    } catch (e) { }

    // 3. Page Title & Meta Tags Check
    try {
      const title = document.title || '';
      if (SIGNUP_CHECKOUT_LEGAL_TITLE_META_REGEX.test(title)) return true;

      const metaTags = document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="keywords"]');
      for (const meta of metaTags) {
        const content = meta.getAttribute('content') || '';
        if (SIGNUP_CHECKOUT_LEGAL_TITLE_META_REGEX.test(content)) return true;
      }
    } catch (e) { }

    // 4. Signup / Checkout Interactive Elements
    try {
      // Buttons indicating primary registration, checkout, or subscription action
      const buttons = document.querySelectorAll('button, input[type="submit"], a.btn, a[role="button"]');
      for (const btn of buttons) {
        const text = (btn.textContent || btn.value || '').trim();
        if (SIGNUP_CHECKOUT_ACTION_BTN_REGEX.test(text)) return true;
      }

      // Password input combined with terms agreement checkbox or registration cues
      const hasPassword = Boolean(document.querySelector('input[type="password"]'));
      const hasTermsCheckbox = Boolean(document.querySelector('input[type="checkbox"][name*="terms" i], input[type="checkbox"][id*="terms" i], input[type="checkbox"][name*="agree" i], input[type="checkbox"][id*="agree" i]'));
      if (hasPassword && hasTermsCheckbox) return true;

      // Form action URL targeting signup/register/checkout
      const forms = document.querySelectorAll('form[action]');
      for (const form of forms) {
        const action = form.getAttribute('action') || '';
        if (SIGNUP_CHECKOUT_LEGAL_URL_REGEX.test(action)) return true;
      }
    } catch (e) { }

    return false;
  }

  function findTermsLink() {
    const links = Array.from(document.querySelectorAll('a[href]'));
    for (const a of links) {
      const text = (a.textContent || '').trim();
      const label = a.getAttribute('aria-label') || a.getAttribute('title') || '';
      if (TERMS_LINK_REGEX.test(text) || TERMS_LINK_REGEX.test(label)) {
        if (/^(https?|file):/i.test(a.href)) return a.href;
      }
    }
    // Second pass: link URL looks like a legal page (e.g. footer "/privacy", "/terms")
    const urlLike = /\/(?:terms|tos|privacy|legal|eula|conditions)(?:[-_/.?]|$)/i;
    for (const a of links) {
      if (/^(https?|file):/i.test(a.href) && urlLike.test(new URL(a.href).pathname)) return a.href;
    }
    return null;
  }

  async function fetchTermsUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok && response.status !== 0) throw new Error(`HTTP ${response.status}`);
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

  function getFallbackResolutionSteps(catKey, domain = '') {
    const cleanDomain = String(domain || currentDomain || '').toLowerCase().replace(/^www\./, '');
    if (catKey === 'DATA_SALE') {
      return [
        'Visit the site\'s Privacy Settings or footer and select "Do Not Sell My Info" or "Cookie Preferences".',
        'Toggle off third-party ad targeting, data sharing, and behavioral tracking.',
        'Submit a formal CCPA/GDPR opt-out request through their privacy webform or email.'
      ];
    }
    if (catKey === 'AI_TRAINING') {
      return [
        'Open your Account Settings or Privacy / Data Controls dashboard.',
        'Locate "Model Improvement", "AI Training", or "Content Permissions".',
        'Turn off the toggle allowing your prompts, files, or uploaded data to train artificial intelligence models.'
      ];
    }
    if (catKey === 'AUTO_RENEW') {
      const guide = getDefaultCancellationGuide(domain);
      return guide.steps;
    }
    if (catKey === 'WAIVE_RIGHTS') {
      return [
        'Review the Arbitration section in the terms for an opt-out deadline (typically 30 days from sign-up).',
        'Draft a brief written notice stating your name, account identifier, and explicit rejection of the arbitration clause.',
        'Send the opt-out notice via email or certified mail to the company\'s designated legal notice address.'
      ];
    }
    if (catKey === 'NO_DELETE') {
      return [
        'Contact customer support or the Data Protection Officer requesting total account erasure.',
        'Cite your right to deletion under GDPR (Article 17) or CCPA where applicable.',
        'Request written confirmation once persistent records and backup archives are purged.'
      ];
    }
    return [];
  }

  function generateLocalMockResponse(text) {
    // Negation-aware keyword detection to prevent false positives (e.g., "do not sell", "never sell")
    const checkUnnegated = (pattern) => {
      let m;
      const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      while ((m = regex.exec(text)) !== null) {
        const preceding = text.slice(Math.max(0, m.index - 60), m.index);
        if (!/\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not)\b/i.test(preceding)) {
          return true;
        }
      }
      return false;
    };

    const hasDataSale = checkUnnegated(/(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)\b(sell|sold|selling|monetiz\w*)\b[^.]{0,60}(personal|data|information)|data brokers?|(?<!\b(?:no\s+|not\s+))sale of (your )?(personal )?(data|information)/gi);
    const hasAiTraining = checkUnnegated(/(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:train(ing)?\b[^.]{0,60}\b(models?|artificial intelligence|machine learning|\bAI\b)|\b(artificial intelligence|machine learning)\b[^.]{0,60}\btrain)/gi);
    const hasAutoRenew = checkUnnegated(/(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't)\s+(?:to\s+|ever\s+)?)auto(matic(ally)?)?[- ]?renew|renews? automatically|recurring (billing|subscription|charge)/gi);
    const hasNoDelete = checkUnnegated(/(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't)\s+(?:to\s+|ever\s+)?)(retain|keep|preserve|store)[^.]{0,80}(indefinite(ly)?|after (you )?(delet|terminat|clos))|backups?[^.]{0,60}(indefinite|retain)/gi);
    const hasWaiveRights = checkUnnegated(/binding arbitration|class[- ]action (waiver|waive)|waive[^.]{0,60}(jury|class action)/gi);

    const currentEngine = 'Keyword Heuristic (Standalone Fallback)';
    const finalData = {
      DATA_SALE: {
        present: hasDataSale,
        summary: 'Sells or discloses your behavioral telemetry and profile to commercial third-party data brokers and marketing networks.'
      },
      AI_TRAINING: {
        present: hasAiTraining,
        summary: 'Grants an irrevocable license to train proprietary artificial intelligence and neural network models using your uploads and prompts.'
      },
      AUTO_RENEW: {
        present: hasAutoRenew,
        summary: 'Enforces automatic recurring subscription renewals ($99/mo) accompanied by strict non-refundable cancellation terms.'
      },
      NO_DELETE: {
        present: hasNoDelete,
        summary: 'Preserves customer data and activity logs indefinitely in persistent archives even after explicit account deletion requests.'
      },
      WAIVE_RIGHTS: {
        present: hasWaiveRights,
        summary: 'Mandates individual binding arbitration and forces you to waive all rights to trial by jury and class action participation.'
      }
    };

    return {
      success: true,
      engine: currentEngine,
      categories: finalData,
      data: finalData
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
          present: Boolean(catData.present),
          summary: catData.summary || CATEGORY_META[catKey].defaultSummary,
          shortSummary: catData.shortSummary || '',
          snippet: catData.snippet || '',
          optOutSteps: Array.isArray(catData.optOutSteps) ? catData.optOutSteps : null,
          optOutLink: catData.optOutLink || null,
          cancellationGuide: catData.cancellationGuide || null,
          acknowledged: Boolean(catData.acknowledged)
        };
      } else {
        normalized[catKey] = {
          present: false,
          summary: CATEGORY_META[catKey].defaultSummary,
          shortSummary: '',
          snippet: '',
          optOutSteps: null,
          optOutLink: null,
          cancellationGuide: null,
          acknowledged: false
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
      host.className = 'tc-widget-container';
      host.style.position = 'fixed';
      host.style.top = '0';
      host.style.right = '0';
      host.style.width = '0';
      host.style.height = '0';
      host.style.zIndex = '2147483647';
      host.style.overflow = 'visible';
      (document.body || document.documentElement).appendChild(host);
    }
    host.style.display = 'block';
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
        color: #0f172a;
        line-height: 1.5;
        box-sizing: border-box;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      /* Base Floating Widget Container */
      .tc-widget-container {
        display: block;
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
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: tc-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(12px);
        color: #0f172a;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
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
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-radius: 30px;
        padding: 8px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        font-weight: 600;
        font-size: 13px;
        transition: transform 0.15s ease, background 0.15s ease;
      }

      .tc-bubble:hover {
        transform: translateY(-2px);
        background: #f8fafc;
      }

      .tc-bubble-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        margin-left: 4px;
        border-radius: 50%;
        color: #94a3b8;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }

      .tc-bubble-close:hover {
        background: #e2e8f0;
        color: #0f172a;
      }

      .tc-bubble-dealbreaker {
        border-color: #ef4444;
        color: #dc2626;
        animation: pulse-danger 2s infinite;
      }

      @keyframes pulse-danger {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
      }

      /* Header */
      .tc-header {
        padding: 14px 18px;
        background: inherit;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
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
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f1f5f9;
        color: #0f172a;
        font-weight: 700;
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        letter-spacing: 0.2px;
      }

      .tc-header-mascot {
        width: 18px;
        height: 18px;
        object-fit: contain;
        vertical-align: middle;
      }

      .tc-bubble-mascot {
        width: 18px;
        height: 18px;
        object-fit: contain;
        vertical-align: middle;
      }

      .tc-title {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tc-domain-tag {
        font-size: 11px;
        color: #475569;
        background: #f1f5f9;
        padding: 2px 8px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
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
        color: #64748b;
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
        background: #f1f5f9;
        color: #0f172a;
      }

      /* Card List */
      .tc-body {
        padding: 14px 18px;
        overflow-y: auto;
        max-height: calc(100vh - 220px);
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: transparent;
      }

      .tc-body::-webkit-scrollbar {
        width: 6px;
      }

      .tc-body::-webkit-scrollbar-track {
        background: transparent;
      }

      .tc-body::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 3px;
      }

      /* Base Finding Card */
      .tc-card,
      .tc-risk-item {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      /* Risk-Themed Accents on Inner Risk Item Containers */
      .tc-card.risk-high,
      .tc-card.tc-card-dealbreaker,
      .tc-risk-item.risk-high {
        background-color: #fef2f2 !important;
        border-left: 5px solid #dc2626 !important;
        border-color: #fecaca !important;
      }

      .tc-card.risk-med,
      .tc-risk-item.risk-med {
        background-color: #fffbeb !important;
        border-left: 5px solid #d97706 !important;
        border-color: #fde68a !important;
      }

      .tc-card.risk-low,
      .tc-risk-item.risk-low {
        background-color: #f0fdf4 !important;
        border-left: 5px solid #16a34a !important;
        border-color: #bbf7d0 !important;
      }

      .tc-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }

      .tc-card-question {
        font-size: 13.5px;
        font-weight: 600;
        color: #334155;
        margin-bottom: 12px;
        line-height: 1.4;
      }

      .tc-card-title {
        font-size: 13.5px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.4;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .tc-question {
        font-size: 13.5px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.4;
        margin-bottom: 8px;
      }

      .tc-quote {
        font-size: 11.5px;
        color: #64748b;
        font-style: italic;
        margin-top: 6px;
        line-height: 1.45;
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
        padding: 2px 7px;
        border-radius: 9999px;
        text-transform: uppercase;
        flex-shrink: 0;
      }

      .tc-risk-pill.risk-high {
        background: #fee2e2;
        color: #dc2626;
        border: 1px solid #fca5a5;
      }

      .tc-risk-pill.risk-med {
        background: #fef3c7;
        color: #d97706;
        border: 1px solid #fde68a;
      }

      .tc-risk-pill.risk-low {
        background: #dcfce7;
        color: #16a34a;
        border: 1px solid #bbf7d0;
      }

      .tc-card-summary {
        font-size: 12px;
        color: #334155;
        line-height: 1.55;
        margin-bottom: 12px;
        background: rgba(255, 255, 255, 0.8);
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
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
        color: #0284c7;
        font-weight: 600;
        font-size: 12px;
        background: #f0f9ff;
        padding: 2px 8px;
        border-radius: 6px;
        border: 1px solid #bae6fd;
        font-family: monospace;
      }

      /* Injected Short Summary Text */
      .tc-card-short-summary {
        font-size: 12.5px;
        color: #334155;
        line-height: 1.45;
        margin-bottom: 10px;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      /* Accessible Clause Details & Summary (Native Elements) */
      details.tc-clause-details {
        margin-top: 8px;
        margin-bottom: 12px;
        border-top: 1px dashed rgba(0, 0, 0, 0.08);
        padding-top: 8px;
      }

      summary.tc-clause-summary {
        list-style: none;
        cursor: pointer;
        color: #0369a1;
        font-size: 11.5px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        transition: all 0.15s ease;
        user-select: none;
      }

      summary.tc-clause-summary::-webkit-details-marker {
        display: none;
      }

      summary.tc-clause-summary::after {
        content: '▸';
        font-size: 10px;
        color: #0369a1;
        transition: transform 0.2s ease;
      }

      details.tc-clause-details[open] > summary.tc-clause-summary::after {
        transform: rotate(90deg);
      }

      summary.tc-clause-summary:hover {
        background: #e0f2fe;
        color: #0284c7;
      }

      details.tc-clause-details .tc-quote {
        margin-top: 8px;
        padding: 8px 12px;
        background: #f8fafc;
        border-left: 3px solid #cbd5e1;
        border-radius: 6px;
        font-size: 11.5px;
        color: #475569;
        font-style: italic;
        line-height: 1.5;
        word-break: break-word;
      }

      /* Resolution Guide UI (Native <details> and <summary>) */
      details.tc-resolution-guide {
        margin-top: 8px;
        margin-bottom: 12px;
        border-top: 1px dashed rgba(0, 0, 0, 0.08);
        padding-top: 8px;
      }

      details.tc-resolution-guide summary {
        list-style: none;
        cursor: pointer;
        color: #d97706;
        font-size: 11.5px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 6px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        transition: all 0.15s ease;
        user-select: none;
      }

      details.tc-resolution-guide summary::-webkit-details-marker {
        display: none;
      }

      details.tc-resolution-guide summary::after {
        content: '▸';
        font-size: 10px;
        color: #d97706;
        transition: transform 0.2s ease;
      }

      details.tc-resolution-guide[open] > summary::after {
        transform: rotate(90deg);
      }

      details.tc-resolution-guide summary:hover {
        background: #fef3c7;
        color: #b45309;
      }

      details.tc-resolution-guide .tc-resolution-content {
        margin-top: 8px;
        padding: 10px 12px;
        background: #ffffff;
        border: 1px solid #fde68a;
        border-radius: 8px;
        font-size: 11.5px;
        color: #475569;
        line-height: 1.5;
      }

      details.tc-resolution-guide ol.tc-resolution-steps {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      details.tc-resolution-guide ol.tc-resolution-steps li {
        color: #334155;
      }

      .tc-resolution-link-wrapper {
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px dashed #e2e8f0;
      }

      .tc-resolution-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #2563eb;
        font-weight: 600;
        font-size: 11px;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .tc-resolution-link:hover {
        color: #1d4ed8;
      }

      /* Action Buttons: Soft Rounded Aesthetic */
      .tc-btn-view-clause,
      .tc-view-btn {
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        color: #0369a1;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
      }

      .tc-btn-view-clause:hover,
      .tc-view-btn:hover {
        background: #e0f2fe;
        color: #0284c7;
        border-color: #7dd3fc;
      }

      .tc-btn-how-to-cancel {
        background: #fffbeb;
        border: 1px solid #fde68a;
        color: #b45309;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
      }

      .tc-btn-how-to-cancel:hover,
      .tc-btn-how-to-cancel.active {
        background: #fef3c7;
        color: #92400e;
        border-color: #fcd34d;
        box-shadow: 0 2px 6px rgba(245, 158, 11, 0.2);
      }

      /* How to Stop Auto-Pay Guide */
      .tc-cancel-guide-panel {
        background: #fffdf5;
        border: 1px solid #fde68a;
        border-radius: 12px;
        padding: 12px 14px;
        margin-top: 8px;
        margin-bottom: 12px;
        font-size: 12px;
        animation: tc-fade-in 0.2s ease;
      }

      .tc-cancel-guide-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        color: #92400e;
        margin-bottom: 10px;
        font-size: 12.5px;
      }

      .tc-cancel-steps-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 10px;
      }

      .tc-cancel-step-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 11.5px;
        color: #451a03;
        line-height: 1.45;
      }

      .tc-step-num-badge {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fef3c7;
        border: 1px solid #fde68a;
        color: #b45309;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        flex-shrink: 0;
      }

      .tc-step-text {
        flex: 1;
      }

      .tc-cancel-guide-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 12px;
        background: #f59e0b;
        color: #0f172a;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 700;
        font-size: 11.5px;
        transition: all 0.15s ease;
      }

      .tc-cancel-guide-link:hover {
        background: #d97706;
      }

      .tc-cancel-guide-note {
        font-size: 10px;
        color: #92400e;
        margin-top: 6px;
      }

      .tc-source-preview {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
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
        color: #1e293b;
        font-size: 12px;
        line-height: 1.45;
        margin-bottom: 8px;
      }

      .tc-bullet-dot {
        color: #0284c7;
        font-size: 16px;
        line-height: 1.1;
        user-select: none;
      }

      .tc-bullet-content {
        flex: 1;
      }

      .tc-bullet-label {
        font-weight: 700;
        color: #0369a1;
        margin-right: 4px;
      }

      .tc-bullet-text {
        color: #334155;
      }

      /* Raw Legal Snippet Accordion */
      .tc-raw-accordion {
        margin-top: 6px;
        border-top: 1px solid #e2e8f0;
        padding-top: 6px;
      }

      .tc-accordion-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        padding: 4px 2px;
        user-select: none;
        list-style: none;
        transition: color 0.15s ease;
      }

      .tc-accordion-toggle::-webkit-details-marker {
        display: none;
      }

      .tc-accordion-toggle:hover {
        color: #0f172a;
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
        color: #0284c7;
        margin-bottom: 6px;
      }

      .tc-source-preview-body {
        color: #475569;
        font-style: italic;
        font-size: 11.5px;
        line-height: 1.45;
        background: #ffffff;
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
        border-left: 3px solid #0284c7;
        word-break: break-word;
        white-space: pre-wrap;
      }

      .tc-override-pill {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 6px;
      }

      .tc-override-pill.pill-yes {
        background: #dcfce7;
        color: #15803d;
        border: 1px solid #bbf7d0;
      }

      .tc-override-pill.pill-no {
        background: #fee2e2;
        color: #b91c1c;
        border: 1px solid #fecaca;
      }

      .tc-dealbreaker-pill {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 6px;
        background: #fee2e2;
        color: #b91c1c;
        border: 1px solid #fecaca;
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
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        letter-spacing: 0.3px;
        transition: all 0.15s ease;
        border: 1px solid transparent;
      }

      .tc-btn-yes {
        background: #ecfdf5;
        color: #047857;
        border-color: #a7f3d0;
      }

      .tc-btn-yes:hover {
        background: #10b981;
        color: #ffffff;
        border-color: #10b981;
        box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
      }

      .tc-btn-yes.active {
        background: #059669;
        color: #ffffff;
        border-color: #059669;
        box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);
      }

      .tc-btn-no {
        background: #fef2f2;
        color: #b91c1c;
        border-color: #fecaca;
      }

      .tc-btn-no:hover {
        background: #ef4444;
        color: #ffffff;
        border-color: #ef4444;
        box-shadow: 0 2px 6px rgba(239, 68, 68, 0.25);
      }

      .tc-btn-no.active {
        background: #dc2626;
        color: #ffffff;
        border-color: #dc2626;
        box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
      }

      /* Empty State */
      .tc-empty {
        text-align: center;
        padding: 24px;
        color: #64748b;
      }

      .tc-empty-icon {
        font-size: 28px;
        margin-bottom: 8px;
      }

      /* Recommendation Verdict Bar */
      .tc-reco {
        padding: 10px 14px;
        margin: 0 18px 10px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
        display: flex;
        align-items: center;
        gap: 8px;
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

      /* Voice settings + notices */
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
      .tc-voice-notice { padding: 6px 18px; font-size: 11px; color: #fde68a; background: rgba(245, 158, 11, 0.12); }
      .tc-speak-btn { margin-left: auto; padding: 0 4px; font-size: 12px; }

      .tc-risk-tag {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }

      .tc-reco-danger {
        background-color: #fef2f2 !important;
        border-left: 5px solid #dc2626 !important;
        border: 1px solid #fecaca;
        color: #991b1b;
      }
      }

      .tc-reco-warn {
        background-color: #fffbeb !important;
        border-left: 5px solid #d97706 !important;
        border: 1px solid #fde68a;
        color: #92400e;
      }

      .tc-reco-safe {
        background-color: #f0fdf4 !important;
        border-left: 5px solid #16a34a !important;
        border: 1px solid #bbf7d0;
        color: #166534;
      }

      .tc-reco-pending {
        background-color: #f8fafc;
        border-left: 5px solid #94a3b8;
        border: 1px solid #e2e8f0;
        color: #475569;
      }

      /* Footer */
      .tc-footer {
        padding: 10px 18px;
        background: inherit;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
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
  let voiceSettingsLoaded = false;

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
        chrome.storage.local.set({
          [VOICE_KEY]: {
            autoRead: voiceAutoRead, enabled: voiceEnabled, engine: voiceEngineChoice, rate: voiceRate, voiceName
          }
        });
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
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = voiceRate * 0.97;
        u.pitch = 1;
        const v = pickBrowserVoice();
        if (v) u.voice = v;
        u.onend = () => resolve();
        u.onerror = (e) => {
          console.warn('[TC-Guardian] Browser speech synthesis error:', e);
          resolve();
        };
        window.speechSynthesis.speak(u);
      } catch (err) {
        console.warn('[TC-Guardian] speakBrowser exception:', err);
        resolve();
      }
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
    const domainOverrides = (lastOverrides && lastOverrides[currentDomain]) || {};
    return CATEGORIES.filter((c) => {
      const d = currentAnalysis.categories[c];
      return Boolean(d && d.present === true && d.acknowledged !== true && !Object.prototype.hasOwnProperty.call(domainOverrides, c));
    });
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

  function getHighestRiskMascotFileName(analysis) {
    let hasHigh = false;
    let hasMed = false;
    let hasLow = false;

    if (analysis && analysis.categories) {
      CATEGORIES.forEach((catKey) => {
        if (analysis.categories[catKey]?.present === true) {
          const level = CATEGORY_META[catKey]?.riskLevel;
          if (level === 'HIGH') hasHigh = true;
          else if (level === 'MEDIUM') hasMed = true;
          else if (level === 'LOW') hasLow = true;
        }
      });
    }

    if (hasHigh) {
      return 'icons/guardian-high-risk.png';
    } else if (hasMed) {
      return 'icons/guardian-medium-risk.png';
    } else if (hasLow) {
      return 'icons/guardian-low-risk.png';
    }
    return 'icons/guardian-neutral.png';
  }

  function getHighestRiskMascot(analysis) {
    const fileName = getHighestRiskMascotFileName(analysis);
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      try {
        return chrome.runtime.getURL(fileName);
      } catch (e) {
        return fileName;
      }
    }
    return fileName;
  }

  async function renderUI(analysis, profile, overrides) {
    currentAnalysis = analysis;
    lastProfile = profile;
    lastOverrides = overrides;

    if (isDismissedForSession) {
      const host = document.getElementById('tc-guardian-host');
      if (host) host.style.display = 'none';
      if (shadowRoot) {
        const container = shadowRoot.querySelector('.tc-widget-container');
        if (container) container.style.display = 'none';
      }
      return;
    }

    if (!voiceSettingsLoaded) { voiceSettingsLoaded = true; await loadVoiceSettings(); }
    currentAnalysis = analysis;
    lastProfile = profile;
    lastOverrides = overrides;

    const domainOverrides = (overrides && overrides[currentDomain]) || {};

    // Silent Memory: Only consider categories where present === true AND acknowledged !== true
    const unacknowledgedActiveCategories = CATEGORIES.filter((catKey) => {
      const catData = analysis?.categories?.[catKey];
      const hasOverride = Object.prototype.hasOwnProperty.call(domainOverrides, catKey);
      return Boolean(catData && catData.present === true && catData.acknowledged !== true && !hasOverride);
    });

    const alwaysShowWidget = await getAlwaysShowWidgetSetting();

    // If total number of unacknowledged active risks is 0, check alwaysShowWidget override
    if (unacknowledgedActiveCategories.length === 0) {
      if (!alwaysShowWidget) {
        if (shadowRoot) {
          shadowRoot.innerHTML = '';
        }
        const host = document.getElementById('tc-guardian-host');
        if (host) {
          host.style.display = 'none';
        }
        return;
      }
      if (isMinimized === null || isMinimized === undefined) {
        isMinimized = true;
      }
    } else {
      if (isMinimized === null || isMinimized === undefined) {
        isMinimized = false;
      }
    }

    // Banner: a flagged category the user has historically rejected most of the time (history only, never auto-decides)
    const hasDealbreaker = unacknowledgedActiveCategories.some((c) => {
      const st = (profile && profile[c]) || { yes: 0, no: 0 };
      const total = (Number(st.yes) || 0) + (Number(st.no) || 0);
      return total > 0 && (Number(st.no) || 0) / total >= 0.6;
    });

    const root = ensureShadowRoot();
    const host = document.getElementById('tc-guardian-host');
    if (host && host.style.display === 'none') {
      host.style.display = '';
    }
    const mascotFileName = getHighestRiskMascotFileName(analysis);
    const mascotSrc = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL(mascotFileName)
      : mascotFileName;

    if (isMinimized) {
      // Count dealbreakers
      let dealbreakerCount = 0;
      unacknowledgedActiveCategories.forEach((catKey) => {
        const catStats = (profile && profile[catKey]) || { yes: 0, no: 0 };
        const no = Number(catStats.no) || 0;
        const total = Number(catStats.yes || 0) + no;
        if (total > 0 && no >= 2 && (no / total) >= 0.60) dealbreakerCount++;
      });

      root.innerHTML = `
        <style>${getCSS()}</style>
        <div class="tc-widget-container">
          <button class="tc-bubble ${dealbreakerCount > 0 ? 'tc-bubble-dealbreaker' : ''}" id="tc-expand-btn">
            <img class="tc-bubble-mascot" src="${escapeHtml((typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL(mascotFileName) : mascotSrc)}" alt="T&C Guardian" />
            <span>T&C Guardian</span>
            ${dealbreakerCount > 0 ? `<span style="color: #ef4444;">(${dealbreakerCount} ⚠️)</span>` : ''}
            <div class="tc-bubble-close">×</div>
          </button>
        </div>
      `;

      root.getElementById('tc-expand-btn').addEventListener('click', () => {
        isMinimized = false;
        renderUI(analysis, profile, overrides);
      });

      const bubbleCloseBtn = root.querySelector('.tc-bubble-close');
      if (bubbleCloseBtn) {
        bubbleCloseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          isDismissedForSession = true;
          const containers = [
            root.querySelector('.tc-widget-container'),
            document.querySelector('.tc-widget-container'),
            document.getElementById('tc-guardian-host')
          ];
          containers.forEach((el) => {
            if (el) el.style.display = 'none';
          });
        });
      }
      return;
    }

    // Strictly sort the unacknowledged risk cards by severity: High-risk first, Medium-risk second, Low-risk last
    const severityRank = { HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sortedCategories = [...unacknowledgedActiveCategories].sort((a, b) => {
      const rankA = severityRank[CATEGORY_META[a]?.riskLevel] || 2;
      const rankB = severityRank[CATEGORY_META[b]?.riskLevel] || 2;
      return rankA - rankB;
    });

    let dealbreakerCount = 0;
    const categoryCardsHtml = sortedCategories.map((catKey) => {
      const meta = CATEGORY_META[catKey];
      const data = (analysis && analysis.categories && analysis.categories[catKey]) || {};

      const catStats = (profile && profile[catKey]) || { yes: 0, no: 0 };
      const yes = Number(catStats.yes) || 0;
      const no = Number(catStats.no) || 0;
      const total = yes + no;

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
      const sourceSnippet = (sourceClauses && sourceClauses[catKey]) || data.snippet || data.summary || '';
      const shortSummaryText = data.shortSummary || data.summary || meta.defaultSummary;
      const riskClass = meta.riskLevel === 'HIGH' ? 'risk-high' : (meta.riskLevel === 'LOW' ? 'risk-low' : 'risk-med');

      // Resolution Guide UI: If a risk contains optOutSteps (or falls under Medium/High severity with steps available)
      let resolutionGuideHtml = '';
      const fallbackSteps = getFallbackResolutionSteps(catKey, currentDomain);
      const steps = (Array.isArray(data.optOutSteps) && data.optOutSteps.length > 0)
        ? data.optOutSteps
        : ((catKey === 'AUTO_RENEW' && data.cancellationGuide?.steps) || fallbackSteps);

      const rawOptOutLink = (typeof data.optOutLink === 'string' && data.optOutLink.trim())
        ? data.optOutLink.trim()
        : ((catKey === 'AUTO_RENEW' && typeof data.cancellationGuide?.url === 'string') ? data.cancellationGuide.url.trim() : '');
      const isSecureOptOutLink = /^https:\/\//i.test(rawOptOutLink);

      if (Array.isArray(steps) && steps.length > 0 && (meta.riskLevel === 'HIGH' || meta.riskLevel === 'MEDIUM' || (Array.isArray(data.optOutSteps) && data.optOutSteps.length > 0))) {
        resolutionGuideHtml = `
          <details class="tc-resolution-guide">
            <summary>How to solve this</summary>
            <div class="tc-resolution-content">
              <ol class="tc-resolution-steps">
                ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
              </ol>
              ${isSecureOptOutLink ? `
                <div class="tc-resolution-link-wrapper">
                  <a class="tc-resolution-link" href="${escapeHtml(rawOptOutLink)}" target="_blank" rel="noopener noreferrer">
                    <span>Direct Resolution Link</span>
                    <span>↗</span>
                  </a>
                </div>
              ` : ''}
            </div>
          </details>
        `;
      }

      return `
        <div class="tc-card tc-risk-item ${riskClass} ${isDealbreaker ? 'tc-card-dealbreaker' : ''}" data-cat="${catKey}">
          <div class="tc-card-header">
            <span class="tc-card-title">${meta.icon} ${escapeHtml(meta.name)}</span>
            <span class="tc-risk-tag tc-risk-${CATEGORY_RISK[catKey]}">${CATEGORY_RISK[catKey] === 'high' ? 'High risk' : 'Medium risk'}</span>
            ${overrideBadgeHtml}
            ${voiceOn() ? `<button class="tc-icon-btn tc-speak-btn" data-cat="${catKey}" title="Read this clause aloud">🔊</button>` : ''}
          </div>

          <div class="tc-card-question">Is this risk okay with you?</div>

          <!-- Injected shortSummary text above original clause snippet -->
          <div class="tc-card-short-summary">${escapeHtml(shortSummaryText)}</div>

          <!-- Native <details> and <summary> elements for View Clause toggle -->
          ${sourceSnippet ? `
            <details class="tc-clause-details">
              <summary class="tc-clause-summary">
                <span>📖 View Clause</span>
              </summary>
              <div class="tc-quote">
                "${escapeHtml(sourceSnippet)}"
              </div>
              ${canJumpToClause(catKey) ? `
                <div style="margin-top: 8px;">
                  <button class="tc-btn tc-btn-view tc-view-btn" data-cat="${catKey}" title="Jump to this clause in the terms">
                    <span>↗ Jump to page location</span>
                  </button>
                </div>
              ` : ''}
            </details>
          ` : ''}

          <!-- Resolution / Opt-Out Guide for Medium and High Risk alerts -->
          ${resolutionGuideHtml}

          <div class="tc-card-actions">
            <button class="tc-btn tc-btn-yes ${isCurrentYes ? 'active' : ''}" data-cat="${catKey}" data-choice="yes" title="Accept this clause">
              ${isCurrentYes ? '✓ ' : ''}Yes
            </button>
            <button class="tc-btn tc-btn-no ${isCurrentNo ? 'active' : ''}" data-cat="${catKey}" data-choice="no" title="Reject this clause">
              ${isCurrentNo ? '✕ ' : ''}No
            </button>
          </div>
        </div>
      `;
    }).join('');

    const hasAnyRisks = CATEGORIES.some((c) => analysis?.categories?.[c]?.present === true);
    const emptyHtml = hasAnyRisks ? `
      <div class="tc-empty">
        <div class="tc-empty-icon">✓</div>
        <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">All Flagged Clauses Answered</div>
        <div style="color: #64748b;">You have saved choices for all risks on this site.</div>
      </div>
    ` : `
      <div class="tc-empty">
        <div class="tc-empty-icon">🎉</div>
        <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">No Critical Red Flags Found</div>
        <div style="color: #64748b;">This agreement did not trigger any of the monitored high-risk categories.</div>
      </div>
    `;

    root.innerHTML = `
      <style>${getCSS()}</style>
      <div class="tc-widget-container">
        <div class="tc-widget">
          <!-- Header -->
          <div class="tc-header">
            <div class="tc-header-title-row">
              <span class="tc-logo-badge">
                <img class="tc-header-mascot" src="${escapeHtml((typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL(mascotFileName) : mascotSrc)}" alt="T&C Guardian" />
                <span>T&C Guardian</span>
              </span>
              <span class="tc-domain-tag">${escapeHtml(currentDomain)}</span>
            </div>
            <div class="tc-header-actions">
              ${voiceOn() ? `<button class="tc-icon-btn" id="tc-voice-read" title="Read flagged clauses aloud">🔊</button>` : ''}
              ${voiceOn() && recognitionCtor() ? `<button class="tc-icon-btn" id="tc-voice-answer" title="Answer by voice (say yes / no / skip)">🎤</button>` : ''}
              ${voiceSupported() ? `<button class="tc-icon-btn" id="tc-settings-btn" title="Voice settings" aria-expanded="${settingsOpen}">⚙️</button>` : ''}
              <button class="tc-icon-btn tc-minimize-btn" id="tc-minimize-btn" title="Minimize">−</button>
              <button class="tc-icon-btn tc-close-btn" id="tc-close-btn" title="Close">&times;</button>
            </div>
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
            ${categoryCardsHtml || emptyHtml}
          </div>

          <!-- Footer -->
          <div class="tc-footer">
            <span>${sortedCategories.length} active question${sortedCategories.length === 1 ? '' : 's'}</span>
            <span style="color: #38bdf8;">Choices save instantly</span>
          </div>
        </div>
      </div>
    `;

    // Event Handlers: Manual Minimize and Close Buttons
    const minBtn = root.getElementById('tc-minimize-btn');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        isMinimized = true;
        renderUI(analysis, profile, overrides);
      });
    }

    const closeBtn = root.getElementById('tc-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        isMinimized = true;
        renderUI(analysis, profile, overrides);
      });
    }

    const resetBtn = root.getElementById('tc-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Reset all learned preference history and site overrides?')) {
          const freshProfile = getDefaultProfile();
          const freshOverrides = {};
          await saveStorageData(freshProfile, freshOverrides);
          renderUI(analysis, freshProfile, freshOverrides);
        }
      });
    }

    // Voice controls
    const readBtn = root.getElementById('tc-voice-read');
    if (readBtn) readBtn.addEventListener('click', () => { if (voiceMode) stopVoice(); else readAllAloud(); });
    const answerBtn = root.getElementById('tc-voice-answer');
    if (answerBtn) answerBtn.addEventListener('click', () => { if (voiceMode) stopVoice(); else answerByVoice(); });
    root.querySelectorAll('.tc-speak-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); readOneAloud(btn.getAttribute('data-cat')); });
    });
    bindSettingsHandlers(root);
    applyVoiceButtonState();

    // View Clause buttons
    root.querySelectorAll('.tc-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => jumpToClause(btn.getAttribute('data-cat')));
    });

    // Accept / Reject Buttons: Multi-Question Persistence
    // Fade out and remove ONLY the specific risk card (.tc-risk-item) that was answered.
    // Only trigger full overlay collapse/dismissal when the user has answered the final remaining risk card.
    root.querySelectorAll('.tc-btn-yes, .tc-btn-no').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget;
        const catKey = target.getAttribute('data-cat');
        const choice = target.getAttribute('data-choice');
        const isYes = (choice === 'yes');

        if (choiceBusy) return;
        choiceBusy = true;
        let currentProfile;
        let currentOverrides;
        try {
          ({ profile: currentProfile, overrides: currentOverrides } = await getStorageData());
          const prev = currentOverrides[currentDomain] && currentOverrides[currentDomain][catKey];

          // Counts are updated here only (the background just refreshes the badge).
          // Changing an answer replaces the earlier vote instead of adding another.
          if (prev !== isYes) {
            if (!currentProfile[catKey]) currentProfile[catKey] = { yes: 0, no: 0 };
            const st = currentProfile[catKey];
            if (prev === true) st.yes = Math.max(0, (st.yes || 0) - 1);
            if (prev === false) st.no = Math.max(0, (st.no || 0) - 1);
            if (isYes) st.yes = (st.yes || 0) + 1; else st.no = (st.no || 0) + 1;

            if (!currentOverrides[currentDomain]) currentOverrides[currentDomain] = {};
            currentOverrides[currentDomain][catKey] = isYes;
            await saveStorageData(currentProfile, currentOverrides);
          }
        } finally {
          choiceBusy = false;
        }
        // Tell the background so the toolbar badge drops the answered risk
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          try {
            chrome.runtime.sendMessage({
              action: 'SAVE_EXPLICIT_CHOICE',
              domain: currentDomain,
              category: catKey,
              isAccepted: isYes
            }, () => { void chrome.runtime.lastError; });
          } catch (err) {}
        }

        // Target the specific risk card (.tc-risk-item)
        const card = target.closest('.tc-risk-item') || target.closest('.tc-card');
        if (card) {
          card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.96)';

          setTimeout(() => {
            card.remove();

            // Check if there are any remaining risk cards
            const remainingCards = root.querySelectorAll('.tc-risk-item');
            if (remainingCards.length === 0) {
              // Final remaining card answered: trigger full overlay collapse/dismissal into minimized bubble
              isMinimized = true;
              const widget = root.querySelector('.tc-widget');
              if (widget) {
                widget.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                widget.style.opacity = '0';
                widget.style.transform = 'translateY(10px)';
                setTimeout(() => {
                  renderUI(analysis, currentProfile, currentOverrides);
                }, 200);
              } else {
                renderUI(analysis, currentProfile, currentOverrides);
              }
            } else {
              // Update footer question count
              const footerCount = root.querySelector('.tc-footer span');
              if (footerCount) {
                footerCount.textContent = `${remainingCards.length} active question${remainingCards.length === 1 ? '' : 's'}`;
              }
            }
          }, 250);
        }
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
    // Cache Invalidation: Clear local storage/cached analysis results on page load
    clearCachedAnalysis();
    let rawText = '';
    let remoteUrl = null;

    if (isTermsPage()) {
      // Analyze current page text
      rawText = (document.body && (document.body.innerText || document.body.textContent)) || '';
      buildClauseRefsFromDom();
    } else {
      // Look for linked terms (on signup/checkout or general pages with terms link)
      const termsUrl = findTermsLink();
      if (termsUrl) {
        clauseSourceUrl = termsUrl;
        if (new URL(termsUrl).origin === window.location.origin) {
          rawText = await fetchTermsUrl(termsUrl);
          if (rawText) buildClauseRefsFromText(rawText);
        }
        if (!rawText) {
          remoteUrl = termsUrl; // CORS-blocked or local fetch restricted; let background.js fetch it
        }
      }
    }

    let filtered = '';
    if (!remoteUrl) {
      if (!rawText || rawText.trim().length === 0) {
        // No terms page or terms link found on this page
        const alwaysShow = await getAlwaysShowWidgetSetting();
        if (alwaysShow) {
          analysisData = generateLocalMockResponse('');
          const { profile, overrides } = await getStorageData();
          if (isMinimized === null) isMinimized = true;
          await loadVoiceSettings();
          renderUI(analysisData, profile, overrides);
        }
        return;
      }
      filtered = filterHighRiskText(rawText);
      if (!filtered || filtered.trim().length === 0) {
        const alwaysShow = await getAlwaysShowWidgetSetting();
        if (alwaysShow) {
          analysisData = generateLocalMockResponse('');
          const { profile, overrides } = await getStorageData();
          if (isMinimized === null) isMinimized = true;
          await loadVoiceSettings();
          renderUI(analysisData, profile, overrides);
        }
        return;
      }
    }

    // Extract and map source paragraph excerpts for deep-linking
    sourceClauses = extractSourceClauses(rawText);

    // Run analysis via message passing or standalone fallback (updates background toolbar badge silently!)
    analysisData = await requestAnalysis(filtered, currentDomain, remoteUrl);

    // Fetch stored user profile and overrides
    const { profile, overrides } = await getStorageData();
    const domainOverrides = (overrides && overrides[currentDomain]) || {};
    const alwaysShowWidget = await getAlwaysShowWidgetSetting();

    // Silent Memory: If total number of unacknowledged active risks is 0, do not inject, render, or show .tc-widget-container or .tc-bubble at all
    const unackCount = CATEGORIES.filter((c) => {
      const catData = analysisData && analysisData.categories && analysisData.categories[c];
      const hasOverride = Object.prototype.hasOwnProperty.call(domainOverrides, c);
      return Boolean(catData && catData.present === true && catData.acknowledged !== true && !hasOverride);
    }).length;

    if (unackCount === 0 && !alwaysShowWidget) {
      const host = document.getElementById('tc-guardian-host');
      if (host) host.style.display = 'none';
      if (shadowRoot) shadowRoot.innerHTML = '';
      return;
    }

    // Auto-popup: terms were found and unanswered risks exist, so show the overlay on any page.
    await loadVoiceSettings();
    renderUI(analysisData, profile, overrides);

    // Chrome only allows speech after user activation on the page, so this may stay silent
    if (voiceAutoRead && voiceSupported()) readAllAloud();
  }

  // Read-only State Rendering: Listen for background worker's broadcast of validated analysis
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      if (message?.action === 'TAB_ANALYSIS_FINALIZED' && message.result) {
        handleFinalizedAnalysis(message.result);
      }
      if (message?.action === 'ALWAYS_SHOW_WIDGET_CHANGED') {
        const alwaysShow = Boolean(message.enabled);
        if (alwaysShow) {
          isDismissedForSession = false;
          isMinimized = false;
        }
        if (!analysisData) {
          analysisData = generateLocalMockResponse('');
        }
        const { profile, overrides } = await getStorageData();
        renderUI(analysisData, profile, overrides);
      }
    });
  }

  // Dynamic Storage Listener: Re-render UI when always-show widget setting or overrides change
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === 'local' && (changes[STORAGE_KEYS.ALWAYS_SHOW_WIDGET] || changes[STORAGE_KEYS.SITE_OVERRIDES])) {
        const alwaysShow = await getAlwaysShowWidgetSetting();
        if (changes[STORAGE_KEYS.ALWAYS_SHOW_WIDGET] && alwaysShow) {
          isDismissedForSession = false;
          isMinimized = false;
        }
        if (!analysisData) {
          analysisData = generateLocalMockResponse('');
        }
        const { profile, overrides } = await getStorageData();
        renderUI(analysisData, profile, overrides);
      }
    });
  }

  async function handleFinalizedAnalysis(finalizedResult) {
    if (isDismissedForSession) {
      return;
    }
    if (!finalizedResult || !finalizedResult.success || !finalizedResult.data) {
      return;
    }
    const normalized = normalizeAnalysisResult(finalizedResult);
    analysisData = normalized;

    const { profile, overrides } = await getStorageData();
    const domainOverrides = (overrides && overrides[currentDomain]) || {};
    const alwaysShowWidget = await getAlwaysShowWidgetSetting();

    // Silent Memory: If total number of unacknowledged active risks is 0, do not inject, render, or show .tc-widget-container or .tc-bubble at all
    const unackCount = CATEGORIES.filter((c) => {
      const catData = normalized.categories?.[c];
      const hasOverride = Object.prototype.hasOwnProperty.call(domainOverrides, c);
      return Boolean(catData && catData.present === true && catData.acknowledged !== true && !hasOverride);
    }).length;

    if (unackCount === 0 && !alwaysShowWidget) {
      const host = document.getElementById('tc-guardian-host');
      if (host) host.style.display = 'none';
      if (shadowRoot) shadowRoot.innerHTML = '';
      return;
    }

    await loadVoiceSettings();
    renderUI(normalized, profile, overrides);
  }
  // Stop any speech when leaving the page
  window.addEventListener('pagehide', () => {
    stopTtsAudio();
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  });

  // Apply voice settings changed from the toolbar popup without a page reload
  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[VOICE_KEY]) return;
        const wasEnabled = voiceEnabled;
        loadVoiceSettings().then(() => {
          voiceEngine = null; pinnedBrowserVoice = null; ttsDisabled = false;
          if (wasEnabled && !voiceEnabled) stopVoice();
          if (currentAnalysis && lastProfile) renderUI(currentAnalysis, lastProfile, lastOverrides);
        });
      });
    }
  } catch (e) { /* ignore */ }

  // Voices load asynchronously in Chrome: refresh the settings list when they arrive
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        if (settingsOpen && currentAnalysis && lastProfile) renderUI(currentAnalysis, lastProfile, lastOverrides);
      });
    }
  } catch (e) { /* ignore */ }

  // Run when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

