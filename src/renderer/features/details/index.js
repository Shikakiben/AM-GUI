(function registerDetailsFeature(){
  const namespace = window.features = window.features || {};

  function fallbackPromise(value) {
    return Promise.resolve(value);
  }

  function init(options = {}) {
    const state = options.state;
    if (!state) {
      console.warn('details.init requires a state object');
      return Object.freeze({ showDetails: () => {}, exitDetailsView: () => {} });
    }

    const baseInstallSession = options.activeInstallSession || {};
    const getActiveInstallSession = typeof options.getActiveInstallSession === 'function'
      ? options.getActiveInstallSession
      : () => baseInstallSession;
    const getIconUrl = typeof options.getIconUrl === 'function' ? options.getIconUrl : (name) => `appicon://${name}.png`;
    const showToast = typeof options.showToast === 'function' ? options.showToast : () => {};
    const t = typeof options.translate === 'function' ? options.translate : (key) => key;
    const enqueueInstall = typeof options.enqueueInstall === 'function' ? options.enqueueInstall : () => {};
    const removeFromQueue = typeof options.removeFromQueue === 'function' ? options.removeFromQueue : () => {};
    const applyDetailsSandboxBadge = typeof options.applyDetailsSandboxBadge === 'function' ? options.applyDetailsSandboxBadge : null;
    const refreshAllInstallButtons = typeof options.refreshAllInstallButtons === 'function' ? options.refreshAllInstallButtons : () => {};
    const setAppList = typeof options.setAppList === 'function' ? options.setAppList : () => {};
    const loadApps = typeof options.loadApps === 'function' ? options.loadApps : async () => {};
    const openActionConfirm = typeof options.openActionConfirm === 'function' ? options.openActionConfirm : fallbackPromise;
    const rerenderActiveCategory = typeof options.rerenderActiveCategory === 'function' ? options.rerenderActiveCategory : null;

    const scrollShell = options.scrollShell || null;
    const appsContainer = options.appsContainer || null;

    const elements = options.elements || {};
    const appDetailsSection = elements.appDetailsSection || document.getElementById('appDetails');
    const backToListBtn = elements.backToListBtn || document.getElementById('backToListBtn');
    const detailsIcon = elements.detailsIcon || document.getElementById('detailsIcon');
    const detailsName = elements.detailsName || document.getElementById('detailsName');
    const detailsLong = elements.detailsLong || document.getElementById('detailsLong');
    const detailsInstallBtn = elements.detailsInstallBtn || document.getElementById('detailsInstallBtn');
    const detailsUninstallBtn = elements.detailsUninstallBtn || document.getElementById('detailsUninstallBtn');
    const installStream = elements.installStream || document.getElementById('installStream');
    const installStreamElapsed = elements.installStreamElapsed || document.getElementById('installStreamElapsed');
    const installProgressBar = elements.installProgressBar || document.getElementById('installStreamProgressBar');
    const installProgressPercentLabel = elements.installProgressPercentLabel || document.getElementById('installStreamProgressPercent');
    const installProgressEtaLabel = elements.installProgressEtaLabel || document.getElementById('installStreamEta');

    const descriptionCache = new Map();

    function currentSession() {
      const session = getActiveInstallSession();
      return session && typeof session === 'object' ? session : {};
    }

    function isInstallRunningFor(session, appName) {
      return !!(session.id && !session.done && session.name === appName);
    }

    function initMarkdownLightbox() {
      const mdLightbox = document.getElementById('mdLightbox');
      const mdLightboxImg = document.getElementById('mdLightboxImg');
      if (!mdLightbox || !mdLightboxImg || !detailsLong) return;
      detailsLong.addEventListener('click', (event) => {
        const target = event.target;
        if (target && target.tagName === 'IMG') {
          mdLightboxImg.src = target.src;
          mdLightbox.style.display = 'flex';
        }
      });
      mdLightbox.addEventListener('click', () => {
        mdLightbox.style.display = 'none';
        mdLightboxImg.src = '';
      });
    }

    function applyDescription(appName, record) {
      if (!detailsName) return;
      const reference = detailsName.dataset.app || detailsName.textContent.toLowerCase().replace(/\s+✓$/, '');
      if (reference !== appName.toLowerCase()) return;
      if (detailsLong) detailsLong.innerHTML = record.long;
    }

    async function loadRemoteDescription(appName) {
      const cached = descriptionCache.get(appName);
      if (cached && (Date.now() - cached.timestamp) < 24 * 3600 * 1000) {
        applyDescription(appName, cached);
        return;
      }
      const url = `https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/apps/${encodeURIComponent(appName)}.md`;
      let markdown;
      try {
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        markdown = await response.text();
      } catch (error) {
        throw new Error('Échec fetch: ' + (error.message || error));
      }
      let shortDesc = '';
      let longDesc = '';
      try {
        if (!window.marked) throw new Error('marked non chargé');
        let md = markdown;
        const lines = md.split(/\r?\n/);
        const tableIdx = lines.findIndex((line) => /^\s*\|/.test(line));
        if (tableIdx !== -1) md = lines.slice(0, tableIdx).join('\n');
        longDesc = window.marked.parse(md);
        const descLines = md.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
        shortDesc = descLines[0] || 'Description non fournie.';
      } catch (_) {
        shortDesc = 'Description indisponible.';
        longDesc = 'Impossible de parser le markdown.';
      }
      const record = { short: shortDesc, long: longDesc, timestamp: Date.now() };
      descriptionCache.set(appName, record);
      applyDescription(appName, record);
    }

    function showDetails(appName) {
      const app = (state.allApps || []).find((entry) => entry && entry.name === appName);
      if (!app) return;

      const session = currentSession();

      if (scrollShell) state.lastScrollY = scrollShell.scrollTop || 0;
      state.currentDetailsApp = app.name;

      const label = app.name.charAt(0).toUpperCase() + app.name.slice(1);
      const version = app.version ? String(app.version) : null;

      if (detailsIcon) {
        detailsIcon.src = getIconUrl(app.name);
        detailsIcon.onerror = () => {
          detailsIcon.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png';
        };
      }

      if (detailsName) {
        const isActuallyInstalled = app.installed && !isInstallRunningFor(session, app.name);
        detailsName.innerHTML = isActuallyInstalled
          ? `${label}${version ? ' · ' + version : ''}`
          : (version ? `${label} · ${version}` : label);
        detailsName.dataset.app = app.name.toLowerCase();
      }

      if (detailsLong) detailsLong.textContent = t('details.loadingDesc', { name: app.name });

      try {
        applyDetailsSandboxBadge?.(app.name);
      } catch (_) {}

      if (detailsInstallBtn) {
        detailsInstallBtn.hidden = !!app.installed;
        detailsInstallBtn.setAttribute('data-name', app.name);
        detailsInstallBtn.classList.remove('loading');
        detailsInstallBtn.disabled = false;
        if (isInstallRunningFor(session, app.name)) {
          detailsInstallBtn.textContent = t('install.status') + ' ✕';
          detailsInstallBtn.setAttribute('data-action', 'cancel-install');
          detailsInstallBtn.setAttribute('aria-label', t('install.cancel') || `Annuler installation en cours (${app.name})`);
        } else {
          detailsInstallBtn.textContent = t('details.install');
          detailsInstallBtn.setAttribute('data-action', 'install');
          detailsInstallBtn.setAttribute('aria-label', t('details.install'));
        }
        refreshAllInstallButtons();
      }

      if (installStream) {
        if (isInstallRunningFor(session, app.name)) {
          installStream.hidden = false;
          if (installStreamElapsed && session.start) {
            const seconds = Math.round((performance.now() - session.start) / 1000);
            installStreamElapsed.textContent = seconds + 's';
          }
          if (detailsInstallBtn) {
            detailsInstallBtn.disabled = false;
            detailsInstallBtn.classList.remove('loading');
          }
        } else {
          installStream.hidden = true;
          if (installStreamElapsed) installStreamElapsed.textContent = '0s';
          if (installProgressBar) installProgressBar.value = 0;
          if (installProgressPercentLabel) installProgressPercentLabel.textContent = '';
          if (installProgressEtaLabel) installProgressEtaLabel.textContent = '';
        }
      }

      if (detailsUninstallBtn) {
        detailsUninstallBtn.hidden = !app.installed;
        detailsUninstallBtn.disabled = false;
        detailsUninstallBtn.setAttribute('data-name', app.name);
      }

      if (appDetailsSection) appDetailsSection.hidden = false;
      const tabsRowSecondary = document.querySelector('.tabs-row-secondary');
      if (tabsRowSecondary) tabsRowSecondary.style.visibility = 'hidden';
      document.body.classList.add('details-mode');
      if (appsContainer) appsContainer.hidden = true;

      loadRemoteDescription(app.name).catch((error) => {
        if (detailsLong) detailsLong.textContent = t('details.errorDesc', { error: error?.message || error || t('error.unknown') });
      });
    }

    function exitDetailsView() {
      if (appDetailsSection) appDetailsSection.hidden = true;
      document.body.classList.remove('details-mode');
      if (appsContainer) appsContainer.hidden = false;
      const tabsRowSecondary = document.querySelector('.tabs-row-secondary');
      if (tabsRowSecondary) tabsRowSecondary.style.visibility = 'visible';

      if (rerenderActiveCategory) {
        rerenderActiveCategory();
      } else if (state.activeCategory === 'installed') {
        const filtered = (state.allApps || []).filter((app) => app && app.installed && app.hasDiamond === true);
        state.filtered = filtered;
        setAppList(filtered);
        refreshAllInstallButtons();
      } else if (typeof setAppList === 'function') {
        setAppList(state.filtered || state.allApps || []);
        refreshAllInstallButtons();
      }

      document.querySelectorAll('.app-tile.busy').forEach((tile) => tile.classList.remove('busy'));
      if (scrollShell) scrollShell.scrollTop = state.lastScrollY || 0;
      if (state.currentDetailsApp) sessionStorage.setItem('lastDetailsApp', state.currentDetailsApp);
    }

    function attachEventListeners() {
      backToListBtn?.addEventListener('click', exitDetailsView);

      detailsInstallBtn?.addEventListener('click', async () => {
        const name = detailsInstallBtn.getAttribute('data-name');
        if (!name) return;
        const action = detailsInstallBtn.getAttribute('data-action') || 'install';
        const session = currentSession();

        if (action === 'cancel-install') {
          const canInvokeCancel = session.id || session.name === name;
          if (canInvokeCancel) {
            if (session.id) {
              try {
                await window.electronAPI.installCancel(session.id);
              } catch (_) {}
            }
            showToast(t('toast.cancelRequested'));
            try {
              await window.electronAPI.amAction('uninstall', name);
              await loadApps();
              showDetails(name);
            } catch (_) {}
            return;
          }
          const cancelErrorMessage = t('toast.cancelError');
          const fallbackError = t('error.unknown');
          showToast(
            cancelErrorMessage && cancelErrorMessage !== 'toast.cancelError'
              ? cancelErrorMessage
              : (fallbackError && fallbackError !== 'error.unknown' ? fallbackError : 'Annulation impossible.')
          );
          return;
        }

        if (action === 'remove-queue') {
          removeFromQueue(name);
          return;
        }

        const confirmed = await openActionConfirm({
          title: t('confirm.installTitle'),
          message: t('confirm.installMsg', { name: `<strong>${name}</strong>` }),
          okLabel: t('details.install')
        });
        if (!confirmed) return;

        const refreshedSession = currentSession();
        if (refreshedSession.id && !refreshedSession.done) {
          enqueueInstall(name);
          detailsInstallBtn.classList.remove('loading');
          refreshAllInstallButtons();
          return;
        }

        detailsInstallBtn.classList.remove('loading');
        detailsInstallBtn.disabled = false;
        detailsInstallBtn.setAttribute('aria-label', t('install.cancel') || `Annuler installation en cours (${name})`);
        enqueueInstall(name);
      });

      detailsUninstallBtn?.addEventListener('click', async () => {
        const name = detailsUninstallBtn.getAttribute('data-name');
        if (!name) return;
        const confirmed = await openActionConfirm({
          title: t('confirm.uninstallTitle'),
          message: t('confirm.uninstallMsg', { name: `<strong>${name}</strong>` }),
          okLabel: t('details.uninstall'),
          intent: 'danger'
        });
        if (!confirmed) return;
        detailsUninstallBtn.classList.add('loading');
        detailsUninstallBtn.disabled = true;
        showToast(t('toast.uninstalling', { name }));
        try {
          await window.electronAPI.amAction('uninstall', name);
        } finally {
          await loadApps();
          showDetails(name);
          detailsUninstallBtn.classList.remove('loading');
        }
      });
    }

    initMarkdownLightbox();
    attachEventListeners();

    return Object.freeze({
      showDetails,
      exitDetailsView
    });
  }

  namespace.details = Object.freeze({ init });
})();
