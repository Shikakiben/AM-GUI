(function registerLayoutModule(){
  let metricsRegistered = false;

  function applyHeaderHeight() {
    const header = document.querySelector('.app-header');
    if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    document.documentElement.style.setProperty('--tabs-h', '0px');
    const subBar = document.querySelector('.sub-bar');
    if (subBar) document.documentElement.style.setProperty('--subbar-h', subBar.offsetHeight + 'px');
  }

  function registerLayoutMetrics() {
    if (metricsRegistered) return;
    metricsRegistered = true;
    window.addEventListener('resize', applyHeaderHeight);
    window.addEventListener('DOMContentLoaded', applyHeaderHeight);
    if (document.readyState !== 'loading') applyHeaderHeight();
    setTimeout(applyHeaderHeight, 150);
  }

  registerLayoutMetrics();

  window.ui = window.ui || {};
  window.ui.layout = Object.freeze({
    applyHeaderHeight,
    registerLayoutMetrics
  });
})();
