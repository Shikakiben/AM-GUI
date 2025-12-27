// Lightbox ultra-légère pour images Markdown (initialisation après DOM prêt)
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
  // --- Spacer pour scroll cohérent ---
  let spacer = appsDiv.querySelector('.app-list-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'app-list-spacer';
    spacer.style.width = '100%';
    spacer.style.pointerEvents = 'none';
    appsDiv.appendChild(spacer);
  }
  // Calculer la hauteur moyenne d'une tuile (sur le lot affiché)
  let tileHeight = 120; // fallback par défaut
  const firstTile = appsDiv.querySelector('.app-tile');
  if (firstTile) {
    tileHeight = firstTile.offsetHeight || tileHeight;
  }
  const missing = appListVirtual.length - end;
  spacer.style.height = (missing > 0 ? (missing * tileHeight) : 0) + 'px';
  // --- Fin spacer ---
}


// --- Intégration du prompt mot de passe sudo ---
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
  title.textContent = t(sectionKey === 'sandboxed' ? 'installed.section.sandboxed' : 'installed.section.others');
  section.appendChild(title);
  return section;
}

function buildTile(item){
  if (item && item.__section) {
    return createInstalledSection(item.__section);
  }
  const { name, installed, desc } = typeof item === 'string' ? { name: item, installed: false, desc: null } : item;
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  const version = item?.version ? String(item.version) : null;
  let shortDesc = desc || (installed ? 'Déjà présente localement.' : 'Disponible pour installation.');
  if (shortDesc.length > 110) shortDesc = shortDesc.slice(0,107).trim() + '…';
  let actionsHTML = '';
  if (state.viewMode === 'list') {
    if (!installed) {
      let btnLabel = 'Installer';
      let actionAttr = 'install';
      let disabledAttr = '';
      if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name){
        btnLabel = 'Installation… ✕';
        actionAttr = 'cancel-install';
      } else {
        const pos = getQueuePosition(name);
        if (pos !== -1) { btnLabel = 'En file (#'+pos+') ✕'; actionAttr='remove-queue'; }
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
      stateBadge = ' <span class="install-state-badge installing" data-state="installing">Installation…<button class="queue-remove-badge inline-action" data-action="cancel-install" data-app="'+name+'" title="Annuler" aria-label="Annuler">✕</button></span>';
    } else {
      const pos = getQueuePosition(name);
      if (pos !== -1) stateBadge = ' <span class="install-state-badge queued" data-state="queued">En file (#'+pos+')<button class="queue-remove-badge inline-action" data-action="remove-queue" data-app="'+name+'" title="Retirer de la file" aria-label="Retirer">✕</button></span>';
    }
  }
  const tile = document.createElement('div');
  tile.className = 'app-tile';
  tile.setAttribute('data-app', name);
  const isSandboxedTile = installed && isAppSandboxed(name);
  const badgeSymbol = isSandboxedTile ? '🔒' : '✓';
  const badgeHTML = installed
    ? `<span class="installed-badge" aria-label="Installée" title="Installée" style="position:absolute;top:2px;right:2px;">${badgeSymbol}</span>`
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
  tile.tabIndex = 0; // navigation clavier
  tile.addEventListener('click', (ev) => {
    if (ev.target.closest('.inline-action')) return; // ne pas ouvrir si clic sur bouton d'action
    showDetails(name);
  });
  tile.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (ev.target.closest('.inline-action')) return;
      ev.preventDefault();
      showDetails(name);
    }
  });
  return tile;
}
// ...existing code...

// Active/désactive les animations globales selon l'état
function setAnimationsActive(active) {
  document.body.classList.toggle('animations-active', !!active);
}

// Désactiver les animations au démarrage
setAnimationsActive(false);

// Animations globales
// ...existing code...


