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

## 📦 How to Install (Step-by-Step)

T&C Guardian runs on Google Chrome, Brave, Microsoft Edge, Opera, or any Chromium-based browser:

### Step 1: Download or Clone the Repository
Clone the repository using Git:
```bash
git clone https://github.com/tawfiqueeeM/tc-guardian.git
cd tc-guardian
```
*(Or download the ZIP from GitHub and extract it to a folder on your computer).*

### Step 2: Open Extensions in Your Browser
- In Google Chrome, type `chrome://extensions` in the address bar and press Enter.
- In Brave, navigate to `brave://extensions`.
- In Edge, navigate to `edge://extensions`.

### Step 3: Enable Developer Mode
- In the top-right corner of the Extensions page, toggle the **Developer mode** switch **ON**.

### Step 4: Load the Unpacked Extension
- Click the **"Load unpacked"** button in the top-left corner.
- In the folder picker, select the `tc-guardian` folder (the directory containing `manifest.json`).
- You will see the **T&C Guardian** extension card appear in your extensions list!

### Step 5: Pin the Extension Icon
- Click the puzzle piece icon (🧩) in your Chrome toolbar.
- Click the pin icon (📌) next to **T&C Guardian** so the shield mascot icon is always visible in your toolbar.

### Step 6: Enable File URLs *(Crucial for Testing Local HTML Files)*
If you want to test the extension with local HTML files (like the included `test-signup.html`):
1. On the `chrome://extensions` page, click **Details** on the T&C Guardian card.
2. Scroll down to **"Allow access to file URLs"** and toggle it **ON**.
*(Chrome disables extension access to `file:///` URLs by default for security; enabling this allows the extension to inspect local test files).*

---

## 💡 How to Use the Extension (User Guide)

Once installed, T&C Guardian works seamlessly without requiring any manual setup. Here is how to use its core features during everyday browsing:

### 1. In-Page Floating Assistant on Sign-Up Pages
- **Automatic Pop-up**: When you visit a registration, checkout, or account creation page (or a page linking to terms), the floating T&C Guardian mascot automatically slides into the top-right corner.
- **Review Plain-English Summaries**: Each card highlights a specific detected risk in clear language.
- **Inspect Original Contract Snippets**: Click **"📖 View Clause"** on any card to see the exact text quoted from the agreement, or click **"↗ Jump to page location"** to scroll directly to the clause in the text.
- **Opt-Out & Cancellation Guides**: If an agreement includes automatic charges or medium/high risks, expand **"How to solve this"** for step-by-step resolution steps and direct settings links.
- **Accept or Reject Clauses**:
  - Click **Yes** if you are okay with the clause.
  - Click **No** if you reject the risk.
  - Answered cards animate and fade away cleanly.
- **Minimize to Mascot Bubble**: Click the minimize button (`−`) in the header to collapse the widget into a cute floating bubble (`.tc-bubble`). Clicking the bubble re-expands it anytime.
- **Dismiss for Session**: Click `×` to hide the widget for the remainder of your current browsing session.

### 2. 🔊 Using the Voice Assistant & Voice Answering
- **Listen Aloud**: Click the **🔊** icon in the widget header (to read all flagged clauses) or on any individual card to hear it read aloud.
- **Natural Voice / Browser Fallback**: Uses natural ElevenLabs speech if configured, or automatically falls back to your browser's built-in speech synthesis.
- **Answer by Voice (Hands-Free)**:
  1. Click the microphone icon (**🎤**) in the widget header.
  2. The assistant will read each clause and prompt you: *"Is this risk okay with you?"*.
  3. Speak naturally: say **"Yes"**, **"No"**, or **"Skip"** to record your choice hands-free.
- **Voice Settings**: Click the **⚙️** icon in the widget header to change the speech rate (speed slider), select preferred browser voices, or enable auto-read on page load.

### 3. 🧠 Personal Preference Learning & Dealbreakers
- T&C Guardian learns your habits over time based on your explicit votes.
- If you consistently reject a specific category (e.g. you vote **No** on AI Training $\ge 2$ times with a $\ge 60\%$ rejection rate), the extension flags that category as a **Dealbreaker**.
- On future sites containing that clause:
  - The minimized bubble displays a red warning: `(1 ⚠️)`.
  - Expanding the widget displays the banner: `🚨 Caution: Agreement contains terms you routinely reject!`.
  - The risk card highlights with a red outline and a `⚠️ Normally Rejected` badge.

### 4. 🧭 Using the Toolbar Popup Dashboard
Click the T&C Guardian icon in your browser toolbar to open the popup dashboard:
- **"This Website" Tab**: Shows the live analysis for the active tab, the analysis engine used, and compact accordion cards for each risk.
- **"Preferences" Tab**:
  - Displays your historical explicit votes across all 5 risk categories.
  - Features searchable and removable **Site Overrides** (review or clear individual domain choices).
  - Contains the **"Always show widget on page (even if clean or answered)"** toggle right at the top.
- **Settings Screen (`⚙️` Header Icon)**:
  - Access the widget visibility toggle.
  - Configure full voice assistant preferences.
  - Click **"Reset All Saved Answers"** to clear historical votes and start fresh.

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

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>Why didn't the in-page widget pop up on a website?</b></summary>
<br>

There are three normal reasons for this:
1. **Silent Memory**: If you already answered all risks on that domain, or if the page agreement contains 0 red flags, T&C Guardian remains quiet so it doesn't interrupt your browsing. To see the widget regardless, open the popup, go to **Preferences**, and turn **ON** *"Always show widget on page (even if clean or answered)"*.
2. **Local File Permissions**: If you opened `test-signup.html` directly from disk (`file:///...`), make sure **"Allow access to file URLs"** is toggled ON under `chrome://extensions` $\rightarrow$ T&C Guardian **Details**.
3. **Non-Signup Page**: The in-page widget only injects on registration, checkout, or legal pages (`isSignupCheckoutOrLegalPage()`). On regular content pages (like blogs or news), the extension updates the toolbar badge silently without injecting popups.
</details>

<details>
<summary><b>Do I need API keys to use T&C Guardian?</b></summary>
<br>

**No.** T&C Guardian operates with a 4-tier fallback system:
- It includes a 100% local, on-device keyword heuristic engine that runs instantly with zero API keys or external services.
- Browser speech synthesis works natively without any cloud keys.
- Cloud LLM keys (Gemini, Groq, Cerebras, OpenRouter, ElevenLabs) are optional for users who want enhanced natural language synthesis.
</details>

<details>
<summary><b>Does T&C Guardian send my personal data or browsing history to external servers?</b></summary>
<br>

**No.** T&C Guardian does not collect, track, or sell your browsing history. All user preferences, site overrides, and vote counters are stored locally on your device in `chrome.storage.local`. Only the public legal terms text of the page being evaluated is passed to the analysis engine.
</details>

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
