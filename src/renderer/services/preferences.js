(function registerPreferences(){
  function getThemePref() {
    try {
      return localStorage.getItem('themePref') || 'system';
    } catch (_) {
      return 'system';
    }
  }

  function applyThemePreference() {
    const pref = getThemePref();
    const root = document.documentElement;
    root.classList.remove('theme-light','theme-dark');
    if (pref === 'light') root.classList.add('theme-light');
    else if (pref === 'dark') root.classList.add('theme-dark');
  }

  function loadOpenExternalPref() {
    try {
      return localStorage.getItem('openExternalLinks') === '1';
    } catch (_) {
      return false;
    }
  }

  function saveOpenExternalPref(val) {
    try {
      localStorage.setItem('openExternalLinks', val ? '1' : '0');
    } catch (_){ }
  }

  // 'emoji' (default) keeps the colourful category emojis, 'mono' swaps the
  // pictographs for the inline Lucide SVGs of ui/icons.js.
  function getIconStyle() {
    try {
      return localStorage.getItem('iconStyle') === 'mono' ? 'mono' : 'emoji';
    } catch (_) {
      return 'emoji';
    }
  }

  function saveIconStyle(val) {
    try {
      if (val === 'mono') localStorage.setItem('iconStyle', 'mono');
      else localStorage.removeItem('iconStyle');
    } catch (_){ }
  }

  const api = Object.freeze({
    getThemePref,
    applyThemePreference,
    loadOpenExternalPref,
    saveOpenExternalPref,
    getIconStyle,
    saveIconStyle
  });

  window.services = window.services || {};
  window.services.preferences = api;
  window.preferences = api;
})();
