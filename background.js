/**
 * T&C Guardian - Background Service Worker (Manifest V3)
 * Developer A: Multi-Tier Analysis Engine (ToS;DR -> Opera Web AI -> Cloud LLM Fallback)
 * With 10s Non-Silent Fallback Guarantee & Explicit-Choice Storage Protocol
 */

import { CONFIG } from './config.js';

// Default empty contract structure
function createEmptyData() {
  return {
    DATA_SALE: {
      present: false,
      summary: 'No explicit clauses found indicating commercial sale to third-party data brokers.',
      shortSummary: 'No data sale clauses detected.',
      snippet: ''
    },
    AI_TRAINING: {
      present: false,
      summary: 'No explicit clauses found authorizing AI model training on user uploads or data.',
      shortSummary: 'No AI training clauses detected.',
      snippet: ''
    },
    AUTO_RENEW: {
      present: false,
      summary: 'No automatic renewal or non-refundable billing terms detected.',
      shortSummary: 'No auto-renewal clauses detected.',
      snippet: '',
      cancellationGuide: null
    },
    NO_DELETE: {
      present: false,
      summary: 'No clauses found indicating indefinite data retention following account deletion.',
      shortSummary: 'No indefinite retention clauses detected.',
      snippet: ''
    },
    WAIVE_RIGHTS: {
      present: false,
      summary: 'No mandatory binding arbitration or class action waiver clauses identified.',
      shortSummary: 'No arbitration waiver clauses detected.',
      snippet: ''
    }
  };
}

/**
 * Truncates raw snippet text to a maximum of 250 characters.
 */
function truncateSnippet(snippet, maxLen = 250) {
  if (!snippet || typeof snippet !== 'string') return '';
  const clean = snippet.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3).trim() + '...';
}

/**
 * Formats or generates a concise 1-2 sentence plain-English shortSummary under 150 characters.
 */
function formatShortSummary(summary, categoryKey, isPresent = true) {
  if (!isPresent) {
    return 'No risk clause detected.';
  }

  const defaultShorts = {
    DATA_SALE: 'Sells or shares your personal data with third-party ad brokers.',
    AI_TRAINING: 'Trains proprietary AI and neural models on your content without opt-out.',
    AUTO_RENEW: 'Enforces recurring subscription renewals with strict non-refundable terms.',
    NO_DELETE: 'Retains customer records and activity telemetry indefinitely post-deletion.',
    WAIVE_RIGHTS: 'Forces individual binding arbitration and waives class action rights.'
  };

  if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
    return defaultShorts[categoryKey] || 'Risk clause detected in terms.';
  }

  let clean = summary.replace(/\s+/g, ' ').trim();
  if (clean.length <= 145) {
    return clean;
  }

  // Extract first sentence if length fits
  const firstSentenceMatch = clean.match(/^([^.!?]+[.!?])/);
  if (firstSentenceMatch && firstSentenceMatch[1].length <= 145 && firstSentenceMatch[1].length >= 25) {
    return firstSentenceMatch[1].trim();
  }

  // Trim cleanly at word boundary
  const truncated = clean.slice(0, 142);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 40) {
    return truncated.slice(0, lastSpace).trim() + '...';
  }
  return truncated.trim() + '...';
}

/**
 * Structured Subscription Cancellation Guides Database
 * Maps popular subscription domains to step-by-step instructions and billing URLs.
 */
const CANCELLATION_GUIDES = {
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
      'Log into your Spotify Account Overview page',
      'Scroll down to "Your plan" and click "Change plan"',
      'Scroll to "Cancel Spotify" and click "Cancel Premium"'
    ]
  },
  'adobe.com': {
    domain: 'adobe.com',
    url: 'https://account.adobe.com/plans',
    steps: [
      'Sign in to account.adobe.com/plans',
      'Select "Manage plan" for the active subscription',
      'Select "Cancel your plan" and follow prompts to confirm cancellation'
    ]
  },
  'amazon.com': {
    domain: 'amazon.com',
    url: 'https://www.amazon.com/mc/manage',
    steps: [
      'Go to Amazon Account -> "Your Memberships & Subscriptions"',
      'Select "Manage Subscription" next to the active service',
      'Click "End Subscription" and follow the confirmation prompts'
    ]
  },
  'quora.com': {
    domain: 'quora.com',
    url: 'https://www.quora.com/settings/subscription',
    steps: [
      'Go to your Quora profile -> "Settings"',
      'Navigate to "Subscriptions"',
      'Click "Cancel Subscription" on Quora+'
    ]
  },
  'reddit.com': {
    domain: 'reddit.com',
    url: 'https://www.reddit.com/settings/premium',
    steps: [
      'Go to Reddit User Settings -> "Subscriptions"',
      'Find Reddit Premium and click "Manage Subscription"',
      'Click "Cancel" to turn off recurring auto-renewal'
    ]
  },
  'apple.com': {
    domain: 'apple.com',
    url: 'https://support.apple.com/billing',
    steps: [
      'Open Settings or App Store on your device -> tap your Apple ID',
      'Tap "Subscriptions"',
      'Tap the active subscription and select "Cancel Subscription"'
    ]
  },
  'google.com': {
    domain: 'google.com',
    url: 'https://play.google.com/store/account/subscriptions',
    steps: [
      'Go to Google Play Subscriptions (play.google.com/store/account/subscriptions)',
      'Select the subscription you want to cancel',
      'Click "Manage" -> "Cancel subscription"'
    ]
  },
  'hulu.com': {
    domain: 'hulu.com',
    url: 'https://secure.hulu.com/account',
    steps: [
      'Log into your Hulu Account page',
      'Under the "Your Subscription" section, select "Cancel"',
      'Follow the on-screen options to finalize cancellation'
    ]
  },
  'disneyplus.com': {
    domain: 'disneyplus.com',
    url: 'https://www.disneyplus.com/account',
    steps: [
      'Log into your Disney+ Account overview',
      'Select your subscription under the "Subscription" heading',
      'Select "Cancel Subscription" and choose your reason'
    ]
  },
  'youtube.com': {
    domain: 'youtube.com',
    url: 'https://www.youtube.com/paid_memberships',
    steps: [
      'Go to youtube.com/paid_memberships',
      'Click "Manage Membership" next to YouTube Premium',
      'Click "Deactivate" or "Cancel"'
    ]
  },
  'dropbox.com': {
    domain: 'dropbox.com',
    url: 'https://www.dropbox.com/account/plan',
    steps: [
      'Go to Dropbox Account -> "Plan"',
      'Select "Cancel plan" at the bottom of the page',
      'Choose a cancellation reason and confirm'
    ]
  },
  'microsoft.com': {
    domain: 'microsoft.com',
    url: 'https://account.microsoft.com/services',
    steps: [
      'Sign in to account.microsoft.com/services',
      'Find the subscription and select "Manage"',
      'Select "Cancel subscription" or "Turn off recurring billing"'
    ]
  },
  'default': {
    domain: 'default',
    url: null,
    steps: [
      'Locate your Profile or Avatar icon in the top navigation bar',
      'Go to "Account Settings", "Billing", or "Subscriptions"',
      'Look for "Manage Plan", "Auto-Renew", or "Payment Methods"',
      'Select "Cancel Subscription" or toggle off "Auto-Renew" before your next billing cycle'
    ]
  }
};

