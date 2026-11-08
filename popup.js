/**
 * T&C Guardian - Extension Popup Dashboard
 * Developer A: "This Website" Analysis View & "Preferences" Dashboard
 * Strictly adhering to Developer A file ownership and explicit-choice protocols.
 */

'use strict';

const STORAGE_KEYS = {
  USER_PROFILE: 'tc_guardian_userProfile',
  SITE_OVERRIDES: 'tc_guardian_siteOverrides'
};

const CATEGORIES = [
  'DATA_SALE',
  'AI_TRAINING',
  'AUTO_RENEW',
  'NO_DELETE',
  'WAIVE_RIGHTS'
];

/**
 * Category Metadata & Severity Mapping:
 * • DATA_SALE: High
 * • WAIVE_RIGHTS: High
 * • AI_TRAINING: Medium
 * • AUTO_RENEW: Medium
 * • NO_DELETE: Low
 */
const CATEGORY_CONFIG = {
  DATA_SALE: {
    name: 'Your data may be sold',
    shortTitle: 'Data Sale & Brokers',
    severity: 'High',
    severityClass: 'risk-high',
    icon: '📊',
    defaultShort: 'Your personal activity and data may be sold to advertising partners.'
  },
  WAIVE_RIGHTS: {
    name: 'You waive your legal rights',
    shortTitle: 'Arbitration Waiver',
    severity: 'High',
    severityClass: 'risk-high',
    icon: '⚖️',
    defaultShort: 'Forces individual binding arbitration and waives your class action rights.'
  },
  AI_TRAINING: {
    name: 'Your data may train AI',
    shortTitle: 'AI Model Training',
    severity: 'Medium',
    severityClass: 'risk-medium',
    icon: '🤖',
    defaultShort: 'Your content, prompts, or documents may be used to train AI models.'
  },
  AUTO_RENEW: {
    name: 'Your plan auto-renews',
    shortTitle: 'Auto-Renewal & Billing',
    severity: 'Medium',
    severityClass: 'risk-medium',
    icon: '💳',
    defaultShort: 'Payments repeat until you cancel. Unused time may not be refunded.'
  },
  NO_DELETE: {
    name: 'Data retained indefinitely',
    shortTitle: 'Indefinite Retention',
    severity: 'Low',
    severityClass: 'risk-low',
    icon: '🗄️',
    defaultShort: 'Account records and telemetry remain stored even after deletion requests.'
  }
};

// Legacy alias for preference rendering compatibility
const CATEGORY_META = {
  DATA_SALE: { name: 'Data Sale & Brokers', icon: '📊' },
  AI_TRAINING: { name: 'AI Model Training', icon: '🤖' },
  AUTO_RENEW: { name: 'Auto-Renewal & Billing', icon: '💳' },
  NO_DELETE: { name: 'Indefinite Retention', icon: '🗄️' },
  WAIVE_RIGHTS: { name: 'Arbitration Waiver', icon: '⚖️' }
};

let currentProfile = {};
let currentOverrides = {};
let searchQuery = '';
let activeTabInfo = { id: null, url: '', domain: 'localhost' };
let currentView = 'website'; // 'website' | 'preferences'

/**
 * Storage Helpers (Explicit-Choice Protocol)
 */
function getDefaultProfile() {
  return {
    DATA_SALE: { yes: 0, no: 0 },
    AI_TRAINING: { yes: 0, no: 0 },
    AUTO_RENEW: { yes: 0, no: 0 },
    NO_DELETE: { yes: 0, no: 0 },
    WAIVE_RIGHTS: { yes: 0, no: 0 }
  };
}

