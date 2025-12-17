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


function applyViewModeClass() {
  document.body.classList.remove('view-list','view-grid','view-icons','view-cards');
  if (state.viewMode === 'list') document.body.classList.add('view-list');
  else if (state.viewMode === 'icons') document.body.classList.add('view-icons');
  else if (state.viewMode === 'cards') document.body.classList.add('view-cards');
  else document.body.classList.add('view-grid');
}

let appListVirtual = [];
let currentEndVirtual = VISIBLE_COUNT;
let lastTileObserver = null;

function setAppList(list) {
  appListVirtual = list;
  currentEndVirtual = VISIBLE_COUNT;
  if (scrollShell) scrollShell.scrollTop = 0;
  renderVirtualList();
}

function renderVirtualList() {
  if (!appsDiv) return;
  appsDiv.innerHTML = '';
  const useSkeleton = appListVirtual.length > 50;
  if (useSkeleton) {
    // Génère toutes les tuiles squelettes d’un coup
    // Squelettes ultra-minimaux, adaptatifs selon la vue
    const viewClass = 'view-' + (state.viewMode || 'grid');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < appListVirtual.length; i++) {
      const skel = document.createElement('div');
      skel.className = 'app-tile-skeleton ' + viewClass;
      skel.dataset.index = i;
      fragment.appendChild(skel);
    }
    appsDiv.appendChild(fragment);
    // Observer les squelettes visibles et les hydrater
    if (window.skeletonObserver) window.skeletonObserver.disconnect();
    window.skeletonObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('hydrated')) {
          const idx = parseInt(entry.target.dataset.index, 10);
          const realTile = buildTile(appListVirtual[idx]);
          realTile.classList.add('hydrated');
          entry.target.replaceWith(realTile);
          window.skeletonObserver.observe(realTile); // continue à observer la vraie tuile si besoin
        }
      });
    }, { root: scrollShell, threshold: 0.1 });
    // Observer les squelettes initialement visibles
    const tiles = appsDiv.querySelectorAll('.app-tile-skeleton');
    tiles.forEach(tile => window.skeletonObserver.observe(tile));
  } else {
    // Cas classique : moins de 50 apps, on rend tout normalement
    const end = Math.min(currentEndVirtual, appListVirtual.length);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < end; i++) {
      fragment.appendChild(buildTile(appListVirtual[i]));
    }
    appsDiv.appendChild(fragment);
    if (lastTileObserver) lastTileObserver.disconnect();
    if (end < appListVirtual.length) {
      // Observer les 3 dernières tuiles pour une meilleure robustesse au scroll rapide
      const tiles = appsDiv.querySelectorAll('.app-tile');
      const toObserve = Array.from(tiles).slice(-3); // 3 dernières
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


function buildTile(item){
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
  const badgeHTML = installed ? '<span class="installed-badge" aria-label="Installée" title="Installée" style="position:absolute;top:2px;right:2px;">✓</span>' : '';
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
    } catch (e) {
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

let applySearch = () => {};

// --- Gestion accélération GPU ---
if (disableGpuCheckbox && window.electronAPI && window.electronAPI.getGpuPref && window.electronAPI.setGpuPref) {
  // Charger l'état au démarrage
  window.electronAPI.getGpuPref().then(val => {
    disableGpuCheckbox.checked = !!val;
  });
  disableGpuCheckbox.addEventListener('change', async () => {
    const val = !!disableGpuCheckbox.checked;
    await window.electronAPI.setGpuPref(val);
    // Afficher un toast traduit et proposer de relancer l'app
    showToast(val ? t('toast.gpuDisabled') : t('toast.gpuEnabled'));
    setTimeout(() => {
      if (confirm(t('confirm.gpuRestart'))) {
        window.location.reload();
      }
    }, 1200);
  });
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
    // Correction : ne pas afficher de tuiles dans les onglets updates ou avancé
    if (state.activeCategory === 'updates' || state.activeCategory === 'advanced') {
      setAppList([]);
    } else {
      setAppList(state.filtered);
    }
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
    scrollShell,
    appsContainer: appsDiv,
    getActiveInstallSession: () => activeInstallSession,
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
const toast = document.getElementById('toast');
let toastHideTimer = null;

let syncBtn = null;
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const purgeIconsBtn = document.getElementById('purgeIconsBtn');
const purgeIconsResult = document.getElementById('purgeIconsResult');
const tabs = document.querySelectorAll('.tab');
// Mise à jour
let updateInProgress = false;
const updatesPanel = document.getElementById('updatesPanel');
const advancedPanel = document.getElementById('advancedPanel');
const runUpdatesBtn = document.getElementById('runUpdatesBtn');
const updateSpinner = document.getElementById('updateSpinner');
const updateResult = document.getElementById('updateResult');
const updateFinalMessage = document.getElementById('updateFinalMessage');
const updatedAppsIcons = document.getElementById('updatedAppsIcons');
const installedCountEl = document.getElementById('installedCount');

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
  exitDetailsView,
  debounce
});
if (searchFeature && typeof searchFeature.applySearch === 'function') {
  applySearch = searchFeature.applySearch;
}
// Modale sortie brute update
const showRawUpdateBtn = document.getElementById('showRawUpdateBtn');
const rawUpdateModal = document.getElementById('rawUpdateModal');
const rawUpdatePre = document.getElementById('rawUpdatePre');
const rawUpdateClose = document.getElementById('rawUpdateClose');
const rawUpdateClose2 = document.getElementById('rawUpdateClose2');
const rawCopyBtn = document.getElementById('rawCopyBtn');
const rawSaveBtn = document.getElementById('rawSaveBtn');
let lastUpdateRaw = '';
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
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(new RegExp(`#?\{${k}\}`, 'g'), v);
    });
  }
  return str;
}

