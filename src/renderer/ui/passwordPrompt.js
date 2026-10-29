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

  // The prompt currently on screen, so the main process can close it when it
  // stops waiting. `kind` keeps that from closing the wrong dialog: a sudo
  // prompt and a proxy prompt must not dismiss each other.
  let activePrompt = null;
  // The modal is a single element in the DOM, so two prompts cannot share it.
  // Measured: when a proxy challenge arrived while a sudo prompt was waiting,
  // the second dialog replaced the first and the sudo promise never settled —
  // the install then hung until its ten-minute kill timer. Prompts are therefore
  // serialised: the next one is shown once the current one is answered.
  let promptQueue = Promise.resolve();
  // Prompts waiting their turn, so a timeout can cancel the right one: a proxy
  // prompt queued behind an unanswered sudo prompt must not appear later, long
  // after the app stopped waiting for it.
  const waiting = [];

  function dismissPasswordPrompt(kind) {
    if (activePrompt && (!kind || activePrompt.kind === kind)) {
      const dismiss = activePrompt.dismiss;
      activePrompt = null;
      dismiss();
      return true;
    }
    if (!kind) return false;
    // Not on screen yet: cancel the queued one instead of letting it pop up
    // after the app gave up.
    const index = waiting.findIndex((entry) => entry.kind === kind);
    if (index < 0) return false;
    const [entry] = waiting.splice(index, 1);
    entry.cancelled = true;
    entry.cancel();
    return true;
  }

  // Show the modal and return a promise resolved with the password or null if
  // cancelled. With options.withUsername, resolves { username, password }.
  function promptPassword(options) {
    const labels = options || {};
    let cancelWaiting = null;
    const gate = new Promise((resolve) => { cancelWaiting = resolve; });
    const entry = { kind: labels.kind || null, cancelled: false, cancel: cancelWaiting };
    waiting.push(entry);
    const start = () => {
      const index = waiting.indexOf(entry);
      if (index >= 0) waiting.splice(index, 1);
      // Cancelled while waiting: never show it, or the dialog would pop up long
      // after the app stopped waiting for the answer.
      if (entry.cancelled) return null;
      return showPrompt(options);
    };
    const shown = promptQueue.then(start, start);
    // The queue must keep moving even if one prompt fails.
    promptQueue = shown.then(() => {}, () => {});
    // A cancellation while waiting resolves the caller without ever showing it.
    return Promise.race([shown, gate.then(() => null)]);
  }

  function showPrompt(options) {
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
        if (activePrompt && activePrompt.dismiss === dismiss) activePrompt = null;
      }
      function dismiss() {
        cleanup();
        resolve(null);
      }
      activePrompt = { kind: labels.kind || null, dismiss };
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
  window.ui.passwordPrompt = { promptPassword, dismiss: dismissPasswordPrompt };
})();
