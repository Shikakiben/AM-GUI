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
const getThemePref = typeof appPreferences.getThemePref === 'function'
  ? appPreferences.getThemePref
  : () => {
      try { return localStorage.getItem('themePref') || 'system'; }
      catch (_) { return 'system'; }
    };
const applyThemePreference = typeof appPreferences.applyThemePreference === 'function'
  ? appPreferences.applyThemePreference
  : () => {
      const pref = getThemePref();
      const root = document.documentElement;
      root.classList.remove('theme-light','theme-dark');
      if (pref === 'light') root.classList.add('theme-light');
      else if (pref === 'dark') root.classList.add('theme-dark');
    };
const loadOpenExternalPref = typeof appPreferences.loadOpenExternalPref === 'function'
  ? appPreferences.loadOpenExternalPref
  : () => {
      try { return localStorage.getItem('openExternalLinks') === '1'; }
      catch (_) { return false; }
    };
const saveOpenExternalPref = typeof appPreferences.saveOpenExternalPref === 'function'
  ? appPreferences.saveOpenExternalPref
  : (val) => {
      try { localStorage.setItem('openExternalLinks', val ? '1' : '0'); }
      catch (_) {}
    };
const getIconUrl = typeof appUtils.getIconUrl === 'function'
  ? appUtils.getIconUrl
  : (name) => `appicon://${name}.png`;
const debounce = typeof appUtils.debounce === 'function'
  ? appUtils.debounce
  : (fn, delay) => {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    };
