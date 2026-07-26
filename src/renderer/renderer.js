// Ultra-light lightbox for Markdown images (initialization after DOM ready)
function initMarkdownLightbox() {
  const mdLightbox = document.getElementById('mdLightbox');
  const mdLightboxImg = document.getElementById('mdLightboxImg');
  const detailsLong = document.getElementById('detailsLong');
  if (mdLightbox && mdLightboxImg && detailsLong) {
    detailsLong.addEventListener('click', e => {
      const t = e.target;
      if (t && t.tagName === 'IMG') {
        mdLightboxImg.src = t.src;
        mdLightbox.style.display = 'flex';
      }
    });
    mdLightbox.addEventListener('click', () => {
      mdLightbox.style.display = 'none';
      mdLightboxImg.src = '';
    });
  }
}
const loadedIcons = new Set();
const scrollShell = document.querySelector('.scroll-shell');
const appConstants = window.constants || {};
const VISIBLE_COUNT = typeof appConstants.VISIBLE_COUNT === 'number' ? appConstants.VISIBLE_COUNT : 50;
const CATEGORY_ICON_MAP = appConstants.CATEGORY_ICON_MAP || {};
const appUtils = window.utils || {};
const appPreferences = window.preferences || {};
const AM_INSTALLER_COMMAND = 'wget -q https://raw.githubusercontent.com/ivan-hc/AM/main/AM-INSTALLER && chmod a+x ./AM-INSTALLER && ./AM-INSTALLER && rm ./AM-INSTALLER';
const PM_DOCS_URL = 'https://github.com/ivan-hc/AM#installation';

const safe = (fn, fallback) => typeof fn === 'function' ? fn : fallback;

const getThemePref = safe(appPreferences.getThemePref, () => {
  try { return localStorage.getItem('themePref') || 'system'; }
  catch (_) { return 'system'; }
});
const applyThemePreference = safe(appPreferences.applyThemePreference, () => {
  const pref = getThemePref();
  const root = document.documentElement;
  root.classList.remove('theme-light','theme-dark');
  if (pref === 'light') root.classList.add('theme-light');
  else if (pref === 'dark') root.classList.add('theme-dark');
});
const loadOpenExternalPref = safe(appPreferences.loadOpenExternalPref, () => {
  try { return localStorage.getItem('openExternalLinks') === '1'; }
  catch (_) { return false; }
});
const saveOpenExternalPref = safe(appPreferences.saveOpenExternalPref, (val) => {
  try { localStorage.setItem('openExternalLinks', val ? '1' : '0'); }
  catch (_) {}
});
const getIconUrl = safe(appUtils.getIconUrl, name => `appicon://${name}.png`);
const debounce = safe(appUtils.debounce, (fn, delay) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
});
const prettifyAppName = safe(appUtils.prettifyAppName, name => name || '');

function getThemeVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
  } catch (_) {
    return fallback;
  }
}


function applyViewModeClass() {
  document.body.classList.remove('view-list','view-grid','view-icons','view-cards');
  if (state.viewMode === 'list') document.body.classList.add('view-list');
  else if (state.viewMode === 'icons') document.body.classList.add('view-icons');
  else if (state.viewMode === 'cards') document.body.classList.add('view-cards');
  else document.body.classList.add('view-grid');
  try { refreshAllSandboxBadges(); } catch (_) {}
}

let appListVirtual = [];
let currentEndVirtual = VISIBLE_COUNT;
let lastTileObserver = null;

let setAppListImpl = function(list) {
  appListVirtual = list;
  currentEndVirtual = VISIBLE_COUNT;
  if (scrollShell) scrollShell.scrollTop = 0;
  renderVirtualList();
};

function setAppList(list) {
  return setAppListImpl(list);
}

function renderVirtualList() {
  if (!appsDiv) return;
  appsDiv.innerHTML = '';
  const useSkeleton = appListVirtual.length > 50;
  if (useSkeleton) {
    const viewClass = 'view-' + (state.viewMode || 'grid');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < appListVirtual.length; i++) {
      const skel = document.createElement('div');
      skel.className = 'app-tile-skeleton ' + viewClass;
      skel.dataset.index = i;
      fragment.appendChild(skel);
    }
    appsDiv.appendChild(fragment);
    if (window.skeletonObserver) window.skeletonObserver.disconnect();
    window.skeletonObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (entry.target.classList.contains('hydrated')) return;
        const idx = parseInt(entry.target.dataset.index, 10);
        if (Number.isNaN(idx)) return;
        const realTile = buildTile(appListVirtual[idx]);
        realTile.classList.add('hydrated');
        entry.target.replaceWith(realTile);
        try { window.skeletonObserver.observe(realTile); } catch (_) {}
      });
    }, { root: scrollShell, threshold: 0.1 });
    const tiles = appsDiv.querySelectorAll('.app-tile-skeleton');
    tiles.forEach(tile => window.skeletonObserver && window.skeletonObserver.observe(tile));
    return;
  }

  const end = Math.min(currentEndVirtual, appListVirtual.length);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < end; i++) {
    fragment.appendChild(buildTile(appListVirtual[i]));
  }
  appsDiv.appendChild(fragment);
  if (lastTileObserver) lastTileObserver.disconnect();
  if (end < appListVirtual.length) {
    const tiles = appsDiv.querySelectorAll('.app-tile');
    const toObserve = Array.from(tiles).slice(-3);
    if (toObserve.length) {
      try {
        lastTileObserver = new IntersectionObserver((entries) => {
          if (entries.some(e => e.isIntersecting)) {
            lastTileObserver.disconnect();
            currentEndVirtual = Math.min(currentEndVirtual + VISIBLE_COUNT, appListVirtual.length);
            renderVirtualList();
          }
        }, { root: scrollShell, threshold: 0.1 });
        toObserve.forEach(tile => lastTileObserver.observe(tile));
      } catch(_) {}
    }
  }
  // --- Spacer for consistent scroll ---
  let spacer = appsDiv.querySelector('.app-list-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'app-list-spacer';
    spacer.style.width = '100%';
    spacer.style.gridColumn = '1 / -1';
    spacer.style.pointerEvents = 'none';
    appsDiv.appendChild(spacer);
  }
  // Calculate average tile height (over the displayed batch)
  let tileHeight = 120; // default fallback
  const firstTile = appsDiv.querySelector('.app-tile');
  if (firstTile) {
    tileHeight = firstTile.offsetHeight || tileHeight;
  }
  const missing = appListVirtual.length - end;
  spacer.style.height = (missing > 0 ? (missing * tileHeight) : 0) + 'px';
  // --- Fin spacer ---
}


// --- Sudo password prompt integration ---
if (window.electronAPI && window.electronAPI.onPasswordPrompt) {
  window.electronAPI.onPasswordPrompt(async (data) => {
    if (!window.ui || !window.ui.passwordPrompt || typeof window.ui.passwordPrompt.promptPassword !== 'function') return;
    const password = await window.ui.passwordPrompt.promptPassword();
    window.electronAPI.sendPassword({ id: data && data.id, password });
  });
}
// ...existing code...


function createInstalledSection(sectionKey) {
  const section = document.createElement('div');
  section.className = 'installed-section';
  const title = document.createElement('h4');
  const keyMap = {
    sandboxed: 'installed.section.sandboxed',
    others: 'installed.section.others',
    system: 'installed.section.system',
    user: 'installed.section.user'
  };
  title.textContent = t(keyMap[sectionKey] || 'installed.section.others');
  section.appendChild(title);
  return section;
}

let tileRenderCount = 0;

