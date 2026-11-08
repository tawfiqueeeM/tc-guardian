/**
 * T&C Guardian - Background Service Worker (Manifest V3)
 * Developer A: Multi-Tier Analysis Engine (ToS;DR -> Opera Web AI -> Cloud LLM Fallback)
 * With 10s Non-Silent Fallback Guarantee & Explicit-Choice Storage Protocol
 */

import { CONFIG } from './config.js';

// Default empty contract structure
const REQUIRED_CATEGORIES = [
  'DATA_SALE',
  'AI_TRAINING',
  'AUTO_RENEW',
  'NO_DELETE',
  'WAIVE_RIGHTS'
];

/**
 * Strict Payload Validation
 * Explicitly validates that the parsed payload contains all 5 risk categories with explicit boolean present properties.
 * If empty, malformed, or incomplete, returns false so status is forced to ERROR/INCOMPLETE.
 * Never defaults to CLEAN.
 */
function validateAnalysisData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  for (const cat of REQUIRED_CATEGORIES) {
    if (!data[cat] || typeof data[cat] !== 'object' || Array.isArray(data[cat])) {
      return false;
    }
    if (typeof data[cat].present !== 'boolean') {
      return false;
    }
  }
  return true;
}

function createEmptyData() {
  return {
    DATA_SALE: {
      present: false,
      summary: 'No explicit clauses found indicating commercial sale to third-party data brokers.',
      shortSummary: 'No data sale clauses detected.',
      snippet: '',
      optOutSteps: [],
      optOutLink: null
    },
    AI_TRAINING: {
      present: false,
      summary: 'No explicit clauses found authorizing AI model training on user uploads or data.',
      shortSummary: 'No AI training clauses detected.',
      snippet: '',
      optOutSteps: [],
      optOutLink: null
    },
    AUTO_RENEW: {
      present: false,
      summary: 'No automatic renewal or non-refundable billing terms detected.',
      shortSummary: 'No auto-renewal clauses detected.',
      snippet: '',
      cancellationGuide: null,
      optOutSteps: [],
      optOutLink: null
    },
    NO_DELETE: {
      present: false,
      summary: 'No clauses found indicating indefinite data retention following account deletion.',
      shortSummary: 'No indefinite retention clauses detected.',
      snippet: '',
      optOutSteps: [],
      optOutLink: null
    },
    WAIVE_RIGHTS: {
      present: false,
      summary: 'No mandatory binding arbitration or class action waiver clauses identified.',
      shortSummary: 'No arbitration waiver clauses detected.',
      snippet: '',
      optOutSteps: [],
      optOutLink: null
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
 * Dynamically checks matched evidence for "opt-out" / "opt out" and reflects it in summary.
 * Removes hardcoded "without opt-out" string.
 */
function formatShortSummary(summary, categoryKey, isPresent = true, evidence = '') {
  if (!isPresent) {
    return 'No risk clause detected.';
  }

  const defaultShorts = {
    DATA_SALE: 'Sells or shares your personal data with third-party ad brokers.',
    AI_TRAINING: 'Trains proprietary AI and neural models on your content.',
    AUTO_RENEW: 'Enforces recurring subscription renewals with strict non-refundable terms.',
    NO_DELETE: 'Retains customer records and activity telemetry indefinitely post-deletion.',
    WAIVE_RIGHTS: 'Forces individual binding arbitration and waives class action rights.'
  };

  const combinedEvidence = `${summary || ''} ${evidence || ''}`;

  if (categoryKey === 'AI_TRAINING') {
    const hasOptOut = /\bopt[- ]out\b/i.test(combinedEvidence);
    if (hasOptOut) {
      return 'Trains proprietary AI models on your content (opt-out available).';
    }
  }

  if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
    return defaultShorts[categoryKey] || 'Risk clause detected in terms.';
  }

  let clean = summary.replace(/\s+/g, ' ').trim();
  // Strip hardcoded "without opt-out" if an opt-out was detected
  if (categoryKey === 'AI_TRAINING' && /\bopt[- ]out\b/i.test(combinedEvidence)) {
    clean = clean.replace(/without\s+opt[- ]out/gi, 'with opt-out available');
  } else if (categoryKey === 'AI_TRAINING') {
    // Also remove hardcoded "without opt-out" string as requested
    clean = clean.replace(/\s+without\s+opt[- ]out/gi, '');
  }

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
 * Generic Opt-Out & Resolution Guidance for Medium & High-Risk Categories
 */
function getGenericOptOutGuide(category, domain = '') {
  const cleanDomain = String(domain || '').toLowerCase().replace(/^www\./, '').trim();
  if (category === 'DATA_SALE') {
    return {
      steps: [
        'Visit the site\'s Privacy Settings or footer and select "Do Not Sell My Info" or "Cookie Preferences".',
        'Toggle off third-party ad targeting, data sharing, and behavioral tracking.',
        'Submit a formal CCPA/GDPR opt-out request through their privacy webform or email.'
      ],
      optOutLink: cleanDomain ? `https://${cleanDomain}` : null
    };
  }
  if (category === 'AI_TRAINING') {
    return {
      steps: [
        'Open your Account Settings or Privacy / Data Controls dashboard.',
        'Locate "Model Improvement", "AI Training", or "Content Permissions".',
        'Turn off the toggle allowing your prompts, files, or uploaded data to train artificial intelligence models.'
      ],
      optOutLink: cleanDomain ? `https://${cleanDomain}` : null
    };
  }
  if (category === 'AUTO_RENEW') {
    const guide = getCancellationGuide(domain);
    return {
      steps: guide.steps,
      optOutLink: guide.url
    };
  }
  if (category === 'WAIVE_RIGHTS') {
    return {
      steps: [
        'Review the Arbitration section in the terms for an opt-out deadline (typically 30 days from sign-up).',
        'Draft a brief written notice stating your name, account identifier, and explicit rejection of the arbitration clause.',
        'Send the opt-out notice via email or certified mail to the company\'s designated legal notice address.'
      ],
      optOutLink: null
    };
  }
  if (category === 'NO_DELETE') {
    return {
      steps: [
        'Contact customer support or the Data Protection Officer requesting total account erasure.',
        'Cite your right to deletion under GDPR (Article 17) or CCPA where applicable.',
        'Request written confirmation once persistent records and backup archives are purged.'
      ],
      optOutLink: null
    };
  }
  return { steps: [], optOutLink: null };
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
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:we\s+|may\s+)?sell\s+(?:or\s+monetize\s+)?(?:your\s+|user\s+)?personal\s+(?:information|data)/i,
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)monetiz(?:e|ing)\s+(?:your\s+|user\s+)?(?:personal\s+)?data/i,
    /(?<!\b(?:no\s+|prohibit\s+))sale\s+of\s+personal\s+(?:information|data)/i,
    /(?:license|syndicate)\s+personal\s+data\s+to\s+third[- ]party\s+data\s+brokers/i,
    /share\s+(?:your\s+)?personal\s+information\s+with\s+commercial\s+data\s+brokers/i,
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:sell|rent)\s+your\s+personal\s+information/i
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
 * Employs negative lookbehinds so negation statements are not matched.
 */
const CATEGORY_SNIPPET_MATCHERS = {
  DATA_SALE: [
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not|right\s+to\s+|request\s+to\s+|portability\s+of\s+)\s+(?:to\s+|ever\s+)?)(?:sell|share|disclose|license|monetiz|transfer)\s+[^.!?\n]{0,60}(?:personal\s+(?:information|data)|telemetry|user\s+profile)[^.!?\n]{0,60}(?:third[- ]part|advertis|broker|commercial|marketing|partner)/i,
    /(?:third[- ]party|data\s+broker|advertis)[^.!?\n]{0,60}(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not|right\s+to\s+|request\s+to\s+)\s+(?:to\s+|ever\s+)?)(?:sell|share|monetiz|license)[^.!?\n]{0,60}(?:personal\s+(?:information|data)|user\s+data)/i,
    /(?<!\b(?:no\s+|prohibit\s+))sale\s+(?:or\s+sharing\s+)?of\s+personal\s+(?:information|data)/i,
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:we\s+|may\s+)?sell\s+(?:or\s+monetize\s+)?(?:your\s+|user\s+)?personal\s+(?:information|data)/i,
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:monetiz(?:e|ing)|monetisation|monetization)\s+(?:your\s+|user\s+)?(?:personal\s+)?data/i,
    /commercial\s+data\s+broker\s+licensing/i,
    /sell,\s+license,\s+and\s+syndicate\s+personal\s+data/i
  ],
  AI_TRAINING: [
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:train|training|develop|improve)\s+[^.!?\n]{0,40}(?:ai|artificial\s+intelligence|machine\s+learning|large\s+language|llm|algorithm|neural)\s+models?[^.!?\n]{0,40}(?:content|data|upload|prompt|submission|user)/i,
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:train|training|fine-tun(?:e|ing))\s+(?:our\s+|proprietary\s+)?(?:ai|artificial\s+intelligence|machine\s+learning|neural\s+network|large\s+language)\s+models?\s+(?:on|using|with)\s+(?:your|user)/i,
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:use|utilize|license|ingest)\s+[^.!?\n]{0,40}(?:content|data|upload|prompt|submission|post)[^.!?\n]{0,40}(?:train|training|machine\s+learning|ai\s+model)/i,
    /(?<!\b(?:no\s+|prohibit\s+|without\s+))model\s+training\b/i,
    /ai\s+model\s+training\s+license/i,
    /license\s+to\s+train\s+(?:proprietary\s+)?(?:artificial\s+intelligence|machine\s+learning|ai\s+models)/i,
    /train\s+artificial\s+intelligence\s+(?:models\s+and\s+neural\s+networks\s+on\s+user\s+data|systems)/i
  ],
  AUTO_RENEW: [
    /(?:subscription|plan|service|membership)\s+(?:will\s+)?automatically\s+renew/i,
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't)\s+(?:to\s+|ever\s+)?)automatic(?:ally)?\s+(?:renew(?:s|al)?|charge(?:s|d)?)/i,
    /auto-renew(?:s|al)?/i,
    /recurring\s+(?:billing|charge|subscription|fee|payment)/i,
    /paid\s+subscription\s+renew(?:s|al|als)?/i,
    /automatic\s+charges?/i,
    /mandatory\s+\$(?:99|\d+)[^.!?\n]*recurring\s+auto-renewal/i,
    /(?:payments?|fees|charges?)\s+(?:are|is)\s+(?:strictly\s+)?non-refundable/i,
    /no\s+refunds\s+or\s+credits\s+for\s+(?:partial|any)/i,
    /automatically\s+renew\s+subscription\s+at\s+recurring\s+rate/i
  ],
  NO_DELETE: [
    /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't)\s+(?:to\s+|ever\s+)?)(?:retain|keep|preserve|store|archive)\s+[^.!?\n]{0,50}(?:indefinitely|in\s+perpetuity|permanently|in\s+backups)/i,
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
  DATA_SALE: /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not|right\s+to\s+|request\s+to\s+|portability\s+of\s+)\s+(?:to\s+|ever\s+)?)(?:sell|share|disclose|license|monetiz)\s+[^.!?\n]{0,50}(?:personal\s+(?:information|data)|user\s+data)[^.!?\n]{0,50}(?:third[- ]part|advertis|broker|marketing)|(?<!\b(?:no\s+|prohibit\s+))sale\s+(?:or\s+sharing\s+)?of\s+personal\s+information|monetiz(?:e|ing)\s+(?:your\s+)?data/i,
  AI_TRAINING: /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:train|training|develop|improve)\s+[^.!?\n]{0,40}(?:ai|artificial\s+intelligence|machine\s+learning|llm|algorithm)\s+models?[^.!?\n]{0,40}(?:content|data|upload|prompt|user)|(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not|not)\s+(?:to\s+|ever\s+)?)(?:use|license)\s+[^.!?\n]{0,30}(?:to\s+train|(?:content|data|upload|prompt)\s+[^.!?\n]{0,30}(?:train|training|ai\s+model))|(?<!\b(?:no\s+|prohibit\s+|without\s+))model\s+training\b|ai\s+model\s+training|license\s+to\s+train\s+[^.!?\n]{0,30}(?:ai|artificial\s+intelligence|machine\s+learning)/i,
  AUTO_RENEW: /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't)\s+(?:to\s+|ever\s+)?)automatic(?:ally)?\s+(?:renew(?:s|al)?|charge(?:s|d)?)|paid\s+subscription\s+renew(?:s|al|als)?|automatic\s+charges?|auto-renew|recurring\s+(?:billing|charge|subscription)|non-refundable\s+(?:subscription|billing|fee)/i,
  NO_DELETE: /(?<!\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't)\s+(?:to\s+|ever\s+)?)(?:retain|keep|preserve|store)\s+[^.!?\n]{0,40}(?:indefinitely|permanently)|(?:after\s+(?:account\s+)?deletion|even\s+if\s+you\s+delete)[^.!?\n]{0,40}(?:retain|remain|preserve)|indefinite\s+data\s+retention/i,
  WAIVE_RIGHTS: /(?:mandatory|binding)\s+arbitration|arbitration\s+agreement|class\s+action\s+waiver|waive\s+[^.!?\n]{0,30}(?:jury\s+trial|class\s+action)/i
};

