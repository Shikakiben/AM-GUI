(function initToastModule(globalScope) {
  const scope = globalScope || (window.ui = window.ui || {});

  function initToast({ element, duration = 2300 } = {}) {
    const toastEl = element || document.getElementById('toast');
    if (!toastEl) {
      return {
        showToast: () => {},
        hideToast: () => {}
      };
    }
    let hideTimer = null;

    function hideToast() {
      toastEl.hidden = true;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function showToast(message) {
      toastEl.textContent = message;
      toastEl.hidden = false;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        toastEl.hidden = true;
        hideTimer = null;
      }, duration);
    }

    return { showToast, hideToast };
  }

  scope.toast = { init: initToast };
})(window.ui = window.ui || {});
