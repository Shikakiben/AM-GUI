// js/ui/passwordPrompt.js
(function(){
  // Crée une modale de saisie du mot de passe si elle n'existe pas déjà
  function t(key) {
    if (window && window.translations) {
      const lang = (window.getLangPref && window.getLangPref()) || (navigator.language || 'en').split('-')[0];
      return (window.translations[lang] && window.translations[lang][key]) || window.translations['en'][key] || key;
    }
    return key;
  }
  function ensurePasswordModal() {
    // Toujours supprimer l'ancienne modale pour forcer la régénération avec la langue courante
    let old = document.getElementById('passwordPromptModal');
    if (old) old.remove();
    let modal = document.createElement('div');
    modal.id = 'passwordPromptModal';
    modal.innerHTML = `
      <div class="modal-bg" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);"></div>
      <div class="modal-center" style="position:fixed;top:0;left:0;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;">
        <div class="modal-content" style="background:#fff;max-width:340px;width:100%;padding:2em 1.5em 1.5em 1.5em;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);position:relative;z-index:3;pointer-events:auto;">
          <h2 style="margin-top:0;font-size:1.25em;font-weight:600;">${t('password.title')}</h2>
          <div style="margin-bottom:1em;">${t('password.desc')}</div>
          <input type="password" id="passwordPromptInput" placeholder="${t('password.placeholder')}" autocomplete="current-password" style="width:100%;padding:0.5em;margin-bottom:1em;font-size:1em;border-radius:6px;border:1px solid #bbb;" />
          <div id="passwordPromptError" style="color:#c00;display:none;margin-bottom:1em;"></div>
          <div style="display:flex;gap:0.5em;justify-content:flex-end;">
            <button id="passwordPromptCancel" class="btn btn-soft-neutral" style="min-width:90px;">${t('password.cancel')}</button>
            <button id="passwordPromptOk" class="btn btn-soft-blue" style="min-width:90px;">${t('password.ok')}</button>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.zIndex = '9999';
    modal.style.pointerEvents = 'auto';
    modal.style.background = 'transparent';
    document.body.appendChild(modal);
    return modal;
  }

  // Affiche la modale et retourne une promesse résolue avec le mot de passe ou null si annulé
  function promptPassword() {
    return new Promise((resolve) => {
      const modal = ensurePasswordModal();
      const input = modal.querySelector('#passwordPromptInput');
      const okBtn = modal.querySelector('#passwordPromptOk');
      const cancelBtn = modal.querySelector('#passwordPromptCancel');
      const errorDiv = modal.querySelector('#passwordPromptError');
      modal.style.display = '';
      input.value = '';
      errorDiv.style.display = 'none';
      input.focus();
      function cleanup() {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
      }
      function onOk() {
        if (!input.value) {
          errorDiv.textContent = t('password.error');
          errorDiv.style.display = '';
          input.focus();
          return;
        }
        cleanup();
        resolve(input.value);
      }
      function onCancel() {
        cleanup();
        resolve(null);
      }
      function onKey(e) {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  window.ui = window.ui || {};
  window.ui.passwordPrompt = { promptPassword };
})();
