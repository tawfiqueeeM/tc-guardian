export const CONFIG = {
  // Active Cloud Provider: "gemini" | "groq" | "cerebras" | "openrouter"
  CLOUD_PROVIDER: "gemini",

  // 1. Google Gemini Flash
  GEMINI_API_KEY: "PASTE_YOUR_GEMINI_API_KEY_HERE",
  GEMINI_MODEL: "gemini-2.5-flash",

  // 2. Groq (High-Speed Inference)
  GROQ_API_KEY: "PASTE_YOUR_GROQ_API_KEY_HERE",
  GROQ_MODEL: "llama-3.3-70b-versatile",

  // 3. Cerebras (Ultra-Fast Inference)
  CEREBRAS_API_KEY: "PASTE_YOUR_CEREBRAS_API_KEY_HERE",
  CEREBRAS_MODEL: "llama3.1-70b",

  // 4. OpenRouter
  OPENROUTER_API_KEY: "PASTE_YOUR_OPENROUTER_API_KEY_HERE",
  OPENROUTER_MODEL: "google/gemini-2.5-flash",

  // Tier 1 ToS;DR timeout (ms)
  TOSDR_TIMEOUT_MS: 2000
};
