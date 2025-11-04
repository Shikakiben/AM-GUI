// Lightbox ultra-légère pour images Markdown (initialisation après DOM prêt)
window.addEventListener('DOMContentLoaded', () => {
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
      modeMenu.hidden = true;
      modeMenuBtn.setAttribute('aria-expanded','false');
    }
  });
  modeMenu.addEventListener('click', (ev) => {
    const opt = ev.target.closest('.mode-option');
    if (!opt) return;
    const mode = opt.getAttribute('data-mode');
    if (!mode || mode === state.viewMode) {
      modeMenu.hidden = true;
      modeMenuBtn.setAttribute('aria-expanded','false');
      return;
    }
    if (!['grid','list','icons','cards'].includes(mode)) return;
    state.viewMode = mode;
    localStorage.setItem('viewMode', state.viewMode);
    currentViewMode = state.viewMode;
    updateModeMenuUI();
    if (state.activeCategory === 'updates' || state.activeCategory === 'advanced') {
      setAppList([]);
    } else {
      setAppList(state.filtered);
    }
    const scroller = document.querySelector('.scroll-shell');
    if (scroller) scroller.scrollTop = 0;
    modeMenu.hidden = true;
    modeMenuBtn.setAttribute('aria-expanded','false');
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  // Dropdown menu catégories : ouverture/fermeture
  const categoriesDropdownBtn = document.getElementById('categoriesDropdownBtn');
  const categoriesDropdownMenu = document.getElementById('categoriesDropdownMenu'); // maintenant global, juste après <body>
  const categoriesDropdownOverlay = document.getElementById('categoriesDropdownOverlay');
  const dropdownCategories = document.querySelector('.dropdown-categories');
  // Appliquer le label au chargement
  setCategoriesDropdownBtnLabel();

  // S'assurer que la flèche reste après une traduction dynamique
  // (patch la fonction applyTranslations pour réappliquer la flèche)
  const origApplyTranslations = applyTranslations;
  window.applyTranslations = function() {
    origApplyTranslations();
    setCategoriesDropdownBtnLabel();
  };
  function closeCategoriesDropdown() {
    categoriesDropdownMenu.hidden = true;
    categoriesDropdownBtn.setAttribute('aria-expanded', 'false');
    categoriesDropdownBtn.classList.remove('active');
    if (categoriesDropdownOverlay) categoriesDropdownOverlay.hidden = true;
  }
  function openCategoriesDropdown() {
    // Affiche le menu déroulant, largeur gérée par le CSS (100% de .content)
    categoriesDropdownMenu.hidden = false;
    categoriesDropdownBtn.setAttribute('aria-expanded', 'true');
    categoriesDropdownBtn.classList.add('active');
    if (categoriesDropdownOverlay) categoriesDropdownOverlay.hidden = false;
  }
  // Fonction factorisée pour créer un bouton de catégorie
  function createCategoryButton(name, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-btn';
    // Mapping d'icônes génériques par catégorie
    const iconMap = {
      "android": "🤖",
      "appimages": "📦",
      "audio": "🎵",
      "comic": "📚",
      "command-line": "💻",
      "communication": "💬",
      "disk": "🖴",
      "education": "🎓",
      "file-manager": "🗂️",
      "finance": "💰",
      "game": "🎮",
      "gnome": "👣",
      "graphic": "🎨",
      "internet": "🌐",
      "kde": "🖥️",
      "office": "🗎",
      "password": "🔑",
      "steam": "🕹️",
      "system-monitor": "📊",
      "video": "🎬",
      "web-app": "🕸️",
      "web-browser": "🌍",
      "wine": "🍷",
      "autre": "❓"
    };
    const key = name.trim().toLowerCase();
    const icon = iconMap[key] || "📦";
    btn.innerHTML = `<span class="cat-icon">${icon}</span> <span>${name.charAt(0).toUpperCase() + name.slice(1)}</span>`;
    btn.onclick = onClick;
    return btn;
  }
  if (categoriesDropdownBtn && categoriesDropdownMenu) {
    categoriesDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (categoriesDropdownMenu.hidden) openCategoriesDropdown();
      else closeCategoriesDropdown();
    });
    // Fermer au clic extérieur ou sur l'overlay
    if (categoriesDropdownOverlay) {
      categoriesDropdownOverlay.addEventListener('click', () => closeCategoriesDropdown());
    }
    document.addEventListener('click', (e) => {
      if (!categoriesDropdownMenu.hidden && !categoriesDropdownMenu.contains(e.target) && e.target !== categoriesDropdownBtn) {
        closeCategoriesDropdown();
      }
    });
    // Fermer au changement d’onglet principal
    document.querySelectorAll('.tab[data-category]').forEach(tab => {
      tab.addEventListener('click', () => {
        closeCategoriesDropdown();
      });
    });
  }
  function updateAppsModeBarVisibility() {
    // Affiche ou masque la barre de catégorie sélectionnée uniquement
    // Barre supprimée : plus d’action
    setCategoriesDropdownBtnLabel();
  }
  // Bouton "Tout"
  // Logique Catégories migrée sur l'onglet secondaire
  let categoriesCache = null;
  async function loadCategories() {
    if (categoriesCache) return categoriesCache;
    try {
      const cacheRes = await window.electronAPI.getCategoriesCache();
      if (cacheRes.ok && Array.isArray(cacheRes.categories) && cacheRes.categories.length > 0) {
        categoriesCache = cacheRes.categories;
        return categoriesCache;
      }
    } catch(e) {}
    try {
      const res = await window.electronAPI.fetchAllCategories();
      if (!res.ok || !Array.isArray(res.categories)) throw new Error(res.error || 'Erreur catégories');
      categoriesCache = res.categories;
      return categoriesCache;
    } catch(e) {
      showToast('Erreur catégories: ' + (e.message || e));
      return [];
    }
  }
  loadCategories();
  // Attacher la logique sur l'onglet secondaire
  // (Nettoyé : plus d'ajout de flèche JS sur .tab-secondary)
  const tabSecondary = document.querySelector('.tab-secondary');
  if (tabSecondary) {
    tabSecondary.addEventListener('click', async () => {
      document.querySelectorAll('.tab-secondary').forEach(t => t.classList.remove('active'));
      tabSecondary.classList.add('active');
      if (appDetailsSection) appDetailsSection.hidden = true;
      document.body.classList.remove('details-mode');
      if (appsDiv) appsDiv.hidden = false;
      state.currentDetailsApp = null;
      const categoriesDropdownMenu = document.getElementById('categoriesDropdownMenu');
      if (!categoriesDropdownMenu) return;
      categoriesDropdownMenu.innerHTML = '';
      const categories = await loadCategories();
      // Générer les entrées de catégorie sous forme de boutons stylés
      categories.forEach(({ name, apps }) => {
        const btn = createCategoryButton(name, () => {
          closeCategoriesDropdown();
          if (appDetailsSection) appDetailsSection.hidden = true;
          document.body.classList.remove('details-mode');
          if (appsDiv) appsDiv.hidden = false;
          state.currentDetailsApp = null;
          state.activeCategory = name;
          setCategoriesDropdownBtnLabel();
          const filteredApps = Array.isArray(apps) ? apps.filter(a => typeof a === 'string' && a.length > 0) : [];
          const detailedApps = filteredApps.map(appName => {
            const found = Array.isArray(state.allApps) ? state.allApps.find(x => x && x.name === appName) : null;
            return found ? { ...found } : { name: appName };
          });
          setAppList(detailedApps);
          showToast(`Catégorie "${name}" : ${filteredApps.length} apps`);
        });
        categoriesDropdownMenu.appendChild(btn);
      });
      // Bouton "Autre" affiché immédiatement, désactivé/spinner
      const btnOther = createCategoryButton('Autre', () => {});
      btnOther.disabled = true;
      btnOther.innerHTML += ' <span class="cat-spinner" style="margin-left:8px;font-size:0.9em;">⏳</span>';
      categoriesDropdownMenu.appendChild(btnOther);
      // Calcul asynchrone des apps non catégorisées
      setTimeout(() => {
        const allCategorizedNames = new Set();
        categories.forEach(cat => {
          if (Array.isArray(cat.apps)) {
            cat.apps.forEach(name => allCategorizedNames.add(name));
          }
        });
        const uncategorizedApps = Array.isArray(state.allApps)
          ? state.allApps.filter(app => app && !allCategorizedNames.has(app.name))
          : [];
        // Remplacer le handler et l'état du bouton
        btnOther.disabled = uncategorizedApps.length === 0;
        btnOther.querySelector('.cat-spinner')?.remove();
        btnOther.onclick = () => {
          closeCategoriesDropdown();
          if (appDetailsSection) appDetailsSection.hidden = true;
          document.body.classList.remove('details-mode');
          if (appsDiv) appsDiv.hidden = false;
          state.currentDetailsApp = null;
          state.activeCategory = 'autre';
          setCategoriesDropdownBtnLabel();
          setAppList(uncategorizedApps);
          showToast(`Autres applications : ${uncategorizedApps.length}`);
        };
      }, 0);
    });
  }
  // Par défaut, affiche tout via l'onglet Applications
  const tabApplications = document.querySelector('.tab[data-category="all"]');
  if (tabApplications) tabApplications.click();
  // Affiche ou masque le bouton Catégorie selon l'onglet actif
  function updateDropdownCategoriesVisibility() {
    const activeTab = document.querySelector('.tab.active');
    if (!dropdownCategories) return;
    if (activeTab && activeTab.dataset.category === 'all') {
      dropdownCategories.style.display = '';
    } else {
      dropdownCategories.style.display = 'none';
      if (categoriesDropdownMenu) categoriesDropdownMenu.hidden = true;
      if (categoriesDropdownBtn) {
        categoriesDropdownBtn.setAttribute('aria-expanded', 'false');
        categoriesDropdownBtn.classList.remove('active');
      }
    }
  }
  // Sur chaque changement d'onglet principal, mettre à jour la visibilité
  document.querySelectorAll('.tab[data-category]').forEach(tab => {
    tab.addEventListener('click', () => setTimeout(updateDropdownCategoriesVisibility, 0));
  });
  // Initialiser la visibilité au chargement
  updateDropdownCategoriesVisibility();

  // Sécurité : s'assurer que le bouton n'est jamais bloqué en mode "active" si le menu est caché
  document.addEventListener('mousemove', () => {
    if (categoriesDropdownMenu && categoriesDropdownBtn && categoriesDropdownMenu.hidden && categoriesDropdownBtn.classList.contains('active')) {
      categoriesDropdownBtn.classList.remove('active');
    }
  });

  // (Suppression du masquage automatique de catBar sur changement d’onglet)
  updateAppsModeBarVisibility();

  // Sur changement d’onglet, mettre à jour la visibilité
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      setTimeout(updateAppsModeBarVisibility, 0);
      // Désactive l'onglet secondaire 'Categories' si on quitte Applications
      if (tab.getAttribute('data-category') !== 'all') {
        document.querySelectorAll('.tab-secondary').forEach(t => t.classList.remove('active'));
      }
      // Si on clique sur l'onglet Applications, afficher toutes les apps
      if (tab.dataset.category === 'all') {
        if (appDetailsSection) appDetailsSection.hidden = true;
        document.body.classList.remove('details-mode');
        if (appsDiv) appsDiv.hidden = false;
        state.currentDetailsApp = null;
        // Masque le nom de la catégorie sélectionnée
  // Suppression de la barre : rien à faire
        // Affiche toutes les apps
        if (!Array.isArray(state.allApps) || state.allApps.length === 0) {
          setAppList([]);
          showToast('Chargement des applications…');
          await loadApps();
        }
        if (Array.isArray(state.allApps) && state.allApps.length > 0) {
          setAppList(state.allApps);
          showToast(`Toutes les applications : ${state.allApps.length}`);
        } else {
          showToast('Aucune application trouvée.');
        }
        // (plus de bouton Catégories à désactiver)
  // (plus de bouton Catégories à désactiver)
      }
    });
  });
});
const descriptionCache = new Map();
// --- Gestion multilingue ---

