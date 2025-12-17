(function initSettingsPanelModule(globalScope) {
  const scope = globalScope || (window.ui = window.ui || {});

  function initSettingsPanel(options = {}) {
    const settingsBtn = options.settingsBtn || document.getElementById('settingsBtn');
    const settingsPanel = options.settingsPanel || document.getElementById('settingsPanel');
    const disableGpuCheckbox = options.disableGpuCheckbox || document.getElementById('disableGpuCheckbox');
    const openExternalCheckbox = options.openExternalCheckbox || document.getElementById('openExternalLinksCheckbox');
    const purgeIconsBtn = options.purgeIconsBtn || document.getElementById('purgeIconsBtn');
    const purgeIconsResult = options.purgeIconsResult || document.getElementById('purgeIconsResult');
    const electronAPI = options.electronAPI || window.electronAPI;
    const showToast = options.showToast || (() => {});
    const t = options.t || ((key) => key);
    const getThemePref = options.getThemePref || (() => 'system');
    const applyThemePreference = options.applyThemePreference || (() => {});
    const loadOpenExternalPref = options.loadOpenExternalPref || (() => false);
    const saveOpenExternalPref = options.saveOpenExternalPref || (() => {});
    const onOpen = options.onOpen || (() => {});
    const onClose = options.onClose || (() => {});
    const onIconCachePurged = options.onIconCachePurged || (() => {});

    function syncThemeRadios() {
      if (!settingsPanel) return;
      const themePref = getThemePref();
      settingsPanel.querySelectorAll('input[name="themePref"]').forEach(r => {
        try { r.checked = (r.value === themePref); } catch (_) {}
      });
    }

    async function handleGpuPrefChange(checked) {
      if (!electronAPI?.setGpuPref) return;
      await electronAPI.setGpuPref(!!checked);
      showToast(checked ? t('toast.gpuDisabled') : t('toast.gpuEnabled'));
      setTimeout(() => {
        if (confirm(t('confirm.gpuRestart'))) {
          window.location.reload();
        }
      }, 1200);
    }

    function openPanel() {
      if (!settingsPanel) return;
      onOpen();
      syncThemeRadios();
      settingsPanel.hidden = false;
      settingsPanel.setAttribute('aria-expanded', 'true');
      settingsBtn?.setAttribute('aria-expanded','true');
      setTimeout(() => settingsPanel.focus(), 20);
    }

    function closePanel() {
      if (!settingsPanel) return;
      settingsPanel.hidden = true;
      settingsPanel.setAttribute('aria-expanded', 'false');
      settingsBtn?.setAttribute('aria-expanded','false');
      settingsBtn?.focus();
      onClose();
    }

    function togglePanel(force) {
      if (!settingsPanel) return;
      const shouldOpen = typeof force === 'boolean' ? force : settingsPanel.hidden;
      if (shouldOpen) openPanel(); else closePanel();
    }

    if (disableGpuCheckbox && electronAPI?.getGpuPref) {
      electronAPI.getGpuPref().then(val => {
        disableGpuCheckbox.checked = !!val;
      });
      disableGpuCheckbox.addEventListener('change', () => {
        handleGpuPrefChange(disableGpuCheckbox.checked);
      });
    }

    if (openExternalCheckbox) {
      openExternalCheckbox.checked = loadOpenExternalPref();
      openExternalCheckbox.addEventListener('change', () => {
        saveOpenExternalPref(openExternalCheckbox.checked);
      });
    }

    if (settingsBtn && settingsPanel) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
      });
      document.addEventListener('click', (ev) => {
        if (settingsPanel.hidden) return;
        if (ev.target === settingsPanel || settingsPanel.contains(ev.target) || ev.target === settingsBtn) return;
        togglePanel(false);
      });
      settingsPanel.addEventListener('change', (ev) => {
        const target = ev.target;
        if (target.name === 'themePref') {
          localStorage.setItem('themePref', target.value);
          applyThemePreference();
          togglePanel(false);
        }
      });
    }

    if (purgeIconsBtn) {
      purgeIconsBtn.addEventListener('click', async () => {
        purgeIconsBtn.disabled = true;
        const oldLabel = purgeIconsBtn.textContent;
        purgeIconsBtn.textContent = t('settings.purging');
        try {
          const res = await electronAPI?.purgeIconsCache();
          if (purgeIconsResult) {
            purgeIconsResult.textContent = (res && typeof res.removed === 'number')
              ? t('settings.removedFiles', { count: res.removed })
              : t('settings.done');
          }
          onIconCachePurged();
        } catch (e) {
          if (purgeIconsResult) purgeIconsResult.textContent = t('settings.purgeError');
        } finally {
          purgeIconsBtn.textContent = oldLabel;
          purgeIconsBtn.disabled = false;
        }
      });
    }

    return {
      open: openPanel,
      close: closePanel,
      toggle: togglePanel,
      isOpen: () => settingsPanel && !settingsPanel.hidden
    };
  }

  scope.settingsPanel = { init: initSettingsPanel };
})(window.ui = window.ui || {});
