/**
 * T&C Guardian - Extension Popup Dashboard
 * Developer A: Global Profiles Summary, Site Overrides Manager & Reset Controls
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

/**
 * Storage Helpers
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
        let p = (res && res[STORAGE_KEYS.USER_PROFILE]) || {};
        let o = (res && res[STORAGE_KEYS.SITE_OVERRIDES]) || {};
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
 * Get Active Tab Domain
 */
async function initActiveTabDomain() {
  const pill = document.getElementById('currentSitePill');
  if (!pill) return;

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        try {
          const urlObj = new URL(tabs[0].url);
          if (urlObj.protocol.startsWith('http')) {
            const domain = urlObj.hostname.replace(/^www\./, '');
            pill.textContent = domain;
            pill.title = `Active tab: ${domain}`;
            return;
          }
        } catch {}
      }
      pill.textContent = 'local / newtab';
    });
  } else {
    pill.textContent = (window.location.hostname || 'localhost').replace(/^www\./, '');
  }
}

/**
 * Render Profiles
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

    let badgeClass = 'badge-neutral';
    let badgeText = 'Unset';

    if (total > 0 && yes >= 3 && (yes / total) >= 0.75) {
      badgeClass = 'badge-assumed-yes';
      badgeText = 'Auto-Assumed YES';
    } else if (total > 0 && no >= 2 && (no / total) >= 0.60) {
      badgeClass = 'badge-dealbreaker';
      badgeText = '⚠️ Dealbreaker';
    } else if (total > 0) {
      badgeClass = 'badge-neutral';
      badgeText = `${total} vote${total === 1 ? '' : 's'}`;
    }

    const yesPct = total > 0 ? Math.round((yes / total) * 100) : 50;
    const noPct = total > 0 ? (100 - yesPct) : 50;

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
            <span class="stat-yes">✓ ${yes} Accepted (${total > 0 ? yesPct : 0}%)</span>
            <span class="stat-no">✕ ${no} Rejected (${total > 0 ? noPct : 0}%)</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

/**
 * Render Overrides List
 */
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

  // Add click listeners to tags for toggling
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
  initActiveTabDomain();

  const data = await loadData();
  currentProfile = data.profile;
  currentOverrides = data.overrides;

  renderProfileGrid();
  renderOverridesList();

  // Search filter listener
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

