export const CONFIG = {
  // Active Cloud Provider fallback ring order (Cerebras -> Groq -> OpenRouter -> Gemini)
  PROVIDER_FALLBACK_ORDER: ["cerebras", "groq", "openrouter", "gemini"],

  // Active Cloud Provider default (if single provider targeted)
  CLOUD_PROVIDER: "cerebras",

  // Per-provider request timeout (ms) before rolling over to next provider in the ring
  PROVIDER_TIMEOUT_MS: 3000,

  // 1. Cerebras (Ultra-Fast Inference)
  CEREBRAS_API_KEY: "PASTE_YOUR_CEREBRAS_API_KEY_HERE",
  CEREBRAS_MODEL: "llama3.1-70b",

  // 2. Groq (High-Speed Inference)
  GROQ_API_KEY: "PASTE_YOUR_GROQ_API_KEY_HERE",
  GROQ_MODEL: "llama-3.3-70b-versatile",

  // 3. OpenRouter
  OPENROUTER_API_KEY: "PASTE_YOUR_OPENROUTER_API_KEY_HERE",
  OPENROUTER_MODEL: "google/gemini-2.5-flash",

  // 4. Google Gemini Flash
  GEMINI_API_KEY: "PASTE_YOUR_GEMINI_API_KEY_HERE",
  GEMINI_MODEL: "gemini-2.5-flash",

  // Tier 1 ToS;DR timeout (ms)
  TOSDR_TIMEOUT_MS: 2000
};
