# 🛡️ T&C Guardian — AI-Powered Terms & Conditions Protector

> **Your personal legal copilot for the modern web.** Automatically detects, scans, and summarizes 50-page legal contracts into plain English, alerting you to critical red flags *before* you sign up, check out, or agree to terms.

---

## 📖 Overview

Almost nobody reads through 50-page Terms of Service and Privacy Policies before clicking **"I Agree"**. Because of this, companies frequently bury aggressive terms:
- Selling your personal browsing telemetry to data brokers
- Training AI models on your private uploads, code, or prompts
- Enrolling you in automatically renewing subscriptions that are difficult to cancel
- Stripping your constitutional right to sue or join class-action lawsuits
- Retaining your personal data forever, even after you delete your account

**T&C Guardian** is a privacy-first Chromium browser extension built with **Manifest V3**. It works automatically in the background on sign-up and checkout pages, analyzes agreements with a multi-tiered AI pipeline, and gives you actionable plain-English summaries right where you need them.

---

## 🚩 The 5 Core Monitored Risks

T&C Guardian evaluates every agreement against **5 high-impact risk categories**:

| Risk Category | Severity | Icon | What It Means |
| :--- | :---: | :---: | :--- |
| **Data Sale & Sharing (`DATA_SALE`)** | **High** | 💸 | Selling, licensing, leasing, or syndicating your personal information, browsing history, or behavioral telemetry to commercial data brokers and ad networks. |
| **Arbitration & Class Action Waiver (`WAIVE_RIGHTS`)** | **High** | ⚖️ | Mandatory binding individual arbitration clauses, waiver of trial by jury, and waiver of your right to participate in class-action lawsuits. |
| **AI Model Training (`AI_TRAINING`)** | **Medium** | 🤖 | Ingesting your uploaded documents, source code, text prompts, or personal files to train proprietary machine learning models or generative AI without opt-out. |
| **Sneaky Auto-Renewals (`AUTO_RENEW`)** | **Medium** | 🔄 | Hidden recurring billing charges, strict non-refundable terms, cancellation obstacles, or short cancellation windows. Includes **step-by-step cancellation guides and direct resolution links**. |
| **Indefinite Data Retention (`NO_DELETE`)** | **Medium** | 🗄️ | Preserving your files, telemetry, and activity logs indefinitely in persistent archives even after you request account deletion or termination. |

---

## ✨ Key Features

### 1. In-Page Floating Assistant (Shadow DOM)
- **Automatic Detection**: Detects registration, signup, and checkout flows and pre-fetches linked terms in the background.
- **Isolated Shadow DOM**: Injected safely into the page with a dedicated Shadow Root (`#tc-guardian-host`) so host page CSS never breaks the UI.
- **Plain-English Summaries**: Replaces legalese with concise 1–2 sentence breakdowns.
- **Original Clause Inspection**: An expandable accordion (`📖 View Clause`) showing the exact snippet quoted from the contract, with jump-to-page-location links.
- **Interactive Multi-Question Answering**: Click **Yes** (accept) or **No** (reject) on individual risks. Cards animate and fade away as you answer.
- **Mascot Bubble**: Collapse the widget into an unobtrusive floating bubble (`.tc-bubble`) with a manual minimize button (`−`) or dismiss it with (`×`).

### 2. 🔊 Voice Assistant & Hands-Free Answering
- **Dual Engine Voice**: Automatically uses natural, high-fidelity voices (ElevenLabs) with a seamless fallback to your browser's native `SpeechSynthesis`.
- **Read Aloud**: Click the **🔊** icon in the header or next to any clause to listen hands-free.
- **Voice Answering**: Click the microphone icon **🎤** and speak naturally (`"Yes"`, `"No"`, or `"Skip"`).
- **In-Page Voice Controls**: Adjust speech speed and choose your preferred browser voice on the fly via the in-widget `⚙️` settings button.

### 3. 🧠 Preference Learning & Dealbreaker Detection
- **Explicit-Choice Model**: The extension never makes assumptions or automatically accepts terms on your behalf.
- **Dealbreaker Warning**: If you historically reject a specific risk (e.g. rejecting AI training $\ge 2$ times with a $\ge 60\%$ rejection rate), future occurrences are flagged as a **Dealbreaker** with a prominent warning banner (`🚨 Caution: Agreement contains terms you routinely reject!`) and badge indicators.
- **Per-Site Memory**: Automatically remembers your choices per domain, so you aren't asked about the same clauses twice.

### 4. 🧭 Toolbar Extension Dashboard
- **Dynamic Shield Icon**: Toolbar mascot icon updates dynamically:
  - 🔴 **Red** (`icons/guardian-high-risk.png`): High-risk clauses detected (`DATA_SALE` or `WAIVE_RIGHTS`).
  - 🟡 **Amber** (`icons/guardian-medium-risk.png`): Medium-risk clauses detected (`AI_TRAINING` or `AUTO_RENEW`).
  - 🟢 **Green** (`icons/guardian-low-risk.png`): Safe, clean, or low-risk agreement.