function buildTile(item){
  if (item && item.__section) {
    return createInstalledSection(item.__section);
  }
  const { name, installed, desc } = typeof item === 'string' ? { name: item, installed: false, desc: null } : item;
  const scope = item?.scope || null;
  const appId = scope ? name + '|' + scope : name;
  const label = prettifyAppName(name);
  const version = item?.version ? String(item.version) : null;
  let shortDesc = desc || (installed ? t('installed.localDesc') : t('installed.availableDesc'));
  if (shortDesc.length > 110) shortDesc = shortDesc.slice(0,107).trim() + '…';
  let actionsHTML = '';
  if (state.viewMode === 'list') {
    if (!installed) {
      let btnLabel = t('details.install');
      let actionAttr = 'install';
      let disabledAttr = '';
      const activeSess = installerApi?.getActiveInstallSession?.() || activeInstallSession;
      if (activeSess.id && !activeSess.done && activeSess.name === name){
        btnLabel = t('install.listViewCancel');
        actionAttr = 'cancel-install';
      } else {
        const pos = getQueuePosition(name);
        if (pos !== -1) { btnLabel = t('install.queued', { pos }); actionAttr='remove-queue'; }
      }
      actionsHTML = `<div class="actions"><button class="inline-action install" data-action="${actionAttr}" data-app="${name}"${disabledAttr}>${btnLabel}</button></div>`;
    } else {
      actionsHTML = `<div class="actions">`;
      actionsHTML += `<button class="inline-action uninstall" data-action="uninstall" data-app="${name}">${t('details.uninstall')}</button>`;
      actionsHTML += `</div>`;
    }
  }

  let stateBadge = '';
  if (state.viewMode !== 'list' && !installed) {
    const activeSess2 = installerApi?.getActiveInstallSession?.() || activeInstallSession;
    if (activeSess2.id && !activeSess2.done && activeSess2.name === name) {
      stateBadge = ' <span class="install-state-badge installing" data-state="installing">'+t('install.status')+'<button class="queue-remove-badge inline-action" data-action="cancel-install" data-app="'+name+'" title="'+t('install.cancelShort')+'" aria-label="'+t('install.cancelShort')+'">✕</button></span>';
    } else {
      const pos = getQueuePosition(name);
      if (pos !== -1) stateBadge = ' <span class="install-state-badge queued" data-state="queued">'+t('install.queued', { pos }).replace(/ ✕$/, '')+'<button class="queue-remove-badge inline-action" data-action="remove-queue" data-app="'+name+'" title="'+t('queue.removeBadge')+'" aria-label="'+t('queue.removeBadgeAria')+'">✕</button></span>';
    }
  }
  const tile = document.createElement('div');
  tile.className = 'app-tile';
  tile.setAttribute('data-app', appId);
  const isSandboxedTile = installed && isAppSandboxed(name);
  const badgeSymbol = isSandboxedTile ? '🔒' : '✓';
  const badgeText = t('installed.badge');
  const badgeHTML = installed
    ? `<span class="installed-badge" aria-label="${badgeText}" title="${badgeText}" style="position:absolute;top:2px;right:2px;">${badgeSymbol}</span>`
    : '';
  tile.innerHTML = `
    <div class="tile-icon" style="position:relative;display:inline-block;">
      <img data-src="${getIconUrl(name)}" alt="${label}" loading="lazy" decoding="async"${state.viewMode==='icons' ? ' class="icon-mode"' : ''} onerror="this.onerror=null; this.src='https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/${name}.png'; setTimeout(()=>{ if(this.naturalWidth<=1) this.src='https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; },1200);">
      ${badgeHTML}
    </div>
    <div class="tile-text">
      <div class="tile-name">${label}${version? ` <span class\"tile-version\">${version}</span>`: ''}${stateBadge}</div>
      <div class="tile-short">${shortDesc}</div>
    </div>
    ${actionsHTML ? actionsHTML : ''}`;

  applySandboxBadgeToIcon(tile.querySelector('.tile-icon'), isAppSandboxed(name));

  const img = tile.querySelector('img');
  if (img) {
    const iconUrl = img.getAttribute('data-src');
    if (iconUrl && loadedIcons.has(iconUrl)) {
      img.src = iconUrl;
      img.removeAttribute('data-src');
    } else if (iconUrl) {
      img.classList.add('img-loading');
      img.addEventListener('load', () => {
        img.classList.remove('img-loading');
        loadedIcons.add(iconUrl);
      }, { once:true });
      img.addEventListener('error', () => { img.classList.remove('img-loading'); }, { once:true });
      if (iconObserver) iconObserver.observe(img); else { img.src = iconUrl; img.removeAttribute('data-src'); }
      if (tileRenderCount < 48) {
        try { img.setAttribute('fetchpriority','high'); } catch(_){ }
      }
      tileRenderCount++;
    }
  }
  tile.tabIndex = 0; // keyboard navigation
  tile.addEventListener('click', (ev) => {
    if (ev.target.closest('.inline-action')) return; // don't open if clicking an action button
    showDetails(appId);
  });
  tile.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (ev.target.closest('.inline-action')) return;
      ev.preventDefault();
      showDetails(appId);
    }
  });
  return tile;
}
// ...existing code...

// Toggle global animations based on state
function setAnimationsActive(active) {
  document.body.classList.toggle('animations-active', !!active);
}

// Disable animations at startup
setAnimationsActive(false);

// Global animations
// ...existing code...


// Window controls
document.addEventListener('click', (e) => {
  const b = e.target.closest('.win-btn');
  if (!b) return;
  const act = b.getAttribute('data-action');
  if (!act) return;
  try { window.electronAPI.windowControl(act); } catch(_) {}
});

// Classe d'environnement de bureau
(() => {
  try {
    const de = (window.electronAPI?.desktopEnv && window.electronAPI.desktopEnv()) || 'generic';
    document.documentElement.classList.add('de-' + de);
  } catch(_) {}
})();

const modeMenuBtn = document.getElementById('modeMenuBtn');
const modeMenu = document.getElementById('modeMenu');
const modeOptions = Array.from(document.querySelectorAll('.mode-option'));
const disableGpuCheckbox = document.getElementById('disableGpuCheckbox');
const state = {
  allApps: [], // [{name, installed}]
  filtered: [],
  activeCategory: 'all',
  viewMode: localStorage.getItem('viewMode') || 'grid',
  lastRenderKey: '',
  currentDetailsApp: null,
  renderVersion: 0,
  lastScrollY: 0,
  installed: new Set(), // set of installed names (lowercase)
  bundleChildOf: {}    // { childName: parentName } – populated after loadApps
};

let virtualListApi = null;
let pmPopupCtrl = null;
let pmPopupStatus = null;
let pmAutoInstallRunning = false;

const toast = document.getElementById('toast');
const toastFallbackApi = (() => {
  let hideTimer = null;
  function fallbackShow(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      toast.hidden = true;
      hideTimer = null;
    }, 2300);
  }
  function fallbackHide() {
    if (!toast) return;
    toast.hidden = true;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }
  return { showToast: fallbackShow, hideToast: fallbackHide };
})();
const toastModule = typeof window.ui?.toast?.init === 'function'
  ? window.ui.toast.init({ element: toast, duration: 2300 })
  : null;
const showToast = toastModule?.showToast || toastFallbackApi.showToast;

const defaultApplySearch = () => {};
let applySearch = defaultApplySearch;
let scheduledInstalledResort = null;

function scheduleInstalledResort() {
  if (state.activeCategory !== 'installed') return;
  if (scheduledInstalledResort !== null) return;
  scheduledInstalledResort = setTimeout(() => {
    scheduledInstalledResort = null;
    if (state.activeCategory !== 'installed') return;
    try {
      applySearch();
    } catch (_) {}
  }, 150);
}

// --- (Re)add view mode change handling ---
function updateModeMenuUI() {
  // Update pressed states
  modeOptions.forEach(opt => {
    const m = opt.getAttribute('data-mode');
    const active = m === state.viewMode;
    opt.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  // Change main button icon based on mode
  const iconMap = { grid:'▦', list:'≣', icons:'◻︎', cards:'🂠' };
  if (modeMenuBtn) modeMenuBtn.textContent = iconMap[state.viewMode] || '▦';
  // Update body class based on mode
  applyViewModeClass();
}

if (modeMenuBtn && modeMenu) {
  modeMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !modeMenu.hidden;
    if (open) {
      modeMenu.hidden = true;
      modeMenuBtn.setAttribute('aria-expanded','false');
    } else {
      updateModeMenuUI();
      modeMenu.hidden = false;
      modeMenuBtn.setAttribute('aria-expanded','true');
    }
  });
  document.addEventListener('click', (ev) => {
    if (modeMenu.hidden) return;
    if (ev.target === modeMenu || modeMenu.contains(ev.target) || ev.target === modeMenuBtn) return;
    modeMenu.hidden = true;
    modeMenuBtn.setAttribute('aria-expanded','false');
  });
  // Added: handle click on view mode options
  modeOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      const mode = opt.getAttribute('data-mode');
      if (!mode) return;
      state.viewMode = mode;
      localStorage.setItem('viewMode', mode);
      updateModeMenuUI();
      modeMenu.hidden = true;
      modeMenuBtn.setAttribute('aria-expanded','false');
    });
  });
}

updateModeMenuUI();

const appsDiv = document.getElementById('apps');

// --- DOM references restored after categories cleanup ---
const appDetailsSection = document.getElementById('appDetails');
const backToListBtn = document.getElementById('backToListBtn');
const detailsIcon = document.getElementById('detailsIcon');
const detailsName = document.getElementById('detailsName');
const detailsLong = document.getElementById('detailsLong');
const detailsInstallBtn = document.getElementById('detailsInstallBtn');
const detailsUninstallBtn = document.getElementById('detailsUninstallBtn');
const detailsGallery = document.getElementById('detailsGallery');
const detailsGalleryInner = document.getElementById('detailsGalleryInner');
// Streaming install elements
// Gallery removed: all images are in the description
const installStream = document.getElementById('installStream');
const installStreamStatus = document.getElementById('installStreamStatus');

const installStreamElapsed = document.getElementById('installStreamElapsed');
// Log, line counter and log button removed from UI
const installProgressBar = document.getElementById('installStreamProgressBar');
const installProgressPercentLabel = document.getElementById('installStreamProgressPercent');
const installProgressEtaLabel = document.getElementById('installStreamEta');

// stripAnsiSequences from updates feature module (fallback if module not loaded)
const stripAnsiSequences = window.features?.updates?.stripAnsiSequences || function(text = '') {
  return (text || '').replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '');
};

// Sandbox feature
const sandboxApi = (function initSandbox() {
  const mod = window.features?.sandbox;
  if (typeof mod?.init !== 'function') return null;
  return mod.init({
    dom: {
      sandboxOpenBtn: document.getElementById('sandboxOpenBtn'),
      sandboxButtonStatus: document.getElementById('sandboxButtonStatus'),
      sandboxModal: document.getElementById('sandboxModal'),
      sandboxCloseBtn: document.getElementById('sandboxCloseBtn'),
      sandboxCard: document.getElementById('sandboxCard'),
      sandboxStatusBadge: document.getElementById('sandboxStatusBadge'),
      sandboxRefreshBtn: document.getElementById('sandboxRefreshBtn'),
      sandboxConfigureBtn: document.getElementById('sandboxConfigureBtn'),
      sandboxDisableBtn: document.getElementById('sandboxDisableBtn'),
      sandboxDepsAlert: document.getElementById('sandboxDepsAlert'),
      sandboxInstallDepsBtn: document.getElementById('sandboxInstallDepsBtn'),
      sandboxUnavailable: document.getElementById('sandboxUnavailable'),
      sandboxInstallAppBtn: document.getElementById('sandboxInstallAppBtn'),
      sandboxForm: document.getElementById('sandboxForm'),
      sandboxCustomPathInput: document.getElementById('sandboxCustomPath'),
      sandboxLog: document.getElementById('sandboxLog'),
      sandboxSummary: document.getElementById('sandboxSummary'),
      sandboxSummaryList: document.getElementById('sandboxSummaryList'),
      sandboxSummaryEmpty: document.getElementById('sandboxSummaryEmpty'),
      sandboxLogSection: document.getElementById('sandboxLogSection'),
      sandboxLogToggle: document.getElementById('sandboxLogToggle'),
      nonAppimageModal: document.getElementById('nonAppimageModal'),
      nonAppimageTitle: document.getElementById('nonAppimageTitle'),
      nonAppimageCloseBtn: document.getElementById('nonAppimageClose'),
      nonAppimageDismissBtn: document.getElementById('nonAppimageDismiss'),
      nonAppimageMessage: document.getElementById('nonAppimageMessage')
    },
    state,
    electronAPI: window.electronAPI,
    t,
    showToast,
    stripAnsiSequences: window.features?.updates?.stripAnsiSequences,
    prettifyAppName,
    scheduleInstalledResort,
    loadApps,
    openActionConfirm: window.ui.confirmModal.openActionConfirm,
    getActiveInstallSession: () => installerApi?.getActiveInstallSession?.() || activeInstallSession,
    getStateInstalled: () => state.installed,
    getAllApps: () => state.allApps,
    getDetailsApp: () => state.currentDetailsApp
  });
})();

// Sandbox wrapper functions (auto-generated from API)
['handleSandboxShow','_setAppSandboxState','applySandboxBadgeToIcon','applyDetailsSandboxBadge','showNonAppimageModal'].forEach(fn => {
  window[fn] = (...args) => sandboxApi?.[fn]?.(...args);
});
['handleSandboxExit','refreshAllSandboxBadges','cleanupSandboxCache','scheduleSandboxStateSweep','renderSandboxCard','resetSandboxLog'].forEach(fn => {
  window[fn] = () => sandboxApi?.[fn]?.();
});
function isAppSandboxed(appName) { return sandboxApi?.isAppSandboxed?.(appName) ?? false; }
const sandboxState = sandboxApi?.sandboxState || { currentApp: null, info: null, depsReady: false, busy: false, pendingAction: null, logBuffer: '', supported: true };
const sandboxedApps = sandboxApi?.sandboxedApps || new Map();

// Current install session memory (managed by installer module)
let installScope = 'user';

const installerApi = (function initInstaller() {
  const mod = window.features?.installer;
  if (typeof mod?.init !== 'function') return null;
  return mod.init({
    dom: {
      installStream, installStreamElapsed, installProgressBar,
      installProgressPercentLabel, installProgressEtaLabel, installStreamStatus,
      detailsInstallBtn, detailsUninstallBtn, detailsName, detailsIcon,
      installScopeBtn: document.getElementById('installScopeBtn')
    },
    state,
    t,
    showToast,
    prettifyAppName,
    getIconUrl,
    loadApps,
    applySearch,
    showDetails,
    rerenderActiveCategory,
    electronAPI: window.electronAPI,
    stripAnsiSequences,
    updateQueueIndicators: () => { if (typeof updateQueueIndicators === 'function') updateQueueIndicators(); },
    isAppSandboxed,
    applySandboxBadgeToIcon,
    openActionConfirm: window.ui.confirmModal.openActionConfirm,
    setAppList,
    scrollShell,
    appsContainer: appsDiv
  });
})();

// Wrapper functions to maintain backward compatibility
function getQueuePosition(name) { return installerApi?.getQueuePosition?.(name) ?? -1; }
function removeFromQueue(name) { return installerApi?.removeFromQueue?.(name); }
function refreshAllInstallButtons() { return installerApi?.refreshAllInstallButtons?.(); }
function cancelActiveInstall(name) { return installerApi?.cancelActiveInstall?.(name); }
function updateScopeButtonUI() { return installerApi?.updateScopeButtonUI?.(); }
function enqueueInstall(name, scope) { return installerApi?.enqueueInstall?.(name, scope); }

let detailsApi = null;

function ensureDetailsApi() {
  if (detailsApi) return detailsApi;
  const initFn = window.features?.details?.init;
  if (typeof initFn !== 'function') return null;
  detailsApi = initFn({
    state,
    activeInstallSession: installerApi?.getActiveInstallSession?.() || { id: null, name: null, start: 0, lines: [], done: false, success: null, code: null },
    getIconUrl,
    showToast,
    translate: t,
    enqueueInstall,
    getInstallScope: () => installerApi?.getInstallScope?.() ?? installScope,
    setInstallScope: (s) => { if (installerApi) installerApi.setInstallScope?.(s); else installScope = s; },
    removeFromQueue,
    refreshAllInstallButtons,
    setAppList,
    loadApps,
    applySearch,
    openActionConfirm: window.ui.confirmModal.openActionConfirm,
    rerenderActiveCategory,
    scrollShell,
    appsContainer: appsDiv,
    getActiveInstallSession: () => installerApi?.getActiveInstallSession?.() || activeInstallSession,
    applyDetailsSandboxBadge,
    updateScopeButtonUI,
    onExitDetails: () => { installerApi?.setDetailScopeOverride?.(null); },
    elements: {
      appDetailsSection,
      backToListBtn,
      detailsIcon,
      detailsName,
      detailsLong,
      detailsInstallBtn,
      detailsUninstallBtn,
      installStream,
      installStreamElapsed,
      installProgressBar,
      installProgressPercentLabel,
      installProgressEtaLabel
    }
  }) || null;
  return detailsApi;
}
let syncBtn = null;
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const openExternalCheckbox = document.getElementById('openExternalLinksCheckbox');
const purgeIconsBtn = document.getElementById('purgeIconsBtn');
const purgeIconsResult = document.getElementById('purgeIconsResult');
const tabs = document.querySelectorAll('.tab');
// Updates feature state (managed by module)
let updateInProgress = false;
const updatesPanel = document.getElementById('updatesPanel');
const advancedPanel = document.getElementById('advancedPanel');
const runUpdatesBtn = document.getElementById('runUpdatesBtn');
const updateSpinner = document.getElementById('updateSpinner');
const updateResult = document.getElementById('updateResult');
const updateFinalMessage = document.getElementById('updateFinalMessage');
const updatedAppsIcons = document.getElementById('updatedAppsIcons');
const changedScriptsResult = document.getElementById('changedScriptsResult');
const changedScriptsFinalMessage = document.getElementById('changedScriptsFinalMessage');
const changedScriptsIcons = document.getElementById('changedScriptsIcons');
const reinstallChangedBtn = document.getElementById('reinstallChangedBtn');
const updatesTerminalWrap = document.getElementById('updatesTerminalWrap');
const updatesTerminalNode = document.getElementById('updatesTerminal');
const updatesToggleBtn = document.getElementById('updatesToggleBtn');
const installedCountEl = document.getElementById('installedCount');

// Updates feature
const _updatesApi = (function initUpdates() {
  const mod = window.features?.updates;
  if (typeof mod?.init !== 'function') return null;
  return mod.init({
    dom: {
      runUpdatesBtn, updateSpinner, updateResult, updateFinalMessage,
      updatedAppsIcons, changedScriptsResult, changedScriptsFinalMessage,
      changedScriptsIcons, reinstallChangedBtn,
      updatesTerminalWrap, updatesTerminalNode, updatesToggleBtn
    },
    isUpdateInProgress: () => updateInProgress,
    setUpdateInProgress: (val) => { updateInProgress = val; },
    statePmName: () => state.pmName,
    getAllApps: () => state.allApps,
    t,
    showToast,
    prettifyAppName,
    getIconUrl,
    loadApps,
    applySearch,
    electronAPI: window.electronAPI,
    categories: window.categories
  });
})();

function setUpdateSpinnerBusy(val) { _updatesApi?.setSpinnerBusy?.(val); }
function updateUpdatesToggleUi() { _updatesApi?.refreshToggleUi?.(); }

function rerenderActiveCategory() {
  if (applySearch !== defaultApplySearch) {
    try { applySearch(); return; }
    catch (err) { console.error('applySearch failed, falling back to direct render', err); }
  }
  const panelConf = {
    updates: { apps: false, panel: updatesPanel, other: advancedPanel },
    advanced: { apps: false, panel: advancedPanel, other: updatesPanel }
  };
  const cfg = panelConf[state.activeCategory];
  if (cfg) {
    if (appsDiv) { appsDiv.innerHTML = ''; appsDiv.hidden = true; }
    if (cfg.panel) cfg.panel.hidden = false;
    if (cfg.other) cfg.other.hidden = true;
    return;
  }
  setAppList(state.filtered);
  refreshAllInstallButtons();
  if (appsDiv) appsDiv.hidden = false;
  if (updatesPanel) updatesPanel.hidden = true;
  if (advancedPanel) advancedPanel.hidden = true;
}

const handleIconCachePurged = () => {
  document.querySelectorAll('.app-tile img').forEach(img => {
    if (img.src && img.src.startsWith('appicon://')) {
      const original = img.src;
      img.removeAttribute('src');
      img.setAttribute('data-src', original);
      if (virtualListApi?.observeIcon) {
        virtualListApi.observeIcon(img, original);
      } else if (iconObserver) {
        iconObserver.observe(img);
      }
    }
  });
};

const searchFeature = window.features?.search?.init?.({
  state,
  searchInput: document.getElementById('searchInput'),
  tabs: Array.from(tabs),
  setAppList,
  updatesPanel,
  advancedPanel,
  appsContainer: appsDiv,
  refreshInstallUi: () => refreshAllInstallButtons(),
  categoriesApi: window.categories,
  translate: t,
  iconMap: CATEGORY_ICON_MAP,
  isSandboxed: isAppSandboxed,
  exitDetailsView,
  debounce
});
if (searchFeature && typeof searchFeature.applySearch === 'function') {
  applySearch = searchFeature.applySearch;
}

const translations = window.translations || {};

// Initialize featured banner (compact) feature
// initialize featured with empty items to avoid showing the static fallback briefly at startup
const featuredFeature = window.features?.featured?.init?.({
  container: document.getElementById('featuredBanner'),
  items: [],
  state: state
});
// defensive initial visibility: show only on Applications tab and when not in details view
const featuredBannerInitEl = document.getElementById('featuredBanner');
if (featuredBannerInitEl) featuredBannerInitEl.hidden = !(state.activeCategory === 'all') || document.body.classList.contains('details-mode');

// wrap existing applySearch (if any) so featured refreshes after searches
if (typeof applySearch === 'function') {
  const __origApplySearch = applySearch;
  applySearch = () => { __origApplySearch(); try { setTimeout(() => { if (featuredFeature && typeof featuredFeature.updateFromState === 'function') featuredFeature.updateFromState(); }, 0); } catch(_) {} };
}

// Listen for category override events triggered by the categories dropdown
try { document.addEventListener('category.override', () => { try { setTimeout(() => { if (featuredFeature && typeof featuredFeature.updateFromState === 'function') featuredFeature.updateFromState(); }, 0); } catch(_){} }); } catch(_) {}

// initial population of the banner
if (featuredFeature && typeof featuredFeature.updateFromState === 'function') featuredFeature.updateFromState();

const descriptionCache = new Map();
// --- Multilingual support ---
function getSystemLang() {
  try {
    const available = (window.translations && Object.keys(window.translations).map(k => String(k).toLowerCase())) || ['en'];
    const sys = (window.electronAPI && typeof window.electronAPI.systemLocale === 'function') ? window.electronAPI.systemLocale() : null;
    const envLang = (window.electronAPI && typeof window.electronAPI.envLang === 'function') ? window.electronAPI.envLang() : null;
    const navList = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || navigator.userLanguage || null];
    const intl = (Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().locale : null;

    const candidates = [sys, envLang, ...(navList || []), intl].filter(Boolean).map(s => String(s).toLowerCase());

    for (const cand of candidates) {
      // exact match (fr-ca) or normalized
      if (available.includes(cand)) return cand.split(/[-_.]/)[0];
      // try base code (fr for fr-CA)
      const base = cand.split(/[-_.]/)[0];
      if (available.includes(base)) return base;
    }

    // last resort: pick first available 'preferred' (en if present)
    if (available.includes('en')) return 'en';
    return available[0] || 'en';
  } catch(_) { return 'en'; }
}

function getLangPref() {
  const pref = localStorage.getItem('langPref') || 'auto';
  if (pref === 'auto') return getSystemLang();
  return pref;
}

function t(key) {
  const lang = getLangPref();
  let str = (translations[lang] && translations[lang][key]) || (translations['en'] && translations['en'][key]) || (translations['fr'] && translations['fr'][key]) || key;
  if (arguments.length > 1 && typeof str === 'string') {
    const vars = arguments[1];
    if (vars && typeof vars === 'object') {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(new RegExp(`#?\{${k}\}`, 'g'), v);
      });
    }
  }
  return str;
}
window.ui.confirmModal?.init({ t: t });
window.ui.lightbox?.init();