const translations = window.translations || {};

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

// Appliquer la langue au chargement
window.addEventListener('DOMContentLoaded', () => {
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
function applyThemePreference() {
  const pref = localStorage.getItem('themePref') || 'system';
  document.documentElement.classList.remove('theme-light','theme-dark');
  if (pref === 'light') document.documentElement.classList.add('theme-light');
  else if (pref === 'dark') document.documentElement.classList.add('theme-dark');
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
      const themePref = localStorage.getItem('themePref') || 'system';
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
function loadOpenExternalPref() {
  const v = localStorage.getItem('openExternalLinks');
  return v === '1';
}
function saveOpenExternalPref(val) {
  localStorage.setItem('openExternalLinks', val ? '1' : '0');
}
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
  setTimeout(()=> { if (toast) toast.hidden = true; }, 2300);
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
  // Ne pas relancer si déjà planifié
  if (_prefetchScheduled) return;
  _prefetchScheduled = true;
  // Récupérer les images qui portent encore data-src
  const imgs = Array.from(document.querySelectorAll('img[data-src]'));
  if (!imgs.length) return;
  // Trier par proximité avec le haut de la fenêtre
  imgs.sort((a,b) => (a.getBoundingClientRect().top || 0) - (b.getBoundingClientRect().top || 0));
  const toLoad = imgs.slice(0, Math.min(limit, imgs.length));
  let idx = 0;
  let active = 0;
  function nextBatch(){
    while (active < concurrency && idx < toLoad.length) {
      const img = toLoad[idx++];
      active++;
      // Start load on next frame to avoid blocking
      requestAnimationFrame(()=>{
        try { if (img.getAttribute('data-src')) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); } } catch(_){}
        active--; if (idx < toLoad.length) setTimeout(nextBatch, 0);
      });
    }
  }
  // lancer après un court délai pour laisser le rendu initial se stabiliser
  setTimeout(nextBatch, 180);
}