const prettifyAppName = typeof appUtils.prettifyAppName === 'function'
  ? appUtils.prettifyAppName
  : (name) => name || '';

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
      if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name){
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
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name) {
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
      if (buildTile._count === undefined) buildTile._count = 0;
      if (buildTile._count < 48) {
        try { img.setAttribute('fetchpriority','high'); } catch(_){ }
      }
      buildTile._count++;
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


function initXtermLog() {
  if (!xtermLogDiv) xtermLogDiv = document.getElementById('xtermLog');
  if (!xtermLogDiv) return;
  if (!xterm) {
    try {
      xterm = new Terminal({
        fontSize: 13,
        fontFamily: 'monospace',
        theme: { background: '#181c20' },
        convertEol: true,
        scrollback: 2000,
        disableStdin: true,
        cursorBlink: false
      });
      xtermFit = new FitAddonClass();
      xterm.loadAddon(xtermFit);
      xterm.open(xtermLogDiv);
      window.addEventListener('resize', ()=>xtermFit.fit());
      xtermFit.fit();
    } catch (_err) {
      xterm = null;
      xtermFit = null;
      if (xtermLogDiv) xtermLogDiv.style.display = 'none';
      if (installStreamLog) installStreamLog.style.display = '';
      return;
    }
  } else {
    xterm.clear();
    xtermFit && xtermFit.fit();
  }
  xtermLogDiv.style.display = '';
  if (installStreamLog) installStreamLog.style.display = 'none';
}
// --- xterm.js for native terminal display ---
let xterm = null;
let xtermFit = null;
let xtermLogDiv = null;
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
const modeOptions = () => Array.from(document.querySelectorAll('.mode-option'));
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
  modeOptions().forEach(opt => {
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
  modeOptions().forEach(opt => {
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

function startUpdateTimer() {
  const timer = document.querySelector('.update-timer');
  if (!timer) return;
  // Don't reset if already in progress
  if (updateTimerStart === null) updateTimerStart = Date.now();
  if (updateTimerInterval) return;
  const updateTimerText = () => {
    const elapsed = Math.max(0, Math.floor((Date.now() - updateTimerStart) / 1000));
    if (elapsed < 60) {
      timer.textContent = `${elapsed}s`;
    } else {
      const min = Math.floor(elapsed / 60);
      const sec = String(elapsed % 60).padStart(2, '0');
      timer.textContent = `${min}:${sec}`;
    }
  };
  updateTimerText();
  updateTimerInterval = setInterval(updateTimerText, 1000);
}

function stopUpdateTimer() {
  if (updateTimerInterval) clearInterval(updateTimerInterval);
  updateTimerInterval = null;
  updateTimerStart = null;
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
const sandboxOpenBtn = document.getElementById('sandboxOpenBtn');
const sandboxButtonStatus = document.getElementById('sandboxButtonStatus');
const sandboxModal = document.getElementById('sandboxModal');
const sandboxCloseBtn = document.getElementById('sandboxCloseBtn');
const sandboxCard = document.getElementById('sandboxCard');
const sandboxStatusBadge = document.getElementById('sandboxStatusBadge');
const sandboxRefreshBtn = document.getElementById('sandboxRefreshBtn');
const sandboxConfigureBtn = document.getElementById('sandboxConfigureBtn');
const sandboxDisableBtn = document.getElementById('sandboxDisableBtn');
const sandboxDepsAlert = document.getElementById('sandboxDepsAlert');
const sandboxInstallDepsBtn = document.getElementById('sandboxInstallDepsBtn');
const sandboxUnavailable = document.getElementById('sandboxUnavailable');
const sandboxInstallAppBtn = document.getElementById('sandboxInstallAppBtn');
const sandboxForm = document.getElementById('sandboxForm');
const sandboxCustomPathInput = document.getElementById('sandboxCustomPath');
const sandboxLog = document.getElementById('sandboxLog');
const sandboxSummary = document.getElementById('sandboxSummary');
const sandboxSummaryList = document.getElementById('sandboxSummaryList');
const sandboxSummaryEmpty = document.getElementById('sandboxSummaryEmpty');
const sandboxLogSection = document.getElementById('sandboxLogSection');
const sandboxLogToggle = document.getElementById('sandboxLogToggle');
const nonAppimageModal = document.getElementById('nonAppimageModal');
const nonAppimageTitle = document.getElementById('nonAppimageTitle');
const nonAppimageCloseBtn = document.getElementById('nonAppimageClose');
const nonAppimageDismissBtn = document.getElementById('nonAppimageDismiss');
const nonAppimageMessage = document.getElementById('nonAppimageMessage');
const SANDBOX_DIR_VALUES = ['desktop','documents','downloads','games','music','pictures','videos'];
const SANDBOX_DIR_LABEL_KEYS = {
  desktop: 'sandbox.dir.desktop',
  documents: 'sandbox.dir.documents',
  downloads: 'sandbox.dir.downloads',
  games: 'sandbox.dir.games',
  music: 'sandbox.dir.music',
  pictures: 'sandbox.dir.pictures',
  videos: 'sandbox.dir.videos'
};
const SANDBOX_PREFS_KEY = 'sandboxSharePrefs';
let sandboxSharePrefs = loadSandboxSharePrefs();
const sandboxedApps = new Map();
let sandboxSweepToken = 0;
const sandboxState = {
  currentApp: null,
  info: null,
  depsReady: false,
  busy: false,
  pendingAction: null,
  logBuffer: '',
  supported: true
};

renderSandboxCard();

// Current install session memory
let activeInstallSession = {
  id: null,
  name: null,
  start: 0,
  lines: [], // array of strings
  done: false,
  success: null,
  code: null
};
// Sequential queue
const installQueue = []; // noms d'apps en attente (FIFO)
const installScopeMap = new Map(); // name → 'system' | 'user'
let installScope = 'user'; // default scope for am installs
let detailScopeOverride = null; // per-detail-view override, cleared on back

let detailsApi = null;

function ensureDetailsApi() {
  if (detailsApi) return detailsApi;
  const initFn = window.features?.details?.init;
  if (typeof initFn !== 'function') return null;
  detailsApi = initFn({
    state,
    activeInstallSession,
    getIconUrl,
    showToast,
    translate: t,
    enqueueInstall,
    getInstallScope: () => detailScopeOverride ?? installScope,
    setInstallScope: (s) => { installScope = s; },
    removeFromQueue,
    refreshAllInstallButtons,
    setAppList,
    loadApps,
    openActionConfirm,
    rerenderActiveCategory,
    scrollShell,
    appsContainer: appsDiv,
    getActiveInstallSession: () => activeInstallSession,
    applyDetailsSandboxBadge,
    updateScopeButtonUI,
    onExitDetails: () => { detailScopeOverride = null; },
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

function resetSandboxLog() {
  if (!sandboxLog) return;
  sandboxState.logBuffer = '';
  sandboxLog.textContent = t('sandbox.logEmpty') || '…';
}

function appendSandboxLog(chunk) {
  if (!sandboxLog || typeof chunk !== 'string') return;
  sandboxState.logBuffer += chunk;
  const sanitized = stripAnsiSequences(sandboxState.logBuffer || '');
  const text = sanitized.trim() || t('sandbox.logEmpty') || '…';
  sandboxLog.textContent = text;
  sandboxLog.scrollTop = sandboxLog.scrollHeight;
}

function isSandboxLogExpanded() {
  return !!(sandboxLog && !sandboxLog.hidden);
}

function setSandboxLogExpanded(expanded) {
  if (!sandboxLog || !sandboxLogToggle) return;
  const next = !!expanded;
  sandboxLog.hidden = !next;
  sandboxLogToggle.setAttribute('aria-expanded', String(next));
  if (sandboxLogSection) {
    sandboxLogSection.dataset.open = next ? 'true' : 'false';
  }
}

setSandboxLogExpanded(false);

function inferAppImageFromInfo(appName, info) {
  if (!info) return null;
  if (info.sandboxForbiddenReason) return false;
  // isAppImage is definitive when it's a boolean (detected via magic bytes or sandboxed)
  if (typeof info.isAppImage === 'boolean') return info.isAppImage;
  const target = typeof info.appName === 'string' ? info.appName.toLowerCase() : '';
  if (target && appName && target !== appName.toLowerCase()) return null;
  const execPath = typeof info.execPath === 'string' ? info.execPath.toLowerCase() : '';
  if (!execPath) return null;
  // Fallback to extension if no magic byte detection
  return execPath.endsWith('.appimage');
}

function isSandboxSupported(appName, info = sandboxState.info) {
  if (!appName) return false;
  if (info?.sandboxForbiddenReason) return false;
  
  // If we don't have info yet (loading in progress), we don't know yet
  if (!info || Object.keys(info).length === 0) return true;
  
  const inferred = inferAppImageFromInfo(appName, info);
  
  // Check if the app is installed via appman (not just if an executable exists)
  const installedViaAppman = isAppInstalledInList(appName);
  
  // If the app is NOT installed via appman, don't block
  // (a system executable with the same name should not block future sandboxing)
  if (!installedViaAppman) return true;
  
  // If we have a definitive detection and the app is installed via appman, use it
  if (inferred !== null) return inferred;
  
  // App installed via appman but no detection possible → probably not an AppImage
  return false;
}

function isAppInstalledInList(appName) {
  if (!appName) return false;
  const lower = appName.toLowerCase();
  if (state?.installed instanceof Set && state.installed.has(lower)) return true;
  if (!Array.isArray(state?.allApps)) return false;
  const entry = state.allApps.find((app) => app && typeof app.name === 'string' && app.name.toLowerCase() === lower);
  return !!entry?.installed;
}

function openSandboxModal() {
  if (!sandboxModal || !sandboxState.currentApp) return;
  sandboxModal.hidden = false;
}

function closeSandboxModal() {
  if (!sandboxModal || sandboxModal.hidden) return;
  sandboxModal.hidden = true;
}

function showNonAppimageModal(appName, reason = null) {
  if (!nonAppimageModal) return;
  if (nonAppimageTitle) {
    const titleKey = reason ? 'sandbox.forbidden.title' : 'sandbox.unsupported.title';
    nonAppimageTitle.textContent = t(titleKey);
  }
  if (nonAppimageMessage) {
    const descKey = reason ? 'sandbox.forbidden.desc' : 'sandbox.unsupported.desc';
    nonAppimageMessage.textContent = t(descKey, { name: appName || '—' });
  }
  nonAppimageModal.hidden = false;
  setTimeout(() => {
    try { nonAppimageDismissBtn?.focus(); }
    catch (_) {}
  }, 30);
}

function closeNonAppimageModal() {
  if (!nonAppimageModal || nonAppimageModal.hidden) return;
  nonAppimageModal.hidden = true;
}

function setSandboxBusy(flag) {
  sandboxState.busy = !!flag;
  renderSandboxCard();
}

function updateSandboxActionStyles(isSandboxed) {
  if (!sandboxConfigureBtn || !sandboxDisableBtn) return;
  if (isSandboxed) {
    sandboxConfigureBtn.classList.remove('btn-primary');
    sandboxConfigureBtn.classList.add('btn-outline');
    sandboxDisableBtn.classList.add('btn-primary');
    sandboxDisableBtn.classList.remove('btn-outline');
  } else {
    sandboxConfigureBtn.classList.add('btn-primary');
    sandboxConfigureBtn.classList.remove('btn-outline');
    sandboxDisableBtn.classList.remove('btn-primary');
    sandboxDisableBtn.classList.add('btn-outline');
  }
}

function renderSandboxCard() {
  if (!sandboxCard) return;
  if (!sandboxState.currentApp) {
    sandboxCard.hidden = true;
    if (sandboxOpenBtn) sandboxOpenBtn.disabled = true;
    if (sandboxButtonStatus) {
      sandboxButtonStatus.dataset.status = 'unknown';
      sandboxButtonStatus.textContent = '—';
    }
    return;
  }
  sandboxCard.hidden = false;
  if (sandboxOpenBtn) {
    sandboxOpenBtn.disabled = false;
  }
  const info = sandboxState.info || {};
  const installedFromInfo = typeof info.installed === 'boolean' ? info.installed : null;
  const installedFromList = isAppInstalledInList(sandboxState.currentApp);
  const installedFromDetailsBtn = detailsInstallBtn ? detailsInstallBtn.hidden : null;
  const installedFlag = !!(installedFromInfo || installedFromList || installedFromDetailsBtn === true);
  const forbiddenReason = info?.sandboxForbiddenReason || (info?.selfSandboxProhibited ? 'self' : null);
  const sandboxEligible = isSandboxSupported(sandboxState.currentApp, info) && !forbiddenReason;
  sandboxState.supported = sandboxEligible;
  if (sandboxOpenBtn) {
    const titleKey = sandboxEligible ? 'sandbox.title' : (forbiddenReason ? 'sandbox.forbidden.title' : 'sandbox.unsupported.title');
    sandboxOpenBtn.title = t(titleKey);
  }
  const statusKey = sandboxState.busy
    ? 'busy'
    : (!sandboxEligible
      ? 'forbidden' // same button label for all non-sandboxable; popup will specify the reason
      : (info.sandboxed ? 'active' : (installedFlag ? 'inactive' : 'unknown')));
  const statusLabel = t(`sandbox.status.${statusKey}`) || statusKey;
  if (sandboxStatusBadge) {
    sandboxStatusBadge.dataset.status = statusKey;
    sandboxStatusBadge.textContent = statusLabel;
  }
  if (sandboxButtonStatus) {
    sandboxButtonStatus.dataset.status = statusKey;
    sandboxButtonStatus.textContent = statusLabel;
  }
  if (sandboxUnavailable) sandboxUnavailable.hidden = !!installedFlag;
  if (sandboxInstallAppBtn) {
    sandboxInstallAppBtn.disabled = sandboxState.busy || installedFlag;
    sandboxInstallAppBtn.hidden = installedFlag;
  }
  if (sandboxDepsAlert) sandboxDepsAlert.hidden = sandboxState.depsReady || !sandboxEligible;
  const isSandboxed = !!info.sandboxed;
  if (sandboxInstallDepsBtn) sandboxInstallDepsBtn.disabled = sandboxState.busy || !sandboxEligible;
  if (sandboxConfigureBtn) sandboxConfigureBtn.disabled = sandboxState.busy || !info.installed || !sandboxState.depsReady || isSandboxed || !sandboxEligible;
  if (sandboxDisableBtn) sandboxDisableBtn.disabled = sandboxState.busy || !isSandboxed || !sandboxEligible;
  if (sandboxRefreshBtn) sandboxRefreshBtn.disabled = sandboxState.busy;
  updateSandboxActionStyles(isSandboxed);
  renderSandboxSummary();
}

async function refreshSandboxInfo(appName = sandboxState.currentApp) {
  if (!sandboxCard) return;
  if (!appName) {
    sandboxState.info = null;
    sandboxCard.hidden = true;
    return;
  }
  sandboxState.currentApp = appName;
  sandboxCard.hidden = false;
  setSandboxBusy(true);
  try {
    const response = await window.electronAPI.getSandboxInfo(appName);
    const info = response?.info || { installed: false, sandboxed: false };
    const depsFromInfo = typeof info?.dependenciesReady === 'boolean' ? info.dependenciesReady : null;
    const depsFromResponse = !!(response?.dependencies && (response.dependencies.hasSas || response.dependencies.hasAisap));
    const depsFlag = depsFromInfo !== null ? depsFromInfo : depsFromResponse;
    const listInstalled = isAppInstalledInList(appName);
    if (!info.installed && listInstalled) info.installed = true;
    info.dependenciesReady = depsFlag;
    sandboxState.info = info;
    sandboxState.depsReady = !!depsFlag;
    setAppSandboxState(appName, !!info.sandboxed);
    renderSandboxCard();
  } catch (error) {
    appendSandboxLog(`\n${error?.message || 'IPC error'}\n`);
  } finally {
    setSandboxBusy(false);
  }
}

function collectSandboxFormValues() {
  const shareDirs = {};
  let hasSelection = false;
  if (sandboxForm) {
    SANDBOX_DIR_VALUES.forEach((dir) => {
      const input = sandboxForm.querySelector(`input[value="${dir}"]`);
      const checked = !!(input && input.checked);
      shareDirs[dir] = checked;
      if (checked) hasSelection = true;
    });
  }
  const customPath = (sandboxCustomPathInput?.value || '').trim();
  const configureDirs = hasSelection || !!customPath;
  return { shareDirs, customPath, configureDirs };
}

function loadSandboxSharePrefs() {
  try {
    const raw = localStorage.getItem(SANDBOX_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistSandboxSharePrefs() {
  try {
    localStorage.setItem(SANDBOX_PREFS_KEY, JSON.stringify(sandboxSharePrefs));
  } catch (_) {}
}

function getSandboxSharePrefs(appName) {
  if (!appName) return null;
  const key = appName.toLowerCase();
  return sandboxSharePrefs[key] || null;
}

function rememberSandboxSharePrefs(appName, data) {
  if (!appName || !data) return;
  const key = appName.toLowerCase();
  const nextPrefs = { shareDirs: {}, customPath: data.customPath || '' };
  SANDBOX_DIR_VALUES.forEach((dir) => {
    nextPrefs.shareDirs[dir] = !!data.shareDirs?.[dir];
  });
  sandboxSharePrefs[key] = nextPrefs;
  persistSandboxSharePrefs();
}

function applySandboxPrefsToForm(appName) {
  if (!sandboxForm) return;
  const prefs = getSandboxSharePrefs(appName);
  SANDBOX_DIR_VALUES.forEach((dir) => {
    const input = sandboxForm.querySelector(`input[value="${dir}"]`);
    if (input) input.checked = !!(prefs?.shareDirs?.[dir]);
  });
  if (sandboxCustomPathInput) sandboxCustomPathInput.value = prefs?.customPath || '';
}

function getSandboxSummaryEntries(prefs) {
  if (!prefs || typeof prefs !== 'object') return [];
  const entries = [];
  SANDBOX_DIR_VALUES.forEach((dir) => {
    if (prefs.shareDirs && prefs.shareDirs[dir]) entries.push({ type: 'dir', value: dir });
  });
  if (prefs.customPath) entries.push({ type: 'custom', value: prefs.customPath });
  return entries;
}

function renderSandboxSummary() {
  if (!sandboxSummary) return;
  const hasApp = !!sandboxState.currentApp;
  const isSandboxed = !!(sandboxState.info && sandboxState.info.sandboxed);
  const prefs = getSandboxSharePrefs(sandboxState.currentApp);
  const entries = getSandboxSummaryEntries(prefs);
  const shouldShow = hasApp && isSandboxed;
  sandboxSummary.hidden = !shouldShow;
  if (!sandboxSummaryList) return;
  if (!shouldShow) {
    sandboxSummaryList.innerHTML = '';
    sandboxSummaryList.hidden = true;
    if (sandboxSummaryEmpty) sandboxSummaryEmpty.hidden = false;
    return;
  }
  sandboxSummaryList.innerHTML = '';
  if (!entries.length) {
    sandboxSummaryList.hidden = true;
    if (sandboxSummaryEmpty) sandboxSummaryEmpty.hidden = false;
    return;
  }
  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'sandbox-summary-item';
    if (entry.type === 'dir') {
      li.textContent = t(SANDBOX_DIR_LABEL_KEYS[entry.value]) || entry.value;
    } else if (entry.type === 'custom') {
      const label = document.createElement('span');
      label.className = 'sandbox-summary-label';
      label.textContent = t('sandbox.summary.custom');
      const path = document.createElement('code');
      path.className = 'sandbox-summary-path';
      path.textContent = entry.value;
      li.append(label, path);
    }
    fragment.appendChild(li);
  });
  sandboxSummaryList.hidden = false;
  sandboxSummaryList.appendChild(fragment);
  if (sandboxSummaryEmpty) sandboxSummaryEmpty.hidden = true;
}

function isAppSandboxed(appName) {
  if (!appName) return false;
  return sandboxedApps.get(appName.toLowerCase()) === true;
}

function setAppSandboxState(appName, active) {
  if (!appName) return;
  const key = appName.toLowerCase();
  const nextState = !!active;
  const prevState = sandboxedApps.has(key);
  if (nextState === prevState) {
    return;
  }
  if (nextState) sandboxedApps.set(key, true);
  else sandboxedApps.delete(key);
  refreshSandboxBadgesForApp(appName);
  scheduleInstalledResort();
}

function cleanupSandboxCache() {
  if (!sandboxedApps.size || !(state.installed instanceof Set)) return;
  sandboxedApps.forEach((_, key) => {
    if (!state.installed.has(key)) sandboxedApps.delete(key);
  });
}

function applySandboxBadgeToIcon(iconWrapper, isActive) {
  if (!iconWrapper) return;
  const badge = iconWrapper.querySelector('.installed-badge');
  if (!badge) return;
  const label = isActive ? t('sandbox.status.active') : t('installed.badge');
  const symbol = isActive ? '🔒' : '✓';
  badge.textContent = symbol;
  badge.setAttribute('aria-label', label);
  badge.title = label;
}

function refreshSandboxBadgesForApp(appName) {
  if (!appName) return;
  const lower = appName.toLowerCase();
  const active = isAppSandboxed(appName);
  document.querySelectorAll('.app-tile').forEach(tile => {
    const appId = (tile.getAttribute('data-app') || '').toLowerCase();
    const tileName = appId.includes('|') ? appId.slice(0, appId.lastIndexOf('|')) : appId;
    if (tileName !== lower) return;
    const iconWrapper = tile.querySelector('.tile-icon');
    applySandboxBadgeToIcon(iconWrapper, active);
  });
  if (detailsName && detailsName.dataset.app === lower) {
    applyDetailsSandboxBadge(appName);
  }
}

function refreshAllSandboxBadges() {
  document.querySelectorAll('.app-tile').forEach(tile => {
    const appId = tile.getAttribute('data-app') || '';
    const tileName = appId.includes('|') ? appId.slice(0, appId.lastIndexOf('|')) : appId;
    if (!tileName) return;
    const iconWrapper = tile.querySelector('.tile-icon');
    applySandboxBadgeToIcon(iconWrapper, isAppSandboxed(tileName));
  });
  if (state.currentDetailsApp) {
    applyDetailsSandboxBadge(state.currentDetailsApp);
  }
}

function applyDetailsSandboxBadge(appName) {
  if (!detailsIcon) return;
  const wrapper = detailsIcon.parentElement;
  if (!wrapper || !wrapper.classList.contains('details-icon-wrapper')) return;
  if (getComputedStyle(wrapper).position === 'static') {
    wrapper.style.position = 'relative';
  }
  const target = appName || state.currentDetailsApp;
  const entry = state.allApps.find(a => a && a.name === target);
  const isCurrentlyInstalling = !!(activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === target);
  let isInstalled = false;
  if (entry) {
    isInstalled = !!(entry.installed && entry.hasDiamond !== false);
  } else if (target) {
    isInstalled = state.installed instanceof Set && state.installed.has(String(target).toLowerCase());
  }
  if (isCurrentlyInstalling) {
    isInstalled = false;
  }
  const badge = wrapper.querySelector('.installed-badge');
  if (!isInstalled) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'installed-badge';
    badgeEl.style.position = 'absolute';
    badgeEl.style.top = '0';
    badgeEl.style.right = '0';
    badgeEl.style.zIndex = '2';
    wrapper.appendChild(badgeEl);
  }
  applySandboxBadgeToIcon(wrapper, isAppSandboxed(target));
}

function scheduleSandboxStateSweep() {
  if (!window.electronAPI?.getSandboxInfo) return;
  const token = ++sandboxSweepToken;
  runSandboxStateSweep(token).catch(() => {});
}

async function runSandboxStateSweep(token) {
  const installedApps = (state.allApps || []).filter(app => app && app.installed && app.name).map(app => app.name);
  for (const appName of installedApps) {
    if (token !== sandboxSweepToken) return;
    try {
      const response = await window.electronAPI.getSandboxInfo(appName);
      if (token !== sandboxSweepToken) return;
      const info = response?.info;
      setAppSandboxState(appName, !!info?.sandboxed);
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 65));
  }
}

function handleSandboxShow(appName) {
  if (!sandboxCard) return;
  const isSameApp = sandboxState.currentApp === appName;
  sandboxState.pendingAction = null;
  closeNonAppimageModal();
  sandboxState.currentApp = appName;
  sandboxState.info = null;
  if (!isSameApp) {
    setSandboxLogExpanded(false);
  }
  applySandboxPrefsToForm(appName);
  resetSandboxLog();
  renderSandboxSummary();
  refreshSandboxInfo(appName);
}

function handleSandboxExit() {
  sandboxState.currentApp = null;
  sandboxState.info = null;
  sandboxState.pendingAction = null;
  sandboxState.logBuffer = '';
  sandboxState.supported = true;
  setSandboxLogExpanded(false);
  if (sandboxCard) sandboxCard.hidden = true;
  closeSandboxModal();
  renderSandboxCard();
}

sandboxRefreshBtn?.addEventListener('click', () => {
  if (sandboxState.busy || !sandboxState.currentApp) return;
  refreshSandboxInfo();
});

sandboxInstallDepsBtn?.addEventListener('click', async () => {
  if (sandboxState.busy) return;
  setSandboxBusy(true);
  try {
    await window.electronAPI.depInstall('sas');
    showToast(t('sandbox.toast.depsInstalled'));
  } catch (error) {
    notifySandboxError(error?.code || null);
  } finally {
    setSandboxBusy(false);
    refreshSandboxInfo();
  }
});

sandboxConfigureBtn?.addEventListener('click', async () => {
  if (sandboxState.busy) return;
  if (!sandboxState.info?.installed) {
    showToast(t('sandbox.toast.requireInstall'));
    return;
  }
  if (!sandboxState.depsReady) {
    showToast(t('sandbox.toast.missingDeps'));
    return;
  }
  const payload = collectSandboxFormValues();
  payload.appName = sandboxState.currentApp;
  sandboxState.pendingAction = { type: 'configure', id: null };
  resetSandboxLog();
  setSandboxBusy(true);
  try {
    const result = await window.electronAPI.configureSandbox(payload);
    const currentLog = stripAnsiSequences(sandboxState.logBuffer || '');
    if (result?.output && !currentLog.trim()) appendSandboxLog(result.output);
    if (result?.ok) {
      rememberSandboxSharePrefs(sandboxState.currentApp, payload);
      renderSandboxSummary();
      setAppSandboxState(sandboxState.currentApp, true);
      showToast(t('sandbox.toast.enabled', { name: sandboxState.currentApp }));
      refreshSandboxInfo();
    } else {
      notifySandboxError(result?.error);
    }
  } catch (error) {
    notifySandboxError(error?.code || null);
  } finally {
    sandboxState.pendingAction = null;
    setSandboxBusy(false);
  }
});

sandboxDisableBtn?.addEventListener('click', async () => {
  if (sandboxState.busy || !sandboxState.info?.sandboxed) return;
  sandboxState.pendingAction = { type: 'disable', id: null };
  resetSandboxLog();
  setSandboxBusy(true);
  try {
    const result = await window.electronAPI.disableSandbox({ appName: sandboxState.currentApp });
    const currentLog = stripAnsiSequences(sandboxState.logBuffer || '');
    if (result?.output && !currentLog.trim()) appendSandboxLog(result.output);
    if (result?.ok) {
      setAppSandboxState(sandboxState.currentApp, false);
      showToast(t('sandbox.toast.disabled', { name: sandboxState.currentApp }));
      refreshSandboxInfo();
    } else {
      notifySandboxError(result?.error);
    }
  } catch (error) {
    notifySandboxError(error?.code || null);
  } finally {
    sandboxState.pendingAction = null;
    setSandboxBusy(false);
  }
});

sandboxInstallAppBtn?.addEventListener('click', () => {
  if (sandboxState.busy || sandboxState.info?.installed) return;
  closeSandboxModal();
  detailsInstallBtn?.click();
});

sandboxLogToggle?.addEventListener('click', () => {
  setSandboxLogExpanded(!isSandboxLogExpanded());
});

// Scope toggle for am installs (system vs user)
const installScopeBtn = document.getElementById('installScopeBtn');

function updateScopeButtonUI() {
  const btn = document.getElementById('installScopeBtn');
  if (!btn) return;
  const isAm = String(state.pmName || '').trim().toLowerCase() === 'am';
  btn.hidden = !isAm;
  if (isAm) {
    const effectiveScope = detailScopeOverride ?? installScope;
    btn.textContent = t('settings.installScope') + ': ' + (effectiveScope === 'user' ? t('install.scope.user') : t('install.scope.system'));
  }
}

installScopeBtn?.addEventListener('click', () => {
  const effectiveScope = detailScopeOverride ?? installScope;
  detailScopeOverride = effectiveScope === 'user' ? 'system' : 'user';
  state.currentDetailsScope = detailScopeOverride;
  updateScopeButtonUI();
  // Re-render install/uninstall buttons for the new scope
  if (state.currentDetailsApp) {
    const currentAppId = state.currentDetailsApp;
    const parsedName = currentAppId.includes('|') ? currentAppId.slice(0, currentAppId.lastIndexOf('|')) : currentAppId;
    const newScope = detailScopeOverride ?? installScope;
    // Update currentDetailsApp so post-uninstall refresh uses the correct scope
    state.currentDetailsApp = parsedName + '|' + newScope;
    const app = (state.allApps || []).find(e => e && e.name === parsedName && e.scope === newScope);
    const isInstalled = !!app && !!app.installed;
    const appVersion = app?.version || null;
    if (detailsInstallBtn) {
      detailsInstallBtn.hidden = isInstalled;
      detailsInstallBtn.setAttribute('data-name', parsedName);
      detailsInstallBtn.classList.remove('loading');
      detailsInstallBtn.disabled = false;
      detailsInstallBtn.textContent = t('details.install');
      detailsInstallBtn.setAttribute('data-action', 'install');
      detailsInstallBtn.setAttribute('aria-label', t('details.install'));
    }
    if (detailsUninstallBtn) {
      detailsUninstallBtn.hidden = !isInstalled;
      detailsUninstallBtn.disabled = false;
      detailsUninstallBtn.setAttribute('data-name', parsedName);
    }
    if (detailsName) {
      const label = prettifyAppName(parsedName);
      const version = appVersion ? ' · ' + appVersion : '';
      const scopeLabel = newScope ? ' <span class="updated-scope-tag">(' + (newScope === 'user' ? t('install.scope.user') : t('install.scope.system')) + ')</span>' : '';
      detailsName.innerHTML = `${label}${version}${scopeLabel}`;
      detailsName.dataset.app = parsedName.toLowerCase();
    }
  }
});

sandboxOpenBtn?.addEventListener('click', async () => {
  if (!sandboxState.currentApp) return;
  // If info is not loaded yet, wait for loading
  if (!sandboxState.info && !sandboxState.busy) {
    setSandboxBusy(true);
    try {
      const response = await window.electronAPI.getSandboxInfo(sandboxState.currentApp);
      sandboxState.info = response?.info || { installed: false, sandboxed: false };
      sandboxState.depsReady = !!(response?.dependencies && (response.dependencies.hasSas || response.dependencies.hasAisap));
      renderSandboxCard();
    } catch (_) {}
    setSandboxBusy(false);
  }
  const forbiddenReason = sandboxState.info?.sandboxForbiddenReason || (sandboxState.info?.selfSandboxProhibited ? 'self' : null);
  if (!isSandboxSupported(sandboxState.currentApp) || forbiddenReason) {
    showNonAppimageModal(sandboxState.currentApp, forbiddenReason);
    return;
  }
  openSandboxModal();
});

sandboxCloseBtn?.addEventListener('click', () => {
  closeSandboxModal();
});

sandboxModal?.addEventListener('click', (event) => {
  if (event.target === sandboxModal) {
    closeSandboxModal();
  }
});

nonAppimageCloseBtn?.addEventListener('click', () => {
  closeNonAppimageModal();
});

nonAppimageDismissBtn?.addEventListener('click', () => {
  closeNonAppimageModal();
});

nonAppimageModal?.addEventListener('click', (event) => {
  if (event.target === nonAppimageModal) {
    closeNonAppimageModal();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (nonAppimageModal && !nonAppimageModal.hidden) {
    event.stopPropagation();
    closeNonAppimageModal();
    return;
  }
  if (sandboxModal && !sandboxModal.hidden) {
    closeSandboxModal();
  }
});

if (window.electronAPI?.onSandboxProgress) {
  window.electronAPI.onSandboxProgress((message) => {
    if (!message || !sandboxState.currentApp) return;
    if (message.appName !== sandboxState.currentApp) return;
    if (!sandboxState.pendingAction) return;
    if (sandboxState.pendingAction.type !== message.action) return;
    if (!sandboxState.pendingAction.id && message.id) sandboxState.pendingAction.id = message.id;
    if (sandboxState.pendingAction.id && message.id && sandboxState.pendingAction.id !== message.id) return;
    if (message.kind === 'start') {
      resetSandboxLog();
      setSandboxBusy(true);
    } else if (message.kind === 'data' && typeof message.chunk === 'string') {
      appendSandboxLog(message.chunk);
    } else if (message.kind === 'error' && message.message) {
      appendSandboxLog(`\n${message.message}\n`);
    } else if (message.kind === 'done') {
      sandboxState.pendingAction = null;
      setSandboxBusy(false);
      refreshSandboxInfo();
    }
  });
}

function notifySandboxError(code) {
  switch (code) {
    case 'missing-dependency':
      showToast(t('sandbox.toast.missingDeps'));
      return;
    case 'missing-path':
      showToast(t('sandbox.toast.missingPath'));
      return;
    case 'forbidden-path':
      showToast(t('sandbox.toast.forbiddenPath'));
      return;
    case 'invalid-app':
      showToast(t('sandbox.toast.requireInstall'));
      return;
    case 'missing-pm':
      showToast(t('missingPm.desc'));
      return;
    default:
      showToast(t('sandbox.toast.error'));
  }
}

function getQueuePosition(name){
  const idx = installQueue.indexOf(name);
  return idx === -1 ? -1 : (idx + 1); // position 1-based
}

function removeFromQueue(name){
  const idx = installQueue.indexOf(name);
  if (idx === -1) return false;
  installQueue.splice(idx,1);
  try {
    if (typeof updateQueueIndicators === 'function') updateQueueIndicators();
    // Debounce to avoid double refresh on multiple rapid removals
    if (window.__queueRefreshTimeout) clearTimeout(window.__queueRefreshTimeout);
    window.__queueRefreshTimeout = setTimeout(()=>{
      try { refreshAllInstallButtons(); } catch(e) { console.error('Erreur refreshAllInstallButtons', e); }
    }, 300);
  showToast(t('toast.removedFromQueue', {name}));
  } catch(e) {
    console.error('Erreur removeFromQueue', e);
  showToast(t('toast.removeQueueError'));
  }
  return true;
}

function refreshDetailsInstallButtonForQueue(){
  if (!detailsInstallBtn || !detailsInstallBtn.getAttribute('data-name')) return;
  detailsInstallBtn.classList.remove('loading');
  const name = detailsInstallBtn.getAttribute('data-name');
  if (!name) return;
  // Active en cours
  if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name){
    // Button becomes cancel
    detailsInstallBtn.disabled = false;
    detailsInstallBtn.classList.remove('loading');
    detailsInstallBtn.textContent = t('install.status') + ' ✕';
    detailsInstallBtn.setAttribute('data-action','cancel-install');
    detailsInstallBtn.setAttribute('aria-label', t('install.cancel') || 'Cancel installation in progress ('+name+')');
    return;
  }
  const pos = getQueuePosition(name);
  if (pos !== -1){
    detailsInstallBtn.disabled = false;
    detailsInstallBtn.classList.remove('loading');
    detailsInstallBtn.textContent = t('install.queued') ? t('install.queued').replace('{pos}', pos) : ('En file (#' + pos + ') ✕');
    detailsInstallBtn.setAttribute('data-action','remove-queue');
    detailsInstallBtn.setAttribute('aria-label', t('install.removeQueue') || ('Retirer de la file (' + name + ')'));
    return;
  }
  // Otherwise if already installed, it's hidden elsewhere, but reset label just in case
  if (!detailsInstallBtn.hidden){
    detailsInstallBtn.textContent = t('details.install');
    detailsInstallBtn.classList.remove('loading');
    detailsInstallBtn.disabled = false;
    detailsInstallBtn.setAttribute('data-action','install');
  }
}

// Sync list buttons
function refreshListInstallButtons(){
  // Target all inline buttons in the list to manage states (cancel / queued)
  const buttons = document.querySelectorAll('.app-tile .actions .inline-action');
  buttons.forEach(btn => {
    const name = btn.getAttribute('data-app');
    if (!name) return;
    // If active install for this app -> cancel button
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name){
      btn.textContent = t('install.status') + ' ✕';
      btn.disabled = false;
      btn.setAttribute('data-action','cancel-install');
      btn.setAttribute('aria-label', t('install.cancel') || 'Cancel installation in progress ('+name+')');
      btn.style.display = '';
      return;
    }
    // If queued -> remove from queue button
    const pos = getQueuePosition(name);
    if (pos !== -1){
      btn.textContent = t('install.queued') ? t('install.queued').replace('{pos}', pos) : ('En file (#' + pos + ') ✕');
      btn.disabled = false;
      btn.setAttribute('data-action','remove-queue');
      btn.setAttribute('aria-label', t('install.removeQueue') || ('Retirer de la file (' + name + ')'));
      btn.style.display = '';
      return;
    }
    // No special state -> hide the button in list mode to avoid direct actions
    btn.style.display = 'none';
  });
}

function refreshAllInstallButtons(){
  refreshDetailsInstallButtonForQueue();
  refreshListInstallButtons();
  refreshTileBadges();
}

// Update/inject state badges in non-list modes
function refreshTileBadges() {
  if (state.viewMode === 'list') return; // list handled by buttons
  if (!state.installed || typeof state.installed.has !== 'function') return; // safety guard
  const tiles = document.querySelectorAll('.app-tile');
  tiles.forEach(tile => {
    const appId = tile.getAttribute('data-app') || '';
    const name = appId.includes('|') ? appId.slice(0, appId.lastIndexOf('|')) : appId;
    const installed = state.installed.has(name);
    const nameEl = tile.querySelector('.tile-name');
    if (!nameEl) return;
    // Supprimer badge existant
    const existing = nameEl.querySelector('.install-state-badge');
    if (existing) existing.remove();
    if (installed) return; // no badge if already installed
    let badgeHtml = '';
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name) {
      // Add cancel button in the install badge
      badgeHtml = `<span class="install-state-badge installing" data-state="installing">${t('install.installing')}<button class="queue-remove-badge inline-action" data-action="cancel-install" data-app="${name}" title="${t('install.cancel')}" aria-label="${t('install.cancel')}">✕</button></span>`;
    } else {
      const pos = getQueuePosition(name);
      if (pos !== -1) badgeHtml = `<span class="install-state-badge queued" data-state="queued">${t('install.queuePosition', { pos: pos })}<button class="queue-remove-badge inline-action" data-action="remove-queue" data-app="${name}" title="${t('install.removeQueue')}" aria-label="${t('install.removeQueue')}">✕</button></span>`;
    }
    if (badgeHtml) nameEl.insertAdjacentHTML('beforeend', ' ' + badgeHtml);
  });
}

function refreshQueueUI(){
  // Only refreshes queue representations.
  refreshAllInstallButtons();
}

function processNextInstall(){
  // Don't start anything if an active install is not finished
  if (activeInstallSession.id && !activeInstallSession.done) return;
  if (!installQueue.length) return;
  const next = installQueue.shift();
  const scope = installScopeMap.get(next) || installScope;
  installScopeMap.delete(next);
  refreshQueueUI();
  refreshTileBadges();
  // Nettoyer busy sur toutes les autres tuiles, puis marquer uniquement celle en cours
  document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
  const tile = Array.from(document.querySelectorAll('.app-tile')).find(t => {
    const d = t.getAttribute('data-app') || '';
    return d === next || d.startsWith(next + '|');
  });
  if (tile) tile.classList.add('busy');
  const inlineBtn = Array.from(document.querySelectorAll('.inline-action.install')).find(b => {
    const d = b.getAttribute('data-app') || '';
    return d === next || d.startsWith(next + '|');
  });
  if (inlineBtn) inlineBtn.disabled = true;
  showToast(t('toast.installing', {name: next}));
  startStreamingInstall(next, scope).catch((err) => {
    showToast(err?.message || t('toast.installFailed', {name: next}));
    activeInstallSession.done = true;
    setTimeout(() => processNextInstall(), 200);
  });
  refreshAllInstallButtons();
}

function enqueueInstall(name, scope){
  if (!name) return;
  // Check if already in progress or in queue
  if ((activeInstallSession.name === name && !activeInstallSession.done) || installQueue.includes(name)) {
    showToast(t('toast.alreadyInQueue', {name}));
    return;
  }
  if (scope) installScopeMap.set(name, scope);
  if (activeInstallSession.id && !activeInstallSession.done) {
    installQueue.push(name);
  refreshQueueUI();
  showToast(t('toast.addedToQueue', {name, count: installQueue.length}));
  } else {
    installQueue.push(name);
  refreshQueueUI();
    processNextInstall();
  }
  refreshAllInstallButtons();
}

async function cancelActiveInstall(expectedName = null) {
  // Always close existing choice dialogs
  document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
  if (!activeInstallSession || activeInstallSession.done) return;
  if (expectedName && activeInstallSession.name !== expectedName) return;
  if (!activeInstallSession.id) return;
  const appName = activeInstallSession.name;
  try {
    await window.electronAPI.installCancel(activeInstallSession.id);
    showToast(t('toast.cancelRequested'));
    try {
      await window.electronAPI.uninstallApp(appName);
    } catch (_){ }
    try {
      await loadApps();
      applySearch();
    } catch (_){ }
  } catch (_) {
    showToast(t('toast.cancelError'));
  }
}
let syncBtn = null;
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const openExternalCheckbox = document.getElementById('openExternalLinksCheckbox');
const purgeIconsBtn = document.getElementById('purgeIconsBtn');
const purgeIconsResult = document.getElementById('purgeIconsResult');
const tabs = document.querySelectorAll('.tab');
// Updates
let updateInProgress = false;
let updatesXterm = null;
let updatesXtermFit = null;
let updatesTerminalEl = null;
let updatesTerminalFallbackMode = false;
let updatesTerminalExpanded = false;
let updateSpinnerBusy = false;
let activeUpdateStreamId = null;
let updatesStreamBuffer = ''; // Buffer to accumulate streaming output
const updateStreamWaiters = new Map();
const updatesPanel = document.getElementById('updatesPanel');
const advancedPanel = document.getElementById('advancedPanel');
const runUpdatesBtn = document.getElementById('runUpdatesBtn');
const updateSpinner = document.getElementById('updateSpinner');
const updateResult = document.getElementById('updateResult');
const updateFinalMessage = document.getElementById('updateFinalMessage');
const updatedAppsIcons = document.getElementById('updatedAppsIcons');
const updatesTerminalWrap = document.getElementById('updatesTerminalWrap');
const updatesTerminalNode = document.getElementById('updatesTerminal');
const updatesToggleBtn = document.getElementById('updatesToggleBtn');
const installedCountEl = document.getElementById('installedCount');

function rerenderActiveCategory() {
  if (applySearch !== defaultApplySearch) {
    try {
      applySearch();
      return;
    } catch (err) {
      console.error('applySearch failed, falling back to direct render', err);
    }
  }
  if (state.activeCategory === 'updates') {
    if (appsDiv) {
      appsDiv.innerHTML = '';
      appsDiv.hidden = true;
    }
    if (updatesPanel) updatesPanel.hidden = false;
    if (advancedPanel) advancedPanel.hidden = true;
    return;
  }
  if (state.activeCategory === 'advanced') {
    if (appsDiv) {
      appsDiv.innerHTML = '';
      appsDiv.hidden = true;
    }
    if (advancedPanel) advancedPanel.hidden = false;
    if (updatesPanel) updatesPanel.hidden = true;
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
// ...existing code...
// Modale confirmation actions
const actionConfirmModal = document.getElementById('actionConfirmModal');
const actionConfirmMessage = document.getElementById('actionConfirmMessage');
const actionConfirmCancel = document.getElementById('actionConfirmCancel');
const actionConfirmOk = document.getElementById('actionConfirmOk');
let confirmResolve = null;
function openActionConfirm({ title, message, okLabel, intent }) {
  if (!actionConfirmModal) return Promise.resolve(false);
  actionConfirmMessage.innerHTML = message || '';
  actionConfirmOk.textContent = okLabel || t('confirm.ok');
  // Intent styling (danger / install)
  actionConfirmOk.className = 'btn';
  if (intent === 'danger') {
    actionConfirmOk.classList.add('btn-soft-red');
  } else {
    actionConfirmOk.classList.add('btn-soft-blue');
  }
  if (actionConfirmCancel) actionConfirmCancel.className = 'btn-soft-neutral';
  actionConfirmModal.hidden = false;
  setTimeout(()=> actionConfirmOk.focus(), 30);
  return new Promise(res => { confirmResolve = res; });
}
function closeActionConfirm(result){
  if (!actionConfirmModal) return;
  actionConfirmModal.hidden = true;
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}
actionConfirmCancel?.addEventListener('click', ()=> closeActionConfirm(false));
actionConfirmOk?.addEventListener('click', ()=> closeActionConfirm(true));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && actionConfirmModal && !actionConfirmModal.hidden) {
    e.stopPropagation();
    closeActionConfirm(false);
  }
  if (e.key === 'Enter' && actionConfirmModal && !actionConfirmModal.hidden) {
    // Valide sur Enter uniquement si focus pas sur Cancel
    const active = document.activeElement;
    if (active !== actionConfirmCancel) {
      e.preventDefault();
      closeActionConfirm(true);
    }
  }
}, { capture:true });
// Lightbox
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const lightboxClose = document.getElementById('lightboxClose');
let lightboxState = { images: [], index: 0, originApp: null };

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
  if (!text) throw new Error('nothing to copy');
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
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
    const confirmed = await openActionConfirm({
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
  setUpdateSpinnerBusy(updateSpinnerBusy);
  updateUpdatesToggleUi();
  if (!sandboxState.logBuffer) resetSandboxLog();
  refreshAllSandboxBadges();
  // Refresh sandbox card to reflect language and dynamic labels
  try { renderSandboxCard(); } catch(_) {}
  // Si la popup non-AppImage est ouverte, re-injecter le texte traduit
  try {
    if (nonAppimageModal && !nonAppimageModal.hidden) {
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
    installScope = scope;
    updateScopeButtonUI();
  }
}) || null;

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
let _loadAppsSeq = 0;
async function loadApps() {
  const seq = ++_loadAppsSeq;
  appsDiv?.setAttribute('aria-busy','true');
  let detailed;
  try {
    detailed = await window.electronAPI.listAppsDetailed();
  } catch (e) {
    detailed = { all: [], installed: [], error: t('error.ipc', {msg: e?.message || e}) };
  }
  if (seq !== _loadAppsSeq) return; // stale – a newer loadApps is running
  if (!detailed.pmFound) {
    state.allApps = [];
    state.filtered = [];
    showMissingPmPopup();
    if (appsDiv) {
      appsDiv.innerHTML = `<div class="empty-state pm-empty-placeholder"><p>${t('missingPm.popup.desc')}</p></div>`;
    }
    if (installedCountEl) installedCountEl.textContent = '0';
    sandboxedApps.clear();
    refreshAllSandboxBadges();
    appsDiv?.setAttribute('aria-busy','false');
    return;
  }
  hideMissingPmPopup();
  if (detailed.bothPms) {
    state.allApps = [];
    state.filtered = [];
    showBothPmsPopup(true);
    if (appsDiv) {
      appsDiv.innerHTML = `<div class="empty-state pm-empty-placeholder"><p>${t('bothPms.popup.desc')}</p></div>`;
    }
    if (installedCountEl) installedCountEl.textContent = '0';
    sandboxedApps.clear();
    refreshAllSandboxBadges();
    appsDiv?.setAttribute('aria-busy','false');
    return;
  }
  showBothPmsPopup(false);
  if (detailed.error) {
    state.allApps = [];
    state.filtered = [];
    if (appsDiv) appsDiv.innerHTML = `<div class='empty-state'><h3>${t('error.dialogTitle')}</h3><p style='font-size:13px;'>${detailed.error}</p></div>`;
    if (installedCountEl) installedCountEl.textContent = '0';
    sandboxedApps.clear();
    refreshAllSandboxBadges();
    appsDiv?.setAttribute('aria-busy','false');
    return;
  }
  state.allApps = detailed.all || [];
  state.filtered = state.allApps;
  state.pmName = detailed.pmName || null;
  const isAmPm = String(state.pmName || '').trim().toLowerCase() === 'am';
  // Default install scope: 'user' for am, null for appman; restore from localStorage
  const savedScope = localStorage.getItem('installScope');
  installScope = isAmPm ? (savedScope || 'user') : null;
  // Show/hide install scope setting in preferences
  // Show only for am (supports both system and user scopes)
  const scopeSettingsGroup = document.getElementById('installScopeSettingsGroup');
  if (scopeSettingsGroup) {
    scopeSettingsGroup.hidden = !isAmPm;
    if (isAmPm) {
      scopeSettingsGroup.querySelectorAll('input[name="installScopePref"]').forEach(r => {
        r.checked = r.value === installScope;
      });
    }
  }
  // Build the set of installed apps
  try {
    const installedNames = new Set();
    if (Array.isArray(detailed.installed)) {
      detailed.installed.forEach(entry => {
        if (!entry) return;
        if (typeof entry === 'string') installedNames.add(entry.toLowerCase());
        else if (entry.name) installedNames.add(String(entry.name).toLowerCase());
      });
    } else {
      // Fallback: derive from allApps
      state.allApps.filter(a=>a && a.installed && a.name).forEach(a=> installedNames.add(a.name.toLowerCase()));
    }
    state.installed = installedNames;
  } catch(_) { state.installed = new Set(); }
  // Dynamic app group filtering:
  // 1. Bundle children: mark as installed when parent suite is installed
  //    (e.g. user installs "adb" → "platform-tools" is installed → adb stays
  //    visible and is shown as installed, so the user gets clear feedback)
  // 2. Appimage mutex pairs: X-appimage and X share the same binary/config;
  //    hide only the uninstalled partner so the installed one stays visible.
  function applyAppGroupFiltering(bundleChildOf) {
    const toRemove = new Set();
    // 1. Bundle children: remove from all views (parent stays visible, installed).
    //    After installing a child (adb…) the details panel redirects to the parent.
    for (const app of state.allApps) {
      const name = String(app.name).toLowerCase();
      const parent = (bundleChildOf || {})[name];
      if (parent && state.installed.has(parent.toLowerCase())) {
        state.installed.add(name);
        toRemove.add(name);
      }
    }
    // 2. Appimage mutex pairs (e.g. firefox ↔ firefox-appimage)
    // Also build mutexRedirect: { 'firefox-appimage': 'firefox' } so that
    // post-install can redirect to the surviving app.
    const allNames = new Set(state.allApps.map(a => String(a.name).toLowerCase()));
    const mutexRedirect = {};
    for (const app of state.allApps) {
      const name = String(app.name).toLowerCase();
      if (name.endsWith('-appimage')) {
        const base = name.slice(0, -'-appimage'.length);
        if (allNames.has(base)) {
          if (state.installed.has(base)) {
            toRemove.add(name);
            mutexRedirect[name] = base; // installing firefox-appimage → show firefox
          } else if (state.installed.has(name)) {
            toRemove.add(base);
            mutexRedirect[base] = name; // installing firefox → show firefox-appimage
          }
        }
      }
    }
    state.mutexRedirect = mutexRedirect;
    if (toRemove.size > 0) {
      state.allApps = state.allApps.filter(a => !toRemove.has(String(a.name).toLowerCase()));
      state.filtered = state.filtered.filter(a => !toRemove.has(String(a.name).toLowerCase()));
    }
  }
  state.bundleChildOf = detailed.bundleChildOf || {};
  state.mutexRedirect = {};
  applyAppGroupFiltering(detailed.bundleChildOf);
  if (seq !== _loadAppsSeq) return; // stale
  if (installedCountEl) installedCountEl.textContent = String(state.allApps.filter(a => a.installed).length);
  cleanupSandboxCache();
  rerenderActiveCategory();
  refreshAllSandboxBadges();
  scheduleSandboxStateSweep();
  prefetchPreloadImages();
}

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
    const isActuallyInstalled = app.installed && !(activeInstallSession && activeInstallSession.name === app.name && activeInstallSession.id && !activeInstallSession.done);
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
    detailsInstallBtn.setAttribute('data-name', app.name);
    // Always remove spinner and re-enable the button
  detailsInstallBtn.classList.remove('loading');
  detailsInstallBtn.disabled = false;
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === app.name) {
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
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === app.name) {
      installStream.hidden = false;
      if (installStreamElapsed) {
        const secs = Math.round((performance.now()-activeInstallSession.start)/1000);
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
        if (scope === 'system' || scope === 'user') detailScopeOverride = scope;
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
    getActiveInstallSession: () => activeInstallSession,
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
      openActionConfirm({
        title: t('confirm.installTitle'),
        message: t('confirm.installMsg', {name: `<strong>${appName}</strong>`}),
        okLabel: t('details.install')
      }).then(ok => {
        if (!ok) return;
        actionBtn.disabled = true;
        const tile = actionBtn.closest('.app-tile');
        if (tile){ tile.classList.add('busy'); }
        enqueueInstall(appName, detailScopeOverride ?? installScope);
      });
    } else if (action === 'uninstall') {
      openActionConfirm({
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
        window.electronAPI.uninstallApp(appName).then(() => {
          loadApps().then(()=> {
            applySearch();
            actionBtn.classList.remove('loading'); // Remove spinner after uninstall
          });
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
  // Escape: close details or lightbox / modes menu / settings
  if (e.key === 'Escape') {
    if (lightbox && !lightbox.hidden) { closeLightbox(); return; }
    if (document.body.classList.contains('details-mode')) { exitDetailsView(); return; }
    if (!modeMenu?.hidden){ modeMenu.hidden = true; modeMenuBtn?.setAttribute('aria-expanded','false'); return; }
    if (settingsPanelApi?.isOpen?.()) { settingsPanelApi.close(); return; }
    if (!settingsPanel?.hidden){ settingsPanel.hidden = true; settingsBtn?.setAttribute('aria-expanded','false'); return; }
  }
  if (lightbox && !lightbox.hidden) {
    if (e.key === 'ArrowLeft') { if (lightboxState.index > 0) { lightboxState.index--; applyLightboxImage(); } }
    else if (e.key === 'ArrowRight') { if (lightboxState.index < lightboxState.images.length - 1) { lightboxState.index++; applyLightboxImage(); } }
  }
}, { capture:true });



// Handle interactive choice prompt during installation
(async () => {
  window.electronAPI?.onInstallProgress?.((data) => {
    // Initialize install session on receiving 'start'
    if (data.kind === 'start' && data.id) {
      activeInstallSession.id = data.id;
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
      if (updateInProgress) {
        runUpdatesBtn.disabled = true;
        setUpdateSpinnerBusy(true);
      } else {
        runUpdatesBtn.disabled = false;
        setUpdateSpinnerBusy(false);
      }
    } else {
      // Keep spinner state if an update is still running
      setUpdateSpinnerBusy(updateInProgress);
    }
    // No terminal in advanced mode now
    if (document.body.classList.contains('details-mode')) {
      exitDetailsView();
    }
  });
});

// (Integrated terminal removed)

// Sortie avec ESC
// (Old Escape details handler merged above)

// Update button: integrated terminal + streaming
function hasUpdatesStreamingSupport() {
  return !!(window.electronAPI?.startUpdates && window.electronAPI?.onUpdatesProgress);
}
let updateTimerInterval = null;
let updateTimerStart = null;

function setUpdateSpinnerBusy(isBusy) {
  if (!updateSpinner) return;
  updateSpinnerBusy = !!isBusy;
  updateSpinner.setAttribute('data-busy', updateSpinnerBusy ? 'true' : 'false');
  const hourglass = updateSpinner.querySelector('.update-hourglass');
  const timer = updateSpinner.querySelector('.update-timer');
  const label = updateSpinner.querySelector('.spinner-label');
  if (runUpdatesBtn) runUpdatesBtn.classList.toggle('loading', updateSpinnerBusy);
  if (updateSpinnerBusy) {
    if (hourglass) hourglass.style.display = 'inline-block';
    if (timer) timer.style.display = 'inline-block';
    if (label) {
      label.textContent = t('updates.loading');
      label.style.display = '';
    }
    startUpdateTimer();
  } else {
    if (hourglass) hourglass.style.display = 'none';
    if (timer) timer.style.display = 'none';
    if (label) {
      label.textContent = '';
      label.style.display = 'none';
    }
    stopUpdateTimer();
  }
}

function startUpdateTimer() {
  const timer = document.querySelector('.update-timer');
  if (!timer) return;
  // Don't reset if already in progress
  if (updateTimerStart === null) updateTimerStart = Date.now();
  if (updateTimerInterval) return;
  const updateTimerText = () => {
    const elapsed = Math.max(0, Math.floor((Date.now() - updateTimerStart) / 1000));
    if (elapsed < 60) {
      timer.textContent = `${elapsed}s`;
    } else {
      const min = Math.floor(elapsed / 60);
      const sec = String(elapsed % 60).padStart(2, '0');
      timer.textContent = `${min}:${sec}`;
    }
  };
  updateTimerText();
  updateTimerInterval = setInterval(updateTimerText, 1000);
}

function stopUpdateTimer() {
  if (updateTimerInterval) clearInterval(updateTimerInterval);
  updateTimerInterval = null;
  updateTimerStart = null;
}

function updateUpdatesToggleUi() {
  if (!updatesToggleBtn) return;
  updatesToggleBtn.setAttribute('aria-expanded', updatesTerminalExpanded ? 'true' : 'false');
  const section = document.getElementById('updatesLogSection');
  if (section) section.setAttribute('data-open', updatesTerminalExpanded ? 'true' : 'false');
  // Update the arrow
  const caret = updatesToggleBtn.querySelector('.updates-log-caret');
  if (caret) caret.textContent = updatesTerminalExpanded ? '▾' : '▸';
}

function applyUpdatesTerminalVisibility() {
  if (!updatesTerminalWrap) return;
  updatesTerminalWrap.hidden = !updatesTerminalExpanded;
  if (updatesTerminalExpanded) {
    ensureUpdatesTerminal();
    if (updatesXtermFit) setTimeout(() => updatesXtermFit?.fit(), 30);
  }
}

function setUpdatesTerminalExpanded(expanded) {
  const next = !!expanded;
  if (next === updatesTerminalExpanded) {
    updateUpdatesToggleUi();
    return;
  }
  updatesTerminalExpanded = next;
  applyUpdatesTerminalVisibility();
  updateUpdatesToggleUi();
}

function ensureUpdatesTerminal() {
  if (updatesTerminalFallbackMode) {
    if (!updatesTerminalEl) updatesTerminalEl = updatesTerminalNode;
    updatesTerminalEl?.classList.add('updates-terminal-fallback');
    return null;
  }
  if (!updatesTerminalEl) updatesTerminalEl = updatesTerminalNode;
  if (!updatesTerminalEl) return null;
  if (updatesXterm) return updatesXterm;
  try {
    updatesXterm = new Terminal({
      fontSize: 12,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace',
      convertEol: true,
      allowTransparency: true,
      theme: { background: '#050e17', foreground: '#d4e7ff' },
      scrollback: 2000,
      disableStdin: true
    });
    updatesXtermFit = new FitAddonClass();
    updatesXterm.loadAddon(updatesXtermFit);
    updatesXterm.open(updatesTerminalEl);
    setTimeout(() => updatesXtermFit?.fit(), 60);
    window.addEventListener('resize', () => updatesXtermFit?.fit());
    updatesTerminalEl.classList.remove('updates-terminal-fallback');
  } catch (err) {
    console.error('Init updates terminal failed', err);
    updatesXterm = null;
    updatesXtermFit = null;
    updatesTerminalFallbackMode = true;
    if (updatesTerminalEl) {
      updatesTerminalEl.classList.add('updates-terminal-fallback');
      updatesTerminalEl.textContent = '';
    }
    return null;
  }
  return updatesXterm;
}

function revealUpdatesTerminal(forceExpand = false) {
  if (forceExpand) {
    setUpdatesTerminalExpanded(true);
    return;
  }
  ensureUpdatesTerminal();
  if (updatesTerminalExpanded && updatesTerminalWrap) {
    updatesTerminalWrap.hidden = false;
  }
}

function resetUpdatesTerminal() {
  const term = ensureUpdatesTerminal();
  if (!term) {
    if (updatesTerminalEl) {
      updatesTerminalEl.classList.add('updates-terminal-fallback');
      updatesTerminalEl.textContent = '';
      updatesTerminalEl.scrollTop = 0;
    }
    return;
  }
  try { term.reset(); }
  catch(_) { term.clear?.(); }
  if (updatesXtermFit) setTimeout(() => updatesXtermFit?.fit(), 30);
}

function appendUpdatesTerminalChunk(chunk) {
  if (!chunk) return;
  const term = ensureUpdatesTerminal();
  if (!term) {
    if (!updatesTerminalEl) return;
    const cleaned = chunk
      .replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, '')
      .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
      .replace(/[\x07\x08]/g, '');
    updatesTerminalEl.classList.add('updates-terminal-fallback');
    updatesTerminalEl.textContent += cleaned.replace(/\r?\n/g, '\n');
    updatesTerminalEl.scrollTop = updatesTerminalEl.scrollHeight;
    return;
  }
  term.write(chunk.replace(/\r?\n/g, '\r\n'));
}

function waitForUpdateJob(id) {
  return new Promise((resolve, reject) => {
    updateStreamWaiters.set(id, { resolve, reject });
  });
}

async function startUpdatesStream() {
  revealUpdatesTerminal();
  resetUpdatesTerminal();
  const startRes = await window.electronAPI.startUpdates();
  if (!startRes || startRes.error) {
    throw new Error(startRes?.error || 'updates start failed');
  }
  activeUpdateStreamId = startRes.id;
  return waitForUpdateJob(startRes.id);
}

function resolveUpdateWaiter(msg, isError) {
  if (!msg || !msg.id) return;
  const waiter = updateStreamWaiters.get(msg.id);
  if (!waiter) return;
  try {
    if (isError) waiter.reject?.(msg);
    else waiter.resolve?.(msg);
  } finally {
    updateStreamWaiters.delete(msg.id);
  }
}

updatesToggleBtn?.addEventListener('click', () => {
  setUpdatesTerminalExpanded(!updatesTerminalExpanded);
});

window.electronAPI?.onUpdatesProgress?.((msg) => {
  if (!msg || !msg.id) return;
  if (activeUpdateStreamId && msg.id !== activeUpdateStreamId) {
    if (msg.kind === 'done') resolveUpdateWaiter(msg, false);
    if (msg.kind === 'error') resolveUpdateWaiter(msg, true);
    return;
  }
  switch (msg.kind) {
    case 'start':
      activeUpdateStreamId = msg.id;
      updatesStreamBuffer = ''; // Reset buffer at start
      revealUpdatesTerminal();
      resetUpdatesTerminal();
      appendUpdatesTerminalChunk(`\x1b[36m${t('updates.logHeader') || 'am -u'}\x1b[0m\r\n`);
      break;
    case 'data':
      if (typeof msg.chunk === 'string') {
        updatesStreamBuffer += msg.chunk; // Accumule la sortie
        appendUpdatesTerminalChunk(msg.chunk);
      }
      break;
    case 'done':
      appendUpdatesTerminalChunk(`\r\n\x1b[32m${t('updates.logCompleted') || 'Completed'} (code ${typeof msg.code === 'number' ? msg.code : 0})\x1b[0m\r\n`);
      // Pass the accumulated output into the resolved message
      resolveUpdateWaiter({ ...msg, output: updatesStreamBuffer }, false);
      activeUpdateStreamId = null;
      break;
    case 'error':
      appendUpdatesTerminalChunk(`\r\n\x1b[31m${msg.message || (t('updates.error') || 'Erreur')}\x1b[0m\r\n`);
      resolveUpdateWaiter({ ...msg, output: updatesStreamBuffer }, true);
      activeUpdateStreamId = null;
      break;
  }
});

// Update button: log analysis
function stripAnsiSequences(text = '') {
  return text
    .replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
    .replace(/\][0-9]+;[^\\\x07]*(\x07|\\)/g, '')
    .replace(/[\x07\x08]/g, '');
}

function parseUpdatedApps(res){
  // Purely structural patterns (language-independent)
  const cleanedOutput = stripAnsiSequences(res || '');
  const updated = new Set();
  if (typeof cleanedOutput !== 'string') return updated;
  const lines = cleanedOutput.split(/\r?\n/);
  for (const raw of lines){
    const line = raw.trim();
    if (!line) continue;
    // Structural patterns only (symbols / arrows, no English text):
    // ✔ appname
    // * appname -> version
    // appname (old -> new)
    let name = null;
    let m;
    if ((m = line.match(/^✔\s+([A-Za-z0-9._-]+)/))) name = m[1];
    else if ((m = line.match(/^\*\s*([A-Za-z0-9._-]+)\s+->/))) name = m[1];
    else if ((m = line.match(/^([A-Za-z0-9._-]+)\s*\([^)]*->[^)]*\)/))) name = m[1];
    if (name && !name.toLowerCase().endsWith('.am')) {
      updated.add(name.toLowerCase());
    }
  }
  return updated;
}

/**
 * Parse the updated apps table from AM/appman output (new table format).
 *
 * appman always shows 4 separators in this order:
 *   sep1 → >> START OF ALL PROCESSES <<
 *   sep2 → CAN MANAGE... (header)
 *   sep3 ◆ initial list of everything that can be updated  ← IGNORE
 *   sep4 → result: table of updated apps  OR  "nothing to do" text
 *   (sep5+ possible if more sections are added after)
 *
 * The AM table looks like this (localized headers, ANSI colors removed):
 *        App      Previous    Current
 *
 *     1.  appname  oldver      newver
 *     2.  appname2 oldver2     newver2
 *
 * Strategy: after the 4th separator, look for numbered lines and extract
 * name + old + new version. Independent of the header language.
 *
 * Returns { updated: Set, newVersions: Map, hasStructure: bool }
 *   hasStructure=true  → at least 4 separators found
 *   hasStructure=false → unknown structure (fallback allowed)
 */
function parseUpdatedBlock(text) {
  const updated = new Set();
  const newVersions = new Map();
  const lines = text.split(/\r?\n/);
  const SEP_SKIP = 4;
  let sepCount = 0;
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^[-=]{5,}$/.test(lines[i].trim())) {
      sepCount++;
      if (sepCount === SEP_SKIP) { startIdx = i + 1; break; }
    }
  }
  if (startIdx === -1) return { updated, newVersions, hasStructure: false };

  const blockLines = lines.slice(startIdx);

  // Parse the table structurally: find numbered rows (locale-independent)
  // The (AppMan) or (AM) qualifier can appear after old version, new version, or both
  const QUAL = '(?:\\s+\\((?:AppMan|AM)\\))?';
  const VER = '[^\\s()]+';
  const ROW_RE = new RegExp(
    '^\\s*\\d+\\.\\s+([A-Za-z0-9._-]+)\\s+' + VER + QUAL + '\\s+' + VER + QUAL + '$'
  );
  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i].trim();
    if (!ROW_RE.test(line)) continue;
    const m = line.match(/^\s*\d+\.\s+([A-Za-z0-9._-]+)\s+(.*)/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    // Extract version tokens, filtering out (AppMan) and (AM) qualifiers
    const allTokens = m[2].match(/\S+/g) || [];
    const tokens = allTokens.filter(t => t !== '(AppMan)' && t !== '(AM)');
    if (tokens.length < 2) continue;
    const oldVer = tokens[tokens.length - 2];
    const newVer = tokens[tokens.length - 1];
    // Detect qualifier from the full line
    const qualifier = /\((AppMan|AM)\)/.exec(line);
    const scopeTag = qualifier ? qualifier[1] : null;
    // AM: no qualifier = system, (AppMan) = user
    // AppMan: no qualifier = user (only scope), no qualifier shown
    let scope;
    if (scopeTag === 'AppMan') scope = 'user';
    else if (scopeTag === 'AM') scope = 'system';
    else scope = state.pmName === 'appman' ? 'user' : 'system';
    const key = name + '|' + scope;
    if (!name.endsWith('.am')) {
      updated.add(key);
      newVersions.set(key, { old: oldVer, new: newVer, name, scope });
    }
  }
  return { updated, newVersions, hasStructure: true };
}

function handleUpdateCompletion(fullText){
  const sanitized = stripAnsiSequences(fullText || '');
  // Structural parser (language-independent) — inspired by awk approach
  const { updated: blockUpdated, newVersions, hasStructure } = parseUpdatedBlock(sanitized);
  // Enrich newVersions with "appname (old -> new)" lines (structural, no language)
  const lines = sanitized.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    const arrowMatch = line.match(/^([A-Za-z0-9._-]+)\s*\([^)]*->\s*([^)]+)\)/);
    if (arrowMatch) {
      const appName = arrowMatch[1].toLowerCase();
      const newVer = arrowMatch[2].trim();
      if (newVer && !newVersions.has(appName) && !appName.endsWith('.am')) newVersions.set(appName, newVer);
    }
  }
  let toShow = new Set();
  if (blockUpdated.size > 0) {
    // Apps found in the table after the last separator -> reliable result
    toShow = blockUpdated;
  } else if (!hasStructure) {
    // No separator found (unknown output) → structural fallback (✔, *, ->)
    const fallback = parseUpdatedApps(sanitized);
    if (fallback.size > 0) toShow = fallback;
  }
  // If hasStructure && blockUpdated.size === 0 : empty table = nothing updated
  if (toShow.size > 0) {
    if (updateFinalMessage) updateFinalMessage.textContent = t('updates.updatedApps');
    if (updatedAppsIcons) {
      updatedAppsIcons.innerHTML = '';
      toShow.forEach(keyLower => {
        const pipeIdx = keyLower.lastIndexOf('|');
        const rawName = pipeIdx !== -1 ? keyLower.slice(0, pipeIdx) : keyLower;
        const scopeKey = pipeIdx !== -1 ? keyLower.slice(pipeIdx + 1) : null;
        const wrapper = document.createElement('div'); wrapper.className = 'updated-item';
        const img = document.createElement('img');
        const appObj = scopeKey
          ? state.allApps.find(a => String(a.name).toLowerCase() === rawName && a.scope === scopeKey)
          : state.allApps.find(a => String(a.name).toLowerCase() === rawName);
        const displayName = prettifyAppName(rawName);
        const versionInfo = newVersions.get(keyLower);
        const fallbackVer = appObj && appObj.version ? appObj.version : null;
        img.src = getIconUrl(rawName);
        img.alt = displayName;
        img.onerror = () => { img.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; };
        const meta = document.createElement('div'); meta.className = 'updated-meta';
        const title = document.createElement('div'); title.className = 'updated-name'; title.textContent = displayName;
        const ver = document.createElement('div'); ver.className = 'updated-version';
        const appScope = scopeKey || (appObj && appObj.scope ? appObj.scope : null);
        if (versionInfo && typeof versionInfo === 'object' && versionInfo.old && versionInfo.new) {
          ver.textContent = versionInfo.old + ' → ' + versionInfo.new;
        } else {
          const displayVersion = versionInfo || fallbackVer;
          ver.textContent = displayVersion ? String(displayVersion) : '';
          if (!displayVersion) ver.hidden = true;
        }
        if (appScope && state.pmName === 'am') {
          const scopeTag = document.createElement('span');
          scopeTag.className = 'updated-scope-tag';
          scopeTag.textContent = appScope === 'system' ? `(${t('install.scope.system')})` : `(${t('install.scope.user')})`;
          ver.appendChild(scopeTag);
        }
        meta.appendChild(title);
        meta.appendChild(ver);
        wrapper.appendChild(img);
        wrapper.appendChild(meta);
        updatedAppsIcons.appendChild(wrapper);
      });
    }
  } else {
    // 0 apps to display
    if (hasStructure) {
      // Structure detected but empty table -> really nothing updated
      if (updateFinalMessage) updateFinalMessage.textContent = t('updates.none');
    } else {
      // No known structure -> we don't know, show "done"
      if (updateFinalMessage) updateFinalMessage.textContent = t('updates.done');
    }
    if (updatedAppsIcons) updatedAppsIcons.innerHTML = '';
  }
  if (updateResult) updateResult.style.display = 'block';
  // Refresh the full list to update installed versions
  setTimeout(() => { loadApps().then(applySearch); }, 400);
}