async function loadData() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.SITE_OVERRIDES], (res) => {
        const p = (res && res[STORAGE_KEYS.USER_PROFILE]) || {};
        const o = (res && res[STORAGE_KEYS.SITE_OVERRIDES]) || {};
        resolve(normalizeData(p, o));
      });
      return;
    }

    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_PROFILE)) || {};
      const o = JSON.parse(localStorage.getItem(STORAGE_KEYS.SITE_OVERRIDES)) || {};
      resolve(normalizeData(p, o));
    } catch {
      resolve({ profile: getDefaultProfile(), overrides: {} });
    }
  });
}

function normalizeData(rawProfile, rawOverrides) {
  const profile = getDefaultProfile();
  CATEGORIES.forEach((cat) => {
    if (rawProfile && rawProfile[cat]) {
      profile[cat] = {
        yes: Number(rawProfile[cat].yes) || 0,
        no: Number(rawProfile[cat].no) || 0
      };
    }
  });
  const overrides = (typeof rawOverrides === 'object' && rawOverrides !== null) ? rawOverrides : {};
  return { profile, overrides };
}

async function saveData(profile, overrides) {
  return new Promise((resolve) => {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
      localStorage.setItem(STORAGE_KEYS.SITE_OVERRIDES, JSON.stringify(overrides));
    } catch {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        [STORAGE_KEYS.USER_PROFILE]: profile,
        [STORAGE_KEYS.SITE_OVERRIDES]: overrides
      }, () => resolve());
      return;
    }
    resolve();
  });
}

/**
 * View Switcher
 */
function switchView(viewName) {
  currentView = viewName;
  const viewWebsite = document.getElementById('viewThisWebsite');
  const viewPreferences = document.getElementById('viewPreferences');
  const tabWebsite = document.getElementById('tabBtnWebsite');
  const tabPreferences = document.getElementById('tabBtnPreferences');
  const btnSettings = document.getElementById('btnToggleSettings');

  if (viewName === 'preferences') {
    if (viewWebsite) viewWebsite.classList.remove('active');
    if (viewPreferences) viewPreferences.classList.add('active');
    if (tabWebsite) tabWebsite.classList.remove('active');
    if (tabPreferences) tabPreferences.classList.add('active');
    if (btnSettings) {
      btnSettings.textContent = '🌐';
      btnSettings.title = 'Switch to Website Analysis';
    }
    // Neutral palette for preferences
    document.body.className = 'theme-neutral';
  } else {
    if (viewWebsite) viewWebsite.classList.add('active');
    if (viewPreferences) viewPreferences.classList.remove('active');
    if (tabWebsite) tabWebsite.classList.add('active');
    if (tabPreferences) tabPreferences.classList.remove('active');
    if (btnSettings) {
      btnSettings.textContent = '⚙️';
      btnSettings.title = 'Switch to Preferences & History';
    }
    // Restore tab's current risk theme
    if (activeTabInfo.riskTheme) {
      document.body.className = activeTabInfo.riskTheme;
    }
  }
}

/**
 * Active Tab Identification & Background Result Retrieval
 */
async function fetchActiveTab() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const tab = tabs[0];
          let domain = 'localhost';
          if (tab.url) {
            try {
              const u = new URL(tab.url);
              if (u.protocol.startsWith('http')) {
                domain = u.hostname.replace(/^www\./, '');
              } else {
                domain = u.protocol.replace(':', '');
              }
            } catch {}
          }
          activeTabInfo = { id: tab.id, url: tab.url || '', domain: domain };
          resolve(activeTabInfo);
          return;
        }
        resolve(activeTabInfo);
      });
    } else {
      activeTabInfo = {
        id: null,
        url: window.location.href,
        domain: (window.location.hostname || 'localhost').replace(/^www\./, '')
      };
      resolve(activeTabInfo);
    }
  });
}

