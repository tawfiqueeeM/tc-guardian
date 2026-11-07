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
      snippet: ''
    },
    AI_TRAINING: {
      present: false,
      summary: 'No explicit clauses found authorizing AI model training on user uploads or data.',
      snippet: ''
    },
    AUTO_RENEW: {
      present: false,
      summary: 'No automatic renewal or non-refundable billing terms detected.',
      snippet: ''
    },
    NO_DELETE: {
      present: false,
      summary: 'No clauses found indicating indefinite data retention following account deletion.',
      snippet: ''
    },
    WAIVE_RIGHTS: {
      present: false,
      summary: 'No mandatory binding arbitration or class action waiver clauses identified.',
      snippet: ''
    }
  };
}

/**
 * Keyword matchers used to extract short snippets or keyword phrases
 * directly from the source terms text for each category so that
 * content.js can match and highlight them on the active page.
 */
const CATEGORY_SNIPPET_MATCHERS = {
  DATA_SALE: [
    /(?:sell|license|lease|transmit|syndicate|share|disclose|monetiz)[^.!?\n]*(?:third[- ]party|data broker|advertis|profiling)/i,
    /(?:third[- ]party|data broker)[^.!?\n]*(?:sell|license|share|monetiz)/i,
    /commercial data disclosure|data broker licensing/i,
    /third party data broker|commercial advertisers|marketing partners/i
  ],
  AI_TRAINING: [
    /(?:ingest|process|synthesize|train)[^.!?\n]*(?:artificial intelligence|machine learning|neural network|models)/i,
    /(?:artificial intelligence|machine learning|neural network|large language model)[^.!?\n]*(?:training|license)/i,
    /ai model training license|proprietary machine learning/i,
    /train artificial intelligence systems|machine learning architectures/i
  ],
  AUTO_RENEW: [
    /(?:automatic(?:ally)? renew|subscription|recurring)[^.!?\n]*(?:\$99|billing|rate|period|cancel)/i,
    /mandatory \$(?:99|\d+)[^.!?\n]*recurring auto-renewal/i,
    /non-refundable|no refunds, credits, or prorated reimbursements/i,
    /automatically renew at the non-discounted rate/i
  ],
  NO_DELETE: [
    /(?:retain|store|preserve|archive)[^.!?\n]*(?:indefinitely|persistent|account deletion|termination)/i,
    /indefinite data retention policy/i,
    /retain, store, and preserve all customer files[^.!?\n]*indefinitely/i,
    /complete, irreversible cryptographic shredding/i
  ],
  WAIVE_RIGHTS: [
    /mandatory (?:binding )?arbitration[^.!?\n]*(?:class action waiver|dispute)/i,
    /mandatory arbitration & class action waiver/i,
    /unconditionally waive any right to participate as a lead plaintiff/i,
    /individual, mandatory binding arbitration/i
  ]
};

const CATEGORY_FALLBACK_PHRASES = {
  DATA_SALE: 'sell, license, and syndicate personal data to third-party data brokers',
  AI_TRAINING: 'train artificial intelligence models and neural networks on user data',
  AUTO_RENEW: 'automatically renew subscription at recurring rate with non-refundable terms',
  NO_DELETE: 'retain, store, and preserve customer data and activity logs indefinitely',
  WAIVE_RIGHTS: 'mandatory individual binding arbitration and class action lawsuit waiver'
};

const CATEGORY_RISK_PATTERNS = {
  DATA_SALE: /sell|broker|third[- ]party|commercialize|monetiz|syndicate/i,
  AI_TRAINING: /train|artificial intelligence|machine learning|neural network|large language model/i,
  AUTO_RENEW: /renew|subscription|\$99|recurring|refund|cancel/i,
  NO_DELETE: /retain|delete|indefinitely|archive|preserv|purge/i,
  WAIVE_RIGHTS: /arbitration|waive|class action|jury trial|dispute/i
};

/**
 * Checks whether sourceText genuinely contains risk clauses for categoryKey.
 */
function hasCategoryRisk(sourceText, categoryKey) {
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    return false;
  }
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
 * Evaluates sourceText with heuristic keyword regex matchers:
 * Only returns present: true for categories where a risk clause is genuinely detected.
 * Categories clean or missing from the text are set to present: false so frontend question count is variable.
 */