function setPmPopupStatus(key, vars) {
  if (!pmPopupStatus) return;
  const text = t(key, vars);
  pmPopupStatus.textContent = typeof text === 'string' ? text : key;
}

function togglePmPopupBusy(isBusy) {
  if (!pmPopupCtrl) return;
  const buttons = [pmPopupCtrl.autoBtn, pmPopupCtrl.manualBtn].filter(Boolean);
  buttons.forEach((btn) => { btn.disabled = !!isBusy; });
  if (pmPopupCtrl.autoBtn) {
    pmPopupCtrl.autoBtn.classList.toggle('is-loading', !!isBusy);
  }
  if (!isBusy && pmPopupCtrl.manualBtn) {
    pmPopupCtrl.manualBtn.classList.remove('is-loading');
  }
}

async function openPmDocs() {
  try {
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
      const res = await window.electronAPI.openExternal(PM_DOCS_URL);
      if (res && res.ok === false) throw new Error(res.error || 'open failed');
    } else {
      window.open(PM_DOCS_URL, '_blank', 'noopener,noreferrer');
    }
  } catch (_) {
    window.open(PM_DOCS_URL, '_blank', 'noopener,noreferrer');
  }
}

async function copyTextToClipboard(text) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); } catch (_) {}
}

async function runAutoInstallAppMan() {
  if (pmAutoInstallRunning) return;
  const api = window.electronAPI;
  if (!api || typeof api.installAppManAuto !== 'function') {
    setPmPopupStatus('missingPm.auto.error', { msg: 'IPC unavailable' });
    return;
  }
  pmAutoInstallRunning = true;
  togglePmPopupBusy(true);
  setPmPopupStatus('missingPm.auto.installing');
  try {
    const res = await api.installAppManAuto();
    if (!res || res.ok !== true) {
      throw new Error(res && res.error ? res.error : 'install failed');
    }
    setPmPopupStatus('missingPm.auto.success');
    showToast(t('missingPm.auto.success'));
    await loadApps();
    hideMissingPmPopup();
  } catch (err) {
    console.error('Auto AppMan install failed', err);
    setPmPopupStatus('missingPm.auto.error', { msg: err?.message || 'error' });
    showToast(t('missingPm.auto.errorShort'));
  } finally {
    togglePmPopupBusy(false);
    pmAutoInstallRunning = false;
  }
}

