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
      summary: 'No explicit clauses found indicating commercial sale to third-party data brokers.'
    },
    AI_TRAINING: {
      present: false,
      summary: 'No explicit clauses found authorizing AI model training on user uploads or data.'
    },
    AUTO_RENEW: {
      present: false,
      summary: 'No automatic renewal or non-refundable billing terms detected.'
    },
    NO_DELETE: {
      present: false,
      summary: 'No clauses found indicating indefinite data retention following account deletion.'
    },
    WAIVE_RIGHTS: {
      present: false,
      summary: 'No mandatory binding arbitration or class action waiver clauses identified.'
    }
  };
}

/**
 * Guaranteed Fallback
 * Ensures that if any tier fails, throws, or times out after 10s, all 5 categories
 * are set to present: true with the required fallback summary for UI verification.
 */
function generateGuaranteedFallback(engineLabel = 'Fallback Detection') {
  const summary = 'Fallback detection: Clause detected requiring explicit user choice.';
  const data = {
    DATA_SALE: {
      present: true,
      summary
    },
    AI_TRAINING: {
      present: true,
      summary
    },
    AUTO_RENEW: {
      present: true,
      summary
    },
    NO_DELETE: {
      present: true,
      summary
    },
    WAIVE_RIGHTS: {
      present: true,
      summary
    }
  };

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
async function queryTosdr(domain) {
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

      if (/sell|broker|third party|advertis/i.test(text)) {
        data.DATA_SALE = {
          present: true,
          summary: pt.title || 'Sells or transfers user personal data to third parties.'
        };
        mappedAny = true;
      }
      if (/train|artificial intelligence|machine learning|ai/i.test(text)) {
        data.AI_TRAINING = {
          present: true,
          summary: pt.title || 'Uses user content and submissions to train machine learning/AI models.'
        };
        mappedAny = true;
      }
      if (/renew|subscription|refund|cancel/i.test(text)) {
        data.AUTO_RENEW = {
          present: true,
          summary: pt.title || 'Automatic renewal policy with strict cancellation conditions.'
        };
        mappedAny = true;
      }
      if (/retain|delete|archive|preserve/i.test(text)) {
        data.NO_DELETE = {
          present: true,
          summary: pt.title || 'Retains user data indefinitely even after account termination.'
        };
        mappedAny = true;
      }
      if (/arbitration|waive|class action|jury/i.test(text)) {
        data.WAIVE_RIGHTS = {
          present: true,
          summary: pt.title || 'Forces mandatory arbitration and waives class action rights.'
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
1. DATA_SALE: Selling/sharing data to third-party ad brokers.
2. AI_TRAINING: Training AI/ML models on user uploads/prompts.
3. AUTO_RENEW: Automatic subscriptions or strict no-refund policies.
4. NO_DELETE: Indefinite retention of user data post-deletion.
5. WAIVE_RIGHTS: Mandatory binding arbitration and class action waivers.

Respond ONLY with valid JSON matching this exact structure:
{
  "DATA_SALE": { "present": boolean, "summary": "1 sentence" },
  "AI_TRAINING": { "present": boolean, "summary": "1 sentence" },
  "AUTO_RENEW": { "present": boolean, "summary": "1 sentence" },
  "NO_DELETE": { "present": boolean, "summary": "1 sentence" },
  "WAIVE_RIGHTS": { "present": boolean, "summary": "1 sentence" }
}

Terms to analyze:
${text.slice(0, 8000)}
`;

    const rawResponse = await session.prompt(promptText);
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const data = validateAndNormalizeData(parsed);
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

Respond ONLY with a valid JSON object strictly adhering to this schema without markdown or formatting:
{
  "DATA_SALE": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "AI_TRAINING": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "AUTO_RENEW": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "NO_DELETE": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "WAIVE_RIGHTS": { "present": boolean, "summary": "plain English 1-2 sentence explanation" }
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
  const data = validateAndNormalizeData(parsed);

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
  const data = validateAndNormalizeData(parsed);

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
  return generateGuaranteedFallback('Fallback Detection');
}

/**
 * Ensure all 5 categories exist with present: boolean and summary: string
 */
function validateAndNormalizeData(raw) {
  const base = createEmptyData();
  const keys = ['DATA_SALE', 'AI_TRAINING', 'AUTO_RENEW', 'NO_DELETE', 'WAIVE_RIGHTS'];

  for (const k of keys) {
    if (raw && raw[k]) {
      base[k] = {
        present: Boolean(raw[k].present),
        summary: String(raw[k].summary || base[k].summary)
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
    const tosdrResult = await queryTosdr(domain);
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
  return generateGuaranteedFallback('Fallback Detection');
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
        sendOnce(generateGuaranteedFallback('Timeout Fallback'));
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
        sendOnce(generateGuaranteedFallback('Error Fallback'));
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
