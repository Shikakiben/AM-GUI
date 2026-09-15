(function registerCategoriesCache(){
  let categoriesCache = null;
  let backgroundRefreshPromise = null;

  function normalizeCategories(input) {
    if (!Array.isArray(input)) return [];
    return input
      .filter(cat => cat && typeof cat.name === 'string')
      .map(cat => ({
        name: String(cat.name),
        apps: Array.isArray(cat.apps)
          ? cat.apps.map(app => String(app)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          : []
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  function categoriesChanged(prevList, nextList) {
    const prev = normalizeCategories(prevList);
    const next = normalizeCategories(nextList);
    if (prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i].name !== next[i].name) return true;
      if (prev[i].apps.length !== next[i].apps.length) return true;
      for (let j = 0; j < prev[i].apps.length; j++) {
        if (prev[i].apps[j] !== next[i].apps[j]) return true;
      }
    }
    return false;
  }

  function maybeRefreshInBackground(options = {}) {
    if (backgroundRefreshPromise) return backgroundRefreshPromise;
    backgroundRefreshPromise = (async () => {
      try {
        const res = await window.electronAPI.fetchAllCategories();
        if (!res || !res.ok || !Array.isArray(res.categories)) return;
        const nextCategories = res.categories;
        if (!categoriesChanged(categoriesCache || [], nextCategories)) return;
        categoriesCache = nextCategories;
        if (typeof options.onUpdated === 'function') {
          try { options.onUpdated(nextCategories); } catch (_) {}
        }
      } catch (_) {
        // Silent on purpose: startup checks should not spam errors/toasts.
      } finally {
        backgroundRefreshPromise = null;
      }
    })();
    return backgroundRefreshPromise;
  }

  async function loadCategories(options = {}) {
    if (categoriesCache) {
      if (options.backgroundRefresh !== false) {
        maybeRefreshInBackground(options);
      }
      return categoriesCache;
    }
    const showToast = typeof options.showToast === 'function' ? options.showToast : null;
    try {
      const cacheRes = await window.electronAPI.getCategoriesCache();
      if (cacheRes.ok && Array.isArray(cacheRes.categories) && cacheRes.categories.length > 0) {
        categoriesCache = cacheRes.categories;
        if (options.backgroundRefresh !== false) {
          maybeRefreshInBackground(options);
        }
        return categoriesCache;
      }
    } catch (_) {}
    try {
      const res = await window.electronAPI.fetchAllCategories();
      if (!res.ok || !Array.isArray(res.categories)) throw new Error(res.error || 'Categories error');
      categoriesCache = res.categories;
      return categoriesCache;
    } catch (error) {
      if (showToast) {
        const tMsg = typeof window.t === 'function' ? window.t('error.categories', { msg: error.message || error }) : null;
        showToast(tMsg || ('Categories error: ' + (error.message || error)));
      } else {
        console.warn('Categories error', error);
      }
      return [];
    }
  }

  function resetCategoriesCache() {
    categoriesCache = null;
  }

  function peek() {
    return categoriesCache;
  }

  const api = Object.freeze({
    load: loadCategories,
    reset: resetCategoriesCache,
    peek
  });

  window.features = window.features || {};
  window.features.categories = window.features.categories || {};
  window.features.categories.cache = api;
})();
