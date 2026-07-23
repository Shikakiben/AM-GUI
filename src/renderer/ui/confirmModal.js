(function registerConfirmModal() {
  const ns = window.ui = window.ui || {};

  let modal, messageEl, cancelBtn, okBtn, resolvePending, t;

  function closeActionConfirm(result) {
    if (!modal) return;
    modal.hidden = true;
    if (resolvePending) { resolvePending(result); resolvePending = null; }
  }

  function openActionConfirm({ title, message, okLabel, intent }) {
    if (!modal) return Promise.resolve(false);
    messageEl.innerHTML = message || '';
    okBtn.textContent = okLabel || t('confirm.ok');
    okBtn.className = 'btn';
    if (intent === 'danger') {
      okBtn.classList.add('btn-soft-red');
    } else {
      okBtn.classList.add('btn-soft-blue');
    }
    if (cancelBtn) cancelBtn.className = 'btn-soft-neutral';
    modal.hidden = false;
    setTimeout(function () { okBtn.focus(); }, 30);
    return new Promise(function (res) { resolvePending = res; });
  }

  function handleKeyboard(e) {
    if (!modal || modal.hidden) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeActionConfirm(false);
    }
    if (e.key === 'Enter') {
      var active = document.activeElement;
      if (active !== cancelBtn) {
        e.preventDefault();
        closeActionConfirm(true);
      }
    }
  }

  function init(opts) {
    opts = opts || {};
    t = opts.t || (function (k) { return k; });
    modal = document.getElementById(opts.modalId || 'actionConfirmModal');
    messageEl = document.getElementById(opts.messageId || 'actionConfirmMessage');
    cancelBtn = document.getElementById(opts.cancelId || 'actionConfirmCancel');
    okBtn = document.getElementById(opts.okId || 'actionConfirmOk');

    cancelBtn && cancelBtn.addEventListener('click', function () { closeActionConfirm(false); });
    okBtn && okBtn.addEventListener('click', function () { closeActionConfirm(true); });
    window.addEventListener('keydown', handleKeyboard, { capture: true });
  }

  ns.confirmModal = { init: init, openActionConfirm: openActionConfirm };
})();