async function handleManualInstallClick() {
  const command = AM_INSTALLER_COMMAND;
  try {
    await copyTextToClipboard(command);
    showToast(t('missingPm.manual.copied'));
    setPmPopupStatus('missingPm.manual.copied');

    // Show a confirmation dialog instructing user what to do next
    const confirmed = await window.ui.confirmModal.openActionConfirm({
      message: t('missingPm.manual.confirmDesc'),
      okLabel: t('missingPm.manual.ok'),
      intent: 'install'
    });
    if (confirmed) {
      // close the missingPm popup and exit the app so user can follow instructions
      hideMissingPmPopup();
      if (window.electronAPI?.closeWindow) {
        window.electronAPI.closeWindow();
      }
    } else {
      // User cancelled: keep popup open (return to choices)
      setPmPopupStatus('missingPm.popup.statusIdle');
      setTimeout(() => {
        const ctrl = ensureMissingPmPopup();
        ctrl?.autoBtn?.focus?.();
      }, 60);
    }
  } catch (err) {
    console.error('Manual install copy error', err);
    showToast(t('missingPm.manual.copyError'));
    setPmPopupStatus('missingPm.manual.copyError');
  }
}

function ensureMissingPmPopup() {
  if (pmPopupCtrl) return pmPopupCtrl;
  if (!document?.body) return null;
  const layer = document.createElement('div');
  layer.className = 'pm-popup-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `
    <section class="pm-popup-panel" role="dialog" aria-modal="true">
      <button class="pm-popup-close" type="button" data-action="dismiss" aria-label="${t('modal.close') || 'Close'}">×</button>
      <p class="pm-popup-desc pm-popup-desc--intro">${t('missingPm.popup.desc')}</p>
      <div class="pm-popup-options">
        <article class="pm-popup-option pm-popup-option--auto">
          <div>
            <h3>${t('missingPm.popup.autoTitle')}</h3>
            <p>${t('missingPm.popup.autoDesc')}</p>
          </div>
          <button type="button" class="btn btn-primary" data-action="auto-install">${t('missingPm.popup.autoCta')}</button>
        </article>
        <article class="pm-popup-option pm-popup-option--manual">
          <div>
            <h3>${t('missingPm.popup.manualTitle')}</h3>
            <p>${t('missingPm.popup.manualDesc')}</p>
          </div>
          <button type="button" class="btn btn-outline" data-action="manual-install">${t('missingPm.popup.manualCta')}</button>
        </article>
      </div>
      <footer class="pm-popup-footer">
        <button type="button" class="btn-link" data-action="docs-link">${t('missingPm.popup.docs')}</button>
        <span class="pm-popup-status" data-status>${t('missingPm.popup.statusIdle')}</span>
      </footer>
    </section>`;
  document.body.appendChild(layer);
  const autoBtn = layer.querySelector('[data-action="auto-install"]');
  const manualBtn = layer.querySelector('[data-action="manual-install"]');
  const docsBtn = layer.querySelector('[data-action="docs-link"]');
  const dismissBtn = layer.querySelector('[data-action="dismiss"]');
  pmPopupStatus = layer.querySelector('[data-status]');

  layer.addEventListener('click', (ev) => {
    if (ev.target === layer) hideMissingPmPopup();
  });

  autoBtn?.addEventListener('click', runAutoInstallAppMan);
  manualBtn?.addEventListener('click', () => {
    handleManualInstallClick();
  });
  docsBtn?.addEventListener('click', openPmDocs);
  dismissBtn?.addEventListener('click', hideMissingPmPopup);

  pmPopupCtrl = {
    layer,
    autoBtn,
    manualBtn,
    show() {
      layer.classList.add('open');
      layer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('pm-popup-open');
      togglePmPopupBusy(false);
      setPmPopupStatus('missingPm.popup.statusIdle');
      setTimeout(() => autoBtn?.focus(), 60);
    },
    hide() {
      layer.classList.remove('open');
      layer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('pm-popup-open');
    }
  };

  return pmPopupCtrl;
}

function showMissingPmPopup() {
  const ctrl = ensureMissingPmPopup();
  ctrl?.show();
}

function hideMissingPmPopup() {
  if (!pmPopupCtrl) return;
  pmPopupCtrl.hide();
}

let bothPmsPopupCtrl = null;
function showBothPmsPopup(show) {
  if (!show) {
    if (bothPmsPopupCtrl) {
      bothPmsPopupCtrl.hide();
      bothPmsPopupCtrl = null;
    }
    return;
  }
  if (bothPmsPopupCtrl) { bothPmsPopupCtrl.show(); return; }
  if (!document?.body) return;
  const layer = document.createElement('div');
  layer.className = 'pm-popup-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `
    <section class="pm-popup-panel" role="dialog" aria-modal="true">
      <button class="pm-popup-close" type="button" data-action="dismiss" aria-label="${t('modal.close') || 'Close'}">×</button>
      <p class="pm-popup-desc pm-popup-desc--intro">${t('bothPms.popup.desc')}</p>
      <div class="pm-popup-options">
        <article class="pm-popup-option pm-popup-option--manual">
          <div>
            <h3>${t('bothPms.popup.removeTitle')}</h3>
            <p>${t('bothPms.popup.removeDesc')}</p>
          </div>
        </article>
      </div>
      <footer class="pm-popup-footer">
        <button type="button" class="btn-link" data-action="docs-link">${t('missingPm.popup.docs')}</button>
        <span class="pm-popup-status" data-status>${t('bothPms.popup.statusIdle')}</span>
      </footer>
    </section>`;
  document.body.appendChild(layer);
  const dismissBtn = layer.querySelector('[data-action="dismiss"]');
  const docsBtn = layer.querySelector('[data-action="docs-link"]');
  const statusEl = layer.querySelector('[data-status]');

  layer.addEventListener('click', (ev) => {
    if (ev.target === layer) { bothPmsPopupCtrl?.hide(); bothPmsPopupCtrl = null; }
  });
  dismissBtn?.addEventListener('click', () => { bothPmsPopupCtrl?.hide(); bothPmsPopupCtrl = null; });
  docsBtn?.addEventListener('click', openPmDocs);

  bothPmsPopupCtrl = {
    layer,
    show() {
      layer.classList.add('open');
      layer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('pm-popup-open');
      if (statusEl) statusEl.textContent = t('bothPms.popup.statusIdle');
      setTimeout(() => dismissBtn?.focus(), 60);
    },
    hide() {
      layer.classList.remove('open');
      layer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('pm-popup-open');
    }
  };
  bothPmsPopupCtrl.show();
}

function applyTranslations() {
  const popupWasOpen = !!(pmPopupCtrl?.layer && pmPopupCtrl.layer.classList.contains('open'));
  if (pmPopupCtrl?.layer) {
    try { pmPopupCtrl.layer.remove(); } catch(_) {}
    document.body?.classList.remove('pm-popup-open');
    pmPopupCtrl = null;
    pmPopupStatus = null;
  }
  // Rebuild both-PMs popup if it was open
  if (bothPmsPopupCtrl) {
    const wasOpen = bothPmsPopupCtrl.layer.classList.contains('open');
    try { bothPmsPopupCtrl.layer.remove(); } catch(_) {}
    bothPmsPopupCtrl = null;
    if (wasOpen) showBothPmsPopup(true);
  }
  // Dynamic detail buttons (install/uninstall)
  if (detailsInstallBtn) detailsInstallBtn.textContent = t('details.install');
  if (detailsUninstallBtn) detailsUninstallBtn.textContent = t('details.uninstall');
  if (installStreamStatus) installStreamStatus.textContent = t('install.status');
  // Generic translation of all data-i18n and data-i18n-* elements
  const lang = getLangPref();
  // data-i18n (texte)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      // If the element contains tags (e.g. <span class="mode-icon">), only replace the main text node
      let replaced = false;
      el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !replaced) {
          node.textContent = translations[lang][key];
          replaced = true;
        }
      });
      // If no text node found, fallback to textContent (rare case)
      if (!replaced) {
        el.textContent = translations[lang][key];
      }
    }
  });
  // data-i18n-html (innerHTML allowed for specific cases)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const localized = (translations[lang] && translations[lang][key])
      || (translations['en'] && translations['en'][key])
      || (translations['fr'] && translations['fr'][key]);
    if (localized) {
      el.innerHTML = localized;
    }
  });
  // data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[lang] && translations[lang][key]) {
      el.setAttribute('placeholder', translations[lang][key]);
    }
  });
  // data-i18n-title, data-i18n-aria-label, etc.
  document.querySelectorAll('[data-i18n-title], [data-i18n-aria-label]').forEach(el => {
    if (el.hasAttribute('data-i18n-title')) {
      const key = el.getAttribute('data-i18n-title');
      if (translations[lang] && translations[lang][key]) {
        el.title = translations[lang][key];
      }
    }
    if (el.hasAttribute('data-i18n-aria-label')) {
      const key = el.getAttribute('data-i18n-aria-label');
      if (translations[lang] && translations[lang][key]) {
        el.setAttribute('aria-label', translations[lang][key]);
      }
    }
  });
  // Special attributes (e.g. aria-label on settingsPanel)
  const settingsPanel = document.getElementById('settingsPanel');
  if (settingsPanel) {
    settingsPanel.setAttribute('aria-label', t('settings.title'));
  }
  // Settings button title
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.title = t('settings.title') + ' (Ctrl+,)';

  // Secondary tab "Categories" translation
  const tabSecondary = document.querySelector('.tab-secondary');
  if (tabSecondary) {
    tabSecondary.textContent = t('tabs.categories') || 'Categories';
  }
  setUpdateSpinnerBusy(_updatesApi?.getSpinnerBusy?.() ?? false);
  updateUpdatesToggleUi();
  if (!sandboxState.logBuffer) resetSandboxLog();
  refreshAllSandboxBadges();
  try { renderSandboxCard(); } catch(_) {}
  try {
    const _nonAppimageEl = document.getElementById('nonAppimageModal');
    if (_nonAppimageEl && !_nonAppimageEl.hidden) {
      const reason = sandboxState.info?.sandboxForbiddenReason || (sandboxState.info?.selfSandboxProhibited ? 'self' : null);
      showNonAppimageModal(sandboxState.currentApp, reason);
    }
  } catch(_) {}
  if (popupWasOpen) {
    showMissingPmPopup();
  }
}

function syncTrayLocale() {
  try {
    const locale = getLangPref();
    if (window.electronAPI && typeof window.electronAPI.setTrayLocale === 'function') {
      window.electronAPI.setTrayLocale(locale);
    }
  } catch(_) {}
}

// Apply language and prepare controls
function initLanguagePreferences() {
  applyTranslations();
  syncTrayLocale();
  // Update HTML lang attribute
  document.documentElement.setAttribute('lang', getLangPref());
  // Sync language radio state with stored preference
  try {
    const stored = localStorage.getItem('langPref') || 'auto';
    const radios = document.querySelectorAll('input[name="langPref"]');
    radios.forEach(r => { try { r.checked = (r.value === stored); } catch(_){} });
    // Add a direct handler to avoid delegation ambiguity
    radios.forEach(r => {
      try {
        r.addEventListener('change', (ev) => {
          ev.stopPropagation();
          try { localStorage.setItem('langPref', r.value); } catch(_){ }
          try { applyTranslations(); } catch(_){ }
          syncTrayLocale();
          try { document.documentElement.setAttribute('lang', getLangPref()); } catch(_){ }
          // Mark handled to avoid delegated double handling
          try { window.__langChangeHandled = true; } catch(_){ }
          rerenderActiveCategory();
        });
      } catch(_){}
    });
  } catch(_) {}
}

const settingsPanelApi = window.ui?.settingsPanel?.init?.({
  settingsBtn,
  settingsPanel,
  disableGpuCheckbox,
  openExternalCheckbox,
  purgeIconsBtn,
  purgeIconsResult,
  electronAPI: window.electronAPI,
  showToast,
  t,
  getThemePref,
  applyThemePreference,
  loadOpenExternalPref,
  saveOpenExternalPref,
  onIconCachePurged: handleIconCachePurged,
  onInstallScopeChange: (scope) => {
    if (installerApi) installerApi.setInstallScope?.(scope); else installScope = scope;
    updateScopeButtonUI();
  }
}) || null;

if (window.ui?.confirmModal?.init) window.ui.confirmModal.init({ t });
if (window.ui?.lightbox?.init) window.ui.lightbox.init({ t });

window.addEventListener('DOMContentLoaded', async () => {
  try {
    initMarkdownLightbox();
    initIconObserver();
    // Ensure spinner and results are hidden at startup
    setUpdateSpinnerBusy(false);
    if (updateResult) updateResult.style.display = 'none';
    // Force list view at startup
    if (appDetailsSection) appDetailsSection.hidden = true;
    document.body.classList.remove('details-mode');
    if (appsDiv) appsDiv.hidden = false;
    const loadAppsPromise = loadApps();
    if (window.categories && typeof window.categories.initDropdown === 'function') {
      window.categories.initDropdown({
        state,
        t,
        showToast,
        setAppList,
        applySearch,
        loadApps,
        appDetailsSection,
        appsDiv,
        tabs,
        iconMap: CATEGORY_ICON_MAP
      });
    }
    // Replace refresh button with the new sync button (after script loads)
    if (window.syncButton && !syncBtn) {
      const { createSyncButton, replaceSyncButton } = window.syncButton;
      syncBtn = createSyncButton({
        onSync: async () => {
          // Force delete category file cache
          if (window.electronAPI && typeof window.electronAPI.deleteCategoriesCache === 'function') {
            await window.electronAPI.deleteCategoriesCache();
          }
          // Refresh JS category cache
          if (window.categories && typeof window.categories.resetCache === 'function') {
            window.categories.resetCache();
          }
          if (window.categories && typeof window.categories.loadCategories === 'function') {
            await window.categories.loadCategories({ showToast });
          }
          // Bascule sur l'onglet Applications
          const tabApplications = document.querySelector('.tab[data-category="all"]');
          if (tabApplications) tabApplications.click();
          showToast(t('toast.refreshing'));
          await loadApps();
          applySearch();
        }
      });
      replaceSyncButton(syncBtn);
    }
    initLanguagePreferences();
    await loadAppsPromise;
    // Restore any previous detail (session) if still present
    const last = sessionStorage.getItem('lastDetailsApp');
    if (last && (state.allApps.find(a => a.name === last) || state.allApps.find(a => (a.scope ? a.name + '|' + a.scope : a.name) === last))) {
      showDetails(last);
    }
    if (state.allApps && state.allApps.length > 0) {
      const uniqueCount = new Set(state.allApps.map(a => String(a.name).toLowerCase())).size;
      showToast(t('categories.allAppsCount', { count: uniqueCount }));
    }
  } catch (err) {
    console.error('Erreur initialisation DOM', err);
  }
});

// Handle language change
const settingsPanelLang = document.getElementById('settingsPanel');
if (settingsPanelLang) {
  settingsPanelLang.addEventListener('change', (ev) => {
    const t = ev.target;
    // avoid double handling if a direct handler already processed it
    if (window.__langChangeHandled) { window.__langChangeHandled = false; return; }
    if (t.name === 'langPref') {
      try { localStorage.setItem('langPref', t.value); } catch(_){ }
      try { applyTranslations(); } catch(_){ }
      try { document.documentElement.setAttribute('lang', getLangPref()); } catch(_){ }
      rerenderActiveCategory();
    }
  });
}

// --- Preferences (theme & default mode) ---
// Ensure the update panel is hidden at startup (unless updates tab is active)
if (updatesPanel) {
  updatesPanel.hidden = true; // default tab is 'all'
}
if (advancedPanel) {
  advancedPanel.hidden = true;
}
applyThemePreference();

// Initialisation defaultMode
if (!localStorage.getItem('defaultMode')) {
  localStorage.setItem('defaultMode', state.viewMode || 'grid');
}

// Copier une commande (am/appman) au clic
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest && ev.target.closest('.copy-cmd');
  if (!btn) return;
  const cmd = btn.getAttribute('data-copy');
  if (!cmd) return;
  ev.preventDefault();
  ev.stopPropagation();
  try {
    await copyTextToClipboard(cmd);
    showToast(t('advanced.copySuccess'));
  } catch (err) {
    console.error('copy command failed', err);
    showToast(t('advanced.copyError') || 'Copy failed');
  }
}, { capture: true });

// Liens externes
document.addEventListener('click', (ev) => {
  const a = ev.target.closest && ev.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || !/^https?:\/\//i.test(href)) return;
  if (!loadOpenExternalPref()) {
    // Ouvrir dans une popup simple
    ev.preventDefault();
    ev.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer,width=980,height=700');
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal(href);
  }
}, { capture: true });
// App loader feature
const appLoaderApi = (function initAppLoader() {
  const mod = window.features?.appLoader;
  if (typeof mod?.init !== 'function') return null;
  return mod.init({
    doms: () => ({ appsDiv, installedCountEl }),
    state: () => state,
    electronAPI: () => window.electronAPI,
    t,
    showMissingPmPopup,
    hideMissingPmPopup,
    showBothPmsPopup,
    updateInstalledCount: (v) => { if (installedCountEl) installedCountEl.textContent = v; },
    sandboxedApps: () => sandboxedApps,
    refreshAllSandboxBadges,
    cleanupSandboxCache,
    scheduleSandboxStateSweep,
    setInstallScope: (s) => { if (installerApi) installerApi.setInstallScope?.(s); else installScope = s; },
    getInstallScope: () => installerApi?.getInstallScope?.() ?? installScope,
    rerenderActiveCategory,
    prefetchPreloadImages
  });
})();

async function loadApps() { return appLoaderApi?.loadApps?.(); }

let iconObserver = null;
function initIconObserver(){
  if ('IntersectionObserver' in window && !iconObserver){
    // Load earlier off-screen to reduce latency on scroll appearance
    iconObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting){
          const img = entry.target; const data = img.getAttribute('data-src');
          if (data){ img.src = data; img.removeAttribute('data-src'); }
          iconObserver.unobserve(img);
        }
      });
    }, { rootMargin: '1600px' }); // increased margin to load even earlier off-screen
  }
}


// Async throttled preloading of yet-unstarted images — starts after render
let _prefetchScheduled = false;
function prefetchPreloadImages(limit = 200, concurrency = 6) {
  if (iconObserver) return; // IntersectionObserver already handles advanced preloading
  if (_prefetchScheduled) return;
  const imgs = Array.from(document.querySelectorAll('img[data-src]'));
  if (!imgs.length) return;
  _prefetchScheduled = true;
  const toLoad = imgs.slice(0, Math.min(limit, imgs.length));
  let idx = 0;
  let active = 0;

  const scheduleNext = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(pump);
    } else {
      setTimeout(pump, 0);
    }
  };

  const pump = () => {
    while (active < concurrency && idx < toLoad.length) {
      const img = toLoad[idx++];
      active++;
      queueMicrotask(() => {
        try {
          const dataSrc = img.getAttribute('data-src');
          if (dataSrc) {
            img.src = dataSrc;
            img.removeAttribute('data-src');
          }
        } catch (_) {}
        active--;
        if (idx < toLoad.length) scheduleNext();
        else if (active === 0) _prefetchScheduled = false;
      });
    }
    if (idx >= toLoad.length && active === 0) {
      _prefetchScheduled = false;
    }
  };

  setTimeout(() => {
    pump();
  }, 180);
}

function showDetails(appName) {
  const app = state.allApps.find(a => a.name === appName);
  if (!app) return;
  // Remember current scroll position (scrollable shell)
  if (scrollShell) state.lastScrollY = scrollShell.scrollTop;
  state.currentDetailsApp = app.name;
  handleSandboxShow(app.name);
  const label = prettifyAppName(app.name);
  const version = app.version ? String(app.version) : null;
  if (detailsIcon) {
    detailsIcon.src = getIconUrl(app.name);
    detailsIcon.onerror = () => { detailsIcon.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; };
  }
  if (detailsName) {
    // Fix: if install cancelled, don't show as installed
    const activeSess3 = installerApi?.getActiveInstallSession?.() || activeInstallSession;
    const isActuallyInstalled = app.installed && !(activeSess3 && activeSess3.name === app.name && activeSess3.id && !activeSess3.done);
    detailsName.innerHTML = isActuallyInstalled
      ? `${label}${version ? ' · ' + version : ''}`
      : (version ? `${label} · ${version}` : label);
  }
  if (detailsName) detailsName.dataset.app = app.name.toLowerCase();
  applyDetailsSandboxBadge(app.name);
  if (detailsLong) detailsLong.textContent = t('details.loadingDesc', {name: app.name});
  if (detailsGallery) detailsGallery.hidden = true;
  // Gallery removed: nothing to hide
  if (detailsInstallBtn) {
    detailsInstallBtn.hidden = !!app.installed;
    detailsInstallBtn.setAttribute('data-name', app.name);
    // Always remove spinner and re-enable the button
  detailsInstallBtn.classList.remove('loading');
  detailsInstallBtn.disabled = false;
    const activeSess4 = installerApi?.getActiveInstallSession?.() || activeInstallSession;
    if (activeSess4.id && !activeSess4.done && activeSess4.name === app.name) {
      detailsInstallBtn.textContent = t('install.status') + ' ✕';
      detailsInstallBtn.setAttribute('data-action','cancel-install');
      detailsInstallBtn.setAttribute('aria-label', t('install.cancel') || 'Cancel installation in progress ('+app.name+')');
    } else {
      detailsInstallBtn.textContent = t('details.install');
      detailsInstallBtn.setAttribute('data-action','install');
      detailsInstallBtn.setAttribute('aria-label', t('details.install'));
    }
    refreshAllInstallButtons();
  }
  // Show scope toggle only when PM is 'am' and app is not installed
  updateScopeButtonUI();
  // Restore streaming panel if an ongoing install matches this app
  if (installStream) {
    const activeSess5 = installerApi?.getActiveInstallSession?.() || activeInstallSession;
    if (activeSess5.id && !activeSess5.done && activeSess5.name === app.name) {
      installStream.hidden = false;
      if (installStreamElapsed) {
        const secs = Math.round((performance.now()-activeSess5.start)/1000);
        installStreamElapsed.textContent = secs + 's';
      }
      if (detailsInstallBtn) { detailsInstallBtn.disabled = false; detailsInstallBtn.classList.remove('loading'); }
    } else {
      installStream.hidden = true;
    }
  }
  if (detailsUninstallBtn) {
    detailsUninstallBtn.hidden = !app.installed;
    detailsUninstallBtn.disabled = false;
    detailsUninstallBtn.setAttribute('data-name', app.name);
  }
  if (appDetailsSection) appDetailsSection.hidden = false;
  // Hide categories tab bar and mirror/all button
  const tabsRowSecondary = document.querySelector('.tabs-row-secondary');
  if (tabsRowSecondary) tabsRowSecondary.style.visibility = 'hidden';
  // Bar removal: nothing to do
  document.body.classList.add('details-mode');
  // hide featured banner when entering details
  const featuredBannerEl = document.getElementById('featuredBanner');
  if (featuredBannerEl) featuredBannerEl.hidden = true;
  if (virtualListApi?.disconnectObservers) {
    try { virtualListApi.disconnectObservers(); } catch (_) {}
  }
  if (appsDiv) appsDiv.hidden = true;
  loadRemoteDescription(app.name).catch(err => {
    if (detailsLong) detailsLong.textContent = t('details.errorDesc', {error: err?.message || err || t('error.unknown')});
  });
}

function exitDetailsView() {
  handleSandboxExit();
  if (appDetailsSection) appDetailsSection.hidden = true;
  document.body.classList.remove('details-mode');
  // restore featured banner only if on Applications tab
  const featuredBannerEl = document.getElementById('featuredBanner');
  if (featuredBannerEl) {
    featuredBannerEl.hidden = !(state.activeCategory === 'all');
    if (!featuredBannerEl.hidden && featuredFeature && typeof featuredFeature.updateFromState === 'function') featuredFeature.updateFromState();
  }
  if (appsDiv) appsDiv.hidden = false;
  if (virtualListApi?.renderVirtualList) {
    try { virtualListApi.renderVirtualList(); } catch (_) {}
  }
  // Re-show categories tab bar and mirror/all button
  const tabsRowSecondary = document.querySelector('.tabs-row-secondary');
  if (tabsRowSecondary) tabsRowSecondary.style.visibility = 'visible';
  rerenderActiveCategory();
  // Clear all busy/spinner states on tiles
  document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
  // Restaurer scroll
  if (scrollShell) scrollShell.scrollTop = state.lastScrollY || 0;
  // Remember last detail for potential restoration
  if (state.currentDetailsApp) sessionStorage.setItem('lastDetailsApp', state.currentDetailsApp);
}

const legacyShowDetails = showDetails;
const legacyExitDetailsView = exitDetailsView;

(function wireDetailsModule() {
  const api = ensureDetailsApi();
  if (!api) return;
  showDetails = (appName) => {
    if (api && typeof api.showDetails === 'function') {
      // Set detail scope from the clicked entry's scope
      const pipeIdx = appName.lastIndexOf('|');
      if (pipeIdx !== -1) {
        const scope = appName.slice(pipeIdx + 1);
        if (scope === 'system' || scope === 'user') {
          if (installerApi) installerApi.setDetailScopeOverride?.(scope); else detailScopeOverride = scope;
        }
      }
      const result = api.showDetails(appName);
      const plainName = appName.includes('|') ? appName.slice(0, appName.lastIndexOf('|')) : appName;
      try { handleSandboxShow(plainName); } catch (_) {}
      return result;
    }
    return legacyShowDetails(appName);
  };
  exitDetailsView = () => {
    if (api && typeof api.exitDetailsView === 'function') {
      const result = api.exitDetailsView();
      try { handleSandboxExit(); } catch (_) {}
      return result;
    }
    return legacyExitDetailsView();
  };
})();

if (window.ui?.virtualList?.init) {
  const api = window.ui.virtualList.init({
    state,
    appsDiv,
    scrollShell,
    visibleCount: VISIBLE_COUNT,
    getIconUrl,
    t,
    getQueuePosition,
    getActiveInstallSession: () => installerApi?.getActiveInstallSession?.() || activeInstallSession,
    showDetails,
    document,
    window,
    isSandboxed: isAppSandboxed,
    applySandboxBadge: (iconWrapper, active, appName) => applySandboxBadgeToIcon(iconWrapper, active, appName),
    prettify: prettifyAppName
  });
  if (api) {
    virtualListApi = api;
    if (typeof api.setAppList === 'function') setAppListImpl = api.setAppList;
    if (typeof api.renderVirtualList === 'function') renderVirtualList = api.renderVirtualList;
    if (typeof api.initIconObserver === 'function') initIconObserver = () => api.initIconObserver();
    if (typeof api.prefetchPreloadImages === 'function') prefetchPreloadImages = (...args) => api.prefetchPreloadImages(...args);
  }
}

appsDiv?.addEventListener('click', (e) => {
  const actionBtn = e.target.closest('.inline-action');



  if (actionBtn) {
    const action = actionBtn.getAttribute('data-action');
    const appName = actionBtn.getAttribute('data-app');
    if (!action || !appName) return;
    if (action === 'install') {
      window.ui.confirmModal.openActionConfirm({
        title: t('confirm.installTitle'),
        message: t('confirm.installMsg', {name: `<strong>${appName}</strong>`}),
        okLabel: t('details.install')
      }).then(ok => {
        if (!ok) return;
        actionBtn.disabled = true;
        const tile = actionBtn.closest('.app-tile');
        if (tile){ tile.classList.add('busy'); }
        enqueueInstall(appName, (installerApi?.getInstallScope?.() ?? installScope));
      });
      window.ui.confirmModal.openActionConfirm({
        title: t('confirm.uninstallTitle'),
        message: t('confirm.uninstallMsg', {name: `<strong>${appName}</strong>`}),
        okLabel: t('details.uninstall'),
        intent: 'danger'
      }).then(ok => {
        if (!ok) return;
        actionBtn.disabled = true;
        actionBtn.classList.add('loading'); // Add spinner on uninstall button
        const tile = actionBtn.closest('.app-tile');
        if (tile){ tile.classList.add('busy'); }
        showToast(t('toast.uninstalling', {name: appName}));
        window.electronAPI.uninstallApp(appName).then(async () => {
          await window.electronAPI.invalidateAppsCache?.();
          await loadApps();
          applySearch();
          actionBtn.classList.remove('loading');
        }).catch(() => {
          actionBtn.classList.remove('loading');
        });
      });
    } else if (action === 'cancel-install') {
      cancelActiveInstall(appName);
      return;
    } else if (action === 'remove-queue') {
      removeFromQueue(appName);
      return;
    }
    return;
  }
  const tile = e.target.closest('.app-tile');
  if (tile) showDetails(tile.getAttribute('data-app'));
});

// Search debounce to avoid unnecessary re-renders


// Unified keyboard shortcuts
window.addEventListener('keydown', (e) => {
  // Keyboard refresh: Ctrl+R or F5
  if ((e.key === 'r' && (e.ctrlKey || e.metaKey)) || e.key === 'F5') {
    e.preventDefault();
    triggerRefresh();
    return;
  }
  // Toggle settings Ctrl+,
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault();
    if (settingsPanelApi?.toggle) settingsPanelApi.toggle();
    else settingsBtn?.click();
    return;
  }
  // Escape: close details / modes menu / settings
  if (e.key === 'Escape') {
    if (document.body.classList.contains('details-mode')) { exitDetailsView(); return; }
    if (!modeMenu?.hidden){ modeMenu.hidden = true; modeMenuBtn?.setAttribute('aria-expanded','false'); return; }
    if (settingsPanelApi?.isOpen?.()) { settingsPanelApi.close(); return; }
    if (!settingsPanel?.hidden){ settingsPanel.hidden = true; settingsBtn?.setAttribute('aria-expanded','false'); return; }
  }
}, { capture:true });



// Handle interactive choice prompt during installation
(async () => {
  window.electronAPI?.onInstallProgress?.((data) => {
    // Initialize install session on receiving 'start'
    if (data.kind === 'start' && data.id) {
      const sess = installerApi?.getActiveInstallSession?.();
      if (sess) sess.id = data.id;
    }
    if (data.kind === 'choice-prompt') {
      // Remove any existing choice dialog
      document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
      // Create a simple dialog
      const dlg = document.createElement('div');
      dlg.className = 'choice-dialog';
      const cardColor = getThemeVar('--card', '#ffffff');
      const fgColor = getThemeVar('--fg', '#0b1320');
      const borderColor = getThemeVar('--border', '#e5e7eb');
      dlg.style.position = 'fixed';
      dlg.style.top = '50%';
      dlg.style.left = '50%';
      dlg.style.transform = 'translate(-50%, -50%)';
      dlg.style.zIndex = '9999';
      dlg.style.background = cardColor;
      dlg.style.color = fgColor;
      dlg.style.border = `1px solid ${borderColor}`;
      dlg.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
      dlg.style.borderRadius = '10px';
      dlg.style.padding = '24px 32px';
      dlg.style.minWidth = '320px';
      let optionsHtml;
      if (data.options.length > 8) {
        // Display as 2-column table
        const colCount = 2;
        const rowCount = Math.ceil(data.options.length / colCount);
        optionsHtml = '<table class="multi-choice-table"><tbody>';
        for (let r = 0; r < rowCount; r++) {
          optionsHtml += '<tr>';
          for (let c = 0; c < colCount; c++) {
            const idx = r + c * rowCount;
            if (idx < data.options.length) {
              optionsHtml += `<td><button class="multi-choice-item" data-choice="${idx+1}">${data.options[idx]}</button></td>`;
            } else {
              optionsHtml += '<td></td>';
            }
          }
          optionsHtml += '</tr>';
        }
        optionsHtml += '</tbody></table>';
      } else {
        // Classic list display
        optionsHtml = `<ul>${data.options.map((opt,i)=>`<li><button class="multi-choice-item" data-choice="${i+1}">${opt}</button></li>`).join('')}</ul>`;
      }
      const cancelLabel = t('install.cancel') || 'Cancel';
      const cleanPrompt = stripAnsiSequences(data.prompt || '');
      dlg.innerHTML = `
        <div class="choice-dialog-inner">
          <div class="choice-dialog-head">
            <h3>${cleanPrompt}</h3>
            <button type="button" class="choice-dialog-close" aria-label="${cancelLabel}">✕</button>
          </div>
          <div class="choice-dialog-body">${optionsHtml}</div>
        </div>`;
      document.body.appendChild(dlg);
      const closeBtn = dlg.querySelector('.choice-dialog-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          cancelActiveInstall();
        });
      }
      dlg.querySelectorAll('button[data-choice]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const choice = btn.getAttribute('data-choice');
          // Close the dialog immediately
          dlg.remove();
          // Envoi du choix au backend
          const installId = data.id;
          if (!installId) {
            window.showCopiableError(t('error.global', { msg: 'Missing install ID' }));
            return;
          }
          try {
            await window.electronAPI.installSendChoice(installId, choice);
          } catch(e) {
            window.showCopiableError(t('error.global', { msg: 'Send choice: ' + (e?.message || e) }));
          }
        });
      });
    }
    // Close the prompt if the install is finished or cancelled
    if (data.kind === 'done' || data.kind === 'cancelled' || data.kind === 'error') {
      document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
    }
  });

// Global utility function to display a copyable error
window.showCopiableError = function(msg) {
  const errDlg = document.createElement('div');
  const cardColor = getThemeVar('--card', '#ffffff');
  const fgColor = getThemeVar('--fg', '#0b1320');
  const borderColor = getThemeVar('--border', '#e5e7eb');
  errDlg.style.position = 'fixed';
  errDlg.style.top = '50%';
  errDlg.style.left = '50%';
  errDlg.style.transform = 'translate(-50%, -50%)';
  errDlg.style.zIndex = '10000';
  errDlg.style.background = cardColor;
  errDlg.style.color = fgColor;
  errDlg.style.border = `1px solid ${borderColor}`;
  errDlg.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
  errDlg.style.borderRadius = '10px';
  errDlg.style.padding = '24px 32px';
  errDlg.style.minWidth = '320px';
  errDlg.innerHTML = `<div style="margin-bottom:12px;font-weight:bold;">${t("error.dialogTitle")}</div><textarea style="width:100%;height:80px;resize:none;user-select:text;">${msg}</textarea><div style="text-align:right;margin-top:12px;"><button>${t("error.dialogClose")}</button></div>`;
  document.body.appendChild(errDlg);
  errDlg.querySelector('button').onclick = () => errDlg.remove();
  const ta = errDlg.querySelector('textarea');
  ta.style.background = cardColor;
  ta.style.color = fgColor;
  ta.style.border = `1px solid ${borderColor}`;
  ta.focus();
  ta.select();
};
})();

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeCategory = tab.getAttribute('data-category') || 'all';
    if (state.categoryOverride) {
      state.categoryOverride = null;
    }
    if (window.categories && typeof window.categories.updateDropdownLabel === 'function') {
      window.categories.updateDropdownLabel(state, t, CATEGORY_ICON_MAP);
    }
    applySearch();
    // Fermer tout prompt de choix interactif lors du changement d’onglet
    document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
    const isUpdatesTab = state.activeCategory === 'updates';
    const isAdvancedTab = state.activeCategory === 'advanced';
    if (updatesPanel) updatesPanel.hidden = !isUpdatesTab;
    if (advancedPanel) advancedPanel.hidden = !isAdvancedTab;
    const showingApps = !(isUpdatesTab || isAdvancedTab);
    if (appsDiv) appsDiv.hidden = !showingApps;
    // featured banner: show only when we're on the main Applications tab ('all') and not in details mode
    const featuredBannerEl = document.getElementById('featuredBanner');
    const shouldShowBanner = (state.activeCategory === 'all') && !document.body.classList.contains('details-mode');
    if (featuredBannerEl) featuredBannerEl.hidden = !shouldShowBanner;
    // update items to reflect the currently visible category (if the banner is visible)
    if (featuredFeature && typeof featuredFeature.updateFromState === 'function') setTimeout(() => { try { featuredFeature.updateFromState(); } catch(_){} }, 0);
    if (showingApps) {
      if (virtualListApi?.renderVirtualList) {
        try { virtualListApi.renderVirtualList(); } catch (_) {}
      }
    } else if (virtualListApi?.disconnectObservers) {
      try { virtualListApi.disconnectObservers(); } catch (_) {}
    }
    if (isUpdatesTab) {
      runUpdatesBtn.disabled = updateInProgress;
    } else {
      runUpdatesBtn.disabled = false;
    }
    // No terminal in advanced mode now
    if (document.body.classList.contains('details-mode')) {
      exitDetailsView();
    }
  });
});

// ...existing code...
async function loadRemoteDescription(appName) {
  // If in cache (<24h) we reuse
  const cached = descriptionCache.get(appName);
  if (cached && (Date.now() - cached.timestamp) < 24*3600*1000) {
    applyDescription(appName, cached);
    return;
  }
  const url = `https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/apps/${encodeURIComponent(appName)}.md`;
  let markdown;
  try {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    markdown = await resp.text();
  } catch (e) {
    throw new Error('Échec fetch: ' + (e.message || e));
  }
  // Parser le Markdown en HTML avec marked
  let shortDesc = '';
  let longDesc = '';
  try {
  if (!window.marked) throw new Error('marked non chargé');
  // Cut markdown at the first table line (| ...)
  let md = markdown;
  const lines = md.split(/\r?\n/);
  const tableIdx = lines.findIndex(l => /^\s*\|/.test(l));
  if (tableIdx !== -1) md = lines.slice(0, tableIdx).join('\n');
  longDesc = window.marked.parse(md);
  // For shortDesc, take the first non-empty line (excluding title)
  const descLines = md.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  shortDesc = descLines[0] || 'Description non fournie.';
  } catch (_err) {
    shortDesc = 'Description indisponible.';
    longDesc = 'Impossible de parser le markdown.';
  }
  let images = [];
  try {
    const parser2 = new DOMParser();
    const doc2 = parser2.parseFromString(longDesc, 'text/html');
    const imgEls = Array.from(doc2.querySelectorAll('img'));
    // Filter: avoid icons that are too small or decorative
    const filtered = imgEls.filter(img => {
      const src = img.getAttribute('src') || '';
      if (!src) return false;
      if (/icon|logo|badge|emoji/i.test(src)) return false;
      // Exclure images svg petites
      const w = parseInt(img.getAttribute('width') || '0', 10);
      const h = parseInt(img.getAttribute('height') || '0', 10);
      if ((w && w < 64) || (h && h < 64)) return false;
      return true;
    });
    images = filtered.map(i => i.getAttribute('src')).filter(Boolean);
    // Normaliser URLs relatives
    images = images.map(u => {
      if (/^https?:/i.test(u)) return u;
      // Assumer relatif au dossier /apps/
      return `https://portable-linux-apps.github.io/apps/${u.replace(/^\.\//,'')}`;
    });
    // Dedup + limit
    const seen = new Set();
    const finalImgs = [];
    for (const u of images) { if (!seen.has(u)) { seen.add(u); finalImgs.push(u); } }
    images = finalImgs.slice(0, 6);
  } catch(_) { images = []; }

  const record = { short: shortDesc, long: longDesc, images, timestamp: Date.now() };
  descriptionCache.set(appName, record);
  applyDescription(appName, record);
}

