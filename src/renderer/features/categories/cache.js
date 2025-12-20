(function registerCategoriesCache(){
  let categoriesCache = null;

  async function loadCategories(options = {}) {
    if (categoriesCache) return categoriesCache;
    const showToast = typeof options.showToast === 'function' ? options.showToast : null;
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
    } catch (error) {
      if (showToast) {
        showToast('Erreur catégories: ' + (error.message || error));
      } else {
        console.warn('Erreur catégories', error);
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