function showDetails(appName) {
  const app = state.allApps.find(a => a.name === appName);
  if (!app) return;
  // Mémoriser la position de scroll actuelle (shell scrollable)
  const scroller = document.querySelector('.scroll-shell');
  if (scroller) state.lastScrollY = scroller.scrollTop;
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
  const scroller = document.querySelector('.scroll-shell');
  if (scroller) scroller.scrollTop = state.lastScrollY || 0;
  // Mémoriser dernier détail pour potentielle restauration
  if (state.currentDetailsApp) sessionStorage.setItem('lastDetailsApp', state.currentDetailsApp);
}

backToListBtn?.addEventListener('click', exitDetailsView);

function applySearch() {
  // Gestion du mode recherche :
  let base = state.allApps;
  if (state.activeCategory === 'updates') {
    if (updatesPanel) updatesPanel.hidden = false;
    if (advancedPanel) advancedPanel.hidden = true;
    setAppList([]);
    if (appsDiv) appsDiv.innerHTML = '';
    return;
  }
  if (state.activeCategory === 'advanced') {
    if (advancedPanel) advancedPanel.hidden = false;
    if (updatesPanel) updatesPanel.hidden = true;
    setAppList([]);
    if (appsDiv) appsDiv.innerHTML = '';
    return;
  }
  if (updatesPanel) updatesPanel.hidden = true;
  if (advancedPanel) advancedPanel.hidden = true;
  if (state.activeCategory === 'installed') {
    // Dès qu'on quitte "Tout", on désactive la recherche
    if (searchMode) {
      searchMode = false;
      lastSearchValue = searchInput?.value || '';
      if (searchInput) searchInput.blur();
    }
    base = state.allApps.filter(a => a.installed && (a.hasDiamond === true));
  } else if (state.activeCategory !== 'all') {
    // Dès qu'on quitte "Tout", on désactive la recherche
    if (searchMode) {
      searchMode = false;
      lastSearchValue = searchInput?.value || '';
      if (searchInput) searchInput.blur();
    }
    base = state.allApps.filter(app => app.category === state.activeCategory);
  }
  let filtered = base;
  if (searchMode && searchInput && searchInput.value.trim() !== '') {
    const q = searchInput.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    filtered = base.filter(app => {
      const name = (app.name || '').toLowerCase();
      const desc = (app.desc || '').toLowerCase();
      // Tous les mots doivent être présents dans name OU desc
      return words.every(word => name.includes(word) || desc.includes(word));
    });
  }
  state.filtered = filtered;
  setAppList(filtered);
  if (typeof refreshAllInstallButtons === 'function') refreshAllInstallButtons();
}