function applyDescription(appName, record) {
  if (!detailsName) return;
  const refName = (detailsName.dataset.app || detailsName.textContent.toLowerCase().replace(/\s+✓$/, ''));
  if (refName !== appName.toLowerCase()) return;
  if (detailsLong) detailsLong.innerHTML = record.long;
  if (detailsGalleryInner && detailsGallery) {
    detailsGalleryInner.innerHTML = '';
    if (record.images && record.images.length) {
      record.images.forEach(src => {
        const div = document.createElement('div'); div.className='shot';
        const img = document.createElement('img'); img.src = src; img.loading='lazy';
        img.onerror = () => { div.remove(); };
        img.addEventListener('click', () => window.ui.lightbox.openLightbox(record.images, record.images.indexOf(src), detailsName?.textContent || ''));
        div.appendChild(img); detailsGalleryInner.appendChild(div);
      });
      detailsGallery.hidden = false;
    } else { detailsGallery.hidden = true; }
  // Gallery removed: all images are in the description Markdown
// Lightbox removed
  }
}





// Handle close confirmation with ongoing installation
const closeConfirmModal = document.getElementById('closeConfirmModal');
const closeConfirmStay = document.getElementById('closeConfirmStay');
const closeConfirmQuit = document.getElementById('closeConfirmQuit');