function applyTranslations() {
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
          // Correction : n'affiche la liste des applications que si l'onglet actif est un onglet 'application'
          const appTabs = ['all', 'installed'];
          if (appTabs.includes(state.activeCategory)) {
            try { setAppList(state.filtered); refreshAllInstallButtons(); } catch(_){}
            if (appsDiv) appsDiv.hidden = false;
            if (updatesPanel) updatesPanel.hidden = true;
            if (advancedPanel) advancedPanel.hidden = true;
          } else {
            if (appsDiv) appsDiv.hidden = true;
            if (updatesPanel) updatesPanel.hidden = (state.activeCategory !== 'updates');
            if (advancedPanel) advancedPanel.hidden = (state.activeCategory !== 'advanced');
          }
        });
      } catch(_){}
    });
  } catch(_) {}
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
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
      localStorage.setItem('langPref', t.value);
      applyTranslations();
      document.documentElement.setAttribute('lang', getLangPref());
  // Appliquer les traductions dynamiquement sans recharger
  try { applyTranslations(); } catch(_){}
  try { document.documentElement.setAttribute('lang', getLangPref()); } catch(_){}
  try { setAppList(state.filtered); refreshAllInstallButtons(); } catch(_){}
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

// Panneau paramètres
if (settingsBtn && settingsPanel) {
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !settingsPanel.hidden;
    if (isOpen) {
      settingsPanel.hidden = true;
      settingsBtn.setAttribute('aria-expanded','false');
    } else {
      // Synchroniser radios
  const themePref = getThemePref();
      settingsPanel.querySelectorAll('input[name="themePref"]').forEach(r => { r.checked = (r.value === themePref); });
      settingsPanel.hidden = false;
      settingsBtn.setAttribute('aria-expanded','true');
      // Focus panneau pour accessibilité
      setTimeout(()=> settingsPanel.focus(), 20);
    }
  });
  // Fermer clic extérieur
  document.addEventListener('click', (ev) => {
    if (settingsPanel.hidden) return;
    if (ev.target === settingsPanel || settingsPanel.contains(ev.target) || ev.target === settingsBtn) return;
    settingsPanel.hidden = true;
    settingsBtn.setAttribute('aria-expanded','false');
  });
  // Fermeture ESC
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !settingsPanel.hidden) {
      settingsPanel.hidden = true;
      settingsBtn.setAttribute('aria-expanded','false');
      settingsBtn.focus();
    }
    // Ctrl+, ouvre / toggle paramètres
    if ((ev.ctrlKey || ev.metaKey) && ev.key === ',') {
      if (settingsBtn) settingsBtn.click();
    }
  });
  // Radios thème
  settingsPanel.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.name === 'themePref') {
      localStorage.setItem('themePref', t.value);
      applyThemePreference();
      settingsPanel.hidden = true;
      settingsBtn.setAttribute('aria-expanded','false');
      settingsBtn.focus();
    }
  });

  // Purge cache icônes
  if (purgeIconsBtn) {
    purgeIconsBtn.addEventListener('click', async () => {
      purgeIconsBtn.disabled = true;
      const oldLabel = purgeIconsBtn.textContent;
      purgeIconsBtn.textContent = t('settings.purging');
      try {
        const res = await window.electronAPI.purgeIconsCache();
        if (purgeIconsResult) purgeIconsResult.textContent = (res && typeof res.removed === 'number') ? t('settings.removedFiles', {count: res.removed}) : t('settings.done');
        // Forcer rechargement visible: nettoyer attributs src pour celles déjà en cache
        document.querySelectorAll('.app-tile img').forEach(img => {
          if (img.src.startsWith('appicon://')) {
            const original = img.src; // déclencher rechargement en modifiant data-src
            img.removeAttribute('src');
            img.setAttribute('data-src', original);
            if (iconObserver) iconObserver.observe(img);
          }
        });
      } catch(e){ if (purgeIconsResult) purgeIconsResult.textContent = t('settings.purgeError'); }
      finally {
        purgeIconsBtn.textContent = oldLabel;
        purgeIconsBtn.disabled = false;
      }
    });
  }
}



