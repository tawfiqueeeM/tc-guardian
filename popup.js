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
  const domainEl = document.getElementById('currentSiteDomain');
  const pillEl = document.getElementById('currentSitePill');
  const subEl = document.getElementById('currentSiteSub');
  const engineBadge = document.getElementById('engineBadge');

  if (domainEl) domainEl.textContent = activeTabInfo.domain;
  if (pillEl) pillEl.textContent = activeTabInfo.domain;
  if (subEl) subEl.textContent = 'Checking stored analysis...';

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
    if (chrome.runtime.lastError || !res || !res.success) {
      // No active analysis or stale result detected
      renderUnanalyzedState(activeTabInfo.domain);
    } else {
      renderWebsiteAnalysis(res.data, res.engine, res.domain || activeTabInfo.domain, res.riskLevel);
    }
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
 * Render "This Website" Analysis View (Primary View)
 */
function renderWebsiteAnalysis(data, engine = 'Analysis Pipeline', domain = '', precomputedRisk = null) {
  const container = document.getElementById('findingsContainer');
  const mascotImg = document.getElementById('heroMascotImg');
  const brandIcon = document.getElementById('brandShieldIcon');
  const pillBadge = document.getElementById('heroPillBadge');
  const headline = document.getElementById('heroHeadline');
  const subtext = document.getElementById('heroSubtext');
  const subEl = document.getElementById('currentSiteSub');
  const engineBadge = document.getElementById('engineBadge');
  const footerEngine = document.getElementById('engineAttribution');

  if (!container) return;

  const risk = evaluateRisk(data);
  const isFallback = /fallback/i.test(engine);
  const engineDisplay = isFallback ? 'Fallback Detection (Keywords)' : engine;

  if (subEl) subEl.textContent = `${engineDisplay} analysis`;
  if (engineBadge) {
    engineBadge.textContent = isFallback ? 'Keyword Fallback' : engine;
    engineBadge.style.display = 'inline-block';
  }
  if (footerEngine) {
    footerEngine.textContent = `Analysis engine: ${engineDisplay}`;
  }

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

  // Render Findings Cards or Clean State
  if (risk.presentCount === 0) {
    container.innerHTML = `
      <div class="clean-policies-card">
        <div class="clean-title">Policies checked</div>
        <div class="clean-checklist">
          <div class="clean-item">
            <span class="clean-check-badge">✓</span>
            <span>Terms of Service</span>
          </div>
          <div class="clean-item">
            <span class="clean-check-badge">✓</span>
            <span>Privacy Policy</span>
          </div>
        </div>
        <div class="clean-status-box">
          <span>✓</span>
          <span>No findings in this scan.</span>
        </div>
      </div>
    `;
    return;
  }

  // Render Present Categories (Sorted: High -> Medium -> Low)
  const severityOrder = { High: 1, Medium: 2, Low: 3 };
  const presentKeys = CATEGORIES.filter((k) => data[k]?.present === true).sort((a, b) => {
    return severityOrder[CATEGORY_CONFIG[a].severity] - severityOrder[CATEGORY_CONFIG[b].severity];
  });

  let cardsHtml = presentKeys.map((catKey) => {
    const cfg = CATEGORY_CONFIG[catKey];
    const catData = data[catKey] || {};
    const keyFindingText = catData.shortSummary || catData.summary || cfg.defaultShort;
    const snippetText = catData.snippet || '';

    return `
      <div class="finding-card">
        <div class="finding-header">
          <div class="finding-icon-wrap ${cfg.severityClass}">
            ${cfg.icon}
          </div>
          <div class="finding-title-area">
            <div class="finding-title-row">
              <span class="finding-title">${escapeHtml(cfg.name)}</span>
              <span class="finding-severity-pill ${cfg.severityClass}">${cfg.severity} risk</span>
            </div>
            <div class="finding-finding-label">KEY FINDING</div>
            <div class="finding-summary-text">${escapeHtml(keyFindingText)}</div>
          </div>
        </div>

        ${snippetText ? `
          <div class="finding-evidence-toggle">
            <button class="btn-toggle-evidence" data-target="snippet-${catKey}">
              <span>View original clause</span>
              <span class="toggle-arrow">▸</span>
            </button>
            <div class="evidence-quote-box" id="snippet-${catKey}">
              "${escapeHtml(snippetText)}"
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // If AUTO_RENEW is present, attach the cancellation guide card
  if (data.AUTO_RENEW?.present && (data.AUTO_RENEW.cancellationGuide || data.cancellationGuide)) {
    const guide = data.AUTO_RENEW.cancellationGuide || data.cancellationGuide;
    const stepsHtml = (guide.steps || []).map((step, idx) => `
      <div class="cancel-step-item">
        <span class="step-num-badge">${idx + 1}</span>
        <span>${escapeHtml(step)}</span>
      </div>
    `).join('');

    cardsHtml += `
      <div class="cancel-guide-card">
        <div class="cancel-guide-header" id="btnToggleCancelSteps">
          <div class="cancel-guide-title-row">
            <span>💡</span>
            <span>How to Stop Auto-Pay</span>
          </div>
          <span style="font-size: 13px; color: #b45309;" id="cancelStepsArrow">▾</span>
        </div>
        <div class="cancel-steps-list" id="cancelStepsContainer">
          ${stepsHtml}
        </div>
        ${guide.url ? `
          <a class="btn-open-billing" href="${escapeHtml(guide.url)}" target="_blank" rel="noopener noreferrer">
            <span>Open billing settings</span>
            <span>↗</span>
          </a>
        ` : ''}
        <div class="cancel-guide-note">${escapeHtml(guide.domain || domain)} subscription management</div>
      </div>
    `;
  }

  container.innerHTML = cardsHtml;

  // Attach Evidence Toggle Listeners
  container.querySelectorAll('.btn-toggle-evidence').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.getAttribute('data-target');
      const box = document.getElementById(targetId);
      const arrow = btn.querySelector('.toggle-arrow');
      if (box) {
        const isOpen = box.classList.contains('open');
        if (isOpen) {
          box.classList.remove('open');
          if (arrow) arrow.textContent = '▸';
        } else {
          box.classList.add('open');
          if (arrow) arrow.textContent = '▾';
        }
      }
    });
  });

  // Attach Cancellation Guide Collapse Listener
  const cancelToggle = document.getElementById('btnToggleCancelSteps');
  const cancelSteps = document.getElementById('cancelStepsContainer');
  const cancelArrow = document.getElementById('cancelStepsArrow');
  if (cancelToggle && cancelSteps) {
    cancelToggle.addEventListener('click', () => {
      const isHidden = cancelSteps.style.display === 'none';
      cancelSteps.style.display = isHidden ? 'flex' : 'none';
      if (cancelArrow) cancelArrow.textContent = isHidden ? '▾' : '▸';
    });
  }
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
  const subEl = document.getElementById('currentSiteSub');
  const engineBadge = document.getElementById('engineBadge');
  const footerEngine = document.getElementById('engineAttribution');

  activeTabInfo.riskTheme = 'theme-neutral';
  if (currentView === 'website') {
    document.body.className = 'theme-neutral';
  }
  if (mascotImg) mascotImg.src = 'icons/guardian-low-risk.png';
  if (brandIcon) brandIcon.src = 'icons/guardian-low-risk.png';

  if (pillBadge) pillBadge.textContent = 'Not analyzed';
  if (headline) headline.textContent = 'No policies analyzed yet';
  if (subtext) subtext.textContent = customReason || 'No Terms of Service or Privacy Policy detected automatically on this page.';
  if (subEl) subEl.textContent = 'No active scan';
  if (engineBadge) engineBadge.style.display = 'none';
  if (footerEngine) footerEngine.textContent = 'Analysis not yet performed on this tab.';

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
    // Execute quick text/links scraper in active tab
    const [execResult] = await chrome.scripting.executeScript({
      target: { tabId: activeTabInfo.id },
      func: () => {
        const text = (document.body && (document.body.innerText || document.body.textContent) || '').slice(0, 15000);
        const termsLink = Array.from(document.querySelectorAll('a')).find(a => /terms|privacy|tos|conditions/i.test(a.textContent || ''));
        return {
          title: document.title,
          termsUrl: termsLink ? termsLink.href : null,
          text: text
        };
      }
    });

    const pageData = execResult?.result || {};
    const text = pageData.text || '';
    const remoteUrl = pageData.termsUrl || null;

    const payload = remoteUrl
      ? { action: 'FETCH_AND_ANALYZE_TC', url: remoteUrl, text: text, domain: activeTabInfo.domain }
      : { action: 'ANALYZE_TC', text: text, domain: activeTabInfo.domain };

    chrome.runtime.sendMessage(payload, (analysisRes) => {
      if (chrome.runtime.lastError || !analysisRes) {
        renderUnanalyzedState(activeTabInfo.domain, 'Analysis request failed or timed out.');
        return;
      }

      // Store in background tab store
      chrome.runtime.sendMessage({
        action: 'STORE_TAB_ANALYSIS',
        tabId: activeTabInfo.id,
        url: activeTabInfo.url,
        domain: activeTabInfo.domain,
        result: analysisRes
      }, () => {
        renderWebsiteAnalysis(analysisRes.data, analysisRes.engine, activeTabInfo.domain);
      });
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