function getCancellationGuide(domain = '') {
  const cleanDomain = String(domain || '').toLowerCase().replace(/^www\./, '').trim();
  for (const [key, guide] of Object.entries(CANCELLATION_GUIDES)) {
    if (key !== 'default' && (cleanDomain === key || cleanDomain.endsWith('.' + key))) {
      return { ...guide };
    }
  }
  const defaultGuide = CANCELLATION_GUIDES['default'];
  return {
    domain: cleanDomain || 'Current Site',
    url: cleanDomain ? `https://${cleanDomain}` : null,
    steps: defaultGuide.steps
  };
}

/**
 * Keyword matchers used to extract short snippets or keyword phrases
 * directly from the source terms text for each category so that
 * content.js can match and highlight them on the active page.
 */
/**
 * Strict Educational & Open-Source Documentation Domains:
 * Only verified non-profit educational/documentation authorities default
 * to zero-risk suppression. Commercial platforms (Quora, Reddit, Netflix,
 * StackOverflow, etc.) are strictly excluded.
 */
const STRICT_DOCS_DOMAINS = [
  'wikipedia.org',
  'wikimedia.org',
  'wiktionary.org',
  'mozilla.org',
  'developer.mozilla.org',
  'python.org',
  'docs.python.org',
  'w3.org',
  'gnu.org',
  'fsf.org',
  'creativecommons.org',
  'apache.org',
  'kernel.org',
  'linuxfoundation.org',
  'freebsd.org',
  'archlinux.org',
  'debian.org',
  'khanacademy.org',
  'freecodecamp.org'
];

const COMMERCIAL_PLATFORMS = [
  'quora.com',
  'reddit.com',
  'netflix.com',
  'stackoverflow.com',
  'stackexchange.com',
  'medium.com',
  'github.com',
  'gitlab.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'google.com',
  'amazon.com',
  'microsoft.com',
  'apple.com',
  'spotify.com',
  'dropbox.com',
  'uber.com',
  'airbnb.com'
];

function isDocumentationOrOpenSource(sourceText, domain = '') {
  const cleanDomain = String(domain || '').toLowerCase().replace(/^www\./, '').trim();

  // 1. Never suppress commercial platforms under any circumstances
  if (COMMERCIAL_PLATFORMS.some((cp) => cleanDomain === cp || cleanDomain.endsWith('.' + cp))) {
    return false;
  }

  // 2. Strict educational / open-source domain whitelist
  if (
    cleanDomain.endsWith('.edu') ||
    STRICT_DOCS_DOMAINS.some((doc) => cleanDomain === doc || cleanDomain.endsWith('.' + doc))
  ) {
    return true;
  }

  // 3. For localhost, empty domain, or unverified domain:
  // Do NOT suppress regular commercial terms just because they mention open-source / CC licenses!
  if (!cleanDomain || cleanDomain === 'localhost') {
    if (/\$|subscription|recurring|billing|omnicloud|payment|commercial/i.test(sourceText)) {
      return false;
    }
    return /(?:wikimedia|wikipedia)\s+foundation|mozilla\s+developer\s+network|gnu\s+operating\s+system|free\s+software\s+foundation/i.test(sourceText);
  }

  return false;
}

/**
 * Explicit Monetization and Arbitration Patterns:
 * On documentation or open-source sites, categories default to present: false
 * UNLESS one of these explicit commercial dealbreaker clauses is detected.
 */
const EXPLICIT_MONETIZATION_ARBITRATION_PATTERNS = {
  DATA_SALE: [
    /(?:we\s+|may\s+)?sell\s+(?:or\s+monetize\s+)?(?:your\s+|user\s+)?personal\s+(?:information|data)/i,
    /monetiz(?:e|ing)\s+(?:your\s+|user\s+)?(?:personal\s+)?data/i,
    /sale\s+of\s+personal\s+(?:information|data)/i,
    /(?:license|syndicate)\s+personal\s+data\s+to\s+third[- ]party\s+data\s+brokers/i,
    /share\s+(?:your\s+)?personal\s+information\s+with\s+commercial\s+data\s+brokers/i,
    /(?:sell|rent)\s+your\s+personal\s+information/i
  ],
  WAIVE_RIGHTS: [
    /mandatory\s+(?:binding\s+)?arbitration/i,
    /class\s+action\s+waiver/i,
    /unconditionally\s+waive\s+any\s+right\s+to\s+participate\s+as\s+a\s+lead\s+plaintiff/i,
    /waive\s+(?:all\s+)?rights?\s+to\s+(?:a\s+)?jury\s+trial/i,
    /waive\s+(?:all\s+)?rights?\s+to\s+(?:participate\s+in\s+)?(?:a\s+)?class\s+action/i,
    /disputes?\s+must\s+be\s+resolved\s+(?:exclusively\s+)?(?:by|through)\s+binding\s+arbitration/i
  ]
};

/**
 * Standard Category Snippet Matchers for Commercial Platforms:
 * Extracts concise snippets when explicit risk clauses are present in terms.
 */