// Listeners (vue détaillée) pour installation / désinstallation
detailsInstallBtn?.addEventListener('click', async () => {
  const name = detailsInstallBtn.getAttribute('data-name');
  if (!name) return;
  const action = detailsInstallBtn.getAttribute('data-action') || 'install';
  if (action === 'cancel-install') {
    if (activeInstallSession.id) {
      try { await window.electronAPI.installCancel(activeInstallSession.id); } catch(_){ }
      showToast(t('toast.cancelRequested'));
      // Lancer la désinstallation directement après l'annulation
      try {
        await window.electronAPI.amAction('uninstall', name);
        await loadApps();
        showDetails(name);
      } catch(_){}
    }
    return;
  }
  if (action === 'remove-queue') { removeFromQueue(name); return; }
  const ok = await openActionConfirm({
  title: t('confirm.installTitle'),
  message: t('confirm.installMsg', {name: `<strong>${name}</strong>`}),
  okLabel: t('details.install')
  });
  if (!ok) return;
  if (activeInstallSession.id && !activeInstallSession.done) {
    enqueueInstall(name);
    detailsInstallBtn.classList.remove('loading');
    refreshAllInstallButtons();
    return;
  }
  // Mise à jour immédiate du bouton avant réponse IPC pour meilleure réactivité
  detailsInstallBtn.classList.remove('loading');
  detailsInstallBtn.disabled = false;
  detailsInstallBtn.setAttribute('aria-label','Annuler installation en cours ('+name+')');
  enqueueInstall(name);
});