async function refreshAfterUpdates(){
  if (window.electronAPI && typeof window.electronAPI.deleteCategoriesCache === 'function') {
    await window.electronAPI.deleteCategoriesCache();
  }
  if (window.categories && typeof window.categories.resetCache === 'function') {
    window.categories.resetCache();
  }
  if (window.categories && typeof window.categories.loadCategories === 'function') {
    await window.categories.loadCategories({ showToast });
  }
  showToast(t('toast.refreshing'));
  await loadApps();
  applySearch();
  try {
    const needs = state.allApps.some(a => a.installed && (!a.version || String(a.version).toLowerCase().includes('unsupported')));
    if (needs) {
      await new Promise(r => setTimeout(r, 3000));
      await loadApps();
      applySearch();
    }
  } catch (_) {}
}

async function fetchUpdatesOutput(){
  if (hasUpdatesStreamingSupport()) {
    try {
      return await startUpdatesStream();
    } catch (err) {
      if (err?.error === 'external-update-running' || err?.message === 'external-update-running') throw err;
      console.warn('Streaming updates failed, fallback to updates-bulk', err);
      activeUpdateStreamId = null;
    }
  }
  if (!window.electronAPI?.updatesBulk) return { output: '' };
  const res = await window.electronAPI.updatesBulk();
  if (res?.error === 'external-update-running') throw new Error('external-update-running');
  const output = res?.output || (typeof res === 'string' ? res : '');
  if (output) {
    revealUpdatesTerminal();
    resetUpdatesTerminal();
    appendUpdatesTerminalChunk(output);
  }
  return { output };
}