async function loadTabAnalysis() {
  if (!activeTabInfo.id || !activeTabInfo.url.startsWith('http')) {
    renderUnanalyzedState(activeTabInfo.domain, 'Non-HTTP page or internal browser tab.');
    return;
  }

  // Ask background service worker for cached analysis of this active tab
  chrome.runtime.sendMessage({
    action: 'GET_TAB_ANALYSIS',
    tabId: activeTabInfo.id,
    url: activeTabInfo.url,
    domain: activeTabInfo.domain
  }, (res) => {
    if (chrome.runtime.lastError || !res) {
      renderUnanalyzedState(activeTabInfo.domain);
      return;
    }
    if (res.status === 'ERROR' || res.riskLevel === 'ERROR' || res.reason === 'POLICY_FETCH_FAILED') {
      renderErrorState(res.error || res.reason || 'Failed to fetch or analyze policy.', activeTabInfo.domain);
      return;
    }
    if (!res.success || res.status === 'UNANALYZED' || !res.data) {
      renderUnanalyzedState(activeTabInfo.domain);
      return;
    }
    renderWebsiteAnalysis(res.data, res.engine, res.domain || activeTabInfo.domain, res.riskLevel, res.policyUrl);
  });
}

/**
 * Overall Risk Evaluation
 */
function evaluateRisk(data) {
  if (!data) return { level: 'CLEAN', highCount: 0, medCount: 0, lowCount: 0, presentCount: 0 };

  let highCount = 0;
  let medCount = 0;
  let lowCount = 0;

  if (data.DATA_SALE?.present) highCount++;
  if (data.WAIVE_RIGHTS?.present) highCount++;
  if (data.AI_TRAINING?.present) medCount++;
  if (data.AUTO_RENEW?.present) medCount++;
  if (data.NO_DELETE?.present) lowCount++;

  const presentCount = highCount + medCount + lowCount;

  let level = 'CLEAN';
  if (highCount > 0) {
    level = 'HIGH';
  } else if (medCount > 0) {
    level = 'MEDIUM';
  } else if (lowCount > 0) {
    level = 'LOW';
  }

  return { level, highCount, medCount, lowCount, presentCount };
}

/**
 * Helper to dynamically extract analyzed policy items based on policyUrl and page metadata.
 * Completely eliminates hardcoded checkmarks for clean screen.
 */
function getAnalyzedPoliciesList(policyUrl, pageTitle = '', domain = '') {
  const list = [];
  const targetUrl = policyUrl || activeTabInfo.url || '';

  if (targetUrl) {
    let name = 'Terms & Conditions';
    if (/privacy/i.test(targetUrl) || /privacy/i.test(pageTitle)) {
      name = 'Privacy Policy';
    } else if (/terms|tos|conditions/i.test(targetUrl) || /terms|tos|conditions/i.test(pageTitle)) {
      name = 'Terms of Service';
    } else if (/eula|license/i.test(targetUrl)) {
      name = 'Software License (EULA)';
    } else if (/billing|subscription/i.test(targetUrl)) {
      name = 'Subscription & Billing Terms';
    } else if (pageTitle && pageTitle.length > 3 && !/loading|untitled/i.test(pageTitle)) {
      name = pageTitle.slice(0, 40).trim();
    } else {
      name = `${domain || 'Site'} Legal Agreement`;
    }
    list.push({ name, url: targetUrl });
  } else {
    list.push({ name: `${domain || 'Site'} Terms & Conditions`, url: null });
  }
  return list;
}

/**
 * Validates billing URL: must be https and cannot be a bare homepage
 */
function isValidBillingUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!/^https:\/\//i.test(clean)) return false;
  try {
    const u = new URL(clean);
    const cleanPath = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!cleanPath && !u.search && !u.hash) {
      return false; // Bare homepage
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Render "This Website" Analysis View (Primary View)
 */
function renderWebsiteAnalysis(data, engine = 'Analysis Pipeline', domain = '', precomputedRisk = null, policyUrl = null) {
  const container = document.getElementById('findingsContainer');
  const mascotImg = document.getElementById('heroMascotImg');
  const brandIcon = document.getElementById('brandShieldIcon');
  const pillBadge = document.getElementById('heroPillBadge');
  const headline = document.getElementById('heroHeadline');
  const subtext = document.getElementById('heroSubtext');
  if (!container) return;

  const risk = evaluateRisk(data);

  // Apply Theme & Mascot
  let themeClass = 'theme-clean';
  let mascotFile = 'icons/guardian-low-risk.png';

  if (risk.level === 'HIGH') {
    themeClass = 'theme-high';
    mascotFile = 'icons/guardian-high-risk.png';
    if (pillBadge) pillBadge.textContent = 'High risk';
    if (headline) headline.textContent = 'A few things to watch';
    if (subtext) subtext.textContent = `${risk.highCount} high-risk finding${risk.highCount === 1 ? '' : 's'}`;
  } else if (risk.level === 'MEDIUM') {
    themeClass = 'theme-medium';
    mascotFile = 'icons/guardian-medium-risk.png';
    if (pillBadge) pillBadge.textContent = 'Medium risk';
    if (headline) headline.textContent = 'Worth a little look';
    if (subtext) subtext.textContent = `${risk.medCount} medium-risk finding${risk.medCount === 1 ? '' : 's'}`;
  } else if (risk.level === 'LOW') {
    themeClass = 'theme-low';
    mascotFile = 'icons/guardian-low-risk.png';
    if (pillBadge) pillBadge.textContent = 'Low risk';
    if (headline) headline.textContent = 'Minor items noted';
    if (subtext) subtext.textContent = `${risk.lowCount} low-risk finding${risk.lowCount === 1 ? '' : 's'}`;
  } else {
    // Clean (0 findings)
    themeClass = 'theme-clean';
    mascotFile = 'icons/guardian-low-risk.png';
    if (pillBadge) pillBadge.textContent = 'Scan complete';
    if (headline) headline.textContent = 'Looking good! No Critical Red Flags Found';
    if (subtext) subtext.textContent = "We didn't find the risk clauses we check for in the policies analyzed.";
  }

  activeTabInfo.riskTheme = themeClass;
  if (currentView === 'website') {
    document.body.className = themeClass;
  }
  if (mascotImg) mascotImg.src = mascotFile;
  if (brandIcon) brandIcon.src = mascotFile;

  // Render Findings Cards or Clean State (Dynamic Checklist based on policyUrl)
  if (risk.presentCount === 0) {
    const policies = getAnalyzedPoliciesList(policyUrl, activeTabInfo.title, domain || activeTabInfo.domain);
    const checklistHtml = policies.map((p) => `
      <div class="clean-item">
        <span class="clean-check-badge">✓</span>
        <span class="clean-item-text">${escapeHtml(p.name)}</span>
        ${p.url ? `<a class="clean-item-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" title="View policy">↗</a>` : ''}
      </div>
    `).join('');

    container.innerHTML = `
      <div class="clean-policies-card">
        <div class="clean-title">Policies checked</div>
        <div class="clean-checklist">
          ${checklistHtml}
        </div>
        <div class="clean-status-box">
          <span>✓</span>
          <span>No findings in this scan.</span>
        </div>
      </div>
    `;
    return;
  }

  // Render Present Categories (Sorted: High -> Medium -> Low) as Compact Accordions
  const severityOrder = { High: 1, Medium: 2, Low: 3 };
  const presentKeys = CATEGORIES.filter((k) => data[k]?.present === true).sort((a, b) => {
    return severityOrder[CATEGORY_CONFIG[a].severity] - severityOrder[CATEGORY_CONFIG[b].severity];
  });

  const cardsHtml = presentKeys.map((catKey) => {
    const cfg = CATEGORY_CONFIG[catKey];
    const catData = data[catKey] || {};
    const keyFindingText = catData.shortSummary || catData.summary || cfg.defaultShort;
    const snippetText = catData.snippet || '';

    // Resolution / Opt-Out Guide inside hidden body
    const steps = (Array.isArray(catData.optOutSteps) && catData.optOutSteps.length > 0)
      ? catData.optOutSteps
      : (catData.cancellationGuide?.steps || (catKey === 'AUTO_RENEW' ? (data.cancellationGuide?.steps || []) : []));
    const rawOptOutLink = (typeof catData.optOutLink === 'string' && catData.optOutLink.trim())
      ? catData.optOutLink.trim()
      : (catData.cancellationGuide?.url || (catKey === 'AUTO_RENEW' ? (data.cancellationGuide?.url || '') : ''));
    const isSecureOptOutLink = typeof rawOptOutLink === 'string' && /^https:\/\//i.test(rawOptOutLink);

    let resolutionGuideHtml = '';
    if (Array.isArray(steps) && steps.length > 0) {
      resolutionGuideHtml = `
        <div class="finding-resolution-guide">
          <div class="resolution-guide-title">
            <span>💡 How to solve this</span>
          </div>
          <ol class="resolution-steps-list">
            ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
          </ol>
          ${isSecureOptOutLink ? `
            <a class="btn-resolution-link" href="${escapeHtml(rawOptOutLink)}" target="_blank" rel="noopener noreferrer">
              <span>Open resolution link</span>
              <span>↗</span>
            </a>
          ` : ''}
        </div>
      `;
    }

    return `
      <details class="finding-card risk-card ${cfg.severity.toLowerCase()} ${cfg.severityClass}">
        <summary class="finding-card-header">
          <div class="finding-header-left">
            <span class="finding-icon-wrap ${cfg.severityClass}">${cfg.icon}</span>
            <span class="finding-title">${escapeHtml(cfg.name)}</span>
          </div>
          <div class="finding-header-right">
            <span class="finding-severity-pill ${cfg.severityClass}">${cfg.severity} risk</span>
            <span class="card-chevron">▸</span>
          </div>
        </summary>

        <div class="finding-card-body">
          <div class="finding-finding-label">KEY FINDING</div>
          <div class="finding-summary-text">${escapeHtml(keyFindingText)}</div>

          ${snippetText ? `
            <details class="finding-evidence-details">
              <summary class="finding-evidence-summary">
                <span>View original clause</span>
              </summary>
              <div class="evidence-quote-box">
                "${escapeHtml(snippetText)}"
              </div>
            </details>
          ` : ''}

          ${resolutionGuideHtml}
        </div>
      </details>
    `;
  }).join('');

  container.innerHTML = cardsHtml;
}

/**
 * Render Unanalyzed / Not Detected State
 * Explicitly fulfills: "Do not display a clean result when analysis is unavailable, incomplete, or based on missing source text."
 */
function renderUnanalyzedState(domain = '', customReason = '') {
  const container = document.getElementById('findingsContainer');
  const mascotImg = document.getElementById('heroMascotImg');
  const brandIcon = document.getElementById('brandShieldIcon');
  const pillBadge = document.getElementById('heroPillBadge');
  const headline = document.getElementById('heroHeadline');
  const subtext = document.getElementById('heroSubtext');

  activeTabInfo.riskTheme = 'theme-neutral';
  if (currentView === 'website') {
    document.body.className = 'theme-neutral';
  }
  if (mascotImg) mascotImg.src = 'icons/guardian-neutral.png';
  if (brandIcon) brandIcon.src = 'icons/guardian-neutral.png';

  if (pillBadge) pillBadge.textContent = 'Not analyzed';
  if (headline) headline.textContent = 'No policies analyzed yet';
  if (subtext) subtext.textContent = customReason || 'No Terms of Service or Privacy Policy detected automatically on this page.';

  if (!container) return;

  container.innerHTML = `
    <div class="unanalyzed-card">
      <div class="unanalyzed-icon">📄</div>
      <div class="unanalyzed-title">Scan Active Page</div>
      <div class="unanalyzed-desc">
        T&C Guardian scans pages for terms and privacy agreements. Click below to inspect and analyze the text on this tab right now.
      </div>
      <button class="btn-scan-now" id="btnScanNow">
        <span>🔍</span>
        <span>Scan This Page Now</span>
      </button>
    </div>
  `;

  const btnScan = document.getElementById('btnScanNow');
  if (btnScan) {
    btnScan.addEventListener('click', triggerActiveTabScan);
  }
}

/**
 * Render Error State (P1 & P3)
 * Displays explicit error notice when policy fetch fails or analysis pipeline errors.
 * Never defaults to clean.
 */
function renderErrorState(errorMsg = '', domain = '') {
  const container = document.getElementById('findingsContainer');
  const mascotImg = document.getElementById('heroMascotImg');
  const brandIcon = document.getElementById('brandShieldIcon');
  const pillBadge = document.getElementById('heroPillBadge');
  const headline = document.getElementById('heroHeadline');
  const subtext = document.getElementById('heroSubtext');

  activeTabInfo.riskTheme = 'theme-neutral';
  if (currentView === 'website') {
    document.body.className = 'theme-neutral';
  }
  if (mascotImg) mascotImg.src = 'icons/guardian-neutral.png';
  if (brandIcon) brandIcon.src = 'icons/guardian-neutral.png';

  if (pillBadge) pillBadge.textContent = 'Analysis error';
  if (headline) headline.textContent = 'Could not analyze policy';
  if (subtext) subtext.textContent = errorMsg || 'An error occurred while fetching or analyzing terms.';

  if (!container) return;

  container.innerHTML = `
    <div class="unanalyzed-card" style="border-left: 5px solid #ef4444;">
      <div class="unanalyzed-icon">⚠️</div>
      <div class="unanalyzed-title" style="color: #dc2626;">Scan Incomplete</div>
      <div class="unanalyzed-desc">
        ${escapeHtml(errorMsg || 'Unable to retrieve or analyze policy content on this page.')}
      </div>
      <button class="btn-scan-now" id="btnScanNow">
        <span>🔄</span>
        <span>Retry Scan</span>
      </button>
    </div>
  `;

  const btnScan = document.getElementById('btnScanNow');
  if (btnScan) {
    btnScan.addEventListener('click', triggerActiveTabScan);
  }
}

/**
 * Trigger On-Demand Scan of the Active Tab
 */
async function triggerActiveTabScan() {
  const btnScan = document.getElementById('btnScanNow');
  const subtext = document.getElementById('heroSubtext');
  if (btnScan) {
    btnScan.disabled = true;
    btnScan.textContent = 'Scanning page text...';
  }
  if (subtext) subtext.textContent = 'Extracting legal text and querying analysis pipeline...';

  if (!activeTabInfo.id) {
    renderUnanalyzedState(activeTabInfo.domain, 'Cannot scan this tab (unsupported tab ID).');
    return;
  }

  try {
    // Check if the active tab's URL matches a legal/terms page first
    const isLegalPage = /(?:terms|privacy|(?:^|[^a-z])tos(?:[^a-z]|$)|conditions|legal|eula|policy|policies)/i.test(activeTabInfo.url);

    // Execute quick text/links scraper in active tab:
    // If on a legal/terms page, use page's own text and set policyUrl to current URL.
    // Only scrape DOM for external policy links if on an ordinary, non-legal page.
    const [execResult] = await chrome.scripting.executeScript({
      target: { tabId: activeTabInfo.id },
      func: (onLegalPage) => {
        const text = (document.body && (document.body.innerText || document.body.textContent) || '').slice(0, 15000);
        let externalTermsUrl = null;
        if (!onLegalPage) {
          const link = Array.from(document.querySelectorAll('a')).find(a =>
            /(?:terms|privacy|tos|conditions|policy)/i.test(a.textContent || '') ||
            /(?:terms|privacy|tos|policy)/i.test(a.href || '')
          );
          if (link && link.href && /^https?:\/\//i.test(link.href)) {
            externalTermsUrl = link.href;
          }
        }
        return {
          title: document.title,
          termsUrl: externalTermsUrl,
          text: text
        };
      },
      args: [isLegalPage]
    });

    const pageData = execResult?.result || {};
    const text = pageData.text || '';
    const policyUrl = isLegalPage ? activeTabInfo.url : (pageData.termsUrl || null);

    const payload = (!isLegalPage && pageData.termsUrl)
      ? { action: 'FETCH_AND_ANALYZE_TC', policyUrl: policyUrl, url: policyUrl, text: text, domain: activeTabInfo.domain, tabId: activeTabInfo.id }
      : { action: 'ANALYZE_TC', policyUrl: policyUrl, text: text, domain: activeTabInfo.domain, url: activeTabInfo.url, tabId: activeTabInfo.id };

    chrome.runtime.sendMessage(payload, (analysisRes) => {
      if (chrome.runtime.lastError || !analysisRes) {
        renderUnanalyzedState(activeTabInfo.domain, 'Analysis request failed or timed out.');
        return;
      }

      if (analysisRes.status === 'ERROR' || analysisRes.riskLevel === 'ERROR' || !analysisRes.success) {
        renderErrorState(analysisRes.error || analysisRes.reason || 'Analysis failed.', activeTabInfo.domain);
        return;
      }

      // Background finalizeScan has stored the record and updated toolbar icon
      renderWebsiteAnalysis(analysisRes.data, analysisRes.engine, activeTabInfo.domain, analysisRes.riskLevel, policyUrl);
    });
  } catch (err) {
    console.warn('[T&C Guardian] On-demand scan failed:', err);
    renderUnanalyzedState(activeTabInfo.domain, 'Could not access page content (restricted browser or extension URL).');
  }
}

/**
 * Render Preferences View (Secondary View)
 * Fulfills all existing historical choices & site overrides management
 */
function renderProfileGrid() {
  const container = document.getElementById('profileGrid');
  if (!container) return;

  const html = CATEGORIES.map((catKey) => {
    const meta = CATEGORY_META[catKey];
    const stats = currentProfile[catKey] || { yes: 0, no: 0 };
    const yes = stats.yes;
    const no = stats.no;
    const total = yes + no;

    const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
    const noPct = total > 0 ? (100 - yesPct) : 0;

    let badgeClass = 'badge-neutral';
    let badgeText = 'No votes recorded';

    if (total > 0) {
      if (noPct >= 60) {
        badgeClass = 'badge-dealbreaker';
        badgeText = `Historically Rejected ${noPct}% of the time`;
      } else if (yesPct >= 60) {
        badgeClass = 'badge-accepted';
        badgeText = `Historically Accepted ${yesPct}% of the time`;
      } else {
        badgeClass = 'badge-neutral';
        badgeText = `Split Choice (${yesPct}% Yes / ${noPct}% No)`;
      }
    }

    return `
      <div class="profile-card">
        <div class="profile-card-top">
          <span class="profile-cat-name">${meta.icon} ${meta.name}</span>
          <span class="profile-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="ratio-bar-wrap">
          <div class="ratio-bar">
            <div class="ratio-yes" style="width: ${total > 0 ? yesPct : 0}%"></div>
            <div class="ratio-no" style="width: ${total > 0 ? noPct : 0}%"></div>
          </div>
          <div class="ratio-stats">
            <span class="stat-yes">✓ ${yes} Yes (${total > 0 ? yesPct : 0}%)</span>
            <span class="stat-no">✕ ${no} No (${total > 0 ? noPct : 0}%)</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function renderOverridesList() {
  const container = document.getElementById('overridesList');
  const countEl = document.getElementById('overridesCount');
  if (!container) return;

  const allDomains = Object.keys(currentOverrides).filter((domain) => {
    const categoriesObj = currentOverrides[domain];
    return categoriesObj && Object.keys(categoriesObj).length > 0;
  });

  if (countEl) {
    countEl.textContent = `${allDomains.length} domain${allDomains.length === 1 ? '' : 's'}`;
  }

  const filteredDomains = allDomains.filter((d) =>
    d.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filteredDomains.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${searchQuery ? 'No domains match your search query.' : 'No site overrides stored yet. Overrides are created when you vote on site terms.'}
      </div>
    `;
    return;
  }

  const html = filteredDomains.map((domain) => {
    const domainOverrides = currentOverrides[domain] || {};
    const catKeys = Object.keys(domainOverrides);

    const tagsHtml = catKeys.map((catKey) => {
      const isYes = Boolean(domainOverrides[catKey]);
      const meta = CATEGORY_META[catKey] || { name: catKey, icon: '•' };
      return `
        <span class="override-tag ${isYes ? 'tag-yes' : 'tag-no'}" 
              data-domain="${escapeAttr(domain)}" 
              data-cat="${escapeAttr(catKey)}" 
              title="Click to toggle Accept / Reject">
          <span>${meta.icon}</span>
          <span>${meta.name}: ${isYes ? 'YES' : 'NO'}</span>
        </span>
      `;
    }).join('');

    return `
      <div class="override-item">
        <div class="override-item-header">
          <span class="override-domain">${escapeHtml(domain)}</span>
          <button class="btn-delete-domain" data-delete-domain="${escapeAttr(domain)}" title="Delete all overrides for ${escapeAttr(domain)}">
            🗑️
          </button>
        </div>
        <div class="override-tags">
          ${tagsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  // Add click listeners to tags for toggling (Explicit-Choice Protocol)
  container.querySelectorAll('.override-tag').forEach((tag) => {
    tag.addEventListener('click', async (e) => {
      const target = e.currentTarget;
      const domain = target.getAttribute('data-domain');
      const catKey = target.getAttribute('data-cat');
      if (domain && catKey && currentOverrides[domain]) {
        currentOverrides[domain][catKey] = !currentOverrides[domain][catKey];
        await saveData(currentProfile, currentOverrides);
        renderOverridesList();
      }
    });
  });

  // Add click listeners to delete domain buttons
  container.querySelectorAll('[data-delete-domain]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const domain = e.currentTarget.getAttribute('data-delete-domain');
      if (domain && currentOverrides[domain]) {
        delete currentOverrides[domain];
        await saveData(currentProfile, currentOverrides);
        renderOverridesList();
      }
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

/**
 * Initialize Dashboard
 */
async function init() {
  // Navigation tabs listeners
  const tabWebsite = document.getElementById('tabBtnWebsite');
  const tabPreferences = document.getElementById('tabBtnPreferences');
  const btnSettings = document.getElementById('btnToggleSettings');

  if (tabWebsite) tabWebsite.addEventListener('click', () => switchView('website'));
  if (tabPreferences) tabPreferences.addEventListener('click', () => switchView('preferences'));
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      switchView(currentView === 'website' ? 'preferences' : 'website');
    });
  }

  // Load active tab info and stored analysis
  await fetchActiveTab();
  await loadTabAnalysis();

  // Load user profile & overrides for preferences view
  const data = await loadData();
  currentProfile = data.profile;
  currentOverrides = data.overrides;

  renderProfileGrid();
  renderOverridesList();

  // Search filter listener for overrides
  const searchInput = document.getElementById('domainSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderOverridesList();
    });
  }

  // Reset All Button
  const btnResetAll = document.getElementById('btnResetAll');
  if (btnResetAll) {
    btnResetAll.addEventListener('click', async () => {
      const ok = confirm('Are you sure you want to reset all learned preferences and clear all site overrides?');
      if (ok) {
        currentProfile = getDefaultProfile();
        currentOverrides = {};
        await saveData(currentProfile, currentOverrides);
        renderProfileGrid();
        renderOverridesList();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