// --- Opening external links preference ---
// Key: openExternalLinks (string '1' == true)
const openExternalCheckbox = document.getElementById('openExternalLinksCheckbox');
// Initialiser checkbox état à l'ouverture du panneau
if (openExternalCheckbox) {
  openExternalCheckbox.checked = loadOpenExternalPref();
  openExternalCheckbox.addEventListener('change', (ev) => {
    saveOpenExternalPref(openExternalCheckbox.checked);
  });
}

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
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  if (toastHideTimer) clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    toast.hidden = true;
    toastHideTimer = null;
  }, 2300);
}

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
    if (appsDiv) {
      appsDiv.innerHTML = `<div class="empty-state"><h3>Aucun gestionnaire détecté</h3><p style='font-size:13px;line-height:1.4;max-width:520px;'>Installez <code>AM</code> ou <code>appman</code> (dans le PATH). Sans cela le catalogue ne peut pas être affiché.</p></div>`;
    }
    if (installedCountEl) installedCountEl.textContent = '0';
    appsDiv?.setAttribute('aria-busy','false');
    return;
  }
  if (detailed.error) {
    state.allApps = [];
    state.filtered = [];
    if (appsDiv) appsDiv.innerHTML = `<div class='empty-state'><h3>Erreur de récupération</h3><p style='font-size:13px;'>${detailed.error}</p></div>`;
    if (installedCountEl) installedCountEl.textContent = '0';
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
  setAppList(state.filtered);
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
    }, { rootMargin: '1200px' }); // marge accrue pour charger encore plus tôt hors écran
  }
}


// Préchargement async throttlé des images encore non démarrées — démarre après rendu
let _prefetchScheduled = false;
function prefetchPreloadImages(limit = 200, concurrency = 6) {
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
  const label = app.name.charAt(0).toUpperCase() + app.name.slice(1);
  const version = app.version ? String(app.version) : null;
  if (detailsIcon) {
    detailsIcon.src = getIconUrl(app.name);
    detailsIcon.onerror = () => { detailsIcon.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; };
    // Ajout du badge installé sur l'icône en vue détaillée
    const wrapper = detailsIcon.parentElement;
    if (wrapper && wrapper.classList.contains('details-icon-wrapper')) {
      wrapper.style.position = 'relative';
      // Nettoyage du badge existant avant ajout
      const oldBadge = wrapper.querySelector('.installed-badge');
      if (oldBadge) oldBadge.remove();
      const isActuallyInstalled = app.installed && !(activeInstallSession && activeInstallSession.name === app.name && activeInstallSession.id && !activeInstallSession.done);
      if (isActuallyInstalled) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'installed-badge';
        badgeEl.setAttribute('aria-label', 'Installée');
        badgeEl.setAttribute('title', 'Installée');
        badgeEl.textContent = '✓';
        badgeEl.style.position = 'absolute';
        badgeEl.style.top = '0';
        badgeEl.style.right = '0';
        badgeEl.style.zIndex = '2';
        wrapper.appendChild(badgeEl);
      }
    }
  }
  if (detailsName) {
    // Correction : si installation annulée, ne pas afficher comme installée
    const isActuallyInstalled = app.installed && !(activeInstallSession && activeInstallSession.name === app.name && activeInstallSession.id && !activeInstallSession.done);
    detailsName.innerHTML = isActuallyInstalled
      ? `${label}${version ? ' · ' + version : ''}`
      : (version ? `${label} · ${version}` : label);
  }
  if (detailsName) detailsName.dataset.app = app.name.toLowerCase();
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
  if (appsDiv) appsDiv.hidden = true;
  loadRemoteDescription(app.name).catch(err => {
    if (detailsLong) detailsLong.textContent = t('details.errorDesc', {error: err?.message || err || t('error.unknown')});
  });
}