runUpdatesBtn?.addEventListener('click', async () => {
  if (runUpdatesBtn.disabled) return;
  updateInProgress = true;
  showToast(t('toast.updating'));
  setUpdateSpinnerBusy(true);
  if (updateResult) updateResult.style.display = 'none';
  if (updateFinalMessage) updateFinalMessage.textContent='';
  if (updatedAppsIcons) updatedAppsIcons.innerHTML='';
  runUpdatesBtn.disabled = true;
  try {
    const start = performance.now();
    const result = await fetchUpdatesOutput();
    const raw = typeof result?.output === 'string' ? result.output : '';
    handleUpdateCompletion(raw);
    const dur = Math.round((performance.now()-start)/1000);
    if (updateFinalMessage && updateFinalMessage.textContent) updateFinalMessage.textContent += t('updates.duration', {dur});
    // Stop the spinner as soon as the result is ready, before the heavy refresh
    setUpdateSpinnerBusy(false);
    await refreshAfterUpdates();
  } catch (err) {
    console.error('Updates failed', err);
    if (err?.error === 'external-update-running' || err?.message === 'external-update-running') {
      showToast(t('toast.updateAlreadyRunning'));
      if (updateFinalMessage) updateFinalMessage.textContent = t('toast.updateAlreadyRunningDetail');
    } else {
      showToast(t('toast.updateFailed') || t('error.global', { msg: 'Update failed' }));
      if (updateFinalMessage) updateFinalMessage.textContent = t('updates.error') || t('error.global', { msg: 'Error during update' });
    }
    if (updateResult) updateResult.style.display = 'block';
  } finally {
    updateInProgress = false;
    setUpdateSpinnerBusy(false);
    runUpdatesBtn.disabled = false;
  }
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
    const doc2 = parser2.parseFromString(html, 'text/html');
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
        img.addEventListener('click', () => openLightbox(record.images, record.images.indexOf(src), detailsName?.textContent || ''));
        div.appendChild(img); detailsGalleryInner.appendChild(div);
      });
      detailsGallery.hidden = false;
    } else { detailsGallery.hidden = true; }
  // Gallery removed: all images are in the description Markdown
