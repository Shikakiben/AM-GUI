(function registerUpdates() {
  const namespace = window.features = window.features || {};

  let _ = null;
  let updatesXterm = null;
  let updatesXtermFit = null;
  let updatesTerminalEl = null;
  let updatesTerminalFallbackMode = false;
  let updatesTerminalExpanded = false;
  let updateSpinnerBusy = false;
  let activeUpdateStreamId = null;
  let updatesStreamBuffer = '';
  const updateStreamWaiters = new Map();
  let updateTimerInterval = null;
  let updateTimerStart = null;

  function stripAnsiSequences(text = '') {
    return text
      .replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, '')
      .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
      .replace(/\][0-9]+;[^\\\x07]*(\x07|\\)/g, '')
      .replace(/[\x07\x08]/g, '');
  }

  function init(opts) {
    _ = opts;
    const { dom } = _;

    // ==========================================================
    // Internal functions
    // ==========================================================

    function hasUpdatesStreamingSupport() {
      return !!(_.electronAPI?.startUpdates && _.electronAPI?.onUpdatesProgress);
    }

    function startUpdateTimer() {
      const timer = document.querySelector('.update-timer');
      if (!timer) return;
      if (updateTimerStart === null) updateTimerStart = Date.now();
      if (updateTimerInterval) return;
      const updateTimerText = () => {
        const elapsed = Math.max(0, Math.floor((Date.now() - updateTimerStart) / 1000));
        if (elapsed < 60) {
          timer.textContent = `${elapsed}s`;
        } else {
          const min = Math.floor(elapsed / 60);
          const sec = String(elapsed % 60).padStart(2, '0');
          timer.textContent = `${min}:${sec}`;
        }
      };
      updateTimerText();
      updateTimerInterval = setInterval(updateTimerText, 1000);
    }

    function stopUpdateTimer() {
      if (updateTimerInterval) clearInterval(updateTimerInterval);
      updateTimerInterval = null;
      updateTimerStart = null;
    }

    function setUpdateSpinnerBusy(isBusy) {
      if (!dom.updateSpinner) return;
      updateSpinnerBusy = !!isBusy;
      dom.updateSpinner.setAttribute('data-busy', updateSpinnerBusy ? 'true' : 'false');
      const hourglass = dom.updateSpinner.querySelector('.update-hourglass');
      const timer = dom.updateSpinner.querySelector('.update-timer');
      const label = dom.updateSpinner.querySelector('.spinner-label');
      if (dom.runUpdatesBtn) dom.runUpdatesBtn.classList.toggle('loading', updateSpinnerBusy);
      if (updateSpinnerBusy) {
        if (hourglass) hourglass.style.display = 'inline-block';
        if (timer) timer.style.display = 'inline-block';
        if (label) {
          label.textContent = _.t('updates.loading');
          label.style.display = '';
        }
        startUpdateTimer();
      } else {
        if (hourglass) hourglass.style.display = 'none';
        if (timer) timer.style.display = 'none';
        if (label) {
          label.textContent = '';
          label.style.display = 'none';
        }
        stopUpdateTimer();
      }
    }

    function updateUpdatesToggleUi() {
      if (!dom.updatesToggleBtn) return;
      dom.updatesToggleBtn.setAttribute('aria-expanded', updatesTerminalExpanded ? 'true' : 'false');
      const section = document.getElementById('updatesLogSection');
      if (section) section.setAttribute('data-open', updatesTerminalExpanded ? 'true' : 'false');
      const caret = dom.updatesToggleBtn.querySelector('.updates-log-caret');
      if (caret) caret.textContent = updatesTerminalExpanded ? '\u25BE' : '\u25B8';
    }

    function ensureUpdatesTerminal() {
      if (updatesTerminalFallbackMode) {
        if (!updatesTerminalEl) updatesTerminalEl = dom.updatesTerminalNode;
        updatesTerminalEl?.classList.add('updates-terminal-fallback');
        return null;
      }
      if (!updatesTerminalEl) updatesTerminalEl = dom.updatesTerminalNode;
      if (!updatesTerminalEl) return null;
      if (updatesXterm) return updatesXterm;
      try {
        updatesXterm = new Terminal({
          fontSize: 12,
          fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace',
          convertEol: true,
          allowTransparency: true,
          theme: { background: '#050e17', foreground: '#d4e7ff' },
          scrollback: 2000,
          disableStdin: true
        });
        updatesXtermFit = new FitAddonClass();
        updatesXterm.loadAddon(updatesXtermFit);
        updatesXterm.open(updatesTerminalEl);
        setTimeout(() => updatesXtermFit?.fit(), 60);
        window.addEventListener('resize', () => updatesXtermFit?.fit());
        updatesTerminalEl.classList.remove('updates-terminal-fallback');
      } catch (err) {
        console.error('Init updates terminal failed', err);
        updatesXterm = null;
        updatesXtermFit = null;
        updatesTerminalFallbackMode = true;
        if (updatesTerminalEl) {
          updatesTerminalEl.classList.add('updates-terminal-fallback');
          updatesTerminalEl.textContent = '';
        }
        return null;
      }
      return updatesXterm;
    }

    function applyUpdatesTerminalVisibility() {
      if (!dom.updatesTerminalWrap) return;
      dom.updatesTerminalWrap.hidden = !updatesTerminalExpanded;
      if (updatesTerminalExpanded) {
        ensureUpdatesTerminal();
        if (updatesXtermFit) setTimeout(() => updatesXtermFit?.fit(), 30);
      }
    }

    function setUpdatesTerminalExpanded(expanded) {
      const next = !!expanded;
      if (next === updatesTerminalExpanded) {
        updateUpdatesToggleUi();
        return;
      }
      updatesTerminalExpanded = next;
      applyUpdatesTerminalVisibility();
      updateUpdatesToggleUi();
    }

    function revealUpdatesTerminal(forceExpand) {
      if (forceExpand === undefined) forceExpand = false;
      if (forceExpand) {
        setUpdatesTerminalExpanded(true);
        return;
      }
      ensureUpdatesTerminal();
      if (updatesTerminalExpanded && dom.updatesTerminalWrap) {
        dom.updatesTerminalWrap.hidden = false;
      }
    }

    function resetUpdatesTerminal() {
      const term = ensureUpdatesTerminal();
      if (!term) {
        if (updatesTerminalEl) {
          updatesTerminalEl.classList.add('updates-terminal-fallback');
          updatesTerminalEl.textContent = '';
          updatesTerminalEl.scrollTop = 0;
        }
        return;
      }
      try { term.reset(); }
      catch (e) { term.clear?.(); }
      if (updatesXtermFit) setTimeout(() => updatesXtermFit?.fit(), 30);
    }

    function appendUpdatesTerminalChunk(chunk) {
      if (!chunk) return;
      const term = ensureUpdatesTerminal();
      if (!term) {
        if (!updatesTerminalEl) return;
        const cleaned = stripAnsiSequences(chunk);
        updatesTerminalEl.classList.add('updates-terminal-fallback');
        updatesTerminalEl.textContent += cleaned.replace(/\r?\n/g, '\n');
        updatesTerminalEl.scrollTop = updatesTerminalEl.scrollHeight;
        return;
      }
      term.write(chunk.replace(/\r?\n/g, '\r\n'));
    }

    function waitForUpdateJob(id) {
      return new Promise((resolve, reject) => {
        updateStreamWaiters.set(id, { resolve, reject });
      });
    }

    async function startUpdatesStream() {
      revealUpdatesTerminal();
      resetUpdatesTerminal();
      const startRes = await _.electronAPI.startUpdates();
      if (!startRes || startRes.error) {
        throw new Error(startRes?.error || 'updates start failed');
      }
      activeUpdateStreamId = startRes.id;
      return waitForUpdateJob(startRes.id);
    }

    function resolveUpdateWaiter(msg, isError) {
      if (!msg || !msg.id) return;
      const waiter = updateStreamWaiters.get(msg.id);
      if (!waiter) return;
      try {
        if (isError) waiter.reject?.(msg);
        else waiter.resolve?.(msg);
      } finally {
        updateStreamWaiters.delete(msg.id);
      }
    }

    function parseUpdatedApps(res) {
      const cleanedOutput = stripAnsiSequences(res || '');
      const updated = new Set();
      if (typeof cleanedOutput !== 'string') return updated;
      const lines = cleanedOutput.split(/\r?\n/);
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        let name = null;
        let m;
        if ((m = line.match(/^\u2714\s+([A-Za-z0-9._-]+)/))) name = m[1];
        else if ((m = line.match(/^\*\s*([A-Za-z0-9._-]+)\s+->/))) name = m[1];
        else if ((m = line.match(/^([A-Za-z0-9._-]+)\s*\([^)]*->[^)]*\)/))) name = m[1];
        if (name && !name.toLowerCase().endsWith('.am')) {
          updated.add(name.toLowerCase());
        }
      }
      return updated;
    }

    function parseUpdatedBlock(text) {
      const updated = new Set();
      const newVersions = new Map();
      const lines = text.split(/\r?\n/);
      const SEP_SKIP = 4;
      let sepCount = 0;
      let startIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^[-=]{5,}$/.test(lines[i].trim())) {
          sepCount++;
          if (sepCount === SEP_SKIP) { startIdx = i + 1; break; }
        }
      }
      if (startIdx === -1) return { updated, newVersions, hasStructure: false };

      const blockLines = lines.slice(startIdx);

      const QUAL = '(?:\\s+\\((?:AppMan|AM)\\))?';
      const VER = '[^\\s()]+';
      const ROW_RE = new RegExp(
        '^\\s*\\d+\\.\\s+([A-Za-z0-9._-]+)\\s+' + VER + QUAL + '\\s+' + VER + QUAL + '$'
      );
      for (let i = 0; i < blockLines.length; i++) {
        const line = blockLines[i].trim();
        if (!ROW_RE.test(line)) continue;
        const m = line.match(/^\s*\d+\.\s+([A-Za-z0-9._-]+)\s+(.*)/);
        if (!m) continue;
        const name = m[1].toLowerCase();
        const allTokens = m[2].match(/\S+/g) || [];
        const tokens = allTokens.filter(function (t) { return t !== '(AppMan)' && t !== '(AM)'; });
        if (tokens.length < 2) continue;
        const oldVer = tokens[tokens.length - 2];
        const newVer = tokens[tokens.length - 1];
        const qualifier = /\((AppMan|AM)\)/.exec(line);
        const scopeTag = qualifier ? qualifier[1] : null;
        let scope;
        if (scopeTag === 'AppMan') scope = 'user';
        else if (scopeTag === 'AM') scope = 'system';
        else scope = _.statePmName() === 'appman' ? 'user' : 'system';
        const key = name + '|' + scope;
        if (!name.endsWith('.am')) {
          updated.add(key);
          newVersions.set(key, { old: oldVer, new: newVer, name: name, scope: scope });
        }
      }
      return { updated: updated, newVersions: newVersions, hasStructure: true };
    }

    function handleUpdateCompletion(fullText) {
      const sanitized = stripAnsiSequences(fullText || '');
      const parsed = parseUpdatedBlock(sanitized);
      const blockUpdated = parsed.updated;
      const newVersions = parsed.newVersions;
      const hasStructure = parsed.hasStructure;
      const lines = sanitized.split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var raw = lines[i];
        var line = raw.trim();
        var arrowMatch = line.match(/^([A-Za-z0-9._-]+)\s*\([^)]*->\s*([^)]+)\)/);
        if (arrowMatch) {
          var appName = arrowMatch[1].toLowerCase();
          var newVer = arrowMatch[2].trim();
          if (newVer && !newVersions.has(appName) && !appName.endsWith('.am')) newVersions.set(appName, newVer);
        }
      }
      var toShow = new Set();
      if (blockUpdated.size > 0) {
        toShow = blockUpdated;
      } else if (!hasStructure) {
        var fallback = parseUpdatedApps(sanitized);
        if (fallback.size > 0) toShow = fallback;
      }
      if (toShow.size > 0) {
        if (dom.updateFinalMessage) dom.updateFinalMessage.textContent = _.t('updates.updatedApps');
        if (dom.updatedAppsIcons) {
          dom.updatedAppsIcons.innerHTML = '';
          toShow.forEach(function (keyLower) {
            var pipeIdx = keyLower.lastIndexOf('|');
            var rawName = pipeIdx !== -1 ? keyLower.slice(0, pipeIdx) : keyLower;
            var scopeKey = pipeIdx !== -1 ? keyLower.slice(pipeIdx + 1) : null;
            var wrapper = document.createElement('div'); wrapper.className = 'updated-item';
            var img = document.createElement('img');
            var appObj = scopeKey
              ? _.getAllApps().find(function (a) { return String(a.name).toLowerCase() === rawName && a.scope === scopeKey; })
              : _.getAllApps().find(function (a) { return String(a.name).toLowerCase() === rawName; });
            var displayName = _.prettifyAppName(rawName);
            var versionInfo = newVersions.get(keyLower);
            var fallbackVer = appObj && appObj.version ? appObj.version : null;
            img.src = _.getIconUrl(rawName);
            img.alt = displayName;
            img.onerror = function () { img.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; };
            var meta = document.createElement('div'); meta.className = 'updated-meta';
            var title = document.createElement('div'); title.className = 'updated-name'; title.textContent = displayName;
            var ver = document.createElement('div'); ver.className = 'updated-version';
            var appScope = scopeKey || (appObj && appObj.scope ? appObj.scope : null);
            if (versionInfo && typeof versionInfo === 'object' && versionInfo.old && versionInfo.new) {
              ver.textContent = versionInfo.old + ' \u2192 ' + versionInfo.new;
            } else {
              var displayVersion = versionInfo || fallbackVer;
              ver.textContent = displayVersion ? String(displayVersion) : '';
              if (!displayVersion) ver.hidden = true;
            }
            if (appScope && _.statePmName() === 'am') {
              var scopeTag = document.createElement('span');
              scopeTag.className = 'updated-scope-tag';
              scopeTag.textContent = appScope === 'system' ? '(' + _.t('install.scope.system') + ')' : '(' + _.t('install.scope.user') + ')';
              ver.appendChild(scopeTag);
            }
            meta.appendChild(title);
            meta.appendChild(ver);
            wrapper.appendChild(img);
            wrapper.appendChild(meta);
            dom.updatedAppsIcons.appendChild(wrapper);
          });
        }
      } else {
        if (hasStructure) {
          if (dom.updateFinalMessage) dom.updateFinalMessage.textContent = _.t('updates.none');
        } else {
          if (dom.updateFinalMessage) dom.updateFinalMessage.textContent = _.t('updates.done');
        }
        if (dom.updatedAppsIcons) dom.updatedAppsIcons.innerHTML = '';
      }
      if (dom.updateResult) dom.updateResult.style.display = 'block';
      setTimeout(function () { _.loadApps().then(_.applySearch); }, 400);
    }

    async function refreshAfterUpdates() {
      if (_.electronAPI && typeof _.electronAPI.deleteCategoriesCache === 'function') {
        await _.electronAPI.deleteCategoriesCache();
      }
      if (_.categories && typeof _.categories.resetCache === 'function') {
        _.categories.resetCache();
      }
      if (_.categories && typeof _.categories.loadCategories === 'function') {
        await _.categories.loadCategories({ showToast: _.showToast });
      }
      _.showToast(_.t('toast.refreshing'));
      await _.loadApps();
      _.applySearch();
      try {
        var needs = _.getAllApps().some(function (a) { return a.installed && (!a.version || String(a.version).toLowerCase().includes('unsupported')); });
        if (needs) {
          await new Promise(function (r) { return setTimeout(r, 3000); });
          await _.loadApps();
          _.applySearch();
        }
      } catch (e) {}
    }

    async function fetchUpdatesOutput() {
      if (hasUpdatesStreamingSupport()) {
        try {
          return await startUpdatesStream();
        } catch (err) {
          if (err?.error === 'external-update-running' || err?.message === 'external-update-running') throw err;
          console.warn('Streaming updates failed, fallback to updates-bulk', err);
          activeUpdateStreamId = null;
        }
      }
      if (!_.electronAPI?.updatesBulk) return { output: '' };
      var res = await _.electronAPI.updatesBulk();
      if (res?.error === 'external-update-running') throw new Error('external-update-running');
      var output = res?.output || (typeof res === 'string' ? res : '');
      if (output) {
        revealUpdatesTerminal();
        resetUpdatesTerminal();
        appendUpdatesTerminalChunk(output);
      }
      return { output: output };
    }

    // ==========================================================
    // Event listeners
    // ==========================================================

    dom.updatesToggleBtn?.addEventListener('click', function () {
      setUpdatesTerminalExpanded(!updatesTerminalExpanded);
    });

    _.electronAPI?.onUpdatesProgress?.(function (msg) {
      if (!msg || !msg.id) return;
      if (activeUpdateStreamId && msg.id !== activeUpdateStreamId) {
        if (msg.kind === 'done') resolveUpdateWaiter(msg, false);
        if (msg.kind === 'error') resolveUpdateWaiter(msg, true);
        return;
      }
      switch (msg.kind) {
        case 'start':
          activeUpdateStreamId = msg.id;
          updatesStreamBuffer = '';
          revealUpdatesTerminal();
          resetUpdatesTerminal();
          appendUpdatesTerminalChunk('\x1b[36m' + (_.t('updates.logHeader') || 'am -u') + '\x1b[0m\r\n');
          break;
        case 'data':
          if (typeof msg.chunk === 'string') {
            updatesStreamBuffer += msg.chunk;
            appendUpdatesTerminalChunk(msg.chunk);
          }
          break;
        case 'done':
          appendUpdatesTerminalChunk('\r\n\x1b[32m' + (_.t('updates.logCompleted') || 'Completed') + ' (code ' + (typeof msg.code === 'number' ? msg.code : 0) + ')\x1b[0m\r\n');
          resolveUpdateWaiter(Object.assign({}, msg, { output: updatesStreamBuffer }), false);
          activeUpdateStreamId = null;
          break;
        case 'error':
          appendUpdatesTerminalChunk('\r\n\x1b[31m' + (msg.message || (_.t('updates.error') || 'Erreur')) + '\x1b[0m\r\n');
          resolveUpdateWaiter(Object.assign({}, msg, { output: updatesStreamBuffer }), true);
          activeUpdateStreamId = null;
          break;
      }
    });

    dom.runUpdatesBtn?.addEventListener('click', async function () {
      if (dom.runUpdatesBtn.disabled) return;
      _.setUpdateInProgress(true);
      _.showToast(_.t('toast.updating'));
      setUpdateSpinnerBusy(true);
      if (dom.updateResult) dom.updateResult.style.display = 'none';
      if (dom.updateFinalMessage) dom.updateFinalMessage.textContent = '';
      if (dom.updatedAppsIcons) dom.updatedAppsIcons.innerHTML = '';
      dom.runUpdatesBtn.disabled = true;
      try {
        var startTime = performance.now();
        var result = await fetchUpdatesOutput();
        var raw = typeof result?.output === 'string' ? result.output : '';
        handleUpdateCompletion(raw);
        var dur = Math.round((performance.now() - startTime) / 1000);
        if (dom.updateFinalMessage && dom.updateFinalMessage.textContent) dom.updateFinalMessage.textContent += _.t('updates.duration', { dur: dur });
        setUpdateSpinnerBusy(false);
        await refreshAfterUpdates();
      } catch (err) {
        console.error('Updates failed', err);
        if (err?.error === 'external-update-running' || err?.message === 'external-update-running') {
          _.showToast(_.t('toast.updateAlreadyRunning'));
          if (dom.updateFinalMessage) dom.updateFinalMessage.textContent = _.t('toast.updateAlreadyRunningDetail');
        } else {
          _.showToast(_.t('toast.updateFailed') || _.t('error.global', { msg: 'Update failed' }));
          if (dom.updateFinalMessage) dom.updateFinalMessage.textContent = _.t('updates.error') || _.t('error.global', { msg: 'Error during update' });
        }
        if (dom.updateResult) dom.updateResult.style.display = 'block';
      } finally {
        _.setUpdateInProgress(false);
        setUpdateSpinnerBusy(false);
        dom.runUpdatesBtn.disabled = false;
      }
    });

    // ==========================================================
    // Public API
    // ==========================================================

    return {
      setSpinnerBusy: setUpdateSpinnerBusy,
      getSpinnerBusy: function () { return updateSpinnerBusy; }
    };
  }

  namespace.updates = { init: init, stripAnsiSequences: stripAnsiSequences };
})();
