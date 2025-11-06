(function installAppiconFallback(){
  document.addEventListener('error', (ev) => {
    try {
      const el = ev.target;
      if (!el || el.tagName !== 'IMG') return;
      const src = String(el.src || '');
      if (!src.startsWith('appicon://')) return;
      if (el.dataset.__appiconFallbackTried) return;
      el.dataset.__appiconFallbackTried = '1';
      const name = src.replace(/^appicon:\/\//i, '').replace(/\?.*$/, '').replace(/#.*/, '');
      const remote = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/' + name;
      console.warn('appicon fallback: replacing', src, 'with', remote);
      setTimeout(() => { try { el.src = remote; } catch (_) {} }, 10);
    } catch (_) {}
  }, true);
})();

(function initHeaderMetrics(){
  const applyHeaderHeight = () => {
    const header = document.querySelector('.app-header');
    if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    document.documentElement.style.setProperty('--tabs-h', '0px');
    const subBar = document.querySelector('.sub-bar');
    if (subBar) document.documentElement.style.setProperty('--subbar-h', subBar.offsetHeight + 'px');
  };
  window.addEventListener('resize', applyHeaderHeight);
  window.addEventListener('DOMContentLoaded', applyHeaderHeight);
  if (document.readyState !== 'loading') applyHeaderHeight();
  setTimeout(applyHeaderHeight, 150);
  window.addEventListener('error', (ev) => {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.hidden = false;
      toast.textContent = 'Erreur: ' + ev.message;
      setTimeout(() => { toast.hidden = true; }, 5000);
    }
    console.error('Erreur globale', ev.error || ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.hidden = false;
      toast.textContent = 'Promesse rejetée: ' + (ev.reason?.message || ev.reason);
      setTimeout(() => { toast.hidden = true; }, 6000);
    }
    console.error('Rejet non géré', ev.reason);
  });
})();