// Lightbox removed
  }
}

function openLightbox(images, index, captionBase) {
  if (!lightbox || !lightboxImage) return;
  lightboxState.images = images || [];
  lightboxState.index = index || 0;
  lightboxState.originApp = captionBase;
  applyLightboxImage();
  lightbox.hidden = false;
  // Focus on close for accessibility
  if (lightboxClose) setTimeout(()=> lightboxClose.focus(), 30);
}

function applyLightboxImage() {
  if (!lightboxImage) return;
  const src = lightboxState.images[lightboxState.index];
  lightboxImage.src = src;
  if (lightboxCaption) {
    lightboxCaption.textContent = `${lightboxState.originApp} – ${lightboxState.index+1}/${lightboxState.images.length}`;
  }
  updateLightboxNav();
}

function updateLightboxNav() {
  if (lightboxPrev) lightboxPrev.disabled = lightboxState.index <= 0;
  if (lightboxNext) lightboxNext.disabled = lightboxState.index >= lightboxState.images.length - 1;
  if (lightboxPrev) lightboxPrev.style.visibility = lightboxState.images.length > 1 ? 'visible' : 'hidden';
  if (lightboxNext) lightboxNext.style.visibility = lightboxState.images.length > 1 ? 'visible' : 'hidden';
}

function closeLightbox() {
  if (lightbox) lightbox.hidden = true;
}

