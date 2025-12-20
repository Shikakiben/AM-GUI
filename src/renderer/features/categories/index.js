(function registerCategoriesFeature(){
  window.features = window.features || {};
  window.features.categories = window.features.categories || {};
  const cache = window.features.categories.cache;
  const dropdown = window.features.categories.dropdown;

  if (!cache || !dropdown) {
    console.warn('Categories feature incomplete: cache or dropdown missing.');
    return;
  }

  const api = Object.freeze({
    initDropdown: dropdown.initDropdown,
    loadCategories: (options) => cache.load(options || {}),
    resetCache: cache.reset,
    updateDropdownLabel: dropdown.updateDropdownLabel
  });

  window.features.categories.api = api;
  window.categories = api;
})();