- **OffscreenCanvas Badges**: Renders a custom badge indicator showing the active unacknowledged threat count.
- **Accordion Findings**: Expandable cards with opt-out guides and direct resolution links.
- **Preferences Tab**: View your historical voting profile across all categories and manage per-site overrides.
- **Settings Screen**: Dedicated pastel settings view with:
  - *"Always show widget on page (even if clean or answered)"* toggle.
  - Full voice assistant configuration (Voice engine, browser voice, speech rate, auto-read).
  - *"Reset All Saved Answers"* button to wipe stored site overrides.

### 5. ⚡ Multi-Tiered AI Architecture
1. **Tier 1 — Cloud AI Ring**: Iterates through high-speed LLM providers (`Cerebras` $\rightarrow$ `Groq` $\rightarrow$ `OpenRouter` $\rightarrow$ `Gemini Flash`) using strict JSON schema validation.
2. **Tier 2 — ToS;DR Database**: Queries `https://api.tosdr.org` for established community ratings and clause points.
3. **Tier 3 — Local Browser AI**: Leverages on-device Gemini Nano via `window.ai` / Chromium Prompt API when available.
4. **Tier 4 — Local Keyword Heuristics**: Runs 100% locally on your machine with negation-aware regex matchers (e.g. distinguishing *"we do not sell"* from *"we sell"*). Guarantees instant offline analysis with zero network dependency.

---

## 🚀 Installation & Local Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/tawfiqueeeM/tc-guardian.git
   cd tc-guardian
   ```

2. **Configure API Keys (Optional)**:
   - Copy `config.example.js` to `config.js`:
     ```bash
     cp config.example.js config.js
     ```
   - Add your API keys for Cerebras, Groq, OpenRouter, Gemini, or ElevenLabs if desired. *(The extension works out of the box using Tier 4 local heuristics and browser speech synthesis even without API keys!)*

3. **Load the Extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions`.
   - Enable **Developer mode** in the top-right corner.
   - Click **Load unpacked** and select the `tc-guardian` directory.

4. **Enable File URLs (Important for Local Testing)**:
   - On the `chrome://extensions` page, click **Details** on the **T&C Guardian** card.
   - Scroll down and toggle **ON** **"Allow access to file URLs"**. *(Chrome requires this to run content scripts on local HTML files).*

---

## 🧪 Hands-On Testing Guide

You can test the complete suite locally using the included `test-signup.html` and `dummy-terms.html` files.

### Scenario 1: Automatic Detection & Scanning
1. Open `test-signup.html` in your browser.
2. The in-page floating widget will appear at the top-right corner, displaying 5 detected risk cards extracted from `dummy-terms.html`.
3. Click **📖 View Clause** on any card to see the exact text quoted from the contract.
4. On the **Auto-Renewal** card, expand **How to solve this** to view step-by-step cancellation instructions and a direct settings link.

### Scenario 2: Answering Questions & Multi-Card Persistence
1. Click **Yes** on one card $\rightarrow$ only that specific card animates and fades away.
2. Click **No** on another card $\rightarrow$ it animates and fades away.
3. Answer all remaining cards $\rightarrow$ the widget automatically collapses into the minimized mascot bubble (`.tc-bubble`).

### Scenario 3: Bubble Expand & Collapse
1. Click the minimized mascot bubble $\rightarrow$ it expands into the full widget displaying the **"✓ All Flagged Clauses Answered"** confirmation card.
2. Click the minimize button (`−`) in the widget header $\rightarrow$ it collapses back to the bubble.
3. Click the close button (`×`) on the bubble $\rightarrow$ it dismisses for the current session.

### Scenario 4: Simulating Dealbreakers
1. At the bottom of `test-signup.html`, click:
   `⚠️ Simulate 2x NO (AI Training → DEALBREAKER)`.
2. The page reloads with learned preferences.
3. Notice:
   - The minimized bubble displays a red warning: `(1 ⚠️)`.
   - Expanding the widget shows the banner:  
     `🚨 Caution: Agreement contains terms you routinely reject!`.
   - The AI Training card has a red border and `⚠️ Normally Rejected` indicator.

### Scenario 5: Voice Assistant & Settings
1. Click the **🔊** icon in the header or next to any clause to hear it read aloud.
2. Click the in-page **⚙️** icon in the header to open the voice settings panel and adjust playback speed.
3. Click **▶ Test voice** to sample the voice.

### Scenario 6: Resetting Storage
1. Click **↺ Reset Storage** in the test panel on the page, or:
2. Open the extension popup in the toolbar $\rightarrow$ click the **`⚙️` Settings** icon $\rightarrow$ click **"Reset All Saved Answers"**.
3. Storage is cleared, and all cards reset fresh.

---

## 🛠️ Project Structure

```
tc-guardian/
├── manifest.json         # Manifest V3 extension configuration
├── background.js         # Service worker, AI fallback pipeline & dynamic toolbar icon
├── content.js            # Shadow DOM floating overlay, pre-fetching & voice controller
├── popup.html            # Extension popup dashboard & settings view
├── popup.js              # Popup dashboard state, historical votes & settings logic
├── popup.css             # Pastel styling for the popup and accordion cards
├── test-signup.html      # Local test registration page with built-in test suite
├── dummy-terms.html      # Local mock legal terms containing all 5 risk categories
├── config.example.js     # Template for optional API keys
├── icons/                # High-resolution mascot shield icons for all risk states
└── CLAUDE.md             # Shared architecture and developer collaboration contract
```

---

## 📄 License

MIT License. Built cooperatively as an advanced agentic coding project.