function initXtermLog() {
  if (!xtermLogDiv) xtermLogDiv = document.getElementById('xtermLog');
  if (!xtermLogDiv) return;
  if (!xterm) {
    try {
      const { Terminal } = require('@xterm/xterm');
      const { FitAddon } = require('@xterm/xterm-addon-fit');
      xterm = new Terminal({
        fontSize: 13,
        fontFamily: 'monospace',
        theme: { background: '#181c20' },
        convertEol: true,
        scrollback: 2000,
        disableStdin: true,
        cursorBlink: false
      });
      xtermFit = new FitAddon();
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
// --- xterm.js pour affichage terminal natif ---
let xterm = null;
let xtermFit = null;
let xtermLogDiv = null;
// Contrôles fenêtre
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
  installed: new Set() // ensemble des noms installés (lowercase)
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

// --- (Ré)ajout gestion changement de mode d'affichage ---
function updateModeMenuUI() {
  // Mettre à jour états pressed
  modeOptions().forEach(opt => {
    const m = opt.getAttribute('data-mode');
    const active = m === state.viewMode;
    opt.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  // Changer l'icône du bouton principal selon mode
  const iconMap = { grid:'▦', list:'≣', icons:'◻︎', cards:'🂠' };
  if (modeMenuBtn) modeMenuBtn.textContent = iconMap[state.viewMode] || '▦';
  // Mettre à jour la classe du body selon le mode
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
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !modeMenu.hidden) {
      modeMenu.hidden = true; modeMenuBtn.setAttribute('aria-expanded','false');
    }
  });
  modeMenu.addEventListener('click', (ev) => {
    const opt = ev.target.closest('.mode-option');
    if (!opt) return;
    const mode = opt.getAttribute('data-mode');
    if (!mode || mode === state.viewMode) { modeMenu.hidden = true; modeMenuBtn.setAttribute('aria-expanded','false'); return; }
    if (!['grid','list','icons','cards'].includes(mode)) return;
    state.viewMode = mode;
    localStorage.setItem('viewMode', state.viewMode);
    currentViewMode = state.viewMode;
    updateModeMenuUI();
    rerenderActiveCategory();
    // Remettre le scroll en haut à chaque changement de mode
    if (scrollShell) scrollShell.scrollTop = 0;
    modeMenu.hidden = true;
    modeMenuBtn.setAttribute('aria-expanded','false');
  });
}

updateModeMenuUI();

const appsDiv = document.getElementById('apps');

// --- Références DOM rétablies après nettoyage catégories ---
const appDetailsSection = document.getElementById('appDetails');
const backToListBtn = document.getElementById('backToListBtn');
const detailsIcon = document.getElementById('detailsIcon');
const detailsName = document.getElementById('detailsName');
const detailsLong = document.getElementById('detailsLong');
const detailsInstallBtn = document.getElementById('detailsInstallBtn');
const detailsUninstallBtn = document.getElementById('detailsUninstallBtn');
const detailsGallery = document.getElementById('detailsGallery');
const detailsGalleryInner = document.getElementById('detailsGalleryInner');
// Éléments streaming installation
// Galerie supprimée : toutes les images sont dans la description
const installStream = document.getElementById('installStream');
const installStreamStatus = document.getElementById('installStreamStatus');

const installStreamElapsed = document.getElementById('installStreamElapsed');
// Log, compteur de lignes et bouton log supprimés de l'UI
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

// Mémoire de la session d'installation en cours
let activeInstallSession = {
  id: null,
  name: null,
  start: 0,
  lines: [], // tableau de chaînes
  done: false,
  success: null,
  code: null
};
// File d'attente séquentielle
const installQueue = []; // noms d'apps en attente (FIFO)

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
  // isAppImage est définitif quand c'est un boolean (détecté via magic bytes ou sandboxé)
  if (typeof info.isAppImage === 'boolean') return info.isAppImage;
  const target = typeof info.appName === 'string' ? info.appName.toLowerCase() : '';
  if (target && appName && target !== appName.toLowerCase()) return null;
  const execPath = typeof info.execPath === 'string' ? info.execPath.toLowerCase() : '';
  if (!execPath) return null;
  // Fallback sur l'extension si pas de détection magic bytes
  return execPath.endsWith('.appimage');
}

function isSandboxSupported(appName, info = sandboxState.info) {
  if (!appName) return false;
  
  // Si on n'a pas encore d'info (chargement en cours), on ne sait pas encore
  if (!info || Object.keys(info).length === 0) return true;
  
  const inferred = inferAppImageFromInfo(appName, info);
  
  // Vérifier si l'app est installée via appman (pas juste si un exécutable existe)
  const installedViaAppman = isAppInstalledInList(appName);
  
  // Si l'app N'EST PAS installée via appman, on ne bloque pas
  // (un exécutable système du même nom ne devrait pas bloquer le sandboxing futur)
  if (!installedViaAppman) return true;
  
  // Si on a une détection définitive et l'app est installée via appman, on l'utilise
  if (inferred !== null) return inferred;
  
  // App installée via appman mais pas de détection possible → probablement pas un AppImage
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

function showNonAppimageModal(appName) {
  if (!nonAppimageModal) return;
  if (nonAppimageMessage) {
    nonAppimageMessage.textContent = t('sandbox.unsupported.desc', { name: appName || '—' });
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
  const installedFlag = (installedFromInfo === true)
    ? true
    : (installedFromInfo === false)
      ? false
      : (installedFromList || installedFromDetailsBtn === true);
  const sandboxEligible = isSandboxSupported(sandboxState.currentApp, info);
  sandboxState.supported = sandboxEligible;
  if (sandboxOpenBtn) {
    const titleKey = sandboxEligible ? 'sandbox.title' : 'sandbox.unsupported.title';
    sandboxOpenBtn.title = t(titleKey);
  }
  const statusKey = sandboxState.busy
    ? 'busy'
    : (!sandboxEligible
      ? 'unsupported'
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
  const label = isActive ? t('sandbox.status.active') : 'Installée';
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
    const tileName = (tile.getAttribute('data-app') || '').toLowerCase();
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
    const tileName = tile.getAttribute('data-app');
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
    await window.electronAPI.amAction('install', 'sas');
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

sandboxOpenBtn?.addEventListener('click', async () => {
  if (!sandboxState.currentApp) return;
  // Si l'info n'est pas encore chargée, attendre le chargement
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
  if (!isSandboxSupported(sandboxState.currentApp)) {
    showNonAppimageModal(sandboxState.currentApp);
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
    // Debounce pour éviter double refresh si plusieurs suppressions rapides
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
  detailsInstallBtn.classList.remove('loading'); // suppression systématique du spinner
  const name = detailsInstallBtn.getAttribute('data-name');
  if (!name) return;
  // Active en cours
  if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name){
    // Bouton devient annulation
    detailsInstallBtn.disabled = false;
    detailsInstallBtn.classList.remove('loading');
    detailsInstallBtn.textContent = t('install.status') + ' ✕';
    detailsInstallBtn.setAttribute('data-action','cancel-install');
    detailsInstallBtn.setAttribute('aria-label', t('install.cancel') || 'Annuler installation en cours ('+name+')');
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
  // Sinon si déjà installée, on masque ailleurs, mais reset label au cas où
  if (!detailsInstallBtn.hidden){
    detailsInstallBtn.textContent = t('details.install');
    detailsInstallBtn.classList.remove('loading');
    detailsInstallBtn.disabled = false;
    detailsInstallBtn.setAttribute('data-action','install');
  }
}

// Synchroniser les boutons de la liste
function refreshListInstallButtons(){
  const buttons = document.querySelectorAll('.inline-action.install');
  buttons.forEach(btn => {
    const name = btn.getAttribute('data-app');
    if (!name) return;
    // Si appli déjà installée, ce bouton devrait avoir disparu après re-render.
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name){
      btn.textContent = t('install.status') + ' ✕';
      btn.disabled = false;
      btn.setAttribute('data-action','cancel-install');
      btn.setAttribute('aria-label', t('install.cancel') || 'Annuler installation en cours ('+name+')');
      return;
    }
    const pos = getQueuePosition(name);
    if (pos !== -1){
      btn.textContent = t('install.queued') ? t('install.queued').replace('{pos}', pos) : ('En file (#' + pos + ') ✕');
      btn.disabled = false;
      btn.setAttribute('data-action','remove-queue');
      btn.setAttribute('aria-label', t('install.removeQueue') || ('Retirer de la file (' + name + ')'));
      return;
    }
    btn.textContent = t('details.install');
    btn.disabled = false;
    btn.setAttribute('data-action','install');
  });
}

function refreshAllInstallButtons(){
  refreshDetailsInstallButtonForQueue();
  refreshListInstallButtons();
  refreshTileBadges();
}

// Met à jour/injecte les badges d'état dans les modes non-list
function refreshTileBadges() {
  if (state.viewMode === 'list') return; // list géré par les boutons
  if (!state.installed || typeof state.installed.has !== 'function') return; // garde de sécurité
  const tiles = document.querySelectorAll('.app-tile');
  tiles.forEach(tile => {
    const name = tile.getAttribute('data-app');
    const installed = state.installed.has(name);
    const nameEl = tile.querySelector('.tile-name');
    if (!nameEl) return;
    // Supprimer badge existant
    const existing = nameEl.querySelector('.install-state-badge');
    if (existing) existing.remove();
    if (installed) return; // pas de badge si déjà installée
    let badgeHtml = '';
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name) {
      // Ajouter bouton d'annulation dans le badge installation
      badgeHtml = '<span class="install-state-badge installing" data-state="installing">Installation…<button class="queue-remove-badge inline-action" data-action="cancel-install" data-app="'+name+'" title="Annuler" aria-label="Annuler l\'installation">✕</button></span>';
    } else {
      const pos = getQueuePosition(name);
      if (pos !== -1) badgeHtml = '<span class="install-state-badge queued" data-state="queued">En file (#'+pos+')<button class="queue-remove-badge inline-action" data-action="remove-queue" data-app="'+name+'" title="Retirer de la file" aria-label="Retirer">✕</button></span>';
    }
    if (badgeHtml) nameEl.insertAdjacentHTML('beforeend', ' ' + badgeHtml);
  });
}

function refreshQueueUI(){
  // Rafraîchit uniquement les représentations de la file.
  refreshAllInstallButtons();
}

function processNextInstall(){
  // Ne rien lancer si une installation active non terminée
  if (activeInstallSession.id && !activeInstallSession.done) return;
  if (!installQueue.length) return;
  const next = installQueue.shift();
  refreshQueueUI();
  refreshTileBadges();
  // Nettoyer busy sur toutes les autres tuiles, puis marquer uniquement celle en cours
  document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
  const tile = document.querySelector(`.app-tile[data-app="${CSS.escape(next)}"]`);
  if (tile) tile.classList.add('busy');
  const inlineBtn = document.querySelector(`.inline-action.install[data-app="${CSS.escape(next)}"]`);
  if (inlineBtn) inlineBtn.disabled = true;
  showToast(t('toast.installing', {name: next}));
  startStreamingInstall(next).catch(() => {
    // Fallback: exécuter via amAction puis enchaîner
    window.electronAPI.amAction('install', next).then(()=>{
      loadApps().then(()=> applySearch());
    }).finally(()=>{
      activeInstallSession.done = true;
      setTimeout(()=> processNextInstall(), 200);
    });
  });
  refreshAllInstallButtons();
}

function enqueueInstall(name){
  if (!name) return;
  // Vérifier si déjà en cours ou dans la file
  if ((activeInstallSession.name === name && !activeInstallSession.done) || installQueue.includes(name)) {
    showToast(t('toast.alreadyInQueue', {name}));
    return;
  }
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
  // Toujours fermer les boîtes de dialogue de choix existantes
  document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
  if (!activeInstallSession || activeInstallSession.done) return;
  if (expectedName && activeInstallSession.name !== expectedName) return;
  if (!activeInstallSession.id) return;
  const appName = activeInstallSession.name;
  try {
    await window.electronAPI.installCancel(activeInstallSession.id);
    showToast(t('toast.cancelRequested'));
    try {
      await window.electronAPI.amAction('uninstall', appName);
    } catch (_){ }
    try {
      await loadApps();
      applySearch();
    } catch (_){ }
  } catch (err) {
    if (typeof window.showCopiableError === 'function') {
      window.showCopiableError('Erreur lors de l’annulation : ' + (err?.message || err));
    }
  }
}
let syncBtn = null;
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const openExternalCheckbox = document.getElementById('openExternalLinksCheckbox');
const purgeIconsBtn = document.getElementById('purgeIconsBtn');
const purgeIconsResult = document.getElementById('purgeIconsResult');
const tabs = document.querySelectorAll('.tab');
// Mise à jour
let updateInProgress = false;
let updatesXterm = null;
let updatesXtermFit = null;
let updatesTerminalEl = null;
let updatesTerminalFallbackMode = false;
let updatesTerminalExpanded = false;
let updateSpinnerBusy = false;
let activeUpdateStreamId = null;
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
  actionConfirmOk.textContent = okLabel || 'Valider';
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
const translations = window.translations || {};
// --- Gestion multilingue ---
function getSystemLang() {
  try {
    // Prefer value fournie par le main / preload si disponible
    const sys = (window.electronAPI && typeof window.electronAPI.systemLocale === 'function') ? window.electronAPI.systemLocale() : null;
    const navLang = sys || navigator.language || navigator.userLanguage || 'fr';
    const code = String(navLang).toLowerCase().split(/[-_.]/)[0];
    if (code === 'fr' || code.startsWith('fr')) return 'fr';
    if (code === 'it' || code.startsWith('it')) return 'it';
    if (code === 'en' || code.startsWith('en')) return 'en';
    // default fallback
    return 'en';
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

function applyTranslations() {
  const popupWasOpen = !!(pmPopupCtrl?.layer && pmPopupCtrl.layer.classList.contains('open'));
  if (pmPopupCtrl?.layer) {
    try { pmPopupCtrl.layer.remove(); } catch(_) {}
    document.body?.classList.remove('pm-popup-open');
    pmPopupCtrl = null;
    pmPopupStatus = null;
  }
  // Boutons dynamiques détails (install/uninstall)
  if (detailsInstallBtn) detailsInstallBtn.textContent = t('details.install');
  if (detailsUninstallBtn) detailsUninstallBtn.textContent = t('details.uninstall');
  if (installStreamStatus) installStreamStatus.textContent = t('install.status');
  // Traduction générique de tous les éléments data-i18n et data-i18n-*
  const lang = getLangPref();
  // data-i18n (texte)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      // Si l'élément contient des balises (ex: <span class="mode-icon">), ne remplacer que le nœud texte principal
      let replaced = false;
      el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !replaced) {
          node.textContent = translations[lang][key];
          replaced = true;
        }
      });
      // Si aucun nœud texte trouvé, fallback sur textContent (cas rare)
      if (!replaced) {
        el.textContent = translations[lang][key];
      }
    }
  });
  // data-i18n-html (innerHTML autorisé pour cas spécifiques)
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
  // Attributs spéciaux (ex: aria-label sur settingsPanel)
  const settingsPanel = document.getElementById('settingsPanel');
  if (settingsPanel) {
    settingsPanel.setAttribute('aria-label', t('settings.title'));
  }
  // Titre bouton paramètres
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.title = t('settings.title') + ' (Ctrl+,)';

  // Traduction de l'onglet secondaire "Catégories"
  const tabSecondary = document.querySelector('.tab-secondary');
  if (tabSecondary) {
    tabSecondary.textContent = t('tabs.categories') || 'Catégories';
  }
  setUpdateSpinnerBusy(updateSpinnerBusy);
  updateUpdatesToggleUi();
  if (!sandboxState.logBuffer) resetSandboxLog();
  refreshAllSandboxBadges();
  if (popupWasOpen) {
    showMissingPmPopup();
  }
}

// Appliquer la langue et préparer les contrôles
function initLanguagePreferences() {
  applyTranslations();
  // Mettre à jour l'attribut lang du HTML
  document.documentElement.setAttribute('lang', getLangPref());
  // Synchroniser l'état des radios de sélection de langue avec la préférence enregistrée
  try {
    const stored = localStorage.getItem('langPref') || 'auto';
    const radios = document.querySelectorAll('input[name="langPref"]');
    radios.forEach(r => { try { r.checked = (r.value === stored); } catch(_){} });
    // Ajouter un gestionnaire direct pour éviter toute ambiguïté de délégation
    radios.forEach(r => {
      try {
        r.addEventListener('change', (ev) => {
          ev.stopPropagation();
          try { localStorage.setItem('langPref', r.value); } catch(_){ }
          try { applyTranslations(); } catch(_){ }
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
  onIconCachePurged: handleIconCachePurged
}) || null;

window.addEventListener('DOMContentLoaded', async () => {
  try {
    initMarkdownLightbox();
    initIconObserver();
    await loadApps();
    if (window.categories && typeof window.categories.initDropdown === 'function') {
      await window.categories.initDropdown({
        state,
        t,
        showToast,
        setAppList,
        loadApps,
        appDetailsSection,
        appsDiv,
        tabs,
        iconMap: CATEGORY_ICON_MAP
      });
    }
    // Remplacer le bouton refresh par le nouveau bouton sync (après chargement du script)
    if (window.syncButton && !syncBtn) {
      const { createSyncButton, replaceSyncButton } = window.syncButton;
      syncBtn = createSyncButton({
        onSync: async () => {
          // Suppression forcée du cache fichier catégories
          if (window.electronAPI && typeof window.electronAPI.deleteCategoriesCache === 'function') {
            await window.electronAPI.deleteCategoriesCache();
          }
          // Rafraîchir le cache JS des catégories
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
  } catch (err) {
    console.error('Erreur initialisation DOM', err);
  }
});

// Gérer le changement de langue
const settingsPanelLang = document.getElementById('settingsPanel');
if (settingsPanelLang) {
  settingsPanelLang.addEventListener('change', (ev) => {
    const t = ev.target;
    // évite double gestion si un handler direct a déjà traité
    if (window.__langChangeHandled) { window.__langChangeHandled = false; return; }
    if (t.name === 'langPref') {
      try { localStorage.setItem('langPref', t.value); } catch(_){ }
      try { applyTranslations(); } catch(_){ }
      try { document.documentElement.setAttribute('lang', getLangPref()); } catch(_){ }
      rerenderActiveCategory();
    }
  });
}

// --- Préférences (thème & mode par défaut) ---
// S'assurer que le panneau des mises à jour est caché au démarrage (sauf si onglet updates actif)
if (updatesPanel) {
  updatesPanel.hidden = true; // l'onglet par défaut est 'all'
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
async function loadApps() {
  appsDiv?.setAttribute('aria-busy','true');
  let detailed;
  try {
    detailed = await window.electronAPI.listAppsDetailed();
  } catch (e) {
    detailed = { all: [], installed: [], error: t('error.ipc', {msg: e?.message || e}) };
  }
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
  if (detailed.error) {
    state.allApps = [];
    state.filtered = [];
    if (appsDiv) appsDiv.innerHTML = `<div class='empty-state'><h3>Erreur de récupération</h3><p style='font-size:13px;'>${detailed.error}</p></div>`;
    if (installedCountEl) installedCountEl.textContent = '0';
    sandboxedApps.clear();
    refreshAllSandboxBadges();
    appsDiv?.setAttribute('aria-busy','false');
    return;
  }
  state.allApps = detailed.all || [];
  state.filtered = state.allApps;
  // Construire l'ensemble des apps installées
  try {
    const installedNames = new Set();
    if (Array.isArray(detailed.installed)) {
      detailed.installed.forEach(entry => {
        if (!entry) return;
        if (typeof entry === 'string') installedNames.add(entry.toLowerCase());
        else if (entry.name) installedNames.add(String(entry.name).toLowerCase());
      });
    } else {
      // Fallback: dériver depuis allApps
      state.allApps.filter(a=>a && a.installed && a.name).forEach(a=> installedNames.add(a.name.toLowerCase()));
    }
    state.installed = installedNames;
  } catch(_) { state.installed = new Set(); }
  if (installedCountEl) installedCountEl.textContent = String(state.allApps.filter(a => a.installed && a.hasDiamond).length);
  cleanupSandboxCache();
  rerenderActiveCategory();
  refreshAllSandboxBadges();
  scheduleSandboxStateSweep();
  prefetchPreloadImages();
}

let iconObserver = null;
function initIconObserver(){
  if ('IntersectionObserver' in window && !iconObserver){
    // Charger plus tôt hors-écran pour réduire latence à l'apparition lors du scroll
    iconObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting){
          const img = entry.target; const data = img.getAttribute('data-src');
          if (data){ img.src = data; img.removeAttribute('data-src'); }
          iconObserver.unobserve(img);
        }
      });
    }, { rootMargin: '1600px' }); // marge accrue pour charger encore plus tôt hors écran
  }
}


// Préchargement async throttlé des images encore non démarrées — démarre après rendu
let _prefetchScheduled = false;
function prefetchPreloadImages(limit = 200, concurrency = 6) {
  if (iconObserver) return; // IntersectionObserver gère déjà le préchargement anticipé
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
  // Mémoriser la position de scroll actuelle (shell scrollable)
  if (scrollShell) state.lastScrollY = scrollShell.scrollTop;
  state.currentDetailsApp = app.name;
  handleSandboxShow(app.name);
  const label = app.name.charAt(0).toUpperCase() + app.name.slice(1);
  const version = app.version ? String(app.version) : null;
  if (detailsIcon) {
    detailsIcon.src = getIconUrl(app.name);
    detailsIcon.onerror = () => { detailsIcon.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; };
  }
  if (detailsName) {
    // Correction : si installation annulée, ne pas afficher comme installée
    const isActuallyInstalled = app.installed && !(activeInstallSession && activeInstallSession.name === app.name && activeInstallSession.id && !activeInstallSession.done);
    detailsName.innerHTML = isActuallyInstalled
      ? `${label}${version ? ' · ' + version : ''}`
      : (version ? `${label} · ${version}` : label);
  }
  if (detailsName) detailsName.dataset.app = app.name.toLowerCase();
  applyDetailsSandboxBadge(app.name);
  if (detailsLong) detailsLong.textContent = t('details.loadingDesc', {name: app.name});
  if (detailsGallery) detailsGallery.hidden = true;
  // Galerie supprimée : rien à cacher
  if (detailsInstallBtn) {
    detailsInstallBtn.hidden = !!app.installed;
    detailsInstallBtn.setAttribute('data-name', app.name);
    // Toujours retirer le spinner et réactiver le bouton
  detailsInstallBtn.classList.remove('loading');
  detailsInstallBtn.disabled = false;
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === app.name) {
      detailsInstallBtn.textContent = t('install.status') + ' ✕';
      detailsInstallBtn.setAttribute('data-action','cancel-install');
      detailsInstallBtn.setAttribute('aria-label', t('install.cancel') || 'Annuler installation en cours ('+app.name+')');
    } else {
      detailsInstallBtn.textContent = t('details.install');
      detailsInstallBtn.setAttribute('data-action','install');
      detailsInstallBtn.setAttribute('aria-label', t('details.install'));
    }
    refreshAllInstallButtons();
  }
  // Restaurer panneau streaming si une installation en cours correspond à cette app
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
  // Masquer la barre d'onglets catégories et le bouton miroir/tout
  const tabsRowSecondary = document.querySelector('.tabs-row-secondary');
  if (tabsRowSecondary) tabsRowSecondary.style.visibility = 'hidden';
  // Suppression de la barre : rien à faire
  document.body.classList.add('details-mode');
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
  if (appsDiv) appsDiv.hidden = false;
  if (virtualListApi?.renderVirtualList) {
    try { virtualListApi.renderVirtualList(); } catch (_) {}
  }
  // Réaffiche la barre d'onglets catégories et le bouton miroir/tout
  const tabsRowSecondary = document.querySelector('.tabs-row-secondary');
  if (tabsRowSecondary) tabsRowSecondary.style.visibility = 'visible';
  rerenderActiveCategory();
  // Nettoyer tous les états busy/spinner sur les tuiles
  document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
  // Restaurer scroll
  if (scrollShell) scrollShell.scrollTop = state.lastScrollY || 0;
  // Mémoriser dernier détail pour potentielle restauration
  if (state.currentDetailsApp) sessionStorage.setItem('lastDetailsApp', state.currentDetailsApp);
}

const legacyShowDetails = showDetails;
const legacyExitDetailsView = exitDetailsView;

(function wireDetailsModule() {
  const api = ensureDetailsApi();
  if (!api) return;
  showDetails = (appName) => {
    if (api && typeof api.showDetails === 'function') {
      const result = api.showDetails(appName);
      try { handleSandboxShow(appName); } catch (_) {}
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
    applySandboxBadge: (iconWrapper, active, appName) => applySandboxBadgeToIcon(iconWrapper, active, appName)
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
        enqueueInstall(appName);
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
        actionBtn.classList.add('loading'); // Ajoute le spinner sur le bouton désinstaller
        const tile = actionBtn.closest('.app-tile');
        if (tile){ tile.classList.add('busy'); }
        showToast(t('toast.uninstalling', {name: appName}));
        window.electronAPI.amAction('uninstall', appName).then(() => {
          loadApps().then(()=> {
            applySearch();
            actionBtn.classList.remove('loading'); // Retire le spinner après désinstallation
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

// Debounce recherche pour éviter re-rendus superflus


// Unification des raccourcis clavier
window.addEventListener('keydown', (e) => {
  // Rafraîchissement clavier: Ctrl+R ou F5
  if ((e.key === 'r' && (e.ctrlKey || e.metaKey)) || e.key === 'F5') {
    e.preventDefault();
    triggerRefresh();
    return;
  }
  // Toggle paramètres Ctrl+,
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault();
    if (settingsPanelApi?.toggle) settingsPanelApi.toggle();
    else settingsBtn?.click();
    return;
  }
  // Escape: fermer détails ou lightbox / menu modes / paramètres
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



(async () => {
  await loadApps();
  // Assurer spinner et résultats cachés au démarrage
  setUpdateSpinnerBusy(false);
  if (updateResult) updateResult.style.display = 'none';
  // Forcer la vue liste au démarrage
  if (appDetailsSection) appDetailsSection.hidden = true;
  document.body.classList.remove('details-mode');
  if (appsDiv) appsDiv.hidden = false;
  // Restaurer éventuel détail précédent (session) si encore présent
  const last = sessionStorage.getItem('lastDetailsApp');
  if (last && state.allApps.find(a=>a.name===last)) {
    showDetails(last);
  }

  // Gestion du prompt de choix interactif pendant installation
  window.electronAPI?.onInstallProgress?.((data) => {
    // Initialiser la session d'installation à la réception de 'start'
    if (data.kind === 'start' && data.id) {
      activeInstallSession.id = data.id;
    }
    if (data.kind === 'choice-prompt') {
      // Supprimer toute boîte de dialogue de choix existante
      document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
      // Créer un dialogue simple
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
        // Affichage en tableau 2 colonnes
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
        // Affichage classique en liste
        optionsHtml = `<ul>${data.options.map((opt,i)=>`<li><button class="multi-choice-item" data-choice="${i+1}">${opt}</button></li>`).join('')}</ul>`;
      }
      const cancelLabel = t('install.cancel') || 'Annuler';
      dlg.innerHTML = `
        <div class="choice-dialog-inner">
          <div class="choice-dialog-head">
            <h3>${data.prompt}</h3>
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
          // Fermer la boîte de dialogue immédiatement
          dlg.remove();
          // Envoi du choix au backend
          const installId = data.id;
          if (!installId) {
            window.showCopiableError('Erreur : identifiant d’installation manquant.');
            return;
          }
          try {
            await window.electronAPI.installSendChoice(installId, choice);
          } catch(e) {
            window.showCopiableError('Erreur lors de l’envoi du choix : ' + (e?.message || e));
          }
        });
      });
    }
    // Fermer le prompt si l'installation est terminée ou annulée
    if (data.kind === 'done' || data.kind === 'cancelled' || data.kind === 'error') {
      document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
    }
  });

// Fonction utilitaire globale pour afficher une erreur copiable
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
  errDlg.innerHTML = `<div style="margin-bottom:12px;font-weight:bold;">Erreur</div><textarea style="width:100%;height:80px;resize:none;user-select:text;">${msg}</textarea><div style="text-align:right;margin-top:12px;"><button>Fermer</button></div>`;
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
      setUpdateSpinnerBusy(false);
    }
    // Pas de terminal dans le mode avancé désormais
    if (document.body.classList.contains('details-mode')) {
      exitDetailsView();
    }
  });
});

// (Terminal intégré supprimé)

// Sortie avec ESC
// (Ancien handler Escape détails fusionné ci-dessus)

// Bouton Mettre à jour: terminal intégré + flux streaming
function hasUpdatesStreamingSupport() {
  return !!(window.electronAPI?.startUpdates && window.electronAPI?.onUpdatesProgress);
}

function setUpdateSpinnerBusy(isBusy) {
  if (!updateSpinner) return;
  updateSpinnerBusy = !!isBusy;
  updateSpinner.setAttribute('data-busy', updateSpinnerBusy ? 'true' : 'false');
  const label = updateSpinner.querySelector('.spinner-label');
  if (label) label.textContent = t(updateSpinnerBusy ? 'updates.loading' : 'updates.ready');
}

function updateUpdatesToggleUi() {
  if (!updatesToggleBtn) return;
  const key = updatesTerminalExpanded ? 'updates.toggleHide' : 'updates.toggleShow';
  updatesToggleBtn.textContent = t(key);
  updatesToggleBtn.setAttribute('aria-expanded', updatesTerminalExpanded ? 'true' : 'false');
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
    const { Terminal } = require('@xterm/xterm');
    const { FitAddon } = require('@xterm/xterm-addon-fit');
    updatesXterm = new Terminal({
      fontSize: 12,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace',
      convertEol: true,
      allowTransparency: true,
      theme: { background: '#050e17', foreground: '#d4e7ff' },
      scrollback: 2000,
      disableStdin: true
    });
    updatesXtermFit = new FitAddon();
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
      revealUpdatesTerminal();
      resetUpdatesTerminal();
      appendUpdatesTerminalChunk(`\x1b[36m${t('updates.logHeader') || 'am -u'}\x1b[0m\r\n`);
      break;
    case 'data':
      appendUpdatesTerminalChunk(typeof msg.chunk === 'string' ? msg.chunk : '');
      break;
    case 'done':
      appendUpdatesTerminalChunk(`\r\n\x1b[32m${t('updates.logCompleted') || 'Terminé'} (code ${typeof msg.code === 'number' ? msg.code : 0})\x1b[0m\r\n`);
      resolveUpdateWaiter(msg, false);
      activeUpdateStreamId = null;
      break;
    case 'error':
      appendUpdatesTerminalChunk(`\r\n\x1b[31m${msg.message || (t('updates.error') || 'Erreur')}\x1b[0m\r\n`);
      resolveUpdateWaiter(msg, true);
      activeUpdateStreamId = null;
      break;
  }
});

// Bouton Mettre à jour: analyse du log
function stripAnsiSequences(text = '') {
  return text
    .replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
    .replace(/[\x07\x08]/g, '');
}

function parseUpdatedApps(res){
  const cleanedOutput = stripAnsiSequences(res || '');
  const updated = new Set();
  if (typeof cleanedOutput !== 'string') return updated;
  const lines = cleanedOutput.split(/\r?\n/);
  for (const raw of lines){
    const line = raw.trim();
    if (!line) continue;
    if (/Nothing to do here!?/i.test(line)) { updated.clear(); return updated; }
    // Motifs possibles:
    // ✔ appname
    // appname updated
    // Updating appname ...
    // * appname -> version
    // appname (old -> new)
    let name = null;
    let m;
    if ((m = line.match(/^✔\s+([A-Za-z0-9._-]+)/))) name = m[1];
    else if ((m = line.match(/^([A-Za-z0-9._-]+)\s+updated/i))) name = m[1];
    else if ((m = line.match(/^[Uu]pdating\s+([A-Za-z0-9._-]+)/))) name = m[1];
    else if ((m = line.match(/^\*\s*([A-Za-z0-9._-]+)\s+->/))) name = m[1];
    else if ((m = line.match(/^([A-Za-z0-9._-]+)\s*\([^)]*->[^)]*\)/))) name = m[1];
    if (name) {
      updated.add(name.toLowerCase());
    }
  }
  return updated;
}

function handleUpdateCompletion(fullText){
  const sanitized = stripAnsiSequences(fullText || '');
  // Chercher la section "The following apps have been updated:" dans le log
  let filteredUpdated = null;
  const match = sanitized && sanitized.match(/The following apps have been updated:[^\n]*\n([\s\S]*?)\n[-=]{5,}/i);
  if (match) {
    // Extraire les noms d'apps de cette section
    filteredUpdated = new Set();
    const lines = match[1].split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    for (const line of lines) {
      // ligne du type: ◆ citron-nightly 8f38c83a2
      const m = line.match(/^◆\s*([A-Za-z0-9._-]+)/);
      if (m) filteredUpdated.add(m[1].toLowerCase());
    }
  }
  const updated = parseUpdatedApps(sanitized);
  const nothingPhrase = /Nothing to do here!?/i.test(sanitized || '');
  let toShow = updated;
  if (filteredUpdated && filteredUpdated.size > 0) {
    // Ne garder que les apps détectées ET listées dans la section
    toShow = new Set([...updated].filter(x => filteredUpdated.has(x)));
  }
  if (toShow.size > 0) {
    if (updateFinalMessage) updateFinalMessage.textContent = t('updates.updatedApps');
    if (updatedAppsIcons) {
      updatedAppsIcons.innerHTML = '';
      toShow.forEach(nameLower => {
        const wrapper = document.createElement('div'); wrapper.className = 'updated-item';
        const img = document.createElement('img');
        // nameLower comes from parsed output (lowercased). Try to find matching app object for proper casing and version
        const appObj = state.allApps.find(a => String(a.name).toLowerCase() === String(nameLower).toLowerCase());
        const displayName = appObj ? (appObj.name) : nameLower;
        const displayVersion = appObj && appObj.version ? appObj.version : null;
        img.src = getIconUrl(displayName);
        img.alt = displayName;
        img.onerror = () => { img.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; };
        const meta = document.createElement('div'); meta.className = 'updated-meta';
        const title = document.createElement('div'); title.className = 'updated-name'; title.textContent = displayName;
        const ver = document.createElement('div'); ver.className = 'updated-version'; ver.textContent = displayVersion ? String(displayVersion) : '';
        if (!displayVersion) ver.hidden = true;
        meta.appendChild(title);
        meta.appendChild(ver);
        wrapper.appendChild(img);
        wrapper.appendChild(meta);
        updatedAppsIcons.appendChild(wrapper);
      });
    }
  } else {
    // Fallback: pas de noms détectés mais sortie non vide et pas de message "rien à faire" => supposer des mises à jour
    if (!nothingPhrase && sanitized.trim()) {
      if (updateFinalMessage) updateFinalMessage.textContent = t('updates.done');
    } else {
      if (updateFinalMessage) updateFinalMessage.textContent = t('updates.none');
    }
    if (updatedAppsIcons) updatedAppsIcons.innerHTML = '';
  }
  if (updateResult) updateResult.style.display = 'block';
  // Rafraîchir la liste complète pour mettre à jour les versions installées
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
      console.warn('Streaming updates failed, fallback to am-action', err);
      activeUpdateStreamId = null;
    }
  }
  if (!window.electronAPI?.amAction) return { output: '' };
  const res = await window.electronAPI.amAction('__update_all__');
  const output = typeof res === 'string' ? res : (res ? String(res) : '');
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
    await refreshAfterUpdates();
    const dur = Math.round((performance.now()-start)/1000);
    if (updateFinalMessage && updateFinalMessage.textContent) updateFinalMessage.textContent += t('updates.duration', {dur});
  } catch (err) {
    console.error('Updates failed', err);
    showToast(t('toast.updateFailed') || 'Échec des mises à jour');
    if (updateFinalMessage) updateFinalMessage.textContent = t('updates.error') || 'Erreur pendant la mise à jour.';
    if (updateResult) updateResult.style.display = 'block';
  } finally {
    updateInProgress = false;
    setUpdateSpinnerBusy(false);
    runUpdatesBtn.disabled = false;
  }
});

// ...existing code...
async function loadRemoteDescription(appName) {
  // Si dans le cache (<24h) on réutilise
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
  // Couper le markdown à la première ligne de tableau (| ...)
  let md = markdown;
  const lines = md.split(/\r?\n/);
  const tableIdx = lines.findIndex(l => /^\s*\|/.test(l));
  if (tableIdx !== -1) md = lines.slice(0, tableIdx).join('\n');
  longDesc = window.marked.parse(md);
  // Pour le shortDesc, on prend la première ligne non vide (hors titre)
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
    // Filtrage: éviter icônes trop petites ou décoratives
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
    // Dédup + limite
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
  // Galerie supprimée : toutes les images sont dans la description Markdown
// Lightbox supprimé
  }
}

function openLightbox(images, index, captionBase) {
  if (!lightbox || !lightboxImage) return;
  lightboxState.images = images || [];
  lightboxState.index = index || 0;
  lightboxState.originApp = captionBase;
  applyLightboxImage();
  lightbox.hidden = false;
  // Focus sur close pour accessibilité
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
// Lightbox supprimé : plus de galerie séparée
});


// --- Streaming installation (Étapes 1 & 2) ---


let currentInstallId = null;
let currentInstallStart = 0;
let installElapsedInterval = null;


function startStreamingInstall(name){
  initXtermLog();
  if (!window.electronAPI.installStart) {
    return Promise.reject(new Error('Streaming non supporté'));
  }
  // Marquer uniquement la tuile active busy (et enlever des autres)
  document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
  const activeTile = document.querySelector(`.app-tile[data-app="${CSS.escape(name)}"]`);
  if (activeTile) activeTile.classList.add('busy');
    if (installStream) {
      installStream.hidden = false;
      if (installStreamElapsed) installStreamElapsed.textContent='0s';
      if (installProgressPercentLabel) installProgressPercentLabel.textContent = '';
      if (installProgressBar) {
        installProgressBar.value = 0;
        installProgressBar.max = 100;
        installProgressBar.removeAttribute('hidden');
      }
    }
  currentInstallStart = Date.now();
  currentInstallLines = 0;
  activeInstallSession = { id: null, name, start: currentInstallStart, lines: [], done: false, success: null, code: null };
  // Démarrer le vrai chronomètre temps réel
  if (installElapsedInterval) clearInterval(installElapsedInterval);
  installElapsedInterval = setInterval(() => {
    if (installStreamElapsed) {
      const secs = Math.floor((Date.now() - currentInstallStart) / 1000);
      installStreamElapsed.textContent = secs + 's';
    }
  }, 1000);
  return window.electronAPI.installStart(name).then(res => {
    if (res && res.error){
      showToast(res.error);
      if (installStream) installStream.hidden = true;
      detailsInstallBtn?.classList.remove('loading');
      detailsInstallBtn?.removeAttribute('disabled');
      return;
    }
    currentInstallId = res?.id || null;
    activeInstallSession.id = currentInstallId;
    // Rafraîchir les boutons maintenant que l'ID est connu
    refreshAllInstallButtons();
  });
}

if (window.electronAPI.onInstallProgress){
  window.electronAPI.onInstallProgress(msg => {
    if (!msg) return;
    if (currentInstallId && msg.id !== currentInstallId) return; // ignorer autres installations (future multi support)
    if (msg.kind === 'line') {
      // --- Extraction du pourcentage de progression depuis le flux ---
      if (msg.raw !== undefined) {
        // Nettoyage robuste de toutes les séquences d'échappement ANSI/OSC (couleurs, curseur, ESC 7/8, etc.)
        const ansiCleaned = msg.raw
          // Séquences ESC [ ... (CSI)
          .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
          // Séquences ESC ... (OSC, ESC 7, ESC 8, etc.)
          .replace(/\x1B[][A-Za-z0-9#()*+\-.\/]*|\x1B[7-8]/g, '')
          // Séquences OSC (Operating System Command)
          .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
          // Autres caractères de contrôle
          .replace(/[\x07\x08\x0D\x0A\x1B]/g, '');

        // --- Détection et accumulation du bloc warning ---
        if (!window._installWarningBuffer) window._installWarningBuffer = null;
        if (!window._installWarningActive) window._installWarningActive = false;

        // Début du bloc warning
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

        // Cherche un motif du type "   6%[>" ou " 99%[" ou "100%[" (tolère espaces avant)
        const percentMatch = ansiCleaned.match(/\s(\d{1,3})%\s*\[/);
        if (percentMatch) {
          let percent = parseInt(percentMatch[1], 10);
          if (!isNaN(percent)) {
            if (installProgressPercentLabel) installProgressPercentLabel.textContent = percent + '%';
            if (installProgressBar) installProgressBar.value = percent;
          }
        }
        // Extraction brute du temps restant (formats "eta ...", "ETA ...", "Temps restant ...", "remaining ...")
        let eta = '';
        let m = ansiCleaned.match(/(?:ETA|eta|Temps restant|remaining)[\s:]+([^\s][^\r\n]*)/i);
        if (m) eta = m[1].trim();
        if (installProgressEtaLabel) installProgressEtaLabel.textContent = eta ? `⏳ ${eta}` : '';
      }
      // (Le temps écoulé est maintenant géré par le chronomètre JS)
      return;
    }
    switch(msg.kind){
      case 'start':
        if (installStreamStatus) installStreamStatus.textContent = t('install.status');
        refreshAllInstallButtons();
        if (installProgressBar) installProgressBar.value = 0;
        break;
      case 'error':
        if (installStreamStatus) installStreamStatus.textContent = t('install.error') || 'Erreur';
        detailsInstallBtn?.classList.remove('loading');
        detailsInstallBtn?.removeAttribute('disabled');
        setTimeout(()=> { if (installStream) installStream.hidden = true; }, 5000);
        if (installProgressBar) installProgressBar.value = 0;
        if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
        break;
      case 'cancelled':
        if (installStreamStatus) installStreamStatus.textContent = t('install.cancelled') || 'Annulée';
        if (detailsInstallBtn) {
          detailsInstallBtn.classList.remove('loading');
          detailsInstallBtn.disabled = false;
        }
        if (installProgressBar) installProgressBar.value = 0;
        if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
        setTimeout(()=> { if (installStream) installStream.hidden = true; }, 2000);
        // (Correction annulée : on ne rafraîchit plus la liste ni les détails ici)
        break;
      case 'done':
        if (installStreamStatus) installStreamStatus.textContent = t('install.done') || 'Terminé';
        if (installProgressBar) installProgressBar.value = 100;
        if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
        setTimeout(()=> { if (installStream) installStream.hidden = true; }, 2000);
        // --- Suite logique d'après l'ancien code (fusionner les deux 'done') ---
        detailsInstallBtn?.classList.remove('loading');
        detailsInstallBtn?.removeAttribute('disabled');
        if (activeInstallSession && activeInstallSession.id === currentInstallId) {
          activeInstallSession.done = true;
          activeInstallSession.success = msg.success;
          activeInstallSession.code = msg.code;
        }
        // Plus de gestion du log ou du bouton log ici
        loadApps().then(()=> {
          if (msg.success) {
            if (msg.name) showDetails(msg.name); else if (detailsInstallBtn?.getAttribute('data-name')) showDetails(detailsInstallBtn.getAttribute('data-name'));
          }
          if (msg.name) {
            const tile = document.querySelector(`.app-tile[data-app="${CSS.escape(msg.name)}"]`);
            if (tile) tile.classList.remove('busy');
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
//# sourceMappingURL=app.js.map