function exitDetailsView() {
  if (appDetailsSection) appDetailsSection.hidden = true;
  document.body.classList.remove('details-mode');
  if (appsDiv) appsDiv.hidden = false;
  // Réaffiche la barre d'onglets catégories et le bouton miroir/tout
  const tabsRowSecondary = document.querySelector('.tabs-row-secondary');
  if (tabsRowSecondary) tabsRowSecondary.style.visibility = 'visible';
  // Réappliquer le filtre si on était dans l’onglet "Installé"
  if (state.activeCategory === 'installed') {
    const filtered = state.allApps.filter(a => a.installed && (a.hasDiamond === true));
    state.filtered = filtered;
    setAppList(filtered);
    if (typeof refreshAllInstallButtons === 'function') refreshAllInstallButtons();
  }
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
    if (api && typeof api.showDetails === 'function') api.showDetails(appName);
    else legacyShowDetails(appName);
  };
  exitDetailsView = () => {
    if (api && typeof api.exitDetailsView === 'function') api.exitDetailsView();
    else legacyExitDetailsView();
  };
})();

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
      if (activeInstallSession.id && activeInstallSession.name === appName) {
        window.electronAPI.installCancel(activeInstallSession.id).then(async ()=>{
          showToast(t('toast.cancelRequested'));
          // Lancer la désinstallation directement après l'annulation
          try {
            await window.electronAPI.amAction('uninstall', appName);
            await loadApps();
            applySearch();
          } catch(_){}
        });
      }
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
    settingsBtn?.click();
    return;
  }
  // Escape: fermer détails ou lightbox / menu modes / paramètres
  if (e.key === 'Escape') {
    if (lightbox && !lightbox.hidden) { closeLightbox(); return; }
    if (document.body.classList.contains('details-mode')) { exitDetailsView(); return; }
    if (!modeMenu?.hidden){ modeMenu.hidden = true; modeMenuBtn?.setAttribute('aria-expanded','false'); return; }
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
  if (updateSpinner) updateSpinner.hidden = true;
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
      dlg.style.position = 'fixed';
      dlg.style.top = '50%';
      dlg.style.left = '50%';
      dlg.style.transform = 'translate(-50%, -50%)';
      dlg.style.zIndex = '9999';
      dlg.style.background = '#fff';
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
      dlg.innerHTML = `<div class="choice-dialog-inner" style="user-select:text;"><h3>${data.prompt}</h3>${optionsHtml}</div>`;
      document.body.appendChild(dlg);
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
  errDlg.style.position = 'fixed';
  errDlg.style.top = '50%';
  errDlg.style.left = '50%';
  errDlg.style.transform = 'translate(-50%, -50%)';
  errDlg.style.zIndex = '10000';
  errDlg.style.background = '#fff';
  errDlg.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
  errDlg.style.borderRadius = '10px';
  errDlg.style.padding = '24px 32px';
  errDlg.style.minWidth = '320px';
  errDlg.innerHTML = `<div style="margin-bottom:12px;font-weight:bold;">Erreur</div><textarea style="width:100%;height:80px;resize:none;user-select:text;">${msg}</textarea><div style="text-align:right;margin-top:12px;"><button>Fermer</button></div>`;
  document.body.appendChild(errDlg);
  errDlg.querySelector('button').onclick = () => errDlg.remove();
  const ta = errDlg.querySelector('textarea');
  ta.focus();
  ta.select();
};
})();

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeCategory = tab.getAttribute('data-category') || 'all';
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
    if (!isUpdatesTab && updateSpinner) updateSpinner.hidden = true;
    if (isUpdatesTab) {
      if (updateInProgress) {
        runUpdatesBtn.disabled = true;
        updateSpinner.hidden = false;
      } else {
        runUpdatesBtn.disabled = false;
        updateSpinner.hidden = true;
      }
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

// Bouton Mettre à jour: exécution simple (pas de progression heuristique)
function parseUpdatedApps(res){
  const updated = new Set();
  if (typeof res !== 'string') return updated;
  const lines = res.split(/\r?\n/);
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
  // Chercher la section "The following apps have been updated:" dans le log
  let filteredUpdated = null;
  const match = fullText && fullText.match(/The following apps have been updated:[^\n]*\n([\s\S]*?)\n[-=]{5,}/i);
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
  const updated = parseUpdatedApps(fullText || '');
  const nothingPhrase = /Nothing to do here!?/i.test(fullText || '');
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
    if (!nothingPhrase && (fullText || '').trim()) {
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

runUpdatesBtn?.addEventListener('click', async () => {
  if (runUpdatesBtn.disabled) return;
  updateInProgress = true;
  showToast(t('toast.updating'));
  updateSpinner.hidden = false;
  updateResult.style.display = 'none';
  updateFinalMessage.textContent='';
  updatedAppsIcons.innerHTML='';
  runUpdatesBtn.disabled = true;
  try {
    const start = performance.now();
    const res = await window.electronAPI.amAction('__update_all__');
    lastUpdateRaw = res || '';
    handleUpdateCompletion(res || '');
    // --- Synchronisation complète comme le bouton sync ---
    if (window.electronAPI && typeof window.electronAPI.deleteCategoriesCache === 'function') {
      await window.electronAPI.deleteCategoriesCache();
    }
    if (window.categories && typeof window.categories.resetCache === 'function') {
      window.categories.resetCache();
    }
    if (window.categories && typeof window.categories.loadCategories === 'function') {
      await window.categories.loadCategories({ showToast });
    }
    const tabApplications = document.querySelector('.tab[data-category="all"]');
    if (tabApplications) tabApplications.click();
    showToast(t('toast.refreshing'));
    await loadApps();
    applySearch();
    // --- Fin synchronisation ---
    try {
      const needs = state.allApps.some(a => a.installed && (!a.version || String(a.version).toLowerCase().includes('unsupported')));
      if (needs) {
        await new Promise(r => setTimeout(r, 3000));
        await loadApps();
        applySearch();
      }
    } catch (_) {}
    const dur = Math.round((performance.now()-start)/1000);
    if (updateFinalMessage && updateFinalMessage.textContent) updateFinalMessage.textContent += t('updates.duration', {dur});
  } catch(e){
    // (Sortie supprimée)
  } finally {
    updateInProgress = false;
    updateSpinner.hidden = true;
    runUpdatesBtn.disabled = false;
  }
});

// --- Modale sortie brute ---
function openRawModal(){
  if (!rawUpdateModal) return;
  if (rawUpdatePre) rawUpdatePre.textContent = lastUpdateRaw || '(vide)';
  rawUpdateModal.hidden = false;
  setTimeout(()=> rawUpdatePre?.focus(), 30);
}
function closeRawModal(){ if (rawUpdateModal) rawUpdateModal.hidden = true; }

showRawUpdateBtn?.addEventListener('click', () => { if (!lastUpdateRaw) { showToast(t('toast.noUpdateLog')); return; } openRawModal(); });
rawUpdateClose?.addEventListener('click', closeRawModal);
rawUpdateClose2?.addEventListener('click', closeRawModal);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !rawUpdateModal?.hidden) closeRawModal(); }, { capture:true });
rawCopyBtn?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(lastUpdateRaw || ''); showToast(t('toast.copied')); } catch(_) { showToast(t('toast.copyError')); }
});
rawSaveBtn?.addEventListener('click', () => {
  try {
    const blob = new Blob([lastUpdateRaw || ''], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    a.download = 'update-log-'+ ts + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  } catch(e){ showToast(t('toast.saveError')); }
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
  } catch (e) {
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

// Transforme le texte brut de description en HTML avec liens cliquables
function linkifyDescription(text) {
  if (!text) return '';
  // Échapper d'abord
  const escaped = text
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  // Regex simple pour URLs http(s) (éviter de trop englober ponctuation finale)
  const urlRegex = /(https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+)(?=[\s)|\]}"'<>]|$)/g;
  const withLinks = escaped.replace(urlRegex, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
  // Newlines => <br>
  return withLinks.replace(/\n/g,'<br>');
}

// (override supprimé, applyDescription fait déjà le travail)

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





