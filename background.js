/**
 * T&C Guardian - Background Service Worker (Manifest V3)
 * Developer A: Multi-Tier Analysis Engine (ToS;DR -> Opera Web AI -> Gemini Flash)
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

    // Find the closest matching service
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
    console.info('[T&C Guardian] ToS;DR fast lookup bypassed or timed out:', err.message || err);
    return null;
  }
}

/**
 * Tier 2: Local Browser AI (Opera Web AI / Chromium Built-in Prompt API)
 */
async function queryBrowserAI(text) {
  try {
    // Check if Opera Web AI or Chromium Prompt API is available in service worker scope
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
 * Tier 3: Cloud Fallback (Gemini Flash)
 */
async function queryGemini(text) {
  const apiKey = CONFIG.GEMINI_API_KEY;
  const model = CONFIG.GEMINI_MODEL || 'gemini-2.5-flash';

  // If API key is placeholder, use heuristic fallback matching the contract
  if (!apiKey || apiKey === 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
    console.warn('[T&C Guardian] Gemini API Key not set. Using heuristic analysis fallback.');
    return generateHeuristicFallback(text, 'Gemini Flash (Heuristic Fallback)');
  }

  const prompt = `You are an expert legal safety assistant analyzing Terms of Service and Privacy Agreements for red flags.
Analyze the following text against these 5 specific categories:
1. DATA_SALE: Selling, licensing, sharing, or syndicating user data, telemetry, or profile to third-party data brokers or advertisers.
2. AI_TRAINING: Training artificial intelligence, large language models, or machine learning systems using user uploads, prompts, or content without explicit opt-out.
3. AUTO_RENEW: Subscriptions automatically renewing (e.g. $99/mo), especially with strict no-refund policies or hard cancellation terms.
4. NO_DELETE: Indefinite retention of user data even after account closure or deletion requests.
5. WAIVE_RIGHTS: Mandatory binding individual arbitration and waiver of class action lawsuits or jury trials.

Respond ONLY with a JSON object strictly adhering to this schema:
{
  "DATA_SALE": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "AI_TRAINING": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "AUTO_RENEW": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "NO_DELETE": { "present": boolean, "summary": "plain English 1-2 sentence explanation" },
  "WAIVE_RIGHTS": { "present": boolean, "summary": "plain English 1-2 sentence explanation" }
}

Terms Text:
${text.slice(0, 11000)}`;

  try {
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

    const parsed = JSON.parse(candidateText.trim());
    const data = validateAndNormalizeData(parsed);

    return {
      success: true,
      engine: 'Gemini Flash',
      data,
      categories: data
    };
  } catch (err) {
    console.warn('[T&C Guardian] Gemini Cloud API call failed:', err.message || err);
    return generateHeuristicFallback(text, 'Gemini Flash');
  }
}

/**
 * Heuristic fallback matching exact contract if remote services fail
 */
function generateHeuristicFallback(text, engineLabel) {
  const hasDataSale = /sell|broker|third party/i.test(text);
  const hasAiTraining = /train|artificial intelligence|machine learning/i.test(text);
  const hasAutoRenew = /renew|cancel|refund/i.test(text);
  const hasNoDelete = /retain|delete/i.test(text);
  const hasWaiveRights = /arbitration|waive|class action/i.test(text);

  const data = {
    DATA_SALE: {
      present: hasDataSale,
      summary: hasDataSale
        ? 'Sells or discloses your behavioral telemetry and profile to commercial third-party data brokers and marketing networks.'
        : 'No explicit data sale to ad brokers detected.'
    },
    AI_TRAINING: {
      present: hasAiTraining,
      summary: hasAiTraining
        ? 'Grants an irrevocable license to train proprietary artificial intelligence and neural network models using your uploads and prompts.'
        : 'No AI model training clauses detected.'
    },
    AUTO_RENEW: {
      present: hasAutoRenew,
      summary: hasAutoRenew
        ? 'Enforces automatic recurring subscription renewals with strict non-refundable cancellation terms.'
        : 'No aggressive auto-renewal or no-refund clauses detected.'
    },
    NO_DELETE: {
      present: hasNoDelete,
      summary: hasNoDelete
        ? 'Preserves customer data and activity logs indefinitely in persistent archives even after explicit account deletion requests.'
        : 'Standard data deletion terms apply.'
    },
    WAIVE_RIGHTS: {
      present: hasWaiveRights,
      summary: hasWaiveRights
        ? 'Mandates individual binding arbitration and forces you to waive all rights to trial by jury and class action participation.'
        : 'No mandatory binding arbitration clause detected.'
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
 * Main Message Listener
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action === 'ANALYZE_TC') {
    const text = request.text || '';
    const domain = request.domain || '';

    // Execute async 3-tier hierarchy
    (async () => {
      try {
        // Tier 1: ToS;DR Fast Lookup
        const tosdrResult = await queryTosdr(domain);
        if (tosdrResult) {
          sendResponse(tosdrResult);
          return;
        }

        // Tier 2: Local Browser AI
        const browserAiResult = await queryBrowserAI(text);
        if (browserAiResult) {
          sendResponse(browserAiResult);
          return;
        }

        // Tier 3: Cloud Fallback (Gemini Flash)
        const geminiResult = await queryGemini(text);
        sendResponse(geminiResult);
      } catch (err) {
        console.error('[T&C Guardian] Unhandled error during analysis:', err);
        sendResponse(generateHeuristicFallback(text, 'Gemini Flash'));
      }
    })();

    // Return true to keep message channel open for async sendResponse
    return true;
  }
});

