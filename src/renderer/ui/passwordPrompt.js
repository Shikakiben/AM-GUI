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
    modal.className = 'password-modal';
    modal.innerHTML = `
      <div class="modal-bg"></div>
      <div class="modal-center">
        <div class="modal-content">
          <h2 class="modal-title">${t('password.title')}</h2>
          <div class="modal-desc">${t('password.desc')}</div>
          <input type="password" id="passwordPromptInput" class="password-input" placeholder="${t('password.placeholder')}" autocomplete="current-password" />
          <div id="passwordPromptError" class="password-error"></div>
          <div class="modal-actions">
            <button id="passwordPromptCancel" class="btn btn-soft-neutral" style="min-width:90px;">${t('password.cancel')}</button>
            <button id="passwordPromptOk" class="btn btn-soft-blue" style="min-width:90px;">${t('password.ok')}</button>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'none';
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
