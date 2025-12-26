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
    let icon = '📦';
    if (state && state.activeCategory && state.activeCategory !== 'all') {
      const key = state.activeCategory.trim().toLowerCase();
      icon = iconMap[key] || '📦';
      label = state.activeCategory.charAt(0).toUpperCase() + state.activeCategory.slice(1);
    } else {
      icon = '🗃️';
      label = translate('categories.all');
    }
    categoriesDropdownBtn.innerHTML = `<span class="cat-icon">${icon}</span> <span>${label}</span> <span class="cat-arrow">▼</span>`;
  }

  function createCategoryButton(name, onClick, iconMap) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-btn';
    const key = name.trim().toLowerCase();
    const icon = iconMap[key] || '📦';
    btn.innerHTML = `<span class="cat-icon">${icon}</span> <span>${name.charAt(0).toUpperCase() + name.slice(1)}</span>`;
    btn.onclick = onClick;
    return btn;
  }

  async function initDropdown(options = {}) {
    const state = options.state || {};
    const translate = typeof options.t === 'function' ? options.t : (key) => key;
    const showToast = typeof options.showToast === 'function' ? options.showToast : null;
    const setAppList = typeof options.setAppList === 'function' ? options.setAppList : () => {};
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
          : `Catégorie "${label}" : ${count} apps`;
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

    document.querySelectorAll('.tab[data-category]').forEach(tab => {
      tab.addEventListener('click', () => {
        closeCategoriesDropdown();
      });
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
        const categories = await cacheApi.load({ showToast });
        categories.forEach(({ name, apps }) => {
          const btn = createCategoryButton(name, () => {
            closeCategoriesDropdown();
            const filteredApps = Array.isArray(apps)
              ? apps.filter(appName => typeof appName === 'string' && appName.trim().length > 0)
              : [];
            const detailedApps = filteredApps.map(appName => {
              const found = Array.isArray(state.allApps)
                ? state.allApps.find(candidate => candidate && normalizeName(candidate.name) === normalizeName(appName))
                : null;
              return found ? { ...found } : { name: appName };
            });
            activateCustomCategory({
              label: name,
              apps: detailedApps,
              toastMessage: `Catégorie "${name}" : ${filteredApps.length} apps`
            });
          }, iconMap);
          categoriesDropdownMenu.appendChild(btn);
        });
        const btnOther = createCategoryButton('Autre', () => {}, iconMap);
        btnOther.disabled = true;
        btnOther.innerHTML += ' <span class="cat-spinner" style="margin-left:8px;font-size:0.9em;">⏳</span>';
        categoriesDropdownMenu.appendChild(btnOther);
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
          btnOther.disabled = uncategorizedApps.length === 0;
          btnOther.querySelector('.cat-spinner')?.remove();
          btnOther.onclick = () => {
            closeCategoriesDropdown();
            activateCustomCategory({
              label: 'autre',
              apps: uncategorizedApps,
              toastMessage: `Autres applications : ${uncategorizedApps.length}`
            });
          };
        }, 0);
      });
    }

    const tabApplications = document.querySelector('.tab[data-category="all"]');
    if (tabApplications) tabApplications.click();

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
            if (showToast) showToast('Chargement des applications…');
            if (loadApps) await loadApps();
          }
          if (Array.isArray(state.allApps) && state.allApps.length > 0) {
            setAppList(state.allApps);
            if (showToast) showToast(`Toutes les applications : ${state.allApps.length}`);
          } else if (showToast) {
            showToast('Aucune application trouvée.');
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
