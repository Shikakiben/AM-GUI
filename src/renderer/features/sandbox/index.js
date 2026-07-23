(function registerSandbox() {
  const namespace = window.features = window.features || {};

  const SANDBOX_DIR_VALUES = ['desktop', 'documents', 'downloads', 'games', 'music', 'pictures', 'videos'];
const SANDBOX_DIR_LABEL_KEYS = {
  desktop: 'sandbox.dir.desktop',
  documents: 'sandbox.dir.documents',
  downloads: 'sandbox.dir.downloads',
  games: 'sandbox.dir.games',
  music: 'sandbox.dir.music',
  pictures: 'sandbox.dir.pictures',
  videos: 'sandbox.dir.videos',
};
const SANDBOX_PREFS_KEY = 'sandboxSharePrefs';

let _ = null;

let sandboxSharePrefs = {};
const sandboxedApps = new Map();
let sandboxSweepToken = 0;
const sandboxState = {
  currentApp: null,
  info: null,
  depsReady: false,
  busy: false,
  pendingAction: null,
  logBuffer: '',
  supported: true,
};

  function init(opts) {
  _ = opts;
  const { dom, state } = _;

  // ==========================================================
  // Internal functions
  // ==========================================================

  function loadSandboxSharePrefs() {
    try {
      const raw = localStorage.getItem(SANDBOX_PREFS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function persistSandboxSharePrefs() {
    try {
      localStorage.setItem(SANDBOX_PREFS_KEY, JSON.stringify(sandboxSharePrefs));
    } catch (e) {}
  }

  function resetSandboxLog() {
    if (!dom.sandboxLog) return;
    sandboxState.logBuffer = '';
    dom.sandboxLog.textContent = _.t('sandbox.logEmpty') || '\u2026';
  }

  function appendSandboxLog(chunk) {
    if (!dom.sandboxLog || typeof chunk !== 'string') return;
    sandboxState.logBuffer += chunk;
    const sanitized = _.stripAnsiSequences(sandboxState.logBuffer || '');
    const text = sanitized.trim() || _.t('sandbox.logEmpty') || '\u2026';
    dom.sandboxLog.textContent = text;
    dom.sandboxLog.scrollTop = dom.sandboxLog.scrollHeight;
  }

  function isSandboxLogExpanded() {
    return !!(dom.sandboxLog && !dom.sandboxLog.hidden);
  }

  function setSandboxLogExpanded(expanded) {
    if (!dom.sandboxLog || !dom.sandboxLogToggle) return;
    const next = !!expanded;
    dom.sandboxLog.hidden = !next;
    dom.sandboxLogToggle.setAttribute('aria-expanded', String(next));
    if (dom.sandboxLogSection) {
      dom.sandboxLogSection.dataset.open = next ? 'true' : 'false';
    }
  }

  function inferAppImageFromInfo(appName, info) {
    if (!info) return null;
    if (info.sandboxForbiddenReason) return false;
    if (typeof info.isAppImage === 'boolean') return info.isAppImage;
    const target = typeof info.appName === 'string' ? info.appName.toLowerCase() : '';
    if (target && appName && target !== appName.toLowerCase()) return null;
    const execPath = typeof info.execPath === 'string' ? info.execPath.toLowerCase() : '';
    if (!execPath) return null;
    return execPath.endsWith('.appimage');
  }

  function isAppInstalledInList(appName) {
    if (!appName) return false;
    const lower = appName.toLowerCase();
    if (state?.installed instanceof Set && state.installed.has(lower)) return true;
    if (!Array.isArray(state?.allApps)) return false;
    const entry = state.allApps.find(function (app) { return app && typeof app.name === 'string' && app.name.toLowerCase() === lower; });
    return !!entry?.installed;
  }

  function isSandboxSupported(appName, info) {
    if (!appName) return false;
    if (info === undefined) info = sandboxState.info;
    if (info?.sandboxForbiddenReason) return false;
    if (!info || Object.keys(info).length === 0) return true;
    const inferred = inferAppImageFromInfo(appName, info);
    const installedViaAppman = isAppInstalledInList(appName);
    if (!installedViaAppman) return true;
    if (inferred !== null) return inferred;
    return false;
  }

  function openSandboxModal() {
    if (!dom.sandboxModal || !sandboxState.currentApp) return;
    dom.sandboxModal.hidden = false;
  }

  function closeSandboxModal() {
    if (!dom.sandboxModal || dom.sandboxModal.hidden) return;
    dom.sandboxModal.hidden = true;
  }

  function showNonAppimageModal(appName, reason) {
    if (!dom.nonAppimageModal) return;
    if (dom.nonAppimageTitle) {
      const titleKey = reason ? 'sandbox.forbidden.title' : 'sandbox.unsupported.title';
      dom.nonAppimageTitle.textContent = _.t(titleKey);
    }
    if (dom.nonAppimageMessage) {
      const descKey = reason ? 'sandbox.forbidden.desc' : 'sandbox.unsupported.desc';
      dom.nonAppimageMessage.textContent = _.t(descKey, { name: appName || '\u2014' });
    }
    dom.nonAppimageModal.hidden = false;
    setTimeout(function () {
      try { dom.nonAppimageDismissBtn?.focus(); }
      catch (e) {}
    }, 30);
  }

  function closeNonAppimageModal() {
    if (!dom.nonAppimageModal || dom.nonAppimageModal.hidden) return;
    dom.nonAppimageModal.hidden = true;
  }

  function setSandboxBusy(flag) {
    sandboxState.busy = !!flag;
    renderSandboxCard();
  }

  function updateSandboxActionStyles(isSandboxed) {
    if (!dom.sandboxConfigureBtn || !dom.sandboxDisableBtn) return;
    if (isSandboxed) {
      dom.sandboxConfigureBtn.classList.remove('btn-primary');
      dom.sandboxConfigureBtn.classList.add('btn-outline');
      dom.sandboxDisableBtn.classList.add('btn-primary');
      dom.sandboxDisableBtn.classList.remove('btn-outline');
    } else {
      dom.sandboxConfigureBtn.classList.add('btn-primary');
      dom.sandboxConfigureBtn.classList.remove('btn-outline');
      dom.sandboxDisableBtn.classList.remove('btn-primary');
      dom.sandboxDisableBtn.classList.add('btn-outline');
    }
  }

  function renderSandboxCard() {
    if (!dom.sandboxCard) return;
    if (!sandboxState.currentApp) {
      dom.sandboxCard.hidden = true;
      if (dom.sandboxOpenBtn) dom.sandboxOpenBtn.disabled = true;
      if (dom.sandboxButtonStatus) {
        dom.sandboxButtonStatus.dataset.status = 'unknown';
        dom.sandboxButtonStatus.textContent = '\u2014';
      }
      return;
    }
    dom.sandboxCard.hidden = false;
    if (dom.sandboxOpenBtn) {
      dom.sandboxOpenBtn.disabled = false;
    }
    const info = sandboxState.info || {};
    const installedFromInfo = typeof info.installed === 'boolean' ? info.installed : null;
    const installedFromList = isAppInstalledInList(sandboxState.currentApp);
    const detailsInstallBtnEl = document.getElementById('detailsInstallBtn');
    const installedFromDetailsBtn = detailsInstallBtnEl ? detailsInstallBtnEl.hidden : null;
    const installedFlag = !!(installedFromInfo || installedFromList || installedFromDetailsBtn === true);
    const forbiddenReason = info?.sandboxForbiddenReason || (info?.selfSandboxProhibited ? 'self' : null);
    const sandboxEligible = isSandboxSupported(sandboxState.currentApp, info) && !forbiddenReason;
    sandboxState.supported = sandboxEligible;
    if (dom.sandboxOpenBtn) {
      const titleKey = sandboxEligible ? 'sandbox.title' : (forbiddenReason ? 'sandbox.forbidden.title' : 'sandbox.unsupported.title');
      dom.sandboxOpenBtn.title = _.t(titleKey);
    }
    const statusKey = sandboxState.busy
      ? 'busy'
      : (!sandboxEligible
        ? 'forbidden'
        : (info.sandboxed ? 'active' : (installedFlag ? 'inactive' : 'unknown')));
    const statusLabel = _.t('sandbox.status.' + statusKey) || statusKey;
    if (dom.sandboxStatusBadge) {
      dom.sandboxStatusBadge.dataset.status = statusKey;
      dom.sandboxStatusBadge.textContent = statusLabel;
    }
    if (dom.sandboxButtonStatus) {
      dom.sandboxButtonStatus.dataset.status = statusKey;
      dom.sandboxButtonStatus.textContent = statusLabel;
    }
    if (dom.sandboxUnavailable) dom.sandboxUnavailable.hidden = !!installedFlag;
    if (dom.sandboxInstallAppBtn) {
      dom.sandboxInstallAppBtn.disabled = sandboxState.busy || installedFlag;
      dom.sandboxInstallAppBtn.hidden = installedFlag;
    }
    if (dom.sandboxDepsAlert) dom.sandboxDepsAlert.hidden = sandboxState.depsReady || !sandboxEligible;
    const isSandboxed = !!info.sandboxed;
    if (dom.sandboxInstallDepsBtn) dom.sandboxInstallDepsBtn.disabled = sandboxState.busy || !sandboxEligible;
    if (dom.sandboxConfigureBtn) dom.sandboxConfigureBtn.disabled = sandboxState.busy || !info.installed || !sandboxState.depsReady || isSandboxed || !sandboxEligible;
    if (dom.sandboxDisableBtn) dom.sandboxDisableBtn.disabled = sandboxState.busy || !isSandboxed || !sandboxEligible;
    if (dom.sandboxRefreshBtn) dom.sandboxRefreshBtn.disabled = sandboxState.busy;
    updateSandboxActionStyles(isSandboxed);
    renderSandboxSummary();
  }

  async function refreshSandboxInfo(appName) {
    if (!dom.sandboxCard) return;
    if (appName === undefined) appName = sandboxState.currentApp;
    if (!appName) {
      sandboxState.info = null;
      dom.sandboxCard.hidden = true;
      return;
    }
    sandboxState.currentApp = appName;
    dom.sandboxCard.hidden = false;
    setSandboxBusy(true);
    try {
      const response = await _.electronAPI.getSandboxInfo(appName);
      const info = response?.info || { installed: false, sandboxed: false };
      const depsFromInfo = typeof info?.dependenciesReady === 'boolean' ? info.dependenciesReady : null;
      const depsFromResponse = !!(response?.dependencies && (response.dependencies.hasSas || response.dependencies.hasAisap));
      const depsFlag = depsFromInfo !== null ? depsFromInfo : depsFromResponse;
      const listInstalled = isAppInstalledInList(appName);
      if (!info.installed && listInstalled) info.installed = true;
      info.dependenciesReady = depsFlag;
      sandboxState.info = info;
      sandboxState.depsReady = !!depsFlag;
      setAppSandboxState(appName, !!info.sandboxed);
      renderSandboxCard();
    } catch (error) {
      appendSandboxLog('\n' + (error?.message || 'IPC error') + '\n');
    } finally {
      setSandboxBusy(false);
    }
  }

  function collectSandboxFormValues() {
    const shareDirs = {};
    let hasSelection = false;
    if (dom.sandboxForm) {
      SANDBOX_DIR_VALUES.forEach(function (dir) {
        const input = dom.sandboxForm.querySelector('input[value="' + dir + '"]');
        const checked = !!(input && input.checked);
        shareDirs[dir] = checked;
        if (checked) hasSelection = true;
      });
    }
    const customPath = (dom.sandboxCustomPathInput?.value || '').trim();
    const configureDirs = hasSelection || !!customPath;
    return { shareDirs: shareDirs, customPath: customPath, configureDirs: configureDirs };
  }

  function getSandboxSharePrefs(appName) {
    if (!appName) return null;
    const key = appName.toLowerCase();
    return sandboxSharePrefs[key] || null;
  }

  function rememberSandboxSharePrefs(appName, data) {
    if (!appName || !data) return;
    const key = appName.toLowerCase();
    const nextPrefs = { shareDirs: {}, customPath: data.customPath || '' };
    SANDBOX_DIR_VALUES.forEach(function (dir) {
      nextPrefs.shareDirs[dir] = !!data.shareDirs?.[dir];
    });
    sandboxSharePrefs[key] = nextPrefs;
    persistSandboxSharePrefs();
  }

  function applySandboxPrefsToForm(appName) {
    if (!dom.sandboxForm) return;
    const prefs = getSandboxSharePrefs(appName);
    SANDBOX_DIR_VALUES.forEach(function (dir) {
      const input = dom.sandboxForm.querySelector('input[value="' + dir + '"]');
      if (input) input.checked = !!(prefs?.shareDirs?.[dir]);
    });
    if (dom.sandboxCustomPathInput) dom.sandboxCustomPathInput.value = prefs?.customPath || '';
  }

  function getSandboxSummaryEntries(prefs) {
    if (!prefs || typeof prefs !== 'object') return [];
    const entries = [];
    SANDBOX_DIR_VALUES.forEach(function (dir) {
      if (prefs.shareDirs && prefs.shareDirs[dir]) entries.push({ type: 'dir', value: dir });
    });
    if (prefs.customPath) entries.push({ type: 'custom', value: prefs.customPath });
    return entries;
  }

  function renderSandboxSummary() {
    if (!dom.sandboxSummary) return;
    const hasApp = !!sandboxState.currentApp;
    const isSandboxed = !!(sandboxState.info && sandboxState.info.sandboxed);
    const prefs = getSandboxSharePrefs(sandboxState.currentApp);
    const entries = getSandboxSummaryEntries(prefs);
    const shouldShow = hasApp && isSandboxed;
    dom.sandboxSummary.hidden = !shouldShow;
    if (!dom.sandboxSummaryList) return;
    if (!shouldShow) {
      dom.sandboxSummaryList.innerHTML = '';
      dom.sandboxSummaryList.hidden = true;
      if (dom.sandboxSummaryEmpty) dom.sandboxSummaryEmpty.hidden = false;
      return;
    }
    dom.sandboxSummaryList.innerHTML = '';
    if (!entries.length) {
      dom.sandboxSummaryList.hidden = true;
      if (dom.sandboxSummaryEmpty) dom.sandboxSummaryEmpty.hidden = false;
      return;
    }
    const fragment = document.createDocumentFragment();
    entries.forEach(function (entry) {
      const li = document.createElement('li');
      li.className = 'sandbox-summary-item';
      if (entry.type === 'dir') {
        li.textContent = _.t(SANDBOX_DIR_LABEL_KEYS[entry.value]) || entry.value;
      } else if (entry.type === 'custom') {
        const label = document.createElement('span');
        label.className = 'sandbox-summary-label';
        label.textContent = _.t('sandbox.summary.custom');
        const path = document.createElement('code');
        path.className = 'sandbox-summary-path';
        path.textContent = entry.value;
        li.append(label, path);
      }
      fragment.appendChild(li);
    });
    dom.sandboxSummaryList.hidden = false;
    dom.sandboxSummaryList.appendChild(fragment);
    if (dom.sandboxSummaryEmpty) dom.sandboxSummaryEmpty.hidden = true;
  }

  function isAppSandboxed(appName) {
    if (!appName) return false;
    return sandboxedApps.get(appName.toLowerCase()) === true;
  }

  function setAppSandboxState(appName, active) {
    if (!appName) return;
    const key = appName.toLowerCase();
    const nextState = !!active;
    const prevState = sandboxedApps.has(key);
    if (nextState === prevState) {
      return;
    }
    if (nextState) sandboxedApps.set(key, true);
    else sandboxedApps.delete(key);
    refreshSandboxBadgesForApp(appName);
    _.scheduleInstalledResort();
  }

  function cleanupSandboxCache() {
    if (!sandboxedApps.size || !(state.installed instanceof Set)) return;
    sandboxedApps.forEach(function (_, key) {
      if (!state.installed.has(key)) sandboxedApps.delete(key);
    });
  }

  function applySandboxBadgeToIcon(iconWrapper, isActive) {
    if (!iconWrapper) return;
    const badge = iconWrapper.querySelector('.installed-badge');
    if (!badge) return;
    const label = isActive ? _.t('sandbox.status.active') : _.t('installed.badge');
    const symbol = isActive ? '\uD83D\uDD12' : '\u2713';
    badge.textContent = symbol;
    badge.setAttribute('aria-label', label);
    badge.title = label;
  }

  function refreshSandboxBadgesForApp(appName) {
    if (!appName) return;
    const lower = appName.toLowerCase();
    const active = isAppSandboxed(appName);
    document.querySelectorAll('.app-tile').forEach(function (tile) {
      const appId = (tile.getAttribute('data-app') || '').toLowerCase();
      const tileName = appId.includes('|') ? appId.slice(0, appId.lastIndexOf('|')) : appId;
      if (tileName !== lower) return;
      const iconWrapper = tile.querySelector('.tile-icon');
      applySandboxBadgeToIcon(iconWrapper, active);
    });
    const detailsNameEl = document.getElementById('detailsName');
    if (detailsNameEl && detailsNameEl.dataset.app === lower) {
      applyDetailsSandboxBadge(appName);
    }
  }

  function refreshAllSandboxBadges() {
    document.querySelectorAll('.app-tile').forEach(function (tile) {
      const appId = tile.getAttribute('data-app') || '';
      const tileName = appId.includes('|') ? appId.slice(0, appId.lastIndexOf('|')) : appId;
      if (!tileName) return;
      const iconWrapper = tile.querySelector('.tile-icon');
      applySandboxBadgeToIcon(iconWrapper, isAppSandboxed(tileName));
    });
    if (state.currentDetailsApp) {
      applyDetailsSandboxBadge(state.currentDetailsApp);
    }
  }

  function applyDetailsSandboxBadge(appName) {
    const detailsIconEl = document.getElementById('detailsIcon');
    if (!detailsIconEl) return;
    const wrapper = detailsIconEl.parentElement;
    if (!wrapper || !wrapper.classList.contains('details-icon-wrapper')) return;
    if (getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
    }
    const target = appName || state.currentDetailsApp;
    const entry = state.allApps.find(function (a) { return a && a.name === target; });
    const sess = _.getActiveInstallSession();
    const isCurrentlyInstalling = !!(sess.id && !sess.done && sess.name === target);
    let isInstalled = false;
    if (entry) {
      isInstalled = !!(entry.installed && entry.hasDiamond !== false);
    } else if (target) {
      isInstalled = state.installed instanceof Set && state.installed.has(String(target).toLowerCase());
    }
    if (isCurrentlyInstalling) {
      isInstalled = false;
    }
    const badge = wrapper.querySelector('.installed-badge');
    if (!isInstalled) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'installed-badge';
      badgeEl.style.position = 'absolute';
      badgeEl.style.top = '0';
      badgeEl.style.right = '0';
      badgeEl.style.zIndex = '2';
      wrapper.appendChild(badgeEl);
    }
    applySandboxBadgeToIcon(wrapper, isAppSandboxed(target));
  }

  function scheduleSandboxStateSweep() {
    if (!_.electronAPI?.getSandboxInfo) return;
    const token = ++sandboxSweepToken;
    runSandboxStateSweep(token).catch(function () {});
  }

  async function runSandboxStateSweep(token) {
    const installedApps = (state.allApps || []).filter(function (app) { return app && app.installed && app.name; }).map(function (app) { return app.name; });
    for (const appName of installedApps) {
      if (token !== sandboxSweepToken) return;
      try {
        const response = await _.electronAPI.getSandboxInfo(appName);
        if (token !== sandboxSweepToken) return;
        const info = response?.info;
        setAppSandboxState(appName, !!info?.sandboxed);
      } catch (e) {}
      await new Promise(function (resolve) { return setTimeout(resolve, 65); });
    }
  }

  function handleSandboxShow(appName) {
    if (!dom.sandboxCard) return;
    const isSameApp = sandboxState.currentApp === appName;
    sandboxState.pendingAction = null;
    closeNonAppimageModal();
    sandboxState.currentApp = appName;
    sandboxState.info = null;
    if (!isSameApp) {
      setSandboxLogExpanded(false);
    }
    applySandboxPrefsToForm(appName);
    resetSandboxLog();
    renderSandboxSummary();
    refreshSandboxInfo(appName);
  }

  function handleSandboxExit() {
    sandboxState.currentApp = null;
    sandboxState.info = null;
    sandboxState.pendingAction = null;
    sandboxState.logBuffer = '';
    sandboxState.supported = true;
    setSandboxLogExpanded(false);
    if (dom.sandboxCard) dom.sandboxCard.hidden = true;
    closeSandboxModal();
    renderSandboxCard();
  }

  function notifySandboxError(code) {
    switch (code) {
      case 'missing-dependency':
        _.showToast(_.t('sandbox.toast.missingDeps'));
        return;
      case 'missing-path':
        _.showToast(_.t('sandbox.toast.missingPath'));
        return;
      case 'forbidden-path':
        _.showToast(_.t('sandbox.toast.forbiddenPath'));
        return;
      case 'invalid-app':
        _.showToast(_.t('sandbox.toast.requireInstall'));
        return;
      case 'missing-pm':
        _.showToast(_.t('missingPm.desc'));
        return;
      default:
        _.showToast(_.t('sandbox.toast.error'));
    }
  }

  // ==========================================================
  // Initialization
  // ==========================================================

  sandboxSharePrefs = loadSandboxSharePrefs();
  renderSandboxCard();
  setSandboxLogExpanded(false);

  // ==========================================================
  // Event listeners
  // ==========================================================

  dom.sandboxRefreshBtn?.addEventListener('click', function () {
    if (sandboxState.busy || !sandboxState.currentApp) return;
    refreshSandboxInfo();
  });

  dom.sandboxInstallDepsBtn?.addEventListener('click', async function () {
    if (sandboxState.busy) return;
    setSandboxBusy(true);
    try {
      await _.electronAPI.depInstall('sas');
      _.showToast(_.t('sandbox.toast.depsInstalled'));
    } catch (error) {
      notifySandboxError(error?.code || null);
    } finally {
      setSandboxBusy(false);
      refreshSandboxInfo();
    }
  });

  dom.sandboxConfigureBtn?.addEventListener('click', async function () {
    if (sandboxState.busy) return;
    if (!sandboxState.info?.installed) {
      _.showToast(_.t('sandbox.toast.requireInstall'));
      return;
    }
    if (!sandboxState.depsReady) {
      _.showToast(_.t('sandbox.toast.missingDeps'));
      return;
    }
    const payload = collectSandboxFormValues();
    payload.appName = sandboxState.currentApp;
    sandboxState.pendingAction = { type: 'configure', id: null };
    resetSandboxLog();
    setSandboxBusy(true);
    try {
      const result = await _.electronAPI.configureSandbox(payload);
      const currentLog = _.stripAnsiSequences(sandboxState.logBuffer || '');
      if (result?.output && !currentLog.trim()) appendSandboxLog(result.output);
      if (result?.ok) {
        rememberSandboxSharePrefs(sandboxState.currentApp, payload);
        renderSandboxSummary();
        setAppSandboxState(sandboxState.currentApp, true);
        _.showToast(_.t('sandbox.toast.enabled', { name: sandboxState.currentApp }));
        refreshSandboxInfo();
      } else {
        notifySandboxError(result?.error);
      }
    } catch (error) {
      notifySandboxError(error?.code || null);
    } finally {
      sandboxState.pendingAction = null;
      setSandboxBusy(false);
    }
  });

  dom.sandboxDisableBtn?.addEventListener('click', async function () {
    if (sandboxState.busy || !sandboxState.info?.sandboxed) return;
    sandboxState.pendingAction = { type: 'disable', id: null };
    resetSandboxLog();
    setSandboxBusy(true);
    try {
      const result = await _.electronAPI.disableSandbox({ appName: sandboxState.currentApp });
      const currentLog = _.stripAnsiSequences(sandboxState.logBuffer || '');
      if (result?.output && !currentLog.trim()) appendSandboxLog(result.output);
      if (result?.ok) {
        setAppSandboxState(sandboxState.currentApp, false);
        _.showToast(_.t('sandbox.toast.disabled', { name: sandboxState.currentApp }));
        refreshSandboxInfo();
      } else {
        notifySandboxError(result?.error);
      }
    } catch (error) {
      notifySandboxError(error?.code || null);
    } finally {
      sandboxState.pendingAction = null;
      setSandboxBusy(false);
    }
  });

  dom.sandboxInstallAppBtn?.addEventListener('click', function () {
    if (sandboxState.busy || sandboxState.info?.installed) return;
    closeSandboxModal();
    document.getElementById('detailsInstallBtn')?.click();
  });

  dom.sandboxLogToggle?.addEventListener('click', function () {
    setSandboxLogExpanded(!isSandboxLogExpanded());
  });

  dom.sandboxOpenBtn?.addEventListener('click', async function () {
    if (!sandboxState.currentApp) return;
    if (!sandboxState.info && !sandboxState.busy) {
      setSandboxBusy(true);
      try {
        const response = await _.electronAPI.getSandboxInfo(sandboxState.currentApp);
        sandboxState.info = response?.info || { installed: false, sandboxed: false };
        sandboxState.depsReady = !!(response?.dependencies && (response.dependencies.hasSas || response.dependencies.hasAisap));
        renderSandboxCard();
      } catch (e) {}
      setSandboxBusy(false);
    }
    const forbiddenReason = sandboxState.info?.sandboxForbiddenReason || (sandboxState.info?.selfSandboxProhibited ? 'self' : null);
    if (!isSandboxSupported(sandboxState.currentApp) || forbiddenReason) {
      showNonAppimageModal(sandboxState.currentApp, forbiddenReason);
      return;
    }
    openSandboxModal();
  });

  dom.sandboxCloseBtn?.addEventListener('click', function () {
    closeSandboxModal();
  });

  dom.sandboxModal?.addEventListener('click', function (event) {
    if (event.target === dom.sandboxModal) {
      closeSandboxModal();
    }
  });

  dom.nonAppimageCloseBtn?.addEventListener('click', function () {
    closeNonAppimageModal();
  });

  dom.nonAppimageDismissBtn?.addEventListener('click', function () {
    closeNonAppimageModal();
  });

  dom.nonAppimageModal?.addEventListener('click', function (event) {
    if (event.target === dom.nonAppimageModal) {
      closeNonAppimageModal();
    }
  });

  window.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (dom.nonAppimageModal && !dom.nonAppimageModal.hidden) {
      event.stopPropagation();
      closeNonAppimageModal();
      return;
    }
    if (dom.sandboxModal && !dom.sandboxModal.hidden) {
      closeSandboxModal();
    }
  });

  if (_.electronAPI?.onSandboxProgress) {
    _.electronAPI.onSandboxProgress(function (message) {
      if (!message || !sandboxState.currentApp) return;
      if (message.appName !== sandboxState.currentApp) return;
      if (!sandboxState.pendingAction) return;
      if (sandboxState.pendingAction.type !== message.action) return;
      if (!sandboxState.pendingAction.id && message.id) sandboxState.pendingAction.id = message.id;
      if (sandboxState.pendingAction.id && message.id && sandboxState.pendingAction.id !== message.id) return;
      if (message.kind === 'start') {
        resetSandboxLog();
        setSandboxBusy(true);
      } else if (message.kind === 'data' && typeof message.chunk === 'string') {
        appendSandboxLog(message.chunk);
      } else if (message.kind === 'error' && message.message) {
        appendSandboxLog('\n' + message.message + '\n');
      } else if (message.kind === 'done') {
        sandboxState.pendingAction = null;
        setSandboxBusy(false);
        refreshSandboxInfo();
      }
    });
  }

  // ==========================================================
  // Public API
  // ==========================================================

  return {
    sandboxState: sandboxState,
    sandboxedApps: sandboxedApps,
    handleSandboxShow: handleSandboxShow,
    handleSandboxExit: handleSandboxExit,
    isAppSandboxed: isAppSandboxed,
    setAppSandboxState: setAppSandboxState,
    applySandboxBadgeToIcon: applySandboxBadgeToIcon,
    refreshAllSandboxBadges: refreshAllSandboxBadges,
    applyDetailsSandboxBadge: applyDetailsSandboxBadge,
    cleanupSandboxCache: cleanupSandboxCache,
    scheduleSandboxStateSweep: scheduleSandboxStateSweep,
    renderSandboxCard: renderSandboxCard,
    resetSandboxLog: resetSandboxLog,
    showNonAppimageModal: showNonAppimageModal,
  };
}

  namespace.sandbox = { init: init };
})();
