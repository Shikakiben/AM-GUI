(function registerAppInit(){
  let fallbackInstalled = false;
  let errorHandlersInstalled = false;

  function installAppiconFallback() {
    if (fallbackInstalled) return;
    fallbackInstalled = true;
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
        setTimeout(() => {
          try { el.src = remote; } catch (_) {}
        }, 10);
      } catch (_) {}
    }, true);
  }

  function initGlobalErrorHandlers() {
    if (errorHandlersInstalled) return;
    errorHandlersInstalled = true;
    window.addEventListener('error', (ev) => {
      const toast = document.getElementById('toast');
      const location = ev.filename ? ` at ${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}` : '';
      if (toast) {
        toast.hidden = false;
        toast.textContent = 'Erreur: ' + ev.message + (location ? (' ' + location) : '');
        setTimeout(() => { toast.hidden = true; }, 8000);
      }
      console.error('Erreur globale', ev.error || ev.message, location, ev.error && ev.error.stack ? ev.error.stack : '');
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
  }

  function bootstrap() {
    installAppiconFallback();
    initGlobalErrorHandlers();
    const layout = window.ui && window.ui.layout;
    if (layout && typeof layout.applyHeaderHeight === 'function') {
      layout.applyHeaderHeight();
    }
  }

  bootstrap();

  window.app = window.app || {};
  window.app.init = Object.freeze({
    installAppiconFallback,
    initGlobalErrorHandlers,
    bootstrap
  });
})();
