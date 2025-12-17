(function registerSearchFeature(){
  const namespace = window.features = window.features || {};

  let stateRef = null;
  let setAppList = () => {};
  let updatesPanel = null;
  let advancedPanel = null;
  let appsContainer = null;
  let refreshInstallUi = () => {};
  let categoriesApi = null;
  let exitDetailsView = null;
  let searchInput = null;
  let tabs = [];
  let tabAll = null;
  let debounceFn = null;
  let debounceDelay = 140;
  let translateFn = (key) => key;
  let iconMapOverride = null;

  let searchMode = false;
  let lastSearchValue = '';

  function fallbackDebounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function getDebounce() {
    if (typeof debounceFn === 'function') return debounceFn;
    const utils = window.utils || {};
    if (typeof utils.debounce === 'function') return utils.debounce;
    return fallbackDebounce;
  }

  function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value.forEach === 'function') return Array.from(value);
    return [];
  }

  function handleFocus() {
    searchMode = true;
    if (searchInput && lastSearchValue) {
      searchInput.value = lastSearchValue;
    }
    if (typeof exitDetailsView === 'function') {
      exitDetailsView();
    }
    if (stateRef && stateRef.activeCategory !== 'all') {
      stateRef.activeCategory = 'all';
      if (tabAll && !tabAll.classList.contains('active')) {
        tabAll.click();
      }
    }
    if (categoriesApi && typeof categoriesApi.updateDropdownLabel === 'function') {
      categoriesApi.updateDropdownLabel(stateRef, translateFn, iconMapOverride);
    }
    applySearchInternal();
  }

  function hidePanelsForNonApps() {
    if (updatesPanel) updatesPanel.hidden = true;
    if (advancedPanel) advancedPanel.hidden = true;
  }

  function showUpdatesPanel() {
    if (updatesPanel) updatesPanel.hidden = false;
    if (advancedPanel) advancedPanel.hidden = true;
  }

  function showAdvancedPanel() {
    if (advancedPanel) advancedPanel.hidden = false;
    if (updatesPanel) updatesPanel.hidden = true;
  }

  function resetSearchModeIfNeeded() {
    if (!searchMode) return;
    searchMode = false;
    if (searchInput) {
      lastSearchValue = searchInput.value || '';
      searchInput.blur();
    } else {
      lastSearchValue = '';
    }
  }

  function filterInstalled(base) {
    return base.filter(app => app && app.installed && app.hasDiamond === true);
  }

  function filterByCategory(base, category) {
    return base.filter(app => app && app.category === category);
  }

  function filterByQuery(base) {
    if (!searchMode || !searchInput) return base;
    const raw = searchInput.value || '';
    const trimmed = raw.trim();
    if (!trimmed) return base;
    const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return base;
    return base.filter(app => {
      if (!app) return false;
      const name = String(app.name || '').toLowerCase();
      const desc = String(app.desc || '').toLowerCase();
      return words.every(word => name.includes(word) || desc.includes(word));
    });
  }

  function applySearchInternal() {
    if (!stateRef) return [];
    const allApps = Array.isArray(stateRef.allApps) ? stateRef.allApps : [];
    const activeCategory = stateRef.activeCategory || 'all';

    if (activeCategory === 'updates') {
      showUpdatesPanel();
      setAppList([]);
      if (appsContainer) appsContainer.innerHTML = '';
      stateRef.filtered = [];
      return [];
    }
    if (activeCategory === 'advanced') {
      showAdvancedPanel();
      setAppList([]);
      if (appsContainer) appsContainer.innerHTML = '';
      stateRef.filtered = [];
      return [];
    }

    hidePanelsForNonApps();

    let base = allApps;
    if (activeCategory === 'installed') {
      resetSearchModeIfNeeded();
      base = filterInstalled(allApps);
    } else if (activeCategory !== 'all') {
      resetSearchModeIfNeeded();
      base = filterByCategory(allApps, activeCategory);
    }

    const filtered = filterByQuery(base);
    stateRef.filtered = filtered;
    setAppList(filtered);
    refreshInstallUi();
    return filtered;
  }

  function init(options = {}) {
    stateRef = options.state || {};
    setAppList = typeof options.setAppList === 'function' ? options.setAppList : () => {};
    updatesPanel = options.updatesPanel || null;
    advancedPanel = options.advancedPanel || null;
    appsContainer = options.appsContainer || null;
    refreshInstallUi = typeof options.refreshInstallUi === 'function' ? options.refreshInstallUi : () => {};
    categoriesApi = options.categoriesApi || null;
    exitDetailsView = typeof options.exitDetailsView === 'function' ? options.exitDetailsView : null;
    translateFn = typeof options.translate === 'function' ? options.translate : (key) => key;
    iconMapOverride = options.iconMap || null;
    searchInput = options.searchInput || document.getElementById('searchInput');
    tabs = ensureArray(options.tabs || document.querySelectorAll('.tab'));
    tabAll = tabs.find(tab => tab && tab.dataset && tab.dataset.category === 'all') || null;
    debounceFn = options.debounce || options.debounceFn || null;
    debounceDelay = typeof options.debounceDelay === 'number' ? options.debounceDelay : 140;

    if (searchInput) {
      searchInput.addEventListener('focus', handleFocus);
      const debouncer = getDebounce();
      const onInput = debouncer(() => applySearchInternal(), debounceDelay);
      searchInput.addEventListener('input', onInput);
    }

    return Object.freeze({
      applySearch: () => applySearchInternal(),
      getSearchState: () => ({ searchMode, lastSearchValue }),
      resetSearch: () => { searchMode = false; lastSearchValue = ''; }
    });
  }

  namespace.search = Object.freeze({ init });
})();
