// js/ui/passwordPrompt.js
(function(){
  // Create a password input modal if it doesn't already exist
  function t(key) {
    if (window && window.translations) {
      const lang = (window.getLangPref && window.getLangPref()) || (navigator.language || 'en').split('-')[0];
      return (window.translations[lang] && window.translations[lang][key]) || window.translations['en'][key] || key;
    }
    return key;
  }
  function ensurePasswordModal(options) {
    // Always remove the old modal to force regeneration with the current language
    let old = document.getElementById('passwordPromptModal');
    if (old) old.remove();
    const labels = options || {};
    const title = labels.title || t('password.title');
    const desc = labels.desc || t('password.desc');
    const withUser = labels.withUsername === true;
    const withRemember = labels.withRemember === true;
    let modal = document.createElement('div');
    modal.id = 'passwordPromptModal';
    modal.className = 'password-modal';
    modal.innerHTML = `
      <div class="modal-bg"></div>
      <div class="modal-center">
        <div class="modal-content">
          <h2 class="modal-title">${title}</h2>
          <div class="modal-desc">${desc}</div>
          ${withUser ? `<input type="text" id="passwordPromptUser" class="password-input" placeholder="${t('password.username')}" autocomplete="username" />` : ''}
          <input type="password" id="passwordPromptInput" class="password-input" placeholder="${t('password.placeholder')}" autocomplete="current-password" />
          ${withRemember ? `<label class="password-remember${labels.encrypted === false ? ' password-remember-warning' : ''}"><input type="checkbox" id="passwordPromptRemember"> <span>${labels.encrypted === false ? t('proxyAuth.rememberUnsafe') : t('proxyAuth.remember')}</span></label>` : ''}
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

  // Show the modal and return a promise resolved with the password or null if
  // cancelled. With options.withUsername, resolves { username, password }.
  function promptPassword(options) {
    return new Promise((resolve) => {
      const labels = options || {};
      const modal = ensurePasswordModal(labels);
      const input = modal.querySelector('#passwordPromptInput');
      const userInput = modal.querySelector('#passwordPromptUser');
      const rememberInput = modal.querySelector('#passwordPromptRemember');
      const okBtn = modal.querySelector('#passwordPromptOk');
      const cancelBtn = modal.querySelector('#passwordPromptCancel');
      const errorDiv = modal.querySelector('#passwordPromptError');
      modal.style.display = '';
      input.value = '';
      if (userInput) {
        userInput.value = labels.username || '';
        (labels.username ? input : userInput).focus();
      } else {
        input.focus();
      }
      errorDiv.style.display = 'none';
      function cleanup() {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        if (userInput) userInput.removeEventListener('keydown', onKey);
      }
      function onOk() {
        const username = userInput ? userInput.value.trim() : '';
        if (userInput && !username) {
          errorDiv.textContent = t('password.errorUser');
          errorDiv.style.display = '';
          userInput.focus();
          return;
        }
        if (!input.value) {
          errorDiv.textContent = t('password.error');
          errorDiv.style.display = '';
          input.focus();
          return;
        }
        cleanup();
        if (userInput) {
          resolve({ username, password: input.value, remember: !!(rememberInput && rememberInput.checked) });
        } else {
          resolve(input.value);
        }
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
      if (userInput) userInput.addEventListener('keydown', onKey);
    });
  }

  window.ui = window.ui || {};
  window.ui.passwordPrompt = { promptPassword };
})();