const CATEGORY_SNIPPET_MATCHERS = {
  DATA_SALE: [
    /(?:sell|share|disclose|license|monetiz|transfer)\s+[^.!?\n]{0,60}(?:personal\s+(?:information|data)|telemetry|user\s+profile)[^.!?\n]{0,60}(?:third[- ]part|advertis|broker|commercial|marketing|partner)/i,
    /(?:third[- ]party|data\s+broker|advertis)[^.!?\n]{0,60}(?:sell|share|monetiz|license)[^.!?\n]{0,60}(?:personal\s+(?:information|data)|user\s+data)/i,
    /sale\s+(?:or\s+sharing\s+)?of\s+personal\s+(?:information|data)/i,
    /(?:we\s+|may\s+)?sell\s+(?:or\s+monetize\s+)?(?:your\s+|user\s+)?personal\s+(?:information|data)/i,
    /monetiz(?:e|ing)\s+(?:your\s+|user\s+)?(?:personal\s+)?data/i,
    /commercial\s+data\s+broker\s+licensing/i,
    /sell,\s+license,\s+and\s+syndicate\s+personal\s+data/i
  ],
  AI_TRAINING: [
    /(?:train|training|develop|improve)\s+[^.!?\n]{0,40}(?:ai|artificial\s+intelligence|machine\s+learning|large\s+language|llm|algorithm|neural)\s+models?[^.!?\n]{0,40}(?:content|data|upload|prompt|submission|user)/i,
    /(?:train|training|fine-tun(?:e|ing))\s+(?:our\s+|proprietary\s+)?(?:ai|artificial\s+intelligence|machine\s+learning|neural\s+network|large\s+language)\s+models?\s+(?:on|using|with)\s+(?:your|user)/i,
    /(?:use|utilize|license|ingest)\s+[^.!?\n]{0,40}(?:content|data|upload|prompt|submission|post)[^.!?\n]{0,40}(?:train|training|machine\s+learning|ai\s+model)/i,
    /ai\s+model\s+training\s+license/i,
    /license\s+to\s+train\s+(?:proprietary\s+)?(?:artificial\s+intelligence|machine\s+learning|ai\s+models)/i,
    /train\s+artificial\s+intelligence\s+(?:models\s+and\s+neural\s+networks\s+on\s+user\s+data|systems)/i
  ],
  AUTO_RENEW: [
    /(?:subscription|plan|service|membership)\s+(?:will\s+)?automatically\s+renew/i,
    /automatic(?:ally)?\s+renew(?:s|al)?/i,
    /auto-renew(?:s|al)?/i,
    /recurring\s+(?:billing|charge|subscription|fee|payment)/i,
    /mandatory\s+\$(?:99|\d+)[^.!?\n]*recurring\s+auto-renewal/i,
    /(?:payments?|fees|charges?)\s+(?:are|is)\s+(?:strictly\s+)?non-refundable/i,
    /no\s+refunds\s+or\s+credits\s+for\s+(?:partial|any)/i,
    /automatically\s+renew\s+subscription\s+at\s+recurring\s+rate/i
  ],
  NO_DELETE: [
    /(?:retain|keep|preserve|store|archive)\s+[^.!?\n]{0,50}(?:indefinitely|in\s+perpetuity|permanently|in\s+backups)/i,
    /(?:even\s+)?after\s+(?:you\s+delete|deletion\s+of|termination\s+of)\s+your\s+account[^.!?\n]{0,60}(?:we\s+may\s+)?(?:retain|keep|remain|preserve)/i,
    /(?:content|posts?|submissions?|data)\s+(?:may\s+)?remain\s+[^.!?\n]{0,40}(?:after|even\s+if)\s+(?:you\s+delete|account\s+is\s+deleted)/i,
    /indefinite\s+data\s+retention\s+policy/i,
    /retain,\s+store,\s+and\s+preserve\s+all\s+customer\s+files[^.!?\n]*indefinitely/i,
    /personal\s+records\s+and\s+database\s+logs\s+indefinitely\s+following\s+account\s+deletion/i,
    /retain,\s+store,\s+and\s+preserve\s+customer\s+data\s+and\s+activity\s+logs\s+indefinitely/i
  ],
  WAIVE_RIGHTS: [
    /(?:mandatory|binding)\s+arbitration/i,
    /arbitration\s+agreement/i,
    /class\s+action\s+waiver/i,
    /unconditionally\s+waive\s+any\s+right\s+to\s+participate\s+as\s+a\s+lead\s+plaintiff/i,
    /waive\s+[^.!?\n]{0,30}(?:jury\s+trial|class\s+action)/i,
    /disputes?\s+[^.!?\n]{0,40}(?:resolved\s+by|subject\s+to)\s+(?:binding\s+)?arbitration/i,
    /mandatory\s+individual\s+binding\s+arbitration/i
  ]
};

const CATEGORY_FALLBACK_PHRASES = {
  DATA_SALE: 'sell, license, and syndicate personal data to third-party data brokers',
  AI_TRAINING: 'train artificial intelligence models and neural networks on user data',
  AUTO_RENEW: 'automatically renew subscription at recurring rate with non-refundable terms',
  NO_DELETE: 'retain, store, and preserve customer data and activity logs indefinitely',
  WAIVE_RIGHTS: 'mandatory individual binding arbitration and class action lawsuit waiver'
};

/**
 * Standard Category Risk Patterns for Commercial Platforms:
 * Evaluates terms text against established industry risk phrasing.
 */
const CATEGORY_RISK_PATTERNS = {
  DATA_SALE: /(?:sell|share|disclose|license|monetiz)\s+[^.!?\n]{0,50}(?:personal\s+(?:information|data)|user\s+data)[^.!?\n]{0,50}(?:third[- ]part|advertis|broker|marketing)|sale\s+(?:or\s+sharing\s+)?of\s+personal\s+information|monetiz(?:e|ing)\s+(?:your\s+)?data/i,
  AI_TRAINING: /(?:train|training|develop|improve)\s+[^.!?\n]{0,40}(?:ai|artificial\s+intelligence|machine\s+learning|llm|algorithm)\s+models?[^.!?\n]{0,40}(?:content|data|upload|prompt|user)|(?:use|license)\s+[^.!?\n]{0,30}(?:content|data|upload|prompt)\s+[^.!?\n]{0,30}(?:train|training|ai\s+model)|ai\s+model\s+training/i,
  AUTO_RENEW: /automatic(?:ally)?\s+renew(?:s|al)?|auto-renew|recurring\s+(?:billing|charge|subscription)|non-refundable\s+(?:subscription|billing|fee)/i,
  NO_DELETE: /retain\s+[^.!?\n]{0,40}(?:indefinitely|permanently)|(?:after\s+(?:account\s+)?deletion|even\s+if\s+you\s+delete)[^.!?\n]{0,40}(?:retain|remain|preserve)|indefinite\s+data\s+retention/i,
  WAIVE_RIGHTS: /(?:mandatory|binding)\s+arbitration|arbitration\s+agreement|class\s+action\s+waiver|waive\s+[^.!?\n]{0,30}(?:jury\s+trial|class\s+action)/i
};

