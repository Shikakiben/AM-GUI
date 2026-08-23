(function registerAppLoader() {
  const namespace = window.features = window.features || {};

  let _ = null;
  let _loadAppsSeq = 0;

  function init(opts) {
    _ = opts;

    // Background cache refresh: reload apps when the main process finishes refreshing
    if (typeof _.electronAPI().onAppsCacheUpdated === 'function') {
      _.electronAPI().onAppsCacheUpdated(async () => {
        try { await loadApps(); _.applySearch(); } catch (_) {}
      });
    }

    async function loadApps() {
      const seq = ++_loadAppsSeq;
      _.doms().appsDiv?.setAttribute('aria-busy', 'true');
      let detailed;
      try {
        detailed = await _.electronAPI().listAppsDetailed();
      } catch (e) {
        detailed = { all: [], installed: [], error: _.t('error.ipc', { msg: e?.message || e }) };
      }
      if (seq !== _loadAppsSeq) return;
      if (!detailed.pmFound) {
        _.state().allApps = [];
        _.state().filtered = [];
        _.showMissingPmPopup();
        const appsDiv = _.doms().appsDiv;
        if (appsDiv) {
          appsDiv.innerHTML = `<div class="empty-state pm-empty-placeholder"><p>${_.t('missingPm.popup.desc')}</p></div>`;
        }
        _.updateInstalledCount('0');
        _.sandboxedApps().clear();
        _.refreshAllSandboxBadges();
        appsDiv?.setAttribute('aria-busy', 'false');
        return;
      }
      _.hideMissingPmPopup();
      if (detailed.bothPms) {
        _.state().allApps = [];
        _.state().filtered = [];
        _.showBothPmsPopup(true);
        const appsDiv = _.doms().appsDiv;
        if (appsDiv) {
          appsDiv.innerHTML = `<div class="empty-state pm-empty-placeholder"><p>${_.t('bothPms.popup.desc')}</p></div>`;
        }
        _.updateInstalledCount('0');
        _.sandboxedApps().clear();
        _.refreshAllSandboxBadges();
        appsDiv?.setAttribute('aria-busy', 'false');
        return;
      }
      _.showBothPmsPopup(false);
      if (detailed.error) {
        _.state().allApps = [];
        _.state().filtered = [];
        const appsDiv = _.doms().appsDiv;
        if (appsDiv) appsDiv.innerHTML = `<div class='empty-state'><h3>${_.t('error.dialogTitle')}</h3><p style='font-size:13px;'>${detailed.error}</p></div>`;
        _.updateInstalledCount('0');
        _.sandboxedApps().clear();
        _.refreshAllSandboxBadges();
        appsDiv?.setAttribute('aria-busy', 'false');
        return;
      }
      _.state().allApps = detailed.all || [];
      _.state().filtered = _.state().allApps;
      _.state().pmName = detailed.pmName || null;
      const isAmPm = String(_.state().pmName || '').trim().toLowerCase() === 'am';
      const savedScope = localStorage.getItem('installScope');
      _.setInstallScope(isAmPm ? (savedScope || 'user') : null);
      const scopeSettingsGroup = document.getElementById('installScopeSettingsGroup');
      if (scopeSettingsGroup) {
        scopeSettingsGroup.hidden = !isAmPm;
        if (isAmPm) {
          const scope = _.getInstallScope();
          scopeSettingsGroup.querySelectorAll('input[name="installScopePref"]').forEach(r => {
            r.checked = r.value === scope;
          });
        }
      }
      try {
        const installedNames = new Set();
        if (Array.isArray(detailed.installed)) {
          detailed.installed.forEach(entry => {
            if (!entry) return;
            if (typeof entry === 'string') installedNames.add(entry.toLowerCase());
            else if (entry.name) installedNames.add(String(entry.name).toLowerCase());
          });
        } else {
          _.state().allApps.filter(a => a && a.installed && a.name).forEach(a => installedNames.add(a.name.toLowerCase()));
        }
        _.state().installed = installedNames;
      } catch (_e) { _.state().installed = new Set(); }

      const bundleChildOf = detailed.bundleChildOf || {};
      _.state().bundleChildOf = bundleChildOf;
      _.state().mutexRedirect = {};
      applyAppGroupFiltering(bundleChildOf);

      if (seq !== _loadAppsSeq) return;
      _.updateInstalledCount(String(_.state().allApps.filter(a => a.installed).length));
      _.cleanupSandboxCache();
      _.rerenderActiveCategory();
      _.refreshAllSandboxBadges();
      _.scheduleSandboxStateSweep();
      _.prefetchPreloadImages();
    }

    function applyAppGroupFiltering(bundleChildOf) {
      const toRemove = new Set();
      const state = _.state();
      for (const app of state.allApps) {
        const name = String(app.name).toLowerCase();
        const parent = (bundleChildOf || {})[name];
        if (parent && state.installed.has(parent.toLowerCase())) {
          state.installed.add(name);
          toRemove.add(name);
        }
      }
      const allNames = new Set(state.allApps.map(a => String(a.name).toLowerCase()));
      const mutexRedirect = {};
      for (const app of state.allApps) {
        const name = String(app.name).toLowerCase();
        if (name.endsWith('-appimage')) {
          const base = name.slice(0, -'-appimage'.length);
          if (allNames.has(base)) {
            if (state.installed.has(base)) {
              toRemove.add(name);
              mutexRedirect[name] = base;
            } else if (state.installed.has(name)) {
              toRemove.add(base);
              mutexRedirect[base] = name;
            }
          }
        }
      }
      state.mutexRedirect = mutexRedirect;
      if (toRemove.size > 0) {
        state.allApps = state.allApps.filter(a => !toRemove.has(String(a.name).toLowerCase()));
        state.filtered = state.filtered.filter(a => !toRemove.has(String(a.name).toLowerCase()));
      }
    }

    return { loadApps };
  }

  namespace.appLoader = { init };
})();
