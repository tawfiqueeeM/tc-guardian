# T&C Guardian - Shared Architecture & Contract Specification

This document defines the strict collaboration boundaries, file ownership rules, and message passing protocols for **T&C Guardian**, a Manifest V3 browser extension built cooperatively by Developer A and Developer B.

---

## 1. File Ownership Rules

To prevent Git merge conflicts and race conditions, each developer strictly owns the following files:

| Developer | Owned Files | Description |
| :--- | :--- | :--- |
| **Developer A** | `manifest.json`<br>`background.js`<br>`popup.html`<br>`popup.js`<br>`config.example.js`<br>`config.js`<br>`.gitignore`<br>`CLAUDE.md` | Background service worker, popup dashboard, API integrations (ToS;DR, Opera/Chromium AI, Gemini Flash), project configurations, and manifest definition. |
| **Developer B** | `content.js`<br>`test-signup.html`<br>`dummy-terms.html` | Page detection, background link pre-fetching, Shadow DOM floating UI overlay, user preference learning & storage. |

> **CRITICAL RULE**: Neither developer may edit, delete, or commit files owned by the other developer under any circumstances.

---

## 2. Message Passing Contract

All communication between the content script (`content.js`) and background service worker (`background.js`) occurs via `chrome.runtime.sendMessage`.

### Request (Sent by `content.js`)

```typescript
{
  action: "ANALYZE_TC" | "FETCH_AND_ANALYZE_TC",
  text?: string,    // Filtered high-risk clauses (up to 12,000 characters)
  domain?: string,  // Target hostname without "www." (e.g., "example.com")
  url?: string      // Optional source URL when using FETCH_AND_ANALYZE_TC
}
```

### Response (Returned by `background.js`)

```typescript
{
  success: boolean,
  engine: "ToS;DR" | "Opera Web AI" | "Gemini Flash" | "Groq" | "Cerebras" | "OpenRouter",
  data: {
    DATA_SALE: {
      present: boolean,
      summary: string,
      snippet: string  // Short quote or keyword phrase from the source text for in-page highlighting
    },
    AI_TRAINING: {
      present: boolean,
      summary: string,
      snippet: string
    },
    AUTO_RENEW: {
      present: boolean,
      summary: string,
      snippet: string
    },
    NO_DELETE: {
      present: boolean,
      summary: string,
      snippet: string
    },
    WAIVE_RIGHTS: {
      present: boolean,
      summary: string,
      snippet: string
    }
  }
}
```

---

## 3. The 5 Core Monitored Categories

Every analysis engine must evaluate and populate all 5 categories:

1. **`DATA_SALE`**
   - **Definition**: Selling, licensing, sharing, or syndicating user personal information, browsing history, or behavioral telemetry with third-party data brokers or marketing networks.
2. **`AI_TRAINING`**
   - **Definition**: Ingesting or utilizing user-uploaded files, prompts, source code, or personal content to train machine learning models, neural networks, or generative artificial intelligence systems without clear opt-out.
3. **`AUTO_RENEW`**
   - **Definition**: Recurring subscription billing with automatic renewals, especially clauses enforcing strict non-refundable terms, cancellation obstacles, or short cancellation windows.
4. **`NO_DELETE`**
   - **Definition**: Retaining customer records, files, or activity logs indefinitely in persistent backups/archives even after formal account termination or deletion requests.
5. **`WAIVE_RIGHTS`**
   - **Definition**: Mandatory binding individual arbitration clauses, waiver of trial by jury, or waiver of class action lawsuit participation.

---

## 4. Multi-Tier Analysis Engine Hierarchy (Developer A)

When `background.js` receives `ANALYZE_TC`:

1. **Tier 1 — Fast Lookup (`ToS;DR`)**:
   - Queries `https://api.tosdr.org/search/v4/?query=${domain}` with a 2000ms timeout (`CONFIG.TOSDR_TIMEOUT_MS`).
   - If clean data points map to the categories, returns `engine: "ToS;DR"`.
2. **Tier 2 — Local Browser AI (`Opera Web AI` / Chromium Prompt API)**:
   - Evaluates `self.ai && self.ai.languageModel` inside the service worker.
   - If available, runs prompt locally on device and returns `engine: "Opera Web AI"`.
3. **Tier 3 — Multi-Provider Cloud Fallback Ring (`CONFIG.PROVIDER_FALLBACK_ORDER`)**:
   - Iterates asynchronously through `CONFIG.PROVIDER_FALLBACK_ORDER` (`Cerebras` -> `Groq` -> `OpenRouter` -> `Gemini`) using individual provider timeouts (`CONFIG.PROVIDER_TIMEOUT_MS = 3000`).
   - Automatically rolls over to the next provider if rate-limited (HTTP 429), errored, or slow.
   - Enforces strict structured JSON schema with exact snippet extraction.
   - Returns `engine: "Cerebras" | "Groq" | "OpenRouter" | "Gemini Flash"`.
4. **10-Second Guaranteed Fallback & Dynamic Detection**:
   - If AI or ToS;DR APIs fail, throw an error, or time out after 10 seconds, `background.js` never fails silently.
   - It dynamically evaluates `sourceText` via heuristic keyword matchers: categories where a risk clause is genuinely detected are returned with `present: true` and extracted snippets, while clean or absent categories are set to `present: false`. This ensures the UI question count is truly variable per website rather than static.

---

## 5. Explicit-Choice Model & Storage Protocol

T&C Guardian operates under a strict **explicit-choice model**:
- **No Automated Assumptions**: The background service worker and analysis engines never automate user decisions, auto-accept, or auto-reject terms on behalf of the user.
- **Explicit Storage**: `siteOverrides` and `userProfile` in `chrome.storage.local` store only explicit user choices made interactively (e.g., via the content script overlay or the popup dashboard).
- **Historical Statistics**: User interfaces display interaction history and preference percentages (e.g., "Historically Rejected 80% of the time") rather than automated assumption badges.