lightboxPrev?.addEventListener('click', () => {
  if (lightboxState.index > 0) { lightboxState.index--; applyLightboxImage(); }
});
lightboxNext?.addEventListener('click', () => {
  if (lightboxState.index < lightboxState.images.length - 1) { lightboxState.index++; applyLightboxImage(); }
});
lightboxClose?.addEventListener('click', () => closeLightbox());
lightbox?.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
// Lightbox removed: no separate gallery
});


// --- Streaming installation (Steps 1 & 2) ---


let currentInstallId = null;
let currentInstallStart = 0;
let installElapsedInterval = null;

function setInstallEtaDisplay(etaText, active) {
  if (!installProgressEtaLabel) return;
  installProgressEtaLabel.classList.toggle('eta-spinning', !!active);
  installProgressEtaLabel.textContent = etaText || '';
}


function startStreamingInstall(name, scope){
  initXtermLog();
  if (!window.electronAPI.installStart) {
    return Promise.reject(new Error('Streaming non supporté'));
  }
  // Marquer uniquement la tuile active busy (et enlever des autres)
  document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
  const activeTile = Array.from(document.querySelectorAll('.app-tile')).find(t => {
    const d = t.getAttribute('data-app') || '';
    return d === name || d.startsWith(name + '|');
  });
  if (activeTile) activeTile.classList.add('busy');
    if (installStream) {
      installStream.hidden = false;
      if (installStreamElapsed) installStreamElapsed.textContent='0s';
      if (installProgressPercentLabel) installProgressPercentLabel.textContent = '';
      setInstallEtaDisplay('', true);
      if (installProgressBar) {
        installProgressBar.value = 0;
        installProgressBar.max = 100;
        installProgressBar.removeAttribute('hidden');
      }
    }
  currentInstallStart = Date.now();
  currentInstallLines = 0;
  activeInstallSession = { id: null, name, start: currentInstallStart, lines: [], done: false, success: null, code: null };
  // Start the real-time timer
  if (installElapsedInterval) clearInterval(installElapsedInterval);
  installElapsedInterval = setInterval(() => {
    if (installStreamElapsed) {
      const secs = Math.floor((Date.now() - currentInstallStart) / 1000);
      installStreamElapsed.textContent = secs + 's';
    }
  }, 1000);
  return window.electronAPI.installStart(name, scope).then(res => {
    if (res && res.error){
      showToast(res.error);
      if (installStream) installStream.hidden = true;
      detailsInstallBtn?.classList.remove('loading');
      detailsInstallBtn?.removeAttribute('disabled');
      return;
    }
    currentInstallId = res?.id || null;
    activeInstallSession.id = currentInstallId;
    // Refresh buttons now that the ID is known
    refreshAllInstallButtons();
  });
}