/**
 * Data Portability Patterns & Exclusion
 * Protects GDPR/CCPA data portability and export clauses from being misidentified as data sales.
 */
const PORTABILITY_PATTERNS = [
  /\b(?:data\s+)?portability\b/i,
  /\bright\s+to\s+(?:request\s+)?(?:transfer|port|export|download|receive)\b/i,
  /\b(?:you\s+may\s+request|user\s+requests?)\s+to\s+transfer\b/i,
  /\btransfer\s+(?:your\s+own|such)\s+data\b/i,
  /\btransfer\s+(?:of\s+)?(?:your\s+)?personal\s+data\s+(?:to\s+another\s+(?:controller|service|provider)|upon\s+(?:your\s+)?request)\b/i,
  /\btransfer\s+personal\s+data\s+to\s+another\b/i
];

/**
 * Negation Patterns & Exclusion Checker
 * Explicitly excludes statements containing negations ("do not sell", "don't sell",
 * "will not sell", "never sell", "does not use") so they are never flagged as threats.
 */
const NEGATION_PATTERNS = [
  /\b(?:do\s+not|don't|does\s+not|doesn't|did\s+not|didn't|will\s+not|won't|never|cannot|can't|shall\s+not|neither|nor)\b/i,
  /\b(?:no\s+(?:longer|sale|selling|monetization|licensing|sharing|training|retention|waiver))\b/i,
  /\b(?:prohibit(?:ed|s)?|refrain\s+from|strictly\s+forbidden|not\s+permitted|not\s+authorized)\b/i,
  /\bnot\s+(?:ever\s+)?(?:sell|sold|share|shared|monetiz\w*|train\w*|use\w*|retain\w*|renew\w*|waiv\w*)\b/i
];

function isClauseNegated(text, matchIndex, matchLength = 0, categoryKey = '') {
  if (!text || typeof text !== 'string') return false;

  const textBefore = text.slice(0, matchIndex);
  const sentenceStart = Math.max(
    0,
    textBefore.lastIndexOf('. '),
    textBefore.lastIndexOf('.\n'),
    textBefore.lastIndexOf('? '),
    textBefore.lastIndexOf('! '),
    textBefore.lastIndexOf('\n\n')
  );

  const clause = text.slice(sentenceStart === 0 ? 0 : sentenceStart + 2, matchIndex + matchLength + 60);
  const preceding = text.slice(sentenceStart === 0 ? 0 : sentenceStart + 2, matchIndex);

  // Check data portability rights exclusion for DATA_SALE (e.g. right to transfer, portability, transfer your own data)
  if (categoryKey === 'DATA_SALE' || (!categoryKey && /\b(?:data|personal|information|transfer)\b/i.test(clause))) {
    for (const portRegex of PORTABILITY_PATTERNS) {
      if (portRegex.test(clause)) {
        return true; // Exclude data portability rights from being treated as sales
      }
    }
  }

  for (const negRegex of NEGATION_PATTERNS) {
    if (negRegex.test(preceding)) {
      const afterNegation = preceding.replace(negRegex, '');
      if (!/\b(?:however|nevertheless|nonetheless|but\s+we\s+may|except)\b/i.test(afterNegation)) {
        return true;
      }
    }
  }

  // Direct phrase negation pattern check
  if (/\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|never|cannot|can't|shall\s+not)\s+[^.!?\n]{0,60}(?:sell|monetiz|train|retain|renew|waive|use)/i.test(clause)) {
    return true;
  }

  return false;
}

/**
 * Checks whether sourceText genuinely contains high-confidence risk clauses for categoryKey.
 * Strictly avoids generic single words and rejects negated statements (e.g. "do not sell").
 * Automatically enforces a ZERO-RISK DEFAULT for open-source and educational documentation text.
 */
function hasCategoryRisk(sourceText, categoryKey, domain = '') {
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    return false;
  }

  // ZERO-RISK DEFAULT FOR DOCUMENTATION:
  if (isDocumentationOrOpenSource(sourceText, domain)) {
    const explicitPatterns = EXPLICIT_MONETIZATION_ARBITRATION_PATTERNS[categoryKey];
    if (!explicitPatterns) {
      return false;
    }
    return explicitPatterns.some((regex) => {
      let m;
      const r = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
      while ((m = r.exec(sourceText)) !== null) {
        if (!isClauseNegated(sourceText, m.index, m[0].length, categoryKey)) {
          return true;
        }
      }
      return false;
    });
  }

  // HIGH-CONFIDENCE MATCHING ONLY (with negation exclusion):
  const snippetMatchers = CATEGORY_SNIPPET_MATCHERS[categoryKey] || [];
  for (const regex of snippetMatchers) {
    let m;
    const r = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((m = r.exec(sourceText)) !== null) {
      if (!isClauseNegated(sourceText, m.index, m[0].length, categoryKey)) {
        return true;
      }
    }
  }

  const generalPattern = CATEGORY_RISK_PATTERNS[categoryKey];
  if (generalPattern) {
    let m;
    const r = new RegExp(generalPattern.source, generalPattern.flags.includes('g') ? generalPattern.flags : generalPattern.flags + 'g');
    while ((m = r.exec(sourceText)) !== null) {
      if (!isClauseNegated(sourceText, m.index, m[0].length, categoryKey)) {
        return true;
      }
    }
  }

  return false;
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
        let m = regex.exec(clean);
        if (m && isClauseNegated(clean, m.index, m[0].length, categoryKey)) {
          continue; // Skip negated statement
        }
        if (clean.length > 200 && m) {
          const start = Math.max(0, m.index - 35);
          const end = Math.min(clean.length, m.index + m[0].length + 100);
          return (start > 0 ? '...' : '') + clean.slice(start, end).trim() + (end < clean.length ? '...' : '');
        }
        return clean;
      }
    }
  }

  // Next, try broader regex search across the raw source text
  for (const regex of matchers) {
    let m;
    const r = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((m = r.exec(sourceText)) !== null) {
      if (!isClauseNegated(sourceText, m.index, m[0].length, categoryKey)) {
        const start = Math.max(0, m.index - 30);
        const end = Math.min(sourceText.length, m.index + m[0].length + 90);
        const sub = sourceText.slice(start, end).replace(/\s+/g, ' ').trim();
        return (start > 0 ? '...' : '') + sub + (end < sourceText.length ? '...' : '');
      }
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
  const keys = REQUIRED_CATEGORIES;
  const isDoc = isDocumentationOrOpenSource(sourceText, domain);

  for (const k of keys) {
    const isDetected = hasCategoryRisk(sourceText, k, domain);
    if (isDetected) {
      const rawSnippet = extractCategorySnippet(sourceText, k);
      const snippet = truncateSnippet(rawSnippet, 250);
      const shortSummary = formatShortSummary('', k, true, rawSnippet);
      const guide = getGenericOptOutGuide(k, domain);
      data[k] = {
        present: true,
        summary: `Fallback detection: ${k.replace('_', ' ').toLowerCase()} clause detected in agreement requiring explicit user choice.`,
        shortSummary: shortSummary,
        snippet: snippet,
        optOutSteps: guide.steps,
        optOutLink: guide.optOutLink
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
        snippet: '',
        optOutSteps: [],
        optOutLink: null
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
      if (validatedData) {
        return {
          success: true,
          engine: 'ToS;DR',
          data: validatedData,
          categories: validatedData
        };
      }
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
- For EVERY flagged Medium and High-risk category (DATA_SALE, AI_TRAINING, AUTO_RENEW, WAIVE_RIGHTS), if "present" is true, extract step-by-step resolution instructions in an "optOutSteps" array (e.g. how the user can opt-out of data sales, toggle off AI training, cancel recurring billing, or send an arbitration opt-out notice) and any direct resolution URL in "optOutLink" (valid https:// URL if found in the text, otherwise null).
- If a category is NOT mentioned in the text, or if the text is clean/favorable for that category, set "present": false, summary: "No risk clause detected in agreement.", snippet: "", optOutSteps: [], and optOutLink: null.
- For open-source, educational, or documentation sites (e.g. Creative Commons, Wikipedia, MDN), default categories to present: false unless explicit monetization/arbitration is present.
- Do NOT assume or hallucinate risk. Keep the count variable per website.

Respond ONLY with valid JSON matching this exact structure:
{
  "DATA_SALE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" },
  "AI_TRAINING": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" },
  "AUTO_RENEW": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" },
  "NO_DELETE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": [], "optOutLink": null },
  "WAIVE_RIGHTS": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "1-2 sentence explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" }
}

Terms to analyze:
${text.slice(0, 8000)}
`;

    const rawResponse = await session.prompt(promptText);
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const data = validateAndNormalizeData(parsed, text, domain);
    if (!data) return null;
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
- For EVERY flagged Medium and High-risk category (DATA_SALE, AI_TRAINING, AUTO_RENEW, WAIVE_RIGHTS), if "present" is true, extract step-by-step resolution instructions in an "optOutSteps" array (e.g. how the user can opt-out of data sales, toggle off AI training, cancel recurring billing, or send an arbitration opt-out notice) and any direct resolution URL in "optOutLink" (valid https:// URL if found in the text, otherwise null).
- If a category is NOT mentioned, absent, or if the terms do not contain that risk, set "present": false, summary: "No risk clause detected in agreement.", snippet: "", optOutSteps: [], and optOutLink: null.
- For open-source, educational, or documentation sites (e.g. Creative Commons, Wikipedia, MDN), default categories to present: false unless explicit monetization/arbitration is present.
- Keep the response truly dynamic: a website with only 1 or 2 risks must only have those categories set to "present": true.

Respond ONLY with a valid JSON object strictly adhering to this schema without markdown or formatting:
{
  "DATA_SALE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" },
  "AI_TRAINING": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" },
  "AUTO_RENEW": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" },
  "NO_DELETE": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": [], "optOutLink": null },
  "WAIVE_RIGHTS": { "present": boolean, "shortSummary": "concise 1-2 sentence plain-English summary under 150 chars if present, or 'No risk clause detected'", "summary": "plain English explanation", "snippet": "exact quote from text (max 250 chars) if present, else ''", "optOutSteps": ["step 1", "step 2"], "optOutLink": "https://... or null" }
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
    if (!data) {
      throw new Error(`Incomplete or malformed category payload from ${engineName}`);
    }

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
    if (!data) {
      throw new Error('Incomplete or malformed category payload from Gemini Flash');
    }

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
 * Ensure all 5 categories exist with explicit boolean present property, summary, shortSummary, and snippet.
 * Validates strictly: if any category is omitted or malformed, returns null so caller forces ERROR or failover.
 * Never defaults missing categories to CLEAN.
 * Enforces ZERO-RISK DEFAULT for documentation and open-source sites.
 * Ensures shortSummary is concise (< 150 chars) and raw snippet is truncated to max 250 characters.
 */
function validateAndNormalizeData(raw, sourceText = '', domain = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  // Strictly verify all 5 risk categories exist in the raw payload
  const hasAllKeys = REQUIRED_CATEGORIES.every((k) => {
    return raw[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k]);
  });
  if (!hasAllKeys) {
    return null;
  }

  const base = createEmptyData();
  const keys = REQUIRED_CATEGORIES;
  const isDoc = isDocumentationOrOpenSource(sourceText, domain);

  for (const k of keys) {
    let isPresent = false;
    if (typeof raw[k].present === 'boolean') {
      isPresent = raw[k].present;
    } else if (typeof raw[k].present === 'string') {
      isPresent = /^(true|yes)$/i.test(raw[k].present.trim());
    } else {
      return null; // Invalid or missing presence flag
    }

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
      const shortSummary = formatShortSummary(raw[k].shortSummary || rawSummary, k, true, rawSnippet);

      const fallbackGuide = getGenericOptOutGuide(k, domain);
      const optOutSteps = (Array.isArray(raw[k]?.optOutSteps) && raw[k].optOutSteps.length > 0)
        ? raw[k].optOutSteps.map((s) => String(s).trim()).filter(Boolean)
        : (raw[k]?.cancellationGuide?.steps || fallbackGuide.steps);
      const optOutLink = (typeof raw[k]?.optOutLink === 'string' && /^https:\/\//i.test(raw[k].optOutLink.trim()))
        ? raw[k].optOutLink.trim()
        : (raw[k]?.cancellationGuide?.url || fallbackGuide.optOutLink);

      base[k] = {
        present: true,
        summary: rawSummary,
        shortSummary: shortSummary,
        snippet: finalSnippet,
        optOutSteps: optOutSteps,
        optOutLink: optOutLink
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
        snippet: '',
        optOutSteps: [],
        optOutLink: null
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
 * Execute Analysis Pipeline with Primary LLM Priority
 * Attempts the primary LLM (Cloud AI) API calls first, and only routes to
 * Fallback Detection if the LLMs fail, timeout, or hit rate limits.
 */
async function executeAnalysisPipeline(text, domain) {
  // Tier 1: Primary Cloud LLM (Cerebras -> Groq -> OpenRouter -> Gemini)
  // Ensure the pipeline properly attempts the primary LLM (Cloud AI) API calls first
  try {
    const cloudResult = await queryCloudFallback(text, domain);
    // If an actual Cloud LLM succeeded (not the internal fallback), return immediately
    if (cloudResult?.success && cloudResult?.data && !/fallback/i.test(cloudResult.engine)) {
      return cloudResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Primary Cloud LLM failed:', err.message || err);
  }

  // Tier 2: ToS;DR Fast Database Lookup
  try {
    const tosdrResult = await queryTosdr(domain, text);
    if (tosdrResult?.success && tosdrResult?.data) {
      return tosdrResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Tier 2 ToS;DR failed:', err.message || err);
  }

  // Tier 3: Local Browser AI (if available)
  try {
    const browserAiResult = await queryBrowserAI(text, domain);
    if (browserAiResult?.success && browserAiResult?.data) {
      return browserAiResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Tier 3 Browser AI failed:', err.message || err);
  }

  // Tier 4: Fallback Detection (only reached if LLMs fail, timeout, or hit rate limits)
  return generateGuaranteedFallback('Fallback Detection', text, domain);
}

/**
 * Tab Analysis Store & Page-Identity Lifecycle Management
 * Backed by chrome.storage.session to survive Service Worker termination (P4).
 * Rejects stale navigations and late asynchronous responses via scanId (P5).
 * Updates dynamic toolbar icon with size dictionary and neutral assets (P2).
 */
const memoryTabStore = new Map();
const memoryScanStore = new Map();

const tabAnalysisStore = {
  async get(tabId) {
    if (!tabId) return null;
    const key = `tab_analysis_${tabId}`;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const res = await chrome.storage.session.get(key);
        if (res && res[key]) return res[key];
      } catch (e) {
        console.warn('[T&C Guardian] chrome.storage.session.get error:', e);
      }
    }
    return memoryTabStore.get(tabId) || null;
  },
  async set(tabId, record) {
    if (!tabId) return;
    memoryTabStore.set(tabId, record);
    const key = `tab_analysis_${tabId}`;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        await chrome.storage.session.set({ [key]: record });
      } catch (e) {
        console.warn('[T&C Guardian] chrome.storage.session.set error:', e);
      }
    }
  },
  async delete(tabId) {
    if (!tabId) return;
    memoryTabStore.delete(tabId);
    memoryScanStore.delete(tabId);
    const key = `tab_analysis_${tabId}`;
    const scanKey = `active_scan_${tabId}`;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        await chrome.storage.session.remove([key, scanKey]);
      } catch (e) {
        console.warn('[T&C Guardian] chrome.storage.session.remove error:', e);
      }
    }
  }
};

async function getActiveScanId(tabId) {
  if (!tabId) return null;
  const key = `active_scan_${tabId}`;
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    try {
      const res = await chrome.storage.session.get(key);
      if (res && res[key]) return res[key];
    } catch {}
  }
  return memoryScanStore.get(tabId) || null;
}

async function setActiveScanId(tabId, scanId) {
  if (!tabId) return;
  memoryScanStore.set(tabId, scanId);
  const key = `active_scan_${tabId}`;
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    try {
      await chrome.storage.session.set({ [key]: scanId });
    } catch {}
  }
}

function computeOverallRisk(data) {
  if (!data) return { level: 'CLEAN', count: 0 };
  let count = 0;
  // Threat count for the toolbar badge ONLY counts risks where present === true AND acknowledged !== true
  const isUnack = (cat) => Boolean(cat?.present && cat?.acknowledged !== true);

  if (isUnack(data.DATA_SALE)) count++;
  if (isUnack(data.AI_TRAINING)) count++;
  if (isUnack(data.AUTO_RENEW)) count++;
  if (isUnack(data.NO_DELETE)) count++;
  if (isUnack(data.WAIVE_RIGHTS)) count++;

  if (count === 0) {
    return { level: 'CLEAN', count: 0 };
  }

  let level = 'CLEAN';
  // High Risk (Dealbreakers): DATA_SALE, WAIVE_RIGHTS
  if (isUnack(data.DATA_SALE) || isUnack(data.WAIVE_RIGHTS)) {
    level = 'HIGH';
  } else if (isUnack(data.AI_TRAINING) || isUnack(data.AUTO_RENEW)) {
    // Medium Risk: AI_TRAINING, AUTO_RENEW
    level = 'MEDIUM';
  } else if (isUnack(data.NO_DELETE)) {
    // Low Risk: NO_DELETE
    level = 'LOW';
  }
  return { level, count };
}

const TOOLBAR_ICON_MAP = {
  HIGH: '/icons/guardian-high-risk.png',
  MEDIUM: '/icons/guardian-medium-risk.png',
  LOW: '/icons/guardian-low-risk.png',
  CLEAN: '/icons/guardian-low-risk.png',
  ERROR: '/icons/guardian-neutral.png',
  NEUTRAL: '/icons/guardian-neutral.png'
};

async function updateToolbarIcon(tabId, riskLevel, count = 0) {
  if (typeof chrome === 'undefined' || !chrome.action || !chrome.action.setIcon) return;

  const normalizedLevel = String(riskLevel || 'NEUTRAL').toUpperCase();
  const iconPath = TOOLBAR_ICON_MAP[normalizedLevel] || TOOLBAR_ICON_MAP.NEUTRAL;

  let badgeColor = '#dc2626';
  if (normalizedLevel === 'MEDIUM') {
    badgeColor = '#d97706';
  } else if (normalizedLevel === 'LOW' || normalizedLevel === 'CLEAN') {
    badgeColor = '#16a34a';
  }

  try {
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      const iconUrl = chrome.runtime.getURL(iconPath);
      const res = await fetch(iconUrl);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(32, 32);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 32, 32);
      ctx.drawImage(bitmap, 0, 0, 32, 32);
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }

      const numericCount = Number(count) || 0;
      if (numericCount > 0) {
        const centerX = 24;
        const centerY = 8;
        const radius = 7;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = badgeColor;
        ctx.fill();

        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = (numericCount > 9) ? 'bold 7.5px sans-serif' : 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(numericCount), centerX, centerY + 0.5);
      }

      const imageData = ctx.getImageData(0, 0, 32, 32);
      const setIconDetails = tabId
        ? { tabId: tabId, imageData: { "32": imageData } }
        : { imageData: { "32": imageData } };

      chrome.action.setIcon(setIconDetails, () => {
        if (chrome.runtime?.lastError) {}
      });
    }
  } catch (err) {
    console.warn('[T&C Guardian] updateToolbarIcon OffscreenCanvas failed:', err);
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
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      const record = await tabAnalysisStore.get(tabId);
      if (record && !urlsMatchPageIdentity(changeInfo.url, record.url)) {
        await tabAnalysisStore.delete(tabId);
        updateToolbarIcon(tabId, 'DEFAULT', 0);
      }
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    await tabAnalysisStore.delete(tabId);
  });
}

/**
 * Centralized State Control & Scan Finalization
 * Verifies scanId against active scan in session storage to eliminate race conditions.
 * Validates payload, stores record, updates toolbar icon/badge, and broadcasts finalized state to content script.
 */
async function finalizeScan(tabId, scanId, result, context = {}) {
  const url = context.url || '';
  const domain = context.domain || (url ? new URL(url).hostname.replace(/^www\./, '') : '');
  const policyUrl = context.policyUrl || null;

  // 1. Verify scanId matches active scan in session storage (late response override protection)
  if (tabId && scanId) {
    const activeScan = await getActiveScanId(tabId);
    if (activeScan && activeScan !== scanId) {
      console.warn(`[T&C Guardian] Discarding stale scan result: active=${activeScan}, incoming=${scanId}`);
      return { success: false, reason: 'STALE_SCAN_DISCARDED', status: 'STALE' };
    }
  }

  // 2. Strict Result Validation: validate all 5 categories have explicit boolean present
  let status = result?.status || (result?.success ? 'SUCCESS' : 'ERROR');
  let data = result?.data || null;
  let engine = result?.engine || context.engine || 'Analysis Pipeline';
  let error = result?.error || null;
  let reason = result?.reason || null;

  if (status === 'SUCCESS' && data) {
    const isValid = validateAnalysisData(data);
    if (!isValid) {
      console.warn('[T&C Guardian] Payload failed strict validation; forcing status to ERROR/INCOMPLETE');
      status = 'ERROR';
      reason = 'INCOMPLETE_DATA';
      error = 'Analysis data was missing required categories or had malformed presence flags.';
      data = null;
    }
  }

  // Domain Persistence: Asynchronously fetch user's saved historical choices for the current domain
  if (status === 'SUCCESS' && data) {
    try {
      const storedOverrides = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get(['tc_guardian_siteOverrides'], (res) => {
            resolve(res?.tc_guardian_siteOverrides || {});
          });
        } else {
          resolve({});
        }
      });

      const hostCandidates = new Set();
      const addHost = (raw) => {
        if (!raw) return;
        try {
          const u = new URL(raw);
          hostCandidates.add(u.hostname);
          hostCandidates.add(u.hostname.replace(/^www\./, ''));
        } catch {
          const clean = String(raw).replace(/^www\./, '').split('/')[0].split('?')[0].trim();
          if (clean) {
            hostCandidates.add(clean);
            hostCandidates.add('www.' + clean);
          }
        }
      };

      addHost(context.url);
      addHost(url);
      addHost(context.domain);
      addHost(domain);

      let domainChoices = null;
      for (const host of hostCandidates) {
        if (storedOverrides[host]) {
          domainChoices = storedOverrides[host];
          break;
        }
      }

      // If a risk category has a saved choice for this domain, append acknowledged: true
      if (domainChoices && typeof domainChoices === 'object') {
        for (const catKey of Object.keys(data)) {
          if (Object.prototype.hasOwnProperty.call(domainChoices, catKey)) {
            data[catKey].acknowledged = true;
          }
        }
      }
    } catch (persistErr) {
      console.warn('[T&C Guardian] Domain persistence check failed:', persistErr);
    }
  }

  // 3. Compute overall risk & severity (ONLY counting unacknowledged risks)
  let riskLevel = 'UNANALYZED';
  let riskCount = 0;

  if (status === 'SUCCESS' && data) {
    const riskInfo = computeOverallRisk(data);
    riskLevel = riskInfo.level;
    riskCount = riskInfo.count;
  } else if (status === 'ERROR') {
    riskLevel = 'ERROR';
    riskCount = 0;
  } else if (status === 'UNANALYZED') {
    riskLevel = 'UNANALYZED';
    riskCount = 0;
  }

  // 4. Construct complete record
  const record = {
    tabId,
    scanId,
    url,
    domain,
    policyUrl,
    engine,
    status,
    reason,
    error,
    data,
    riskLevel,
    riskCount,
    timestamp: Date.now()
  };

  // 5. Write to storage cache
  if (tabId) {
    await tabAnalysisStore.set(tabId, record);
    // 6. Update toolbar icon and badge
    updateToolbarIcon(tabId, riskLevel, riskCount);

    // 7. Broadcast finalized, validated state to content script in active tab
    try {
      chrome.tabs.sendMessage(tabId, {
        action: 'TAB_ANALYSIS_FINALIZED',
        tabId,
        scanId,
        record,
        result: {
          success: status === 'SUCCESS',
          status,
          engine,
          data,
          categories: data,
          riskLevel,
          riskCount,
          policyUrl
        }
      }, () => {
        if (chrome.runtime.lastError) {
          // Tab may not have content script injected (e.g. internal browser page)
        }
      });
    } catch (broadcastErr) {
      // Ignore broadcast errors
    }
  }

  return record;
}

/**
 * ElevenLabs text-to-speech. Returns base64 mp3 so the content script can play it.
 * `fatal: true` tells the content script to stop retrying on this page.
 */
async function handleTtsSpeak(text) {
  const key = CONFIG.ELEVENLABS_API_KEY;
  const voice = CONFIG.ELEVENLABS_VOICE_ID;
  if (!key || !voice || /PASTE_YOUR/.test(key) || !text) {
    return { success: false, fatal: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: String(text).slice(0, 1000), model_id: 'eleven_flash_v2_5',
          seed: 42,
          voice_settings: { stability: 0.6, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true }
        }),
        signal: controller.signal
      }
    );
    if (!res.ok) {
      return { success: false, fatal: [401, 402, 403, 429].includes(res.status) };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { success: true, audio: btoa(bin), mime: 'audio/mpeg' };
  } catch (e) {
    return { success: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main Message Listener
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action === 'TTS_SPEAK') {
    handleTtsSpeak(request.text).then(sendResponse);
    return true;
  }

  // Handle ANALYZE_TC and FETCH_AND_ANALYZE_TC
  if (request?.action === 'ANALYZE_TC' || request?.action === 'FETCH_AND_ANALYZE_TC') {
    let text = request.text || '';
    let domain = request.domain || '';
    const policyUrl = request.policyUrl || (request.action === 'FETCH_AND_ANALYZE_TC' ? request.url : null);
    const tabId = sender?.tab?.id || request.tabId;
    const scanId = request.scanId || `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const tabUrl = sender?.tab?.url || request.url || '';

    (async () => {
      if (tabId) {
        await setActiveScanId(tabId, scanId);
      }

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
      const timeoutTimer = setTimeout(async () => {
        console.warn('[T&C Guardian] 10s timeout reached. Returning guaranteed fallback.');
        if (!text || text.trim().length === 0) {
          const failRecord = await finalizeScan(tabId, scanId, {
            success: false,
            status: 'UNANALYZED',
            reason: 'TIMEOUT_NO_TEXT',
            error: 'Analysis timed out and no text was available.',
            data: null
          }, { url: tabUrl, domain, policyUrl, engine: 'Timeout' });
          sendOnce(failRecord);
          return;
        }

        const fallbackRes = generateGuaranteedFallback('Timeout Fallback', text, domain);
        const record = await finalizeScan(tabId, scanId, fallbackRes, {
          url: tabUrl,
          domain,
          policyUrl,
          engine: fallbackRes.engine || 'Timeout Fallback'
        });
        sendOnce(record.status === 'SUCCESS' ? fallbackRes : record);
      }, 10000);

      try {
        // Linked Policy Priority (P3):
        // If policyUrl is provided AND (action is FETCH_AND_ANALYZE_TC OR no text OR policyUrl is distinct from current tab page)
        const shouldFetchPolicy = policyUrl && (
          request.action === 'FETCH_AND_ANALYZE_TC' ||
          !text ||
          text.trim().length === 0 ||
          (tabUrl && !urlsMatchPageIdentity(policyUrl, tabUrl))
        );

        if (shouldFetchPolicy) {
          try {
            const fetchRes = await fetch(policyUrl);
            if (!fetchRes.ok) {
              throw new Error(`HTTP ${fetchRes.status}: ${fetchRes.statusText}`);
            }
            const html = await fetchRes.text();
            const extractedText = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            if (!extractedText || extractedText.length < 50) {
              throw new Error('Policy URL returned insufficient or empty text.');
            }
            text = extractedText;
            if (!domain) {
              try {
                domain = new URL(policyUrl).hostname.replace(/^www\./, '');
              } catch {}
            }
          } catch (fetchErr) {
            clearTimeout(timeoutTimer);
            console.warn('[T&C Guardian] Failed to fetch linked policy URL:', fetchErr);
            const errRecord = await finalizeScan(tabId, scanId, {
              success: false,
              status: 'ERROR',
              reason: 'POLICY_FETCH_FAILED',
              error: `Failed to fetch linked policy from ${policyUrl}: ${fetchErr.message || 'Network error'}`,
              data: null
            }, { url: tabUrl, domain, policyUrl, engine: 'Fetch Error' });
            sendOnce(errRecord);
            return;
          }
        }

        if (!domain && tabUrl) {
          try {
            domain = new URL(tabUrl).hostname.replace(/^www\./, '');
          } catch {}
        }

        // If after checking policyUrl and request text, we still have no text:
        if (!text || text.trim().length === 0) {
          clearTimeout(timeoutTimer);
          const unanalyzedRecord = await finalizeScan(tabId, scanId, {
            success: false,
            status: 'UNANALYZED',
            reason: 'MISSING_SOURCE_TEXT',
            error: 'No text provided for analysis.',
            data: null
          }, { url: tabUrl, domain, policyUrl, engine: 'None' });
          sendOnce(unanalyzedRecord);
          return;
        }

        const result = await executeAnalysisPipeline(text, domain);
        clearTimeout(timeoutTimer);

        const finalized = await finalizeScan(tabId, scanId, result, {
          url: tabUrl,
          domain,
          policyUrl,
          engine: result?.engine || 'Analysis Pipeline'
        });

        if (finalized.reason === 'STALE_SCAN_DISCARDED') {
          return;
        }

        if (finalized.status === 'SUCCESS' && finalized.data) {
          sendOnce({
            success: true,
            status: 'SUCCESS',
            engine: finalized.engine,
            data: finalized.data,
            categories: finalized.data,
            riskLevel: finalized.riskLevel,
            riskCount: finalized.riskCount,
            policyUrl: finalized.policyUrl
          });
        } else {
          sendOnce({
            success: false,
            status: finalized.status,
            reason: finalized.reason || 'ANALYSIS_FAILED',
            error: finalized.error || 'Analysis produced no valid data.',
            data: null
          });
        }
      } catch (err) {
        clearTimeout(timeoutTimer);
        console.error('[T&C Guardian] Analysis pipeline error:', err);
        const errRecord = await finalizeScan(tabId, scanId, {
          success: false,
          status: 'ERROR',
          reason: 'PIPELINE_ERROR',
          error: err.message || 'Analysis pipeline threw an unexpected error.',
          data: null
        }, { url: tabUrl, domain, policyUrl, engine: 'Pipeline Error' });
        sendOnce(errRecord);
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

    (async () => {
      const record = await tabAnalysisStore.get(tabId);
      if (!record) {
        sendResponse({ success: false, reason: 'NOT_ANALYZED', status: 'UNANALYZED' });
        return;
      }

      if (record.status === 'ERROR' || record.riskLevel === 'ERROR') {
        sendResponse({
          success: false,
          status: 'ERROR',
          reason: record.reason || 'ANALYSIS_ERROR',
          error: record.error || 'Failed to analyze policy',
          tabId: record.tabId,
          url: record.url,
          domain: record.domain || reqDomain,
          policyUrl: record.policyUrl || null
        });
        return;
      }

      if (record.status === 'UNANALYZED' || record.riskLevel === 'UNANALYZED' || !record.data) {
        sendResponse({
          success: false,
          status: 'UNANALYZED',
          reason: record.reason || 'NOT_ANALYZED',
          tabId: record.tabId,
          url: record.url,
          domain: record.domain || reqDomain,
          policyUrl: record.policyUrl || null
        });
        return;
      }

      // Page identity check: if navigation to a different page occurred, reject stale result
      if (reqUrl && record.url && !urlsMatchPageIdentity(reqUrl, record.url)) {
        await tabAnalysisStore.delete(tabId);
        updateToolbarIcon(tabId, 'DEFAULT', 0);
        sendResponse({ success: false, reason: 'STALE_NAV', status: 'UNANALYZED' });
        return;
      }

      sendResponse({
        success: true,
        status: 'SUCCESS',
        tabId: record.tabId,
        url: record.url,
        domain: record.domain || reqDomain,
        policyUrl: record.policyUrl || null,
        engine: record.engine || 'Unknown',
        data: record.data,
        riskLevel: record.riskLevel,
        riskCount: record.riskCount || 0,
        timestamp: record.timestamp
      });
    })();
    return true;
  }

  // Store/update tab analysis directly from an on-demand popup scan or manual override
  if (request?.action === 'STORE_TAB_ANALYSIS' || request?.type === 'STORE_TAB_ANALYSIS') {
    const tabId = sender?.tab?.id || request.tabId;
    const url = request.url || sender?.tab?.url || '';
    const domain = request.domain || (url ? new URL(url).hostname.replace(/^www\./, '') : '');
    const currentEngine = request.engine || request.result?.engine || 'Fallback Detection';
    const rawData = request.data || request.result?.data || request.result;
    const policyUrl = request.policyUrl || null;
    const scanId = request.scanId || `manual_${Date.now()}`;

    (async () => {
      if (tabId && rawData) {
        const normalizedData = rawData.categories || (rawData.DATA_SALE ? rawData : (rawData.data || rawData));
        const resObj = {
          success: true,
          status: 'SUCCESS',
          engine: currentEngine,
          data: normalizedData
        };
        const record = await finalizeScan(tabId, scanId, resObj, { url, domain, policyUrl, engine: currentEngine });
        try {
          sendResponse({ success: record.status === 'SUCCESS', riskLevel: record.riskLevel, riskCount: record.riskCount });
        } catch {}
      } else {
        const record = await finalizeScan(tabId, scanId, {
          success: false,
          status: 'UNANALYZED',
          reason: 'MISSING_TAB_OR_DATA',
          data: null
        }, { url, domain, policyUrl, engine: currentEngine });
        try {
          sendResponse({ success: false, reason: 'MISSING_TAB_OR_DATA', status: 'UNANALYZED' });
        } catch {}
      }
    })();
    return true;
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
