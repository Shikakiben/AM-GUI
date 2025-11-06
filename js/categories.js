(function(){
  let categoriesCache = null;

  function updateDropdownLabel(state, t, iconMapOverride) {
    const categoriesDropdownBtn = document.getElementById('categoriesDropdownBtn');
    if (!categoriesDropdownBtn) return;
    const iconMap = iconMapOverride || (window.constants && window.constants.CATEGORY_ICON_MAP) || {};
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

  async function loadCategories(options) {
    const opts = options || {};
    if (categoriesCache) return categoriesCache;
    try {
      const cacheRes = await window.electronAPI.getCategoriesCache();
      if (cacheRes.ok && Array.isArray(cacheRes.categories) && cacheRes.categories.length > 0) {
        categoriesCache = cacheRes.categories;
        return categoriesCache;
      }
    } catch (_) {}
    try {
      const res = await window.electronAPI.fetchAllCategories();
      if (!res.ok || !Array.isArray(res.categories)) throw new Error(res.error || 'Erreur catégories');
      categoriesCache = res.categories;
      return categoriesCache;
    } catch (e) {
      if (typeof opts.showToast === 'function') {
        opts.showToast('Erreur catégories: ' + (e.message || e));
      } else {
        console.warn('Erreur catégories', e);
      }
      return [];
    }
  }

  function resetCategoriesCache() {
    categoriesCache = null;
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

  async function initDropdown(options) {
    const opts = options || {};
    const state = opts.state || {};
    const translate = typeof opts.t === 'function' ? opts.t : (key) => key;
    const showToast = typeof opts.showToast === 'function' ? opts.showToast : null;
    const setAppList = typeof opts.setAppList === 'function' ? opts.setAppList : () => {};
    const loadApps = typeof opts.loadApps === 'function' ? opts.loadApps : null;
    const appDetailsSection = opts.appDetailsSection || null;
    const appsDiv = opts.appsDiv || null;
    const tabs = Array.isArray(opts.tabs) ? opts.tabs : Array.from(opts.tabs || document.querySelectorAll('.tab'));
    const iconMap = opts.iconMap || (window.constants && window.constants.CATEGORY_ICON_MAP) || {};

    const categoriesDropdownBtn = document.getElementById('categoriesDropdownBtn');
    const categoriesDropdownMenu = document.getElementById('categoriesDropdownMenu');
    if (!categoriesDropdownBtn || !categoriesDropdownMenu) return;
    const categoriesDropdownOverlay = document.getElementById('categoriesDropdownOverlay');
    const dropdownCategories = document.querySelector('.dropdown-categories');

    const updateLabel = () => updateDropdownLabel(state, translate, iconMap);
    updateLabel();

    if (typeof window.applyTranslations === 'function') {
      const origApplyTranslations = window.applyTranslations;
      window.applyTranslations = function() {
        origApplyTranslations();
        updateLabel();
        // Ne pas écraser le label du bouton dropdown ici
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

    categoriesDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (categoriesDropdownMenu.hidden) openCategoriesDropdown();
      else closeCategoriesDropdown();
    });

    if (categoriesDropdownOverlay) {
      categoriesDropdownOverlay.addEventListener('click', () => closeCategoriesDropdown());
    }

    document.addEventListener('click', (e) => {
      if (!categoriesDropdownMenu.hidden && !categoriesDropdownMenu.contains(e.target) && e.target !== categoriesDropdownBtn) {
        closeCategoriesDropdown();
      }
    });

    document.querySelectorAll('.tab[data-category]').forEach(tab => {
      tab.addEventListener('click', () => {
        closeCategoriesDropdown();
      });
    });

    loadCategories({ showToast });

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
        const categories = await loadCategories({ showToast });
        categories.forEach(({ name, apps }) => {
          const btn = createCategoryButton(name, () => {
            closeCategoriesDropdown();
            if (appDetailsSection) appDetailsSection.hidden = true;
            document.body.classList.remove('details-mode');
            if (appsDiv) appsDiv.hidden = false;
            state.currentDetailsApp = null;
            state.activeCategory = name;
            updateLabel();
            const filteredApps = Array.isArray(apps) ? apps.filter(a => typeof a === 'string' && a.length > 0) : [];
            const detailedApps = filteredApps.map(appName => {
              const found = Array.isArray(state.allApps) ? state.allApps.find(x => x && x.name === appName) : null;
              return found ? { ...found } : { name: appName };
            });
            setAppList(detailedApps);
            if (showToast) showToast(`Catégorie "${name}" : ${filteredApps.length} apps`);
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
              cat.apps.forEach(name => allCategorizedNames.add(name));
            }
          });
          const uncategorizedApps = Array.isArray(state.allApps)
            ? state.allApps.filter(app => app && !allCategorizedNames.has(app.name))
            : [];
          btnOther.disabled = uncategorizedApps.length === 0;
          btnOther.querySelector('.cat-spinner')?.remove();
          btnOther.onclick = () => {
            closeCategoriesDropdown();
            if (appDetailsSection) appDetailsSection.hidden = true;
            document.body.classList.remove('details-mode');
            if (appsDiv) appsDiv.hidden = false;
            state.currentDetailsApp = null;
            state.activeCategory = 'autre';
            updateLabel();
            setAppList(uncategorizedApps);
            if (showToast) showToast(`Autres applications : ${uncategorizedApps.length}`);
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
        if (tab.getAttribute('data-category') !== 'all') {
          document.querySelectorAll('.tab-secondary').forEach(t => t.classList.remove('active'));
        }
        if (tab.dataset.category === 'all') {
          if (appDetailsSection) appDetailsSection.hidden = true;
          document.body.classList.remove('details-mode');
          if (appsDiv) appsDiv.hidden = false;
          state.currentDetailsApp = null;
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

  window.categories = Object.freeze({
    initDropdown,
    loadCategories: (options) => loadCategories(options || {}),
    resetCache: resetCategoriesCache,
    updateDropdownLabel
  });
})();
