(function registerCategoriesDropdown(){
  const categoriesNamespace = window.features = window.features || {};
  categoriesNamespace.categories = categoriesNamespace.categories || {};

  function getIconMap(iconMapOverride) {
    if (iconMapOverride) return iconMapOverride;
    return (window.constants && window.constants.CATEGORY_ICON_MAP) || {};
  }

  function updateDropdownLabel(state, t, iconMapOverride) {
    const categoriesDropdownBtn = document.getElementById('categoriesDropdownBtn');
    if (!categoriesDropdownBtn) return;
    const iconMap = getIconMap(iconMapOverride);
    const translate = typeof t === 'function' ? t : (key) => key;
    let label = translate('tabs.categories');
    let icon = 'package';
    if (state && state.activeCategory && state.activeCategory !== 'all') {
      const key = state.activeCategory.trim().toLowerCase();
      icon = iconMap[key] || 'package';
      if (key === 'autre') {
        label = translate('categories.other');
      } else {
        label = (window.utils && typeof window.utils.prettifyAppName === 'function') ? window.utils.prettifyAppName(state.activeCategory) : state.activeCategory;
      }
    } else {
      icon = 'layout-grid';
      label = translate('categories.all');
    }
    categoriesDropdownBtn.innerHTML = `<i data-lucide="${icon}" class="cat-icon" style="width: 1.1em; height: 1.1em; margin-right: 6px; vertical-align: text-bottom;"></i> <span>${label}</span> <span class="cat-arrow">▼</span>`;
    if (window.lucide) window.lucide.createIcons({ root: categoriesDropdownBtn });
  }

  function createCategoryButton(name, onClick, iconMap) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-btn';
    const key = name.trim().toLowerCase();
    const icon = iconMap[key] || 'package';
    const displayName = (window.utils && typeof window.utils.prettifyAppName === 'function') ? window.utils.prettifyAppName(name) : name;
    btn.innerHTML = `<i data-lucide="${icon}" class="cat-icon" style="width: 1.1em; height: 1.1em; margin-right: 6px; vertical-align: text-bottom;"></i> <span>${displayName}</span>`;
    btn.onclick = onClick;
    return btn;
  }

  async function initDropdown(options = {}) {
    const state = options.state || {};
    const translate = typeof options.t === 'function' ? options.t : (key) => key;
    const showToast = typeof options.showToast === 'function' ? options.showToast : null;
    const setAppList = typeof options.setAppList === 'function' ? options.setAppList : () => {};
    const applySearch = typeof options.applySearch === 'function' ? options.applySearch : null;
    const loadApps = typeof options.loadApps === 'function' ? options.loadApps : null;
    const appDetailsSection = options.appDetailsSection || null;
    const appsDiv = options.appsDiv || null;
    const tabs = Array.isArray(options.tabs) ? options.tabs : Array.from(options.tabs || document.querySelectorAll('.tab'));
    const iconMap = options.iconMap || getIconMap();

    const normalizeName = (value) => (value && typeof value === 'string'
      ? value
      : (value ?? '')).toString().trim().toLowerCase();

    const ensureAppList = (apps) => Array.isArray(apps)
      ? apps.filter(item => !!item)
      : [];

    const buildAllAlphabetical = (apps) => {
      const source = Array.isArray(apps) ? apps : [];
      const byName = new Map();
      source.forEach(app => {
        if (!app || !app.name) return;
        const key = String(app.name).toLowerCase();
        if (!byName.has(key)) byName.set(key, app);
      });
      return Array.from(byName.values()).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
    };

    const renderAllApps = () => {
      if (applySearch) {
        applySearch();
        return;
      }
      setAppList(buildAllAlphabetical(state.allApps));
    };

    const setCategoryOverride = (label, apps) => {
      const list = ensureAppList(apps);
      state.categoryOverride = {
        name: label,
        norm: normalizeName(label),
        apps: list
      };
      state.filtered = list;
    };

    const clearCategoryOverride = () => {
      state.categoryOverride = null;
    };

    const resetToAppsView = () => {
      if (appDetailsSection) appDetailsSection.hidden = true;
      document.body.classList.remove('details-mode');
      if (appsDiv) appsDiv.hidden = false;
      state.currentDetailsApp = null;
    };

    const activateCustomCategory = ({ label, apps, toastMessage }) => {
      if (!label) return;
      resetToAppsView();
      state.activeCategory = label;
      setCategoryOverride(label, apps);
      updateLabel();
      const list = state.filtered || [];
      setAppList(list);
      if (showToast) {
        const count = list.length;
        const message = typeof toastMessage === 'string'
          ? toastMessage
          : translate('categories.appCount', { label, count });
        showToast(message);
      }
    };

    const cacheApi = categoriesNamespace.categories.cache;
    if (!cacheApi || typeof cacheApi.load !== 'function') {
      console.warn('Categories cache API non disponible.');
      return;
    }

    const categoriesDropdownBtn = document.getElementById('categoriesDropdownBtn');
    const categoriesDropdownMenu = document.getElementById('categoriesDropdownMenu');
    if (!categoriesDropdownBtn || !categoriesDropdownMenu) return;
    const categoriesDropdownOverlay = document.getElementById('categoriesDropdownOverlay');
    const dropdownCategories = document.querySelector('.dropdown-categories');

    const updateLabel = () => updateDropdownLabel(state, translate, iconMap);
    updateLabel();

    if (typeof window.applyTranslations === 'function') {
      const origApplyTranslations = window.applyTranslations;
      window.applyTranslations = function patchedApplyTranslations() {
        origApplyTranslations();
        updateLabel();
      };
    }

    function closeCategoriesDropdown() {
      categoriesDropdownMenu.hidden = true;
      categoriesDropdownBtn.setAttribute('aria-expanded', 'false');
      categoriesDropdownBtn.classList.remove('active');
      if (categoriesDropdownOverlay) categoriesDropdownOverlay.hidden = true;
    }

    function openCategoriesDropdown() {
      categoriesDropdownMenu.hidden = false;
      categoriesDropdownBtn.setAttribute('aria-expanded', 'true');
      categoriesDropdownBtn.classList.add('active');
      if (categoriesDropdownOverlay) categoriesDropdownOverlay.hidden = false;
    }

    categoriesDropdownBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (categoriesDropdownMenu.hidden) openCategoriesDropdown();
      else closeCategoriesDropdown();
    });

    if (categoriesDropdownOverlay) {
      categoriesDropdownOverlay.addEventListener('click', () => closeCategoriesDropdown());
    }

    document.addEventListener('click', (event) => {
      if (!categoriesDropdownMenu.hidden && !categoriesDropdownMenu.contains(event.target) && event.target !== categoriesDropdownBtn) {
        closeCategoriesDropdown();
      }
    });

    cacheApi.load({ showToast });

    const tabSecondary = document.querySelector('.tab-secondary');
    if (tabSecondary) {
      tabSecondary.addEventListener('click', async () => {
        document.querySelectorAll('.tab-secondary').forEach(t => t.classList.remove('active'));
        tabSecondary.classList.add('active');
        if (appDetailsSection) appDetailsSection.hidden = true;
        document.body.classList.remove('details-mode');
        if (appsDiv) appsDiv.hidden = false;
        state.currentDetailsApp = null;
        categoriesDropdownMenu.innerHTML = '';

        // "All" option at the top
        const btnAll = createCategoryButton('all', () => {
          closeCategoriesDropdown();
          clearCategoryOverride();
          state.activeCategory = 'all';
          updateLabel();
          resetToAppsView();
          if (!Array.isArray(state.allApps) || state.allApps.length === 0) {
            setAppList([]);
            if (showToast) showToast(translate('categories.loading'));
            if (loadApps) { (async () => { await loadApps(); })(); }
          }
          if (Array.isArray(state.allApps) && state.allApps.length > 0) {
            renderAllApps();
            const uniqueCount = new Set(state.allApps.map(a => String(a.name).toLowerCase())).size;
            if (showToast) showToast(translate('categories.allAppsCount', { count: uniqueCount }));
          }
        }, iconMap);
        btnAll.querySelector('span:last-child').textContent = translate('categories.all');
        btnAll.querySelector('.cat-icon').setAttribute('data-lucide', 'layout-grid');
        if (state.activeCategory === 'all') btnAll.classList.add('active');
        categoriesDropdownMenu.appendChild(btnAll);

        const categories = await cacheApi.load({ showToast });
        categories.forEach(({ name, apps }) => {
          const btn = createCategoryButton(name, () => {
            const filteredApps = Array.isArray(apps)
              ? apps.filter(appName => typeof appName === 'string' && appName.trim().length > 0)
              : [];
            if (filteredApps.length === 0) {
              if (showToast) showToast(translate('categories.empty', { category: name }));
              return;
            }
            closeCategoriesDropdown();
            const detailedApps = filteredApps.map(appName => {
              const found = Array.isArray(state.allApps)
                ? state.allApps.find(candidate => candidate && normalizeName(candidate.name) === normalizeName(appName))
                : null;
              return found ? { ...found } : { name: appName };
            });
            activateCustomCategory({
              label: name,
              apps: detailedApps,
              toastMessage: translate('categories.appCount', { label: name, count: filteredApps.length })
            });
            try { document.dispatchEvent(new CustomEvent('category.override', { detail: { name, count: detailedApps.length } })); } catch(_) {}
          }, iconMap);
          if (state.activeCategory === name) btn.classList.add('active');
          categoriesDropdownMenu.appendChild(btn);
        });
        const btnOther = createCategoryButton('autre', () => {}, iconMap);
        btnOther.querySelector('span:last-child').textContent = translate('categories.other');
        btnOther.disabled = true;
        btnOther.innerHTML += ' <i data-lucide="loader" class="cat-spinner" style="width: 1em; height: 1em; margin-left:8px; vertical-align: text-bottom;"></i>';
        if (state.activeCategory === 'autre') btnOther.classList.add('active');
        categoriesDropdownMenu.appendChild(btnOther);

        if (window.lucide) window.lucide.createIcons({ root: categoriesDropdownMenu });
        setTimeout(() => {
          const allCategorizedNames = new Set();
          categories.forEach(cat => {
            if (Array.isArray(cat.apps)) {
              cat.apps.forEach(name => allCategorizedNames.add(normalizeName(name)));
            }
          });
          const uncategorizedApps = Array.isArray(state.allApps)
            ? state.allApps.filter(app => app && !allCategorizedNames.has(normalizeName(app.name)))
            : [];
          btnOther.querySelector('.cat-spinner')?.remove();
          btnOther.disabled = false;
          btnOther.onclick = () => {
            if (uncategorizedApps.length === 0) {
              if (showToast) showToast(translate('categories.empty', { category: translate('categories.other') }));
              return;
            }
            closeCategoriesDropdown();
            activateCustomCategory({
              label: 'autre',
              apps: uncategorizedApps,
              toastMessage: translate('categories.otherAppsCount', { count: uncategorizedApps.length })
            });
          };
        }, 0);
      });
    }

    function updateDropdownCategoriesVisibility() {
      const activeTab = document.querySelector('.tab.active');
      if (!dropdownCategories) return;
      if (activeTab && activeTab.dataset.category === 'all') {
        dropdownCategories.style.display = '';
      } else {
        dropdownCategories.style.display = 'none';
        categoriesDropdownMenu.hidden = true;
        categoriesDropdownBtn.setAttribute('aria-expanded', 'false');
        categoriesDropdownBtn.classList.remove('active');
      }
    }

    document.querySelectorAll('.tab[data-category]').forEach(tab => {
      tab.addEventListener('click', () => setTimeout(updateDropdownCategoriesVisibility, 0));
    });
    updateDropdownCategoriesVisibility();

    document.addEventListener('mousemove', () => {
      if (categoriesDropdownMenu.hidden && categoriesDropdownBtn.classList.contains('active')) {
        categoriesDropdownBtn.classList.remove('active');
      }
    });

    function updateAppsModeBarVisibility() {
      updateLabel();
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        setTimeout(updateAppsModeBarVisibility, 0);
        clearCategoryOverride();
        if (tab.getAttribute('data-category') !== 'all') {
          document.querySelectorAll('.tab-secondary').forEach(t => t.classList.remove('active'));
        }
        if (tab.dataset.category === 'all') {
          resetToAppsView();
          if (!Array.isArray(state.allApps) || state.allApps.length === 0) {
            setAppList([]);
            if (showToast) showToast(translate('categories.loading'));
            if (loadApps) await loadApps();
          }
          if (Array.isArray(state.allApps) && state.allApps.length > 0) {
            renderAllApps();
            const uniqueCount = new Set(state.allApps.map(a => String(a.name).toLowerCase())).size;
            if (showToast) showToast(translate('categories.allAppsCount', { count: uniqueCount }));
          } else if (showToast) {
            showToast(translate('categories.noneFound'));
          }
        }
      });
    });
  }

  const api = Object.freeze({
    updateDropdownLabel,
    initDropdown
  });

  categoriesNamespace.categories.dropdown = api;
})();