detailsUninstallBtn?.addEventListener('click', async () => {
  const name = detailsUninstallBtn.getAttribute('data-name');
  if (!name) return;
  const ok = await openActionConfirm({
  title: t('confirm.uninstallTitle'),
  message: t('confirm.uninstallMsg', {name: `<strong>${name}</strong>`}),
  okLabel: t('details.uninstall'),
  intent: 'danger'
  });
  if (!ok) return;
  detailsUninstallBtn.classList.add('loading');
  detailsUninstallBtn.disabled = true;
  showToast(t('toast.uninstalling', {name}));
  try {
    await window.electronAPI.amAction('uninstall', name);
  } finally {
    await loadApps();
    showDetails(name);
    detailsUninstallBtn.classList.remove('loading');
  }
});

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
function debounce(fn, delay){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), delay); }; }
searchInput?.addEventListener('input', debounce(applySearch, 140));
async function triggerRefresh() {
  if (!refreshBtn) return;
  if (refreshBtn.classList.contains('loading')) return;
  // Rafraîchir le cache des catégories comme au démarrage
  if (typeof categoriesCache !== 'undefined') categoriesCache = null;
  if (typeof loadCategories === 'function') await loadCategories();
  // Bascule sur l'onglet Applications (remplace btnAll)
  const tabApplications = document.querySelector('.tab[data-category="all"]');
  if (tabApplications) tabApplications.click();
  showToast(t('toast.refreshing'));
  refreshBtn.classList.add('loading');
  try {
    await loadApps();
    applySearch();
  } finally {
    setTimeout(()=> refreshBtn.classList.remove('loading'), 300);
    if (updateSpinner) updateSpinner.hidden = true;
  }
}
refreshBtn?.addEventListener('click', triggerRefresh);

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
  // Vérifie si l'utilisateur a choisi de ne plus afficher le warning
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
      if (document.getElementById('dontShowWget2Warning').checked) {
        localStorage.setItem(dontShowKey, '1');
      }
      modal.remove();
    };
  } else {
    modal.querySelector('pre').textContent = msg;
    modal.style.display = 'block';
  }
}
//# sourceMappingURL=app.js.map