/**
 * Checks whether sourceText genuinely contains high-confidence risk clauses for categoryKey.
 * Strictly avoids generic single words while allowing standard detection on commercial platforms.
 * Automatically enforces a ZERO-RISK DEFAULT for open-source and educational documentation text.
 */
function hasCategoryRisk(sourceText, categoryKey, domain = '') {
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    return false;
  }

  // ZERO-RISK DEFAULT FOR DOCUMENTATION:
  // If terms text contains open-source or educational disclaimers (e.g., "open-source",
  // "creative commons", "educational project"), default categories to present: false
  // unless explicit monetization/arbitration clauses are detected.
  if (isDocumentationOrOpenSource(sourceText, domain)) {
    const explicitPatterns = EXPLICIT_MONETIZATION_ARBITRATION_PATTERNS[categoryKey];
    if (!explicitPatterns) {
      return false;
    }
    return explicitPatterns.some((regex) => regex.test(sourceText));
  }

  // HIGH-CONFIDENCE MATCHING ONLY:
  // Require explicit high-risk phrases rather than generic words.
  const snippetMatchers = CATEGORY_SNIPPET_MATCHERS[categoryKey] || [];
  if (snippetMatchers.some((regex) => regex.test(sourceText))) {
    return true;
  }
  const generalPattern = CATEGORY_RISK_PATTERNS[categoryKey];
  return generalPattern ? generalPattern.test(sourceText) : false;
}

function extractCategorySnippet(sourceText, categoryKey) {
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    return CATEGORY_FALLBACK_PHRASES[categoryKey] || '';
  }

  const matchers = CATEGORY_SNIPPET_MATCHERS[categoryKey] || [];

  // Try matching against discrete sentences or clause blocks first
  const blocks = sourceText.split(/(?<=[.!?])\s+|\n\s*\n|\r\n\s*\r\n/);
  for (const regex of matchers) {
    for (const b of blocks) {
      const clean = b.replace(/\s+/g, ' ').trim();
      if (clean.length >= 25 && regex.test(clean)) {
        if (clean.length > 200) {
          const match = regex.exec(clean);
          if (match) {
            const start = Math.max(0, match.index - 35);
            const end = Math.min(clean.length, match.index + match[0].length + 100);
            return (start > 0 ? '...' : '') + clean.slice(start, end).trim() + (end < clean.length ? '...' : '');
          }
          return clean.slice(0, 197).trim() + '...';
        }
        return clean;
      }
    }
  }

  // Next, try broader regex search across the raw source text
  for (const regex of matchers) {
    const match = regex.exec(sourceText);
    if (match) {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(sourceText.length, match.index + match[0].length + 90);
      const sub = sourceText.slice(start, end).replace(/\s+/g, ' ').trim();
      return (start > 0 ? '...' : '') + sub + (end < sourceText.length ? '...' : '');
    }
  }

  return CATEGORY_FALLBACK_PHRASES[categoryKey] || '';
}

/**
 * Dynamic Guaranteed Fallback
 * Evaluates sourceText with high-confidence keyword matchers:
 * Only returns present: true for categories where an explicit risk clause is genuinely detected.
 * Categories clean or missing from the text are set to present: false so frontend question count is variable.
 * Enforces zero-risk default for documentation and open-source sites.
 */
function generateGuaranteedFallback(engineLabel = 'Fallback Detection', sourceText = '', domain = '') {
  const data = {};
  const keys = ['DATA_SALE', 'AI_TRAINING', 'AUTO_RENEW', 'NO_DELETE', 'WAIVE_RIGHTS'];
  const isDoc = isDocumentationOrOpenSource(sourceText, domain);

  for (const k of keys) {
    const isDetected = hasCategoryRisk(sourceText, k, domain);
    if (isDetected) {
      const rawSnippet = extractCategorySnippet(sourceText, k);
      const snippet = truncateSnippet(rawSnippet, 250);
      const shortSummary = formatShortSummary('', k, true);
      data[k] = {
        present: true,
        summary: `Fallback detection: ${k.replace('_', ' ').toLowerCase()} clause detected in agreement requiring explicit user choice.`,
        shortSummary: shortSummary,
        snippet: snippet
      };
      if (k === 'AUTO_RENEW') {
        data[k].cancellationGuide = getCancellationGuide(domain);
      }
    } else {
      const docNote = isDoc ? ' (Open-source / educational site)' : '';
      data[k] = {
        present: false,
        summary: `No risk clause detected in agreement terms for this category.${docNote}`,
        shortSummary: 'No risk clause detected.',
        snippet: ''
      };
      if (k === 'AUTO_RENEW') {
        data[k].cancellationGuide = null;
      }
    }
  }

  if (data.AUTO_RENEW?.present && data.AUTO_RENEW.cancellationGuide) {
    data.cancellationGuide = data.AUTO_RENEW.cancellationGuide;
  }

  return {
    success: true,
    engine: engineLabel,
    data,
    categories: data
  };
}

/**
 * Tier 1: ToS;DR Fast Lookup
 * Queries https://api.tosdr.org/search/v4/?query=${domain}
 */