function generateGuaranteedFallback(engineLabel = 'Fallback Detection', sourceText = '') {
  const data = {};
  const keys = ['DATA_SALE', 'AI_TRAINING', 'AUTO_RENEW', 'NO_DELETE', 'WAIVE_RIGHTS'];

  for (const k of keys) {
    const isDetected = hasCategoryRisk(sourceText, k);
    if (isDetected) {
      data[k] = {
        present: true,
        summary: `Fallback detection: ${k.replace('_', ' ').toLowerCase()} clause detected in agreement requiring explicit user choice.`,
        snippet: extractCategorySnippet(sourceText, k)
      };
    } else {
      data[k] = {
        present: false,
        summary: 'No risk clause detected in agreement terms for this category.',
        snippet: ''
      };
    }
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
        data.DATA_SALE = {
          present: true,
          summary: pt.title || 'Sells or transfers user personal data to third parties.',
          snippet: quoteSnippet || extractCategorySnippet(sourceText, 'DATA_SALE')
        };
        mappedAny = true;
      }
      if (/train|artificial intelligence|machine learning|ai/i.test(text)) {
        data.AI_TRAINING = {
          present: true,
          summary: pt.title || 'Uses user content and submissions to train machine learning/AI models.',
          snippet: quoteSnippet || extractCategorySnippet(sourceText, 'AI_TRAINING')
        };
        mappedAny = true;
      }
      if (/renew|subscription|refund|cancel/i.test(text)) {
        data.AUTO_RENEW = {
          present: true,
          summary: pt.title || 'Automatic renewal policy with strict cancellation conditions.',
          snippet: quoteSnippet || extractCategorySnippet(sourceText, 'AUTO_RENEW')
        };
        mappedAny = true;
      }
      if (/retain|delete|archive|preserve/i.test(text)) {
        data.NO_DELETE = {
          present: true,
          summary: pt.title || 'Retains user data indefinitely even after account termination.',
          snippet: quoteSnippet || extractCategorySnippet(sourceText, 'NO_DELETE')
        };
        mappedAny = true;
      }
      if (/arbitration|waive|class action|jury/i.test(text)) {
        data.WAIVE_RIGHTS = {
          present: true,
          summary: pt.title || 'Forces mandatory arbitration and waives class action rights.',
          snippet: quoteSnippet || extractCategorySnippet(sourceText, 'WAIVE_RIGHTS')
        };
        mappedAny = true;
      }
    }

    if (mappedAny) {
      return {
        success: true,
        engine: 'ToS;DR',
        data,
        categories: data
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
async function queryBrowserAI(text) {
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
- Do NOT assume or hallucinate risk. Keep the count variable per website.

Respond ONLY with valid JSON matching this exact structure:
{
  "DATA_SALE": { "present": boolean, "summary": "1 sentence explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "AI_TRAINING": { "present": boolean, "summary": "1 sentence explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "AUTO_RENEW": { "present": boolean, "summary": "1 sentence explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "NO_DELETE": { "present": boolean, "summary": "1 sentence explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "WAIVE_RIGHTS": { "present": boolean, "summary": "1 sentence explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" }
}

Terms to analyze:
${text.slice(0, 8000)}
`;

    const rawResponse = await session.prompt(promptText);
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const data = validateAndNormalizeData(parsed, text);
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
- Keep the response truly dynamic: a website with only 1 or 2 risks must only have those categories set to "present": true.

Respond ONLY with a valid JSON object strictly adhering to this schema without markdown or formatting:
{
  "DATA_SALE": { "present": boolean, "summary": "plain English explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "AI_TRAINING": { "present": boolean, "summary": "plain English explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "AUTO_RENEW": { "present": boolean, "summary": "plain English explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "NO_DELETE": { "present": boolean, "summary": "plain English explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" },
  "WAIVE_RIGHTS": { "present": boolean, "summary": "plain English explanation if present, or 'No risk clause detected'", "snippet": "exact quote from text if present, else ''" }
}`;

/**
 * OpenAI-compatible Cloud Provider (Groq / Cerebras / OpenRouter)
 */
async function queryOpenAICompatible(text, endpoint, apiKey, model, engineName) {
  const promptUser = `Analyze the following terms text for the 5 categories:\n\n${text.slice(0, 10000)}`;

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
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${engineName} API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Empty response content from ${engineName}`);
  }

  const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const data = validateAndNormalizeData(parsed, text);

  return {
    success: true,
    engine: engineName,
    data,
    categories: data
  };
}

/**
 * Google Gemini Flash Cloud Provider
 */
async function queryGemini(text) {
  const apiKey = CONFIG.GEMINI_API_KEY;
  const model = CONFIG.GEMINI_MODEL || 'gemini-2.5-flash';

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

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    throw new Error('No candidate content returned by Gemini');
  }

  const cleaned = candidateText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const data = validateAndNormalizeData(parsed, text);

  return {
    success: true,
    engine: 'Gemini Flash',
    data,
    categories: data
  };
}

/**
 * Tier 3: Cloud Fallback Router (Groq / Cerebras / Gemini / OpenRouter)
 */
async function queryCloudFallback(text) {
  const provider = (CONFIG.CLOUD_PROVIDER || 'gemini').toLowerCase();

  // 1. Groq
  if (provider === 'groq' || (CONFIG.GROQ_API_KEY && CONFIG.GROQ_API_KEY !== 'PASTE_YOUR_GROQ_API_KEY_HERE')) {
    try {
      if (CONFIG.GROQ_API_KEY && CONFIG.GROQ_API_KEY !== 'PASTE_YOUR_GROQ_API_KEY_HERE') {
        return await queryOpenAICompatible(
          text,
          'https://api.groq.com/openai/v1/chat/completions',
          CONFIG.GROQ_API_KEY,
          CONFIG.GROQ_MODEL || 'llama-3.3-70b-versatile',
          'Groq'
        );
      }
    } catch (err) {
      console.warn('[T&C Guardian] Groq provider call failed:', err.message || err);
    }
  }

  // 2. Cerebras
  if (provider === 'cerebras' || (CONFIG.CEREBRAS_API_KEY && CONFIG.CEREBRAS_API_KEY !== 'PASTE_YOUR_CEREBRAS_API_KEY_HERE')) {
    try {
      if (CONFIG.CEREBRAS_API_KEY && CONFIG.CEREBRAS_API_KEY !== 'PASTE_YOUR_CEREBRAS_API_KEY_HERE') {
        return await queryOpenAICompatible(
          text,
          'https://api.cerebras.ai/v1/chat/completions',
          CONFIG.CEREBRAS_API_KEY,
          CONFIG.CEREBRAS_MODEL || 'llama3.1-70b',
          'Cerebras'
        );
      }
    } catch (err) {
      console.warn('[T&C Guardian] Cerebras provider call failed:', err.message || err);
    }
  }

  // 3. OpenRouter
  if (provider === 'openrouter' || (CONFIG.OPENROUTER_API_KEY && CONFIG.OPENROUTER_API_KEY !== 'PASTE_YOUR_OPENROUTER_API_KEY_HERE')) {
    try {
      if (CONFIG.OPENROUTER_API_KEY && CONFIG.OPENROUTER_API_KEY !== 'PASTE_YOUR_OPENROUTER_API_KEY_HERE') {
        return await queryOpenAICompatible(
          text,
          'https://openrouter.ai/api/v1/chat/completions',
          CONFIG.OPENROUTER_API_KEY,
          CONFIG.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
          'OpenRouter'
        );
      }
    } catch (err) {
      console.warn('[T&C Guardian] OpenRouter provider call failed:', err.message || err);
    }
  }

  // 4. Gemini Flash
  if (CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY !== 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
    try {
      return await queryGemini(text);
    } catch (err) {
      console.warn('[T&C Guardian] Gemini Flash call failed:', err.message || err);
    }
  }

  // 5. Fallback detection if cloud keys are placeholders or network is blocked
  console.info('[T&C Guardian] Cloud providers unavailable. Returning guaranteed fallback.');
  return generateGuaranteedFallback('Fallback Detection', text);
}

/**
 * Ensure all 5 categories exist with present: boolean, summary: string, and snippet: string.
 * Strictly preserves dynamic presence: categories where present is false are never forced to true.
 */
function validateAndNormalizeData(raw, sourceText = '') {
  const base = createEmptyData();
  const keys = ['DATA_SALE', 'AI_TRAINING', 'AUTO_RENEW', 'NO_DELETE', 'WAIVE_RIGHTS'];

  for (const k of keys) {
    if (raw && raw[k]) {
      const isPresent = Boolean(raw[k].present);
      if (isPresent) {
        let snippet = String(raw[k].snippet || '').trim();
        if (!snippet && sourceText) {
          snippet = extractCategorySnippet(sourceText, k);
        }
        base[k] = {
          present: true,
          summary: String(raw[k].summary || 'Risk clause detected in terms.'),
          snippet: snippet || (extractCategorySnippet(sourceText, k) || 'Clause detected in agreement')
        };
      } else {
        base[k] = {
          present: false,
          summary: String(raw[k].summary || 'No risk clause detected in agreement terms.'),
          snippet: ''
        };
      }
    } else {
      // Key omitted by LLM -> Clean / not present
      base[k] = {
        present: false,
        summary: 'No risk clause detected in agreement terms.',
        snippet: ''
      };
    }
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
    const browserAiResult = await queryBrowserAI(text);
    if (browserAiResult?.success && browserAiResult?.data) {
      return browserAiResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Tier 2 Browser AI failed:', err.message || err);
  }

  // Tier 3: Cloud Fallback
  try {
    const cloudResult = await queryCloudFallback(text);
    if (cloudResult?.success && cloudResult?.data) {
      return cloudResult;
    }
  } catch (err) {
    console.info('[T&C Guardian] Tier 3 Cloud Fallback failed:', err.message || err);
  }

  // If all tiers fail or return empty, return guaranteed fallback
  return generateGuaranteedFallback('Fallback Detection', text);
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
        sendOnce(generateGuaranteedFallback('Timeout Fallback', text));
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
        sendOnce(result);
      } catch (err) {
        clearTimeout(timeoutTimer);
        console.error('[T&C Guardian] Analysis pipeline error:', err);
        sendOnce(generateGuaranteedFallback('Error Fallback', text));
      }
    })();

    // Always return true to keep the message channel open for async sendResponse
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