if (window.electronAPI.onInstallProgress){
  window.electronAPI.onInstallProgress(msg => {
    if (!msg) return;
    if (currentInstallId && msg.id !== currentInstallId) return; // ignore other installs (future multi support)
    if (msg.kind === 'line') {
      // --- Extraction du pourcentage de progression depuis le flux ---
      if (msg.raw !== undefined) {
        // Robust cleanup of all ANSI/OSC escape sequences (colors, cursor, ESC 7/8, etc.)
        const ansiCleaned = msg.raw
          // ESC [ ... sequences (CSI)
          .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
          // ESC ... sequences (OSC, ESC 7, ESC 8, etc.)
          .replace(/\x1B[][A-Za-z0-9#()*+\-.\/]*|\x1B[7-8]/g, '')
          // OSC sequences (Operating System Command)
          .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
          // Other control characters
          .replace(/[\x07\x08\x0D\x0A\x1B]/g, '');

        // --- Warning block detection and accumulation ---
        if (!window._installWarningBuffer) window._installWarningBuffer = null;
        if (!window._installWarningActive) window._installWarningActive = false;

        // Warning block start
        if (/^\s*WARNING:/i.test(ansiCleaned)) {
          window._installWarningBuffer = ansiCleaned + '\n';
          window._installWarningActive = true;
          return;
        }
        // Accumulation du bloc warning
        if (window._installWarningActive) {
          if (/^=+/.test(ansiCleaned)) {
            showPopupWarning(window._installWarningBuffer.trim());
            window._installWarningBuffer = null;
            window._installWarningActive = false;
            return;
          }
          window._installWarningBuffer += ansiCleaned + '\n';
          return;
        }

        // Accept multiple progress formats (wget/curl/custom bars) instead of only "%[".
        const percentCandidates = [];
        const percentRegex = /(\d{1,3}(?:[\.,]\d+)?)\s*%/g;
        let percentHit;
        while ((percentHit = percentRegex.exec(ansiCleaned)) !== null) {
          const p = Math.round(parseFloat(String(percentHit[1]).replace(',', '.')));
          if (!Number.isNaN(p) && p >= 0 && p <= 100) percentCandidates.push(p);
        }
        const ratioMatch = ansiCleaned.match(/(?:^|\s)(\d{1,6})\s*\/\s*(\d{1,6})(?=\s|$)/);
        if (ratioMatch) {
          const done = parseInt(ratioMatch[1], 10);
          const total = parseInt(ratioMatch[2], 10);
          if (!Number.isNaN(done) && !Number.isNaN(total) && total > 0 && done >= 0) {
            percentCandidates.push(Math.round((done / total) * 100));
          }
        }
        if (percentCandidates.length) {
          const percent = Math.max(0, Math.min(100, Math.max(...percentCandidates)));
          if (installProgressPercentLabel) installProgressPercentLabel.textContent = percent + '%';
          if (installProgressBar) installProgressBar.value = percent;
        }
        // ETA extraction with broader patterns ("ETA 00:12", "00:12 ETA", "remaining 12s", etc.)
        let eta = '';
        let m = ansiCleaned.match(/(?:ETA|eta|Temps restant|remaining)[\s:=]+([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?|\d+\s*(?:s|sec|min|m)\b|[^\r\n]+)/i);
        if (m && m[1]) eta = m[1].trim();
        if (!eta) {
          const reverseEta = ansiCleaned.match(/([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\s*(?:ETA|eta)\b/i);
          if (reverseEta && reverseEta[1]) eta = reverseEta[1].trim();
        }
        setInstallEtaDisplay(eta, true);
      }
      // (Elapsed time is now handled by the JS timer)
      return;
    }
    switch(msg.kind){
      case 'start':
        if (installStreamStatus) installStreamStatus.textContent = t('install.status');
        refreshAllInstallButtons();
        if (installProgressBar) installProgressBar.value = 0;
        setInstallEtaDisplay('', true);
        break;
      case 'error':
        if (installStreamStatus) installStreamStatus.textContent = t('install.error') || 'Erreur';
        detailsInstallBtn?.classList.remove('loading');
        detailsInstallBtn?.removeAttribute('disabled');
        setTimeout(()=> { if (installStream) installStream.hidden = true; }, 5000);
        if (installProgressBar) installProgressBar.value = 0;
        setInstallEtaDisplay('', false);
        if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
        break;
      case 'cancelled':
        if (installStreamStatus) installStreamStatus.textContent = t('install.cancelled') || 'Cancelled';
        if (detailsInstallBtn) {
          detailsInstallBtn.classList.remove('loading');
          detailsInstallBtn.disabled = false;
        }
        if (installProgressBar) installProgressBar.value = 0;
        setInstallEtaDisplay('', false);
        if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
        setTimeout(()=> { if (installStream) installStream.hidden = true; }, 2000);
        // (Fix reverted: no longer refresh list or details here)
        break;
      case 'done':
        if (installStreamStatus) installStreamStatus.textContent = t('install.done') || 'Done';
        if (installProgressBar) installProgressBar.value = 100;
        setInstallEtaDisplay('', false);
        if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
        setTimeout(()=> { if (installStream) installStream.hidden = true; }, 2000);
        // --- Logical continuation from old code (merge the two 'done' handlers) ---
        detailsInstallBtn?.classList.remove('loading');
        detailsInstallBtn?.removeAttribute('disabled');
        if (activeInstallSession && activeInstallSession.id === currentInstallId) {
          activeInstallSession.done = true;
          activeInstallSession.success = msg.success;
          activeInstallSession.code = msg.code;
        }
        // No more log or log button handling here
        loadApps().then(()=> {
          if (msg.success) {
            // Redirect to the surviving app after install:
            // - bundle child (adb) → parent (platform-tools)
            // - mutex partner (firefox-appimage) → canonical (firefox), or vice-versa
            const installedName = msg.name || detailsInstallBtn?.getAttribute('data-name');
            const key = installedName && installedName.toLowerCase();
            const targetName = (key && (state.bundleChildOf[key] || state.mutexRedirect[key])) || installedName;
            if (targetName) showDetails(targetName);
          }
          if (msg.name) {
            document.querySelectorAll(`.app-tile[data-app="${CSS.escape(msg.name)}"]`).forEach(t => t.classList.remove('busy'));
          }
          refreshQueueUI();
          refreshAllInstallButtons();
        });
        setTimeout(()=> { if (installStream) installStream.hidden = true; }, 3500);
        setTimeout(()=> processNextInstall(), 450);
        break;
    }
  });
}

function showPopupWarning(msg) {
  const dontShowKey = 'hideWget2Warning';
  if (localStorage.getItem(dontShowKey) === '1') return;
  let modal = document.getElementById('warningModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'warningModal';
    modal.className = 'modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.style.zIndex = '9999';
    modal.innerHTML = `<div style='background:#fff;max-width:480px;margin:80px auto;padding:28px 22px;border-radius:12px;box-shadow:0 2px 16px #0002;text-align:left;'>
      <h2 style='color:#c00;font-size:20px;margin-bottom:12px;'>${t('warning.title')}</h2>
      <pre style='white-space:pre-wrap;font-size:15px;color:#c00;margin-bottom:18px;'>${msg}</pre>
      <label style='display:flex;align-items:center;margin-bottom:18px;font-size:15px;color:#444;'><input type='checkbox' id='dontShowWget2Warning' style='margin-right:8px;'>${t('warning.checkboxText')}</label>
      <button id='closeWarningModal' style='font-size:15px;padding:8px 18px;border-radius:8px;background:#c00;color:#fff;border:none;cursor:pointer;'>${t('warning.closeBtn')}</button>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('closeWarningModal').onclick = () => {
      const checkbox = document.getElementById('dontShowWget2Warning');
      if (checkbox?.checked) localStorage.setItem(dontShowKey, '1');
      modal.remove();
    };
  } else {
    const pre = modal.querySelector('pre');
    if (pre) pre.textContent = msg;
    modal.style.display = 'block';
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
  if (activeInstallSession && !activeInstallSession.done) {
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
    if (activeInstallSession && activeInstallSession.id && !activeInstallSession.done) {
      showCloseConfirm();
    }
  });
}

//# sourceMappingURL=app.js.map