async function queryTosdr(domain, sourceText = '') {
  if (!domain || domain === 'localhost') return null;

  const controller = new AbortController();
  const timeoutMs = CONFIG.TOSDR_TIMEOUT_MS || 2000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const cleanDomain = domain.replace(/^www\./, '');
    const url = `https://api.tosdr.org/search/v4/?query=${encodeURIComponent(cleanDomain)}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const result = await response.json();
    const services = result?.data?.service || [];
    if (!Array.isArray(services) || services.length === 0) {
      return null;
    }

    const service = services.find((s) => s.url && s.url.includes(cleanDomain)) || services[0];
    const points = service.points || [];

    if (!Array.isArray(points) || points.length === 0) {
      return null;
    }

    const data = createEmptyData();
    let mappedAny = false;

    for (const pt of points) {
      const text = `${pt.title || ''} ${pt.quoteText || ''} ${pt.summary || ''}`.toLowerCase();
      const quoteSnippet = pt.quoteText || pt.title || '';

      // Skip points that describe user protections or lack of risk
      const isNotRisk = /does not sell|doesn't sell|never sell|will not sell|does not train|doesn't train|not renew|opt-out available|can delete/i.test(text);
      if (isNotRisk) continue;

      if (/sell|broker|third party|advertis/i.test(text)) {
        const rawSnippet = quoteSnippet || extractCategorySnippet(sourceText, 'DATA_SALE');
        data.DATA_SALE = {
          present: true,
          summary: pt.title || 'Sells or transfers user personal data to third parties.',
          shortSummary: formatShortSummary(pt.title, 'DATA_SALE', true),
          snippet: truncateSnippet(rawSnippet, 250)
        };
        mappedAny = true;
      }
      if (/train|artificial intelligence|machine learning|ai/i.test(text)) {
        const rawSnippet = quoteSnippet || extractCategorySnippet(sourceText, 'AI_TRAINING');
        data.AI_TRAINING = {
          present: true,
          summary: pt.title || 'Uses user content and submissions to train machine learning/AI models.',
          shortSummary: formatShortSummary(pt.title, 'AI_TRAINING', true),
          snippet: truncateSnippet(rawSnippet, 250)
        };
        mappedAny = true;
      }
      if (/renew|subscription|refund|cancel/i.test(text)) {
        const rawSnippet = quoteSnippet || extractCategorySnippet(sourceText, 'AUTO_RENEW');
        data.AUTO_RENEW = {
          present: true,
          summary: pt.title || 'Automatic renewal policy with strict cancellation conditions.',
          shortSummary: formatShortSummary(pt.title, 'AUTO_RENEW', true),
          snippet: truncateSnippet(rawSnippet, 250)
        };
        mappedAny = true;
      }
      if (/retain|delete|archive|preserve/i.test(text)) {
        const rawSnippet = quoteSnippet || extractCategorySnippet(sourceText, 'NO_DELETE');
        data.NO_DELETE = {
          present: true,
          summary: pt.title || 'Retains user data indefinitely even after account termination.',
          shortSummary: formatShortSummary(pt.title, 'NO_DELETE', true),
          snippet: truncateSnippet(rawSnippet, 250)
        };
        mappedAny = true;
      }
      if (/arbitration|waive|class action|jury/i.test(text)) {
        const rawSnippet = quoteSnippet || extractCategorySnippet(sourceText, 'WAIVE_RIGHTS');
        data.WAIVE_RIGHTS = {
          present: true,
          summary: pt.title || 'Forces mandatory arbitration and waives class action rights.',
          shortSummary: formatShortSummary(pt.title, 'WAIVE_RIGHTS', true),
          snippet: truncateSnippet(rawSnippet, 250)
        };
        mappedAny = true;
      }
    }

    if (mappedAny) {
      const validatedData = validateAndNormalizeData(data, sourceText, domain);
      return {
        success: true,
        engine: 'ToS;DR',
        data: validatedData,
        categories: validatedData
      };
    }

    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.info('[T&C Guardian] ToS;DR lookup bypassed or timed out:', err.message || err);
    return null;
  }
}

/**
 * Tier 2: Local Browser AI (Opera Web AI / Chromium Built-in Prompt API)
 */
async function queryBrowserAI(text, domain = '') {
  try {
    const ai = self?.ai || (typeof window !== 'undefined' ? window?.ai : null);
    if (!ai || !ai.languageModel) return null;

    const capabilities = await ai.languageModel.capabilities();
    if (capabilities.available === 'no') return null;

    const session = await ai.languageModel.create({
      systemPrompt: 'You are an expert legal safety assistant. You analyze Terms of Service text and return strict JSON.'
    });

    const promptText = `
Analyze the legal clauses below against these 5 red flags:
1. DATA_SALE: Selling, licensing, sharing, or syndicating user data or profile to third-party ad brokers or marketing networks.
2. AI_TRAINING: Training artificial intelligence, large language models, or machine learning systems on user uploads, content, or prompts without opt-out.
3. AUTO_RENEW: Subscriptions automatically renewing, recurring billing, or strict no-refund terms.
4. NO_DELETE: Indefinite retention of user data post-deletion or refusal to delete files.
5. WAIVE_RIGHTS: Mandatory binding arbitration and waiver of class action or jury trial rights.

CRITICAL DYNAMIC DETECTION INSTRUCTIONS:
- You must evaluate each category strictly based on the provided text.
- Set "present": true ONLY if an unfavorable or high-risk clause matching that category is genuinely present in the text, and extract a short quote in "snippet".
- If a category is NOT mentioned in the text, or if the text is clean/favorable for that category, set "present": false, summary: "No risk clause detected in agreement.", and snippet: "".
- For open-source, educational, or documentation sites (e.g. Creative Commons, Wikipedia, MDN), default categories to present: false unless explicit monetization/arbitration is present.
- Do NOT assume or hallucinate risk. Keep the count variable per website.

Respond ONLY with valid JSON matching this exact structure:
{
  "DATA_SALE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "AI_TRAINING": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "AUTO_RENEW": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "NO_DELETE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "WAIVE_RIGHTS": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" }
}

Terms to analyze:
${text.slice(0, 8000)}
`;

    const rawResponse = await session.prompt(promptText);
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const data = validateAndNormalizeData(parsed, text, domain);
    return {
      success: true,
      engine: 'Opera Web AI',
      data,
      categories: data
    };
  } catch (err) {
    console.info('[T&C Guardian] Local Browser AI unavailable or failed:', err.message || err);
    return null;
  }
}

/**
 * Prompt Template for Cloud LLM Providers
 */
const CLOUD_PROMPT_SYSTEM = `You are an expert legal safety assistant analyzing Terms of Service and Privacy Agreements for red flags.
Analyze the provided text against these 5 specific categories:
1. DATA_SALE: Selling, licensing, sharing, or syndicating user data, telemetry, or profile to third-party data brokers or advertisers.
2. AI_TRAINING: Training artificial intelligence, large language models, or machine learning systems using user uploads, prompts, or content without explicit opt-out.
3. AUTO_RENEW: Subscriptions automatically renewing (e.g. $99/mo), especially with strict no-refund policies or hard cancellation terms.
4. NO_DELETE: Indefinite retention of user data even after account closure or deletion requests.
5. WAIVE_RIGHTS: Mandatory binding individual arbitration and waiver of class action lawsuits or jury trials.

CRITICAL DYNAMIC DETECTION INSTRUCTIONS:
- You must evaluate each category strictly based on the provided text.
- Set "present": true ONLY if an unfavorable or high-risk clause matching that category is genuinely present in the text, and extract the exact quote in "snippet".
- If a category is NOT mentioned, absent, or if the terms do not contain that risk, set "present": false, summary: "No risk clause detected in agreement.", and snippet: "".
- For open-source, educational, or documentation sites (e.g. Creative Commons, Wikipedia, MDN), default categories to present: false unless explicit monetization/arbitration is present.
- Keep the response truly dynamic: a website with only 1 or 2 risks must only have those categories set to "present": true.

Respond ONLY with a valid JSON object strictly adhering to this schema without markdown or formatting:
{
  "DATA_SALE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "AI_TRAINING": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "AUTO_RENEW": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "NO_DELETE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" },
  "WAIVE_RIGHTS": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''" }
}`;

function isKeyConfigured(key) {
  return typeof key === 'string' && key.trim().length > 0 && !key.startsWith('PASTE_YOUR_') && key !== 'your_api_key_here';
}

/**
 * OpenAI-compatible Cloud Provider (Cerebras / Groq / OpenRouter)
 */
async function queryOpenAICompatible(text, endpoint, apiKey, model, engineName, timeoutMs = 3000, domain = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const promptUser = `Analyze the following terms text for the 5 categories:\n\n${text.slice(0, 10000)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: CLOUD_PROMPT_SYSTEM },
          { role: 'user', content: promptUser }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${engineName} HTTP ${res.status}: ${errText.slice(0, 180)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Empty response content from ${engineName}`);
    }

    const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const data = validateAndNormalizeData(parsed, text, domain);

    return {
      success: true,
      engine: engineName,
      data,
      categories: data
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Google Gemini Flash Cloud Provider
 */
async function queryGemini(text, apiKey = CONFIG.GEMINI_API_KEY, model = CONFIG.GEMINI_MODEL || 'gemini-2.5-flash', timeoutMs = 3000, domain = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const prompt = `${CLOUD_PROMPT_SYSTEM}\n\nTerms Text:\n${text.slice(0, 11000)}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 180)}`);
    }

    const json = await res.json();
    const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('No candidate content returned by Gemini');
    }

    const cleaned = candidateText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const data = validateAndNormalizeData(parsed, text, domain);

    return {
      success: true,
      engine: 'Gemini Flash',
      data,
      categories: data
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Tier 3: Multi-Provider Cloud AI Fallback Ring
 * Iterates through CONFIG.PROVIDER_FALLBACK_ORDER (Cerebras -> Groq -> OpenRouter -> Gemini)
 * Automatically rolls over to the next provider if rate-limited (429), errored, or slow.
 */
async function queryCloudFallback(text, domain = '') {
  const fallbackOrder = Array.isArray(CONFIG.PROVIDER_FALLBACK_ORDER) && CONFIG.PROVIDER_FALLBACK_ORDER.length > 0
    ? CONFIG.PROVIDER_FALLBACK_ORDER
    : ['cerebras', 'groq', 'openrouter', 'gemini'];

  const providerTimeout = CONFIG.PROVIDER_TIMEOUT_MS || 3000;

  for (const providerId of fallbackOrder) {
    const normalized = String(providerId).toLowerCase().trim();

    try {
      // 1. Cerebras (Ultra-Fast Inference)
      if (normalized === 'cerebras') {
        if (!isKeyConfigured(CONFIG.CEREBRAS_API_KEY)) {
          console.info('[T&C Guardian Ring] Skipping Cerebras: API key not configured.');
          continue;
        }
        console.info('[T&C Guardian Ring] Querying Cerebras...');
        return await queryOpenAICompatible(
          text,
          'https://api.cerebras.ai/v1/chat/completions',
          CONFIG.CEREBRAS_API_KEY,
          CONFIG.CEREBRAS_MODEL || 'llama3.1-70b',
          'Cerebras',
          providerTimeout,
          domain
        );
      }

      // 2. Groq (High-Speed Inference)
      if (normalized === 'groq') {
        if (!isKeyConfigured(CONFIG.GROQ_API_KEY)) {
          console.info('[T&C Guardian Ring] Skipping Groq: API key not configured.');
          continue;
        }
        console.info('[T&C Guardian Ring] Querying Groq...');
        return await queryOpenAICompatible(
          text,
          'https://api.groq.com/openai/v1/chat/completions',
          CONFIG.GROQ_API_KEY,
          CONFIG.GROQ_MODEL || 'llama-3.3-70b-versatile',
          'Groq',
          providerTimeout,
          domain
        );
      }

      // 3. OpenRouter
      if (normalized === 'openrouter') {
        if (!isKeyConfigured(CONFIG.OPENROUTER_API_KEY)) {
          console.info('[T&C Guardian Ring] Skipping OpenRouter: API key not configured.');
          continue;
        }
        console.info('[T&C Guardian Ring] Querying OpenRouter...');
        return await queryOpenAICompatible(
          text,
          'https://openrouter.ai/api/v1/chat/completions',
          CONFIG.OPENROUTER_API_KEY,
          CONFIG.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
          'OpenRouter',
          providerTimeout,
          domain
        );
      }

      // 4. Gemini Flash
      if (normalized === 'gemini') {
        if (!isKeyConfigured(CONFIG.GEMINI_API_KEY)) {
          console.info('[T&C Guardian Ring] Skipping Gemini: API key not configured.');
          continue;
        }
        console.info('[T&C Guardian Ring] Querying Gemini Flash...');
        return await queryGemini(
          text,
          CONFIG.GEMINI_API_KEY,
          CONFIG.GEMINI_MODEL || 'gemini-2.5-flash',
          providerTimeout,
          domain
        );
      }
    } catch (providerErr) {
      console.warn(`[T&C Guardian Ring] ${providerId} failed or timed out:`, providerErr.message || providerErr, '- Rolling over to next provider...');
      // Failover to next provider in the ring
    }
  }

  // All cloud providers in ring exhausted or unconfigured -> return dynamic fallback
  console.info('[T&C Guardian Ring] All cloud providers exhausted. Returning dynamic fallback.');
  return generateGuaranteedFallback('Fallback Detection', text, domain);
}

/**
 * Ensure all 5 categories exist with present: boolean, summary: string, shortSummary: string, and snippet: string.
 * Strictly preserves dynamic presence: categories where present is false are never forced to true.
 * Enforces ZERO-RISK DEFAULT for documentation and open-source sites.
 * Ensures shortSummary is concise (< 150 chars) and raw snippet is truncated to max 250 characters.
 */
function validateAndNormalizeData(raw, sourceText = '', domain = '') {
  const base = createEmptyData();
  const keys = ['DATA_SALE', 'AI_TRAINING', 'AUTO_RENEW', 'NO_DELETE', 'WAIVE_RIGHTS'];
  const isDoc = isDocumentationOrOpenSource(sourceText, domain);

  for (const k of keys) {
    if (raw && raw[k]) {
      let isPresent = Boolean(raw[k].present);

      // ZERO-RISK DEFAULT FOR DOCUMENTATION:
      // If terms text is open-source/educational, force present: false unless explicit monetization/arbitration
      if (isPresent && isDoc) {
        const explicitPatterns = EXPLICIT_MONETIZATION_ARBITRATION_PATTERNS[k];
        if (!explicitPatterns || !explicitPatterns.some((p) => p.test(sourceText))) {
          isPresent = false;
        }
      }

      if (isPresent) {
        let rawSnippet = String(raw[k].snippet || '').trim();
        if (!rawSnippet && sourceText) {
          rawSnippet = extractCategorySnippet(sourceText, k);
        }
        const finalSnippet = truncateSnippet(rawSnippet || extractCategorySnippet(sourceText, k) || 'Clause detected in agreement', 250);
        const rawSummary = String(raw[k].summary || raw[k].shortSummary || 'Risk clause detected in terms.');
        const shortSummary = formatShortSummary(raw[k].shortSummary || rawSummary, k, true);

        base[k] = {
          present: true,
          summary: rawSummary,
          shortSummary: shortSummary,
          snippet: finalSnippet
        };
        if (k === 'AUTO_RENEW') {
          base[k].cancellationGuide = raw[k]?.cancellationGuide || getCancellationGuide(domain);
        }
      } else {
        const docNote = isDoc ? ' (Open-source / educational site)' : '';
        base[k] = {
          present: false,
          summary: String(raw[k].summary || `No risk clause detected in agreement terms.${docNote}`),
          shortSummary: 'No risk clause detected.',
          snippet: ''
        };
        if (k === 'AUTO_RENEW') {
          base[k].cancellationGuide = null;
        }
      }
    } else {
      // Key omitted by LLM -> Clean / not present
      base[k] = {
        present: false,
        summary: 'No risk clause detected in agreement terms.',
        shortSummary: 'No risk clause detected.',
        snippet: ''
      };
      if (k === 'AUTO_RENEW') {
        base[k].cancellationGuide = null;
      }
    }
  }

  if (base.AUTO_RENEW?.present && base.AUTO_RENEW.cancellationGuide) {
    base.cancellationGuide = base.AUTO_RENEW.cancellationGuide;
  }

  return base;
}

/**
 * Execute 3-Tier Analysis Pipeline
 */
async function executeAnalysisPipeline(text, domain) {
  // Tier 1: ToS;DR Fast Lookup
  try {
    const tosdrResult = await queryTosdr(domain, text);
    if (tosdrResult?.success && tosdrResult?.data) {
      return tosdrResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Tier 1 ToS;DR failed:', err.message || err);
  }

  // Tier 2: Local Browser AI
  try {
    const browserAiResult = await queryBrowserAI(text, domain);
    if (browserAiResult?.success && browserAiResult?.data) {
      return browserAiResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Tier 2 Browser AI failed:', err.message || err);
  }

  // Tier 3: Cloud Fallback
  try {
    const cloudResult = await queryCloudFallback(text, domain);
    if (cloudResult?.success && cloudResult?.data) {
      return cloudResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Tier 3 Cloud Fallback failed:', err.message || err);
  }

  // If all tiers fail or return empty, return guaranteed fallback
  return generateGuaranteedFallback('Fallback Detection', text, domain);
}

/**
 * Tab Analysis Store & Page-Identity Lifecycle Management
 * Stores active analysis per tab, rejects stale navigations, and updates dynamic toolbar icon.
 */
const tabAnalysisStore = new Map();

function computeOverallRisk(data) {
  if (!data) return 'CLEAN';
  // High Risk (Dealbreakers): DATA_SALE, WAIVE_RIGHTS
  if (data.DATA_SALE?.present || data.WAIVE_RIGHTS?.present) {
    return 'HIGH';
  }
  // Medium Risk: AI_TRAINING, AUTO_RENEW
  if (data.AI_TRAINING?.present || data.AUTO_RENEW?.present) {
    return 'MEDIUM';
  }
  // Low Risk: NO_DELETE
  if (data.NO_DELETE?.present) {
    return 'LOW';
  }
  return 'CLEAN';
}

function updateToolbarIcon(tabId, riskLevel) {
  if (typeof chrome === 'undefined' || !chrome.action || !chrome.action.setIcon) return;
  let iconPath = 'icons/guardian-low-risk.png';
  if (riskLevel === 'HIGH') {
    iconPath = 'icons/guardian-high-risk.png';
  } else if (riskLevel === 'MEDIUM') {
    iconPath = 'icons/guardian-medium-risk.png';
  } else if (riskLevel === 'LOW' || riskLevel === 'CLEAN') {
    iconPath = 'icons/guardian-low-risk.png';
  }

  try {
    chrome.action.setIcon({
      tabId: tabId,
      path: {
        16: iconPath,
        32: iconPath,
        48: iconPath,
        128: iconPath
      }
    }, () => {
      if (chrome.runtime.lastError) {
        // Silently swallow errors if tab was closed during icon change
      }
    });
  } catch (e) {
    console.warn('[T&C Guardian] updateToolbarIcon failed:', e);
  }
}

function urlsMatchPageIdentity(urlA, urlB) {
  if (!urlA || !urlB) return false;
  if (urlA === urlB) return true;
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return urlA.split('#')[0].split('?')[0] === urlB.split('#')[0].split('?')[0];
  }
}

// Clear stale tab analysis on navigation
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      const record = tabAnalysisStore.get(tabId);
      if (record && !urlsMatchPageIdentity(changeInfo.url, record.url)) {
        tabAnalysisStore.delete(tabId);
        updateToolbarIcon(tabId, 'DEFAULT');
      }
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabAnalysisStore.delete(tabId);
  });
}

/**
 * Main Message Listener
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle ANALYZE_TC and FETCH_AND_ANALYZE_TC
  if (request?.action === 'ANALYZE_TC' || request?.action === 'FETCH_AND_ANALYZE_TC') {
    let text = request.text || '';
    let domain = request.domain || '';

    (async () => {
      let responded = false;
      const sendOnce = (payload) => {
        if (!responded) {
          responded = true;
          try {
            sendResponse(payload);
          } catch (e) {
            console.warn('[T&C Guardian] sendResponse error:', e);
          }
        }
      };

      // 10-second overall timeout: never fail silently
      const timeoutTimer = setTimeout(() => {
        console.warn('[T&C Guardian] 10s timeout reached. Returning guaranteed fallback.');
        const fallbackRes = generateGuaranteedFallback('Timeout Fallback', text, domain);
        if (sender?.tab?.id && fallbackRes?.data) {
          const tabId = sender.tab.id;
          const tabUrl = sender.tab.url || request.url || '';
          const tabDomain = domain || (tabUrl ? new URL(tabUrl).hostname.replace(/^www\./, '') : '');
          const riskLevel = computeOverallRisk(fallbackRes.data);
          tabAnalysisStore.set(tabId, {
            tabId,
            url: tabUrl,
            domain: tabDomain,
            engine: fallbackRes.engine || 'Timeout Fallback',
            data: fallbackRes.data,
            riskLevel,
            timestamp: Date.now()
          });
          updateToolbarIcon(tabId, riskLevel);
        }
        sendOnce(fallbackRes);
      }, 10000);

      try {
        // If action is FETCH_AND_ANALYZE_TC and text is not provided, fetch from url
        if (request.action === 'FETCH_AND_ANALYZE_TC' && !text && request.url) {
          try {
            const fetchRes = await fetch(request.url);
            if (fetchRes.ok) {
              const html = await fetchRes.text();
              text = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              if (!domain) {
                domain = new URL(request.url).hostname.replace(/^www\./, '');
              }
            }
          } catch (fetchErr) {
            console.warn('[T&C Guardian] Failed to fetch URL in service worker:', fetchErr);
          }
        }

        if (!domain && request.url) {
          try {
            domain = new URL(request.url).hostname.replace(/^www\./, '');
          } catch {}
        }

        const result = await executeAnalysisPipeline(text, domain);
        clearTimeout(timeoutTimer);

        // Store analysis per tab and update dynamic toolbar icon
        if (sender?.tab?.id && result?.data) {
          const tabId = sender.tab.id;
          const tabUrl = sender.tab.url || request.url || '';
          const tabDomain = domain || (tabUrl ? new URL(tabUrl).hostname.replace(/^www\./, '') : '');
          const riskLevel = computeOverallRisk(result.data);
          tabAnalysisStore.set(tabId, {
            tabId,
            url: tabUrl,
            domain: tabDomain,
            engine: result.engine || 'Analysis Pipeline',
            data: result.data,
            riskLevel,
            timestamp: Date.now()
          });
          updateToolbarIcon(tabId, riskLevel);
        }

        sendOnce(result);
      } catch (err) {
        clearTimeout(timeoutTimer);
        console.error('[T&C Guardian] Analysis pipeline error:', err);
        const errFallback = generateGuaranteedFallback('Error Fallback', text, domain);
        if (sender?.tab?.id && errFallback?.data) {
          const tabId = sender.tab.id;
          const tabUrl = sender.tab.url || request.url || '';
          const tabDomain = domain || (tabUrl ? new URL(tabUrl).hostname.replace(/^www\./, '') : '');
          const riskLevel = computeOverallRisk(errFallback.data);
          tabAnalysisStore.set(tabId, {
            tabId,
            url: tabUrl,
            domain: tabDomain,
            engine: errFallback.engine || 'Error Fallback',
            data: errFallback.data,
            riskLevel,
            timestamp: Date.now()
          });
          updateToolbarIcon(tabId, riskLevel);
        }
        sendOnce(errFallback);
      }
    })();

    // Always return true to keep the message channel open for async sendResponse
    return true;
  }

  // Retrieve stored analysis state for a given tab (called by popup.js)
  if (request?.action === 'GET_TAB_ANALYSIS') {
    const tabId = request.tabId;
    const reqUrl = request.url || '';
    const reqDomain = request.domain || '';

    const record = tabAnalysisStore.get(tabId);
    if (!record) {
      sendResponse({ success: false, reason: 'NOT_ANALYZED' });
      return false;
    }

    // Page identity check: if navigation to a different page occurred, reject stale result
    if (reqUrl && record.url && !urlsMatchPageIdentity(reqUrl, record.url)) {
      tabAnalysisStore.delete(tabId);
      updateToolbarIcon(tabId, 'DEFAULT');
      sendResponse({ success: false, reason: 'STALE_NAV' });
      return false;
    }

    sendResponse({
      success: true,
      tabId: record.tabId,
      url: record.url,
      domain: record.domain || reqDomain,
      engine: record.engine || 'Unknown',
      data: record.data,
      riskLevel: record.riskLevel,
      timestamp: record.timestamp
    });
    return false;
  }

  // Store/update tab analysis directly from an on-demand popup scan
  if (request?.action === 'STORE_TAB_ANALYSIS') {
    const { tabId, url, domain, result } = request;
    if (tabId && result?.data) {
      const riskLevel = computeOverallRisk(result.data);
      tabAnalysisStore.set(tabId, {
        tabId,
        url: url || '',
        domain: domain || '',
        engine: result.engine || 'Manual Scan',
        data: result.data,
        riskLevel,
        timestamp: Date.now()
      });
      updateToolbarIcon(tabId, riskLevel);
      sendResponse({ success: true, riskLevel });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  // Explicit Choice Model: Save explicit user preference without automated assumptions
  if (request?.action === 'SAVE_EXPLICIT_CHOICE') {
    const { domain, category, isAccepted } = request;
    chrome.storage.local.get(['tc_guardian_userProfile', 'tc_guardian_siteOverrides'], (res) => {
      const profile = res.tc_guardian_userProfile || getDefaultUserProfile();
      const overrides = res.tc_guardian_siteOverrides || {};

      if (category) {
        if (!profile[category]) profile[category] = { yes: 0, no: 0 };
        if (isAccepted) {
          profile[category].yes += 1;
        } else {
          profile[category].no += 1;
        }

        if (domain) {
          if (!overrides[domain]) overrides[domain] = {};
          overrides[domain][category] = Boolean(isAccepted);
        }
      }

      chrome.storage.local.set({
        tc_guardian_userProfile: profile,
        tc_guardian_siteOverrides: overrides
      }, () => {
        sendResponse({ success: true, profile, overrides });
      });
    });
    return true;
  }

  // Explicit Choice Model: Reset all preferences cleanly
  if (request?.action === 'RESET_PREFERENCES') {
    chrome.storage.local.set({
      tc_guardian_userProfile: getDefaultUserProfile(),
      tc_guardian_siteOverrides: {}
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

function getDefaultUserProfile() {
  return {
    DATA_SALE: { yes: 0, no: 0 },
    AI_TRAINING: { yes: 0, no: 0 },
    AUTO_RENEW: { yes: 0, no: 0 },
    NO_DELETE: { yes: 0, no: 0 },
    WAIVE_RIGHTS: { yes: 0, no: 0 }
  };
}
