(function registerInstaller() {
  const namespace = window.features = window.features || {};

  let _ = null;

  let activeInstallSession = { id: null, name: null, start: 0, lines: [], done: false, success: null, code: null };
  const installQueue = [];
  const installScopeMap = new Map();
  let installScope = 'user';
  let detailScopeOverride = null;

  let currentInstallId = null;
  let currentInstallStart = 0;
  let currentInstallLines = 0;
  let installElapsedInterval = null;

  function init(opts) {
    _ = opts;
    const { dom } = _;

    // ── Scope toggle ──────────────────────────────────────

    function updateScopeButtonUI() {
      const btn = _.dom.installScopeBtn;
      if (!btn) return;
      const isAm = String(_.state.pmName || '').trim().toLowerCase() === 'am';
      btn.hidden = !isAm;
      if (isAm) {
        const effectiveScope = detailScopeOverride ?? installScope;
        btn.textContent = _.t('settings.installScope') + ': ' + (effectiveScope === 'user' ? _.t('install.scope.user') : _.t('install.scope.system'));
      }
    }

    _.dom.installScopeBtn?.addEventListener('click', () => {
      const effectiveScope = detailScopeOverride ?? installScope;
      detailScopeOverride = effectiveScope === 'user' ? 'system' : 'user';
      _.state.currentDetailsScope = detailScopeOverride;
      updateScopeButtonUI();
      if (_.state.currentDetailsApp) {
        const currentAppId = _.state.currentDetailsApp;
        const parsedName = currentAppId.includes('|') ? currentAppId.slice(0, currentAppId.lastIndexOf('|')) : currentAppId;
        const newScope = detailScopeOverride ?? installScope;
        _.state.currentDetailsApp = parsedName + '|' + newScope;
        const app = (_.state.allApps || []).find(e => e && e.name === parsedName && e.scope === newScope);
        const isInstalled = !!app && !!app.installed;
        const appVersion = app?.version || null;
        if (dom.detailsInstallBtn) {
          dom.detailsInstallBtn.hidden = isInstalled;
          dom.detailsInstallBtn.setAttribute('data-name', parsedName);
          dom.detailsInstallBtn.classList.remove('loading');
          dom.detailsInstallBtn.disabled = false;
          dom.detailsInstallBtn.textContent = _.t('details.install');
          dom.detailsInstallBtn.setAttribute('data-action', 'install');
          dom.detailsInstallBtn.setAttribute('aria-label', _.t('details.install'));
        }
        if (dom.detailsUninstallBtn) {
          dom.detailsUninstallBtn.hidden = !isInstalled;
          dom.detailsUninstallBtn.disabled = false;
          dom.detailsUninstallBtn.setAttribute('data-name', parsedName);
        }
        if (dom.detailsName) {
          const label = _.prettifyAppName(parsedName);
          const version = appVersion ? ' · ' + appVersion : '';
          const scopeLabel = newScope ? ' <span class="updated-scope-tag">(' + (newScope === 'user' ? _.t('install.scope.user') : _.t('install.scope.system')) + ')</span>' : '';
          dom.detailsName.innerHTML = `${label}${version}${scopeLabel}`;
          dom.detailsName.dataset.app = parsedName.toLowerCase();
        }
      }
    });

    // ── Queue functions ───────────────────────────────────

    function getQueuePosition(name) {
      const idx = installQueue.indexOf(name);
      return idx === -1 ? -1 : (idx + 1);
    }

    function removeFromQueue(name) {
      const idx = installQueue.indexOf(name);
      if (idx === -1) return false;
      installQueue.splice(idx, 1);
      try {
        if (typeof _.updateQueueIndicators === 'function') _.updateQueueIndicators();
        if (window.__queueRefreshTimeout) clearTimeout(window.__queueRefreshTimeout);
        window.__queueRefreshTimeout = setTimeout(() => {
          try { refreshAllInstallButtons(); } catch (e) { console.error('Erreur refreshAllInstallButtons', e); }
        }, 300);
        _.showToast(_.t('toast.removedFromQueue', { name }));
      } catch (e) {
        console.error('Erreur removeFromQueue', e);
        _.showToast(_.t('toast.removeQueueError'));
      }
      return true;
    }

    function getInstallButtonState(name) {
      if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name) {
        return {
          text: _.t('install.status') + ' ✕',
          action: 'cancel-install',
          ariaLabel: _.t('install.cancel') || 'Cancel installation in progress (' + name + ')',
          isActive: true
        };
      }
      const pos = getQueuePosition(name);
      if (pos !== -1) {
        return {
          text: _.t('install.queued') ? _.t('install.queued').replace('{pos}', pos) : ('En file (#' + pos + ') ✕'),
          action: 'remove-queue',
          ariaLabel: _.t('install.removeQueue') || ('Retirer de la file (' + name + ')'),
          isActive: true
        };
      }
      return { text: '', action: '', ariaLabel: '', isActive: false };
    }

    function refreshDetailsInstallButtonForQueue() {
      const btn = dom.detailsInstallBtn;
      if (!btn || !btn.getAttribute('data-name')) return;
      btn.classList.remove('loading');
      const name = btn.getAttribute('data-name');
      if (!name) return;
      var st = getInstallButtonState(name);
      if (st.isActive) {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = st.text;
        btn.setAttribute('data-action', st.action);
        btn.setAttribute('aria-label', st.ariaLabel);
        return;
      }
      if (!btn.hidden) {
        btn.textContent = _.t('details.install');
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.setAttribute('data-action', 'install');
      }
    }

    function refreshListInstallButtons() {
      const buttons = document.querySelectorAll('.app-tile .actions .inline-action');
      buttons.forEach(btn => {
        const name = btn.getAttribute('data-app');
        if (!name) return;
        var st = getInstallButtonState(name);
        if (st.isActive) {
          btn.textContent = st.text;
          btn.disabled = false;
          btn.setAttribute('data-action', st.action);
          btn.setAttribute('aria-label', st.ariaLabel);
          btn.style.display = '';
          return;
        }
        btn.style.display = 'none';
      });
    }

    function refreshAllInstallButtons() {
      refreshDetailsInstallButtonForQueue();
      refreshListInstallButtons();
      refreshTileBadges();
    }

    function refreshTileBadges() {
      if (_.state.viewMode === 'list') return;
      if (!_.state.installed || typeof _.state.installed.has !== 'function') return;
      const tiles = document.querySelectorAll('.app-tile');
      tiles.forEach(tile => {
        const appId = tile.getAttribute('data-app') || '';
        const name = appId.includes('|') ? appId.slice(0, appId.lastIndexOf('|')) : appId;
        const installed = _.state.installed.has(name);
        const nameEl = tile.querySelector('.tile-name');
        if (!nameEl) return;
        const existing = nameEl.querySelector('.install-state-badge');
        if (existing) existing.remove();
        if (installed) return;
        let badgeHtml = '';
        if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name) {
          badgeHtml = `<span class="install-state-badge installing" data-state="installing">${_.t('install.installing')}<button class="queue-remove-badge inline-action" data-action="cancel-install" data-app="${name}" title="${_.t('install.cancel')}" aria-label="${_.t('install.cancel')}">✕</button></span>`;
        } else {
          const pos = getQueuePosition(name);
          if (pos !== -1) badgeHtml = `<span class="install-state-badge queued" data-state="queued">${_.t('install.queuePosition', { pos: pos })}<button class="queue-remove-badge inline-action" data-action="remove-queue" data-app="${name}" title="${_.t('install.removeQueue')}" aria-label="${_.t('install.removeQueue')}">✕</button></span>`;
        }
        if (badgeHtml) nameEl.insertAdjacentHTML('beforeend', ' ' + badgeHtml);
      });
    }

    function refreshQueueUI() {
      refreshAllInstallButtons();
    }

    function processNextInstall() {
      if (activeInstallSession.id && !activeInstallSession.done) return;
      if (!installQueue.length) return;
      const next = installQueue.shift();
      const scope = installScopeMap.get(next) || installScope;
      installScopeMap.delete(next);
      refreshQueueUI();
      refreshTileBadges();
      document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
      const tile = Array.from(document.querySelectorAll('.app-tile')).find(t => {
        const d = t.getAttribute('data-app') || '';
        return d === next || d.startsWith(next + '|');
      });
      if (tile) tile.classList.add('busy');
      const inlineBtn = Array.from(document.querySelectorAll('.inline-action.install')).find(b => {
        const d = b.getAttribute('data-app') || '';
        return d === next || d.startsWith(next + '|');
      });
      if (inlineBtn) inlineBtn.disabled = true;
      _.showToast(_.t('toast.installing', { name: next }));
      startStreamingInstall(next, scope).catch((err) => {
        _.showToast(err?.message || _.t('toast.installFailed', { name: next }));
        activeInstallSession.done = true;
        setTimeout(() => processNextInstall(), 200);
      });
      refreshAllInstallButtons();
    }

    function enqueueInstall(name, scope) {
      if (!name) return;
      if ((activeInstallSession.name === name && !activeInstallSession.done) || installQueue.includes(name)) {
        _.showToast(_.t('toast.alreadyInQueue', { name }));
        return;
      }
      if (scope) installScopeMap.set(name, scope);
      if (activeInstallSession.id && !activeInstallSession.done) {
        installQueue.push(name);
        refreshQueueUI();
        _.showToast(_.t('toast.addedToQueue', { name, count: installQueue.length }));
      } else {
        installQueue.push(name);
        refreshQueueUI();
        processNextInstall();
      }
      refreshAllInstallButtons();
    }

    async function cancelActiveInstall(expectedName = null) {
      document.querySelectorAll('.choice-dialog').forEach(e => e.remove());
      if (!activeInstallSession || activeInstallSession.done) return;
      if (expectedName && activeInstallSession.name !== expectedName) return;
      if (!activeInstallSession.id) return;
      const appName = activeInstallSession.name;
      try {
        await _.electronAPI.installCancel(activeInstallSession.id);
        _.showToast(_.t('toast.cancelRequested'));
        try {
          await _.electronAPI.uninstallApp(appName);
        } catch (_o) { }
        try {
          await _.electronAPI.invalidateAppsCache?.();
          await _.loadApps();
          _.applySearch();
        } catch (_o) { }
      } catch (_o) {
        _.showToast(_.t('toast.cancelError'));
      }
    }

    // ── Streaming install ─────────────────────────────────

    function setInstallEtaDisplay(etaText, active) {
      const label = dom.installProgressEtaLabel;
      if (!label) return;
      label.classList.toggle('eta-spinning', !!active);
      label.textContent = etaText || '';
    }

    function initXtermLog() {
      if (!window._xtermLogDiv) window._xtermLogDiv = document.getElementById('xtermLog');
      if (!window._xtermLogDiv) return;
      if (!window._xterm) {
        try {
          window._xterm = new Terminal({
            fontSize: 13,
            fontFamily: 'monospace',
            theme: { background: '#181c20' },
            convertEol: true,
            scrollback: 2000,
            disableStdin: true,
            cursorBlink: false
          });
          window._xtermFit = new FitAddonClass();
          window._xterm.loadAddon(window._xtermFit);
          window._xterm.open(window._xtermLogDiv);
          if (window._xtermResizeHandler) window.removeEventListener('resize', window._xtermResizeHandler);
          window._xtermResizeHandler = () => window._xtermFit.fit();
          window.addEventListener('resize', window._xtermResizeHandler);
          window._xtermFit.fit();
        } catch (_err) {
          window._xterm = null;
          window._xtermFit = null;
          if (window._xtermLogDiv) window._xtermLogDiv.style.display = 'none';
          if (window._installStreamLog) window._installStreamLog.style.display = '';
          return;
        }
      } else {
        window._xterm.clear();
        window._xtermFit && window._xtermFit.fit();
      }
      window._xtermLogDiv.style.display = '';
      if (window._installStreamLog) window._installStreamLog.style.display = 'none';
    }

    function startStreamingInstall(name, scope) {
      initXtermLog();
      if (!_.electronAPI.installStart) {
        return Promise.reject(new Error('Streaming non supporté'));
      }
      document.querySelectorAll('.app-tile.busy').forEach(t => t.classList.remove('busy'));
      const activeTile = Array.from(document.querySelectorAll('.app-tile')).find(t => {
        const d = t.getAttribute('data-app') || '';
        return d === name || d.startsWith(name + '|');
      });
      if (activeTile) activeTile.classList.add('busy');
      if (dom.installStream) {
        dom.installStream.hidden = false;
        if (dom.installStreamElapsed) dom.installStreamElapsed.textContent = '0s';
        if (dom.installProgressPercentLabel) dom.installProgressPercentLabel.textContent = '';
        setInstallEtaDisplay('', true);
        if (dom.installProgressBar) {
          dom.installProgressBar.value = 0;
          dom.installProgressBar.max = 100;
          dom.installProgressBar.removeAttribute('hidden');
        }
      }
      currentInstallStart = Date.now();
      currentInstallLines = 0;
      activeInstallSession = { id: null, name, start: currentInstallStart, lines: [], done: false, success: null, code: null };
      if (installElapsedInterval) clearInterval(installElapsedInterval);
      installElapsedInterval = setInterval(() => {
        if (dom.installStreamElapsed) {
          const secs = Math.floor((Date.now() - currentInstallStart) / 1000);
          dom.installStreamElapsed.textContent = secs + 's';
        }
      }, 1000);
      return _.electronAPI.installStart(name, scope).then(res => {
        if (res && res.error) {
          _.showToast(res.error);
          if (dom.installStream) dom.installStream.hidden = true;
          dom.detailsInstallBtn?.classList.remove('loading');
          dom.detailsInstallBtn?.removeAttribute('disabled');
          return;
        }
        currentInstallId = res?.id || null;
        activeInstallSession.id = currentInstallId;
        refreshAllInstallButtons();
      });
    }

    if (_.electronAPI.onInstallProgress) {
      _.electronAPI.onInstallProgress(msg => {
        if (!msg) return;
        if (currentInstallId && msg.id !== currentInstallId) return;
        if (msg.kind === 'line') {
          if (msg.raw !== undefined) {
            const ansiCleaned = _.stripAnsiSequences(msg.raw);

            if (!window._installWarningBuffer) window._installWarningBuffer = null;
            if (!window._installWarningActive) window._installWarningActive = false;

            if (/^\s*WARNING:/i.test(ansiCleaned)) {
              window._installWarningBuffer = ansiCleaned + '\n';
              window._installWarningActive = true;
              return;
            }
            if (window._installWarningActive) {
              if (/^=+/.test(ansiCleaned)) {
                showPopupWarning(window._installWarningBuffer.trim());
                window._installWarningBuffer = null;
                window._installWarningActive = false;
                return;
              }
              window._installWarningBuffer += ansiCleaned + '\n';
              return;
            }

            const percentCandidates = [];
            const percentRegex = /(\d{1,3}(?:[\.,]\d+)?)\s*%/g;
            let percentHit;
            while ((percentHit = percentRegex.exec(ansiCleaned)) !== null) {
              const p = Math.round(parseFloat(String(percentHit[1]).replace(',', '.')));
              if (!Number.isNaN(p) && p >= 0 && p <= 100) percentCandidates.push(p);
            }
            const ratioMatch = ansiCleaned.match(/(?:^|\s)(\d{1,6})\s*\/\s*(\d{1,6})(?=\s|$)/);
            if (ratioMatch) {
              const done = parseInt(ratioMatch[1], 10);
              const total = parseInt(ratioMatch[2], 10);
              if (!Number.isNaN(done) && !Number.isNaN(total) && total > 0 && done >= 0) {
                percentCandidates.push(Math.round((done / total) * 100));
              }
            }
            if (percentCandidates.length) {
              const percent = Math.max(0, Math.min(100, Math.max(...percentCandidates)));
              if (dom.installProgressPercentLabel) dom.installProgressPercentLabel.textContent = percent + '%';
              if (dom.installProgressBar) dom.installProgressBar.value = percent;
            }
            let eta = '';
            let m = ansiCleaned.match(/(?:ETA|eta|Temps restant|remaining)[\s:=]+([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?|\d+\s*(?:s|sec|min|m)\b|[^\r\n]+)/i);
            if (m && m[1]) eta = m[1].trim();
            if (!eta) {
              const reverseEta = ansiCleaned.match(/([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\s*(?:ETA|eta)\b/i);
              if (reverseEta && reverseEta[1]) eta = reverseEta[1].trim();
            }
            setInstallEtaDisplay(eta, true);
          }
          return;
        }
        switch (msg.kind) {
          case 'start':
            if (dom.installStreamStatus) dom.installStreamStatus.textContent = _.t('install.status');
            refreshAllInstallButtons();
            if (dom.installProgressBar) dom.installProgressBar.value = 0;
            setInstallEtaDisplay('', true);
            break;
          case 'error':
            if (dom.installStreamStatus) dom.installStreamStatus.textContent = _.t('install.error') || 'Erreur';
            dom.detailsInstallBtn?.classList.remove('loading');
            dom.detailsInstallBtn?.removeAttribute('disabled');
            setTimeout(() => { if (dom.installStream) dom.installStream.hidden = true; }, 5000);
            if (dom.installProgressBar) dom.installProgressBar.value = 0;
            setInstallEtaDisplay('', false);
            if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
            break;
          case 'cancelled':
            if (dom.installStreamStatus) dom.installStreamStatus.textContent = _.t('install.cancelled') || 'Cancelled';
            if (dom.detailsInstallBtn) {
              dom.detailsInstallBtn.classList.remove('loading');
              dom.detailsInstallBtn.disabled = false;
            }
            if (dom.installProgressBar) dom.installProgressBar.value = 0;
            setInstallEtaDisplay('', false);
            if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
            setTimeout(() => { if (dom.installStream) dom.installStream.hidden = true; }, 2000);
            break;
          case 'done':
            if (dom.installStreamStatus) dom.installStreamStatus.textContent = _.t('install.done') || 'Done';
            if (dom.installProgressBar) dom.installProgressBar.value = 100;
            setInstallEtaDisplay('', false);
            if (installElapsedInterval) { clearInterval(installElapsedInterval); installElapsedInterval = null; }
            setTimeout(() => { if (dom.installStream) dom.installStream.hidden = true; }, 2000);
            dom.detailsInstallBtn?.classList.remove('loading');
            dom.detailsInstallBtn?.removeAttribute('disabled');
            if (activeInstallSession && activeInstallSession.id === currentInstallId) {
              activeInstallSession.done = true;
              activeInstallSession.success = msg.success;
              activeInstallSession.code = msg.code;
            }
            // Invalidate cache then reload so newly‑installed apps appear immediately
            (async () => {
              await _.electronAPI.invalidateAppsCache?.();
              await _.loadApps();
              _.applySearch();
              if (msg.success) {
                const installedName = msg.name || dom.detailsInstallBtn?.getAttribute('data-name');
                const key = installedName && installedName.toLowerCase();
                const targetName = (key && (_.state.bundleChildOf[key] || _.state.mutexRedirect[key])) || installedName;
                if (targetName) _.showDetails(targetName);
              }
              if (msg.name) {
                document.querySelectorAll(`.app-tile[data-app="${CSS.escape(msg.name)}"]`).forEach(t => t.classList.remove('busy'));
              }
              refreshQueueUI();
              refreshAllInstallButtons();
            })().catch(() => {});
            setTimeout(() => { if (dom.installStream) dom.installStream.hidden = true; }, 3500);
            setTimeout(() => processNextInstall(), 450);
            break;
        }
      });
    }

    function showPopupWarning(msg) {
      const dontShowKey = 'hideWget2Warning';
      if (localStorage.getItem(dontShowKey) === '1') return;
      let modal = document.getElementById('warningModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'warningModal';
        modal.className = 'modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(0,0,0,0.45)';
        modal.style.zIndex = '9999';
        modal.innerHTML = `<div style='background:#fff;max-width:480px;margin:80px auto;padding:28px 22px;border-radius:12px;box-shadow:0 2px 16px #0002;text-align:left;'>
          <h2 style='color:#c00;font-size:20px;margin-bottom:12px;'>${_.t('warning.title')}</h2>
          <pre style='white-space:pre-wrap;font-size:15px;color:#c00;margin-bottom:18px;'>${msg}</pre>
          <label style='display:flex;align-items:center;margin-bottom:18px;font-size:15px;color:#444;'><input type='checkbox' id='dontShowWget2Warning' style='margin-right:8px;'>${_.t('warning.checkboxText')}</label>
          <button id='closeWarningModal' style='font-size:15px;padding:8px 18px;border-radius:8px;background:#c00;color:#fff;border:none;cursor:pointer;'>${_.t('warning.closeBtn')}</button>
        </div>`;
        document.body.appendChild(modal);
        document.getElementById('closeWarningModal').onclick = () => {
          const checkbox = document.getElementById('dontShowWget2Warning');
          if (checkbox?.checked) localStorage.setItem(dontShowKey, '1');
          modal.remove();
        };
      } else {
        const pre = modal.querySelector('pre');
        if (pre) pre.textContent = msg;
        modal.style.display = 'block';
      }
    }

    // ── Public API ────────────────────────────────────────

    return {
      getActiveInstallSession: () => activeInstallSession,
      getInstallScope: () => detailScopeOverride ?? installScope,
      setInstallScope: (s) => { installScope = s; },
      getDetailScopeOverride: () => detailScopeOverride,
      setDetailScopeOverride: (v) => { detailScopeOverride = v; },
      getQueuePosition,
      enqueueInstall,
      removeFromQueue,
      refreshAllInstallButtons,
      refreshTileBadges,
      cancelActiveInstall,
      updateScopeButtonUI,
      processNextInstall,
      refreshQueueUI,
      startStreamingInstall
    };
  }

  namespace.installer = { init };
})();