function showCloseConfirm() {
  if (!closeConfirmModal) return;
  closeConfirmModal.hidden = false;
  applyTranslations(); // Update translated texts
  if (closeConfirmQuit) closeConfirmQuit.focus();
}

function hideCloseConfirm() {
  if (!closeConfirmModal) return;
  closeConfirmModal.hidden = true;
}

closeConfirmStay?.addEventListener('click', () => {
  hideCloseConfirm();
});

closeConfirmQuit?.addEventListener('click', async () => {
  hideCloseConfirm();
  // Cancel the ongoing installation
  const activeSess6 = installerApi?.getActiveInstallSession?.() || activeInstallSession;
  if (activeSess6 && !activeSess6.done) {
    try {
      await cancelActiveInstall();
    } catch (err) {
      console.error('Failed to cancel installation', err);
    }
  }
  // Fermer l'application
  if (window.electronAPI?.closeWindow) {
    window.electronAPI.closeWindow();
  }
});

// Intercept close attempt
if (window.electronAPI?.onBeforeClose) {
  window.electronAPI.onBeforeClose(() => {
    // Check if an installation is in progress
    const activeSess7 = installerApi?.getActiveInstallSession?.() || activeInstallSession;
    if (activeSess7 && activeSess7.id && !activeSess7.done) {
      showCloseConfirm();
    }
  });
}

//# sourceMappingURL=app.js.map





