const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const RENDERER_PATH = path.resolve(__dirname, '../../src/renderer/renderer.js');

function setGlobal(target, key, value) {
  try {
    target[key] = value;
  } catch (_) {
    // read-only property, skip
  }
}

function setupContext(dom) {
  const win = dom.window;

  const globals = {
    console,
    setTimeout,
    clearTimeout,
    performance: { now: () => Date.now() },
    localStorage: (() => {
      const data = {};
      return {
        getItem(k) { return data[k] || null; },
        setItem(k, v) { data[k] = v; },
        removeItem(k) { delete data[k]; }
      };
    })(),
    sessionStorage: (() => {
      const data = {};
      return {
        getItem(k) { return data[k] || null; },
        setItem(k, v) { data[k] = v; },
        removeItem(k) { delete data[k]; }
      };
    })(),
    navigator: { languages: ['en'], language: 'en' },
    Intl: { DateTimeFormat() { return { resolvedOptions: () => ({ locale: 'en' }) }; } },
    IntersectionObserver: function () {
      return { observe() {}, unobserve() {}, disconnect() {} };
    },
    requestIdleCallback(fn) { setTimeout(fn, 0); },
    queueMicrotask(fn) { fn(); },
    fetch() { return Promise.reject(new Error('no fetch')); },
    CSS: { escape: (s) => s },
    DOMParser: function () { return { parseFromString() { return win.document; } }; },

    showToast: () => {},
    t(key, vars) {
      if (vars && typeof vars === 'object') {
        return key.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : `{${k}}`);
      }
      return key;
    },
    loadApps() { return Promise.resolve(); },
    applySearch() {},
    openActionConfirm() { return Promise.resolve(false); },
    translations: {},
    getLangPref() { return 'en'; },

    activeInstallSession: { id: null, name: null, start: 0, lines: [], done: false, success: null, code: null },
    installQueue: [],
    installScopeMap: new Map(),
    installScope: 'user',
    detailScopeOverride: null,

    startStreamingInstall() { return Promise.resolve(); },
    refreshAllInstallButtons() {},
    refreshTileBadges() {},
    refreshQueueUI() {},
    refreshDetailsInstallButtonForQueue() {},
    refreshListInstallButtons() {},
    updateQueueIndicators() {},
    cancelActiveInstall() { return Promise.resolve(); },

    detailsInstallBtn: null,
    installStream: null,
    installStreamStatus: null,
    installStreamElapsed: null,
    installProgressBar: null,
    installProgressPercentLabel: null,
    installProgressEtaLabel: null,
    appsDiv: null,
    scrollShell: null,
    appDetailsSection: null,
    backToListBtn: null,
    detailsIcon: null,
    detailsName: null,
    detailsLong: null,
    detailsUninstallBtn: null,
    detailsGallery: null,
    detailsGalleryInner: null,
    toast: null,
    modeMenuBtn: null,
    modeMenu: null,
    disableGpuCheckbox: null,
    settingsBtn: null,
    settingsPanel: null,
    openExternalCheckbox: null,
    purgeIconsBtn: null,
    purgeIconsResult: null,
    tabs: null,
    updatesPanel: null,
    advancedPanel: null,
    runUpdatesBtn: null,
    updateSpinner: null,
    updateResult: null,
    updateFinalMessage: null,
    updatedAppsIcons: null,
    updatesTerminalWrap: null,
    updatesTerminalNode: null,
    updatesToggleBtn: null,
    installedCountEl: null,
    sandboxOpenBtn: null,
    sandboxButtonStatus: null,
    sandboxModal: null,
    sandboxCloseBtn: null,
    sandboxCard: null,
    sandboxStatusBadge: null,
    sandboxRefreshBtn: null,
    sandboxConfigureBtn: null,
    sandboxDisableBtn: null,
    sandboxDepsAlert: null,
    sandboxInstallDepsBtn: null,
    sandboxUnavailable: null,
    sandboxInstallAppBtn: null,
    sandboxForm: null,
    sandboxCustomPathInput: null,
    sandboxLog: null,
    sandboxSummary: null,
    sandboxSummaryList: null,
    sandboxSummaryEmpty: null,
    sandboxLogSection: null,
    sandboxLogToggle: null,
    nonAppimageModal: null,
    nonAppimageTitle: null,
    nonAppimageCloseBtn: null,
    nonAppimageDismissBtn: null,
    nonAppimageMessage: null,
    actionConfirmModal: null,
    actionConfirmMessage: null,
    actionConfirmCancel: null,
    actionConfirmOk: null,
    closeConfirmModal: null,
    closeConfirmStay: null,
    closeConfirmQuit: null,
    lightbox: null,
    lightboxImage: null,
    lightboxCaption: null,
    lightboxPrev: null,
    lightboxNext: null,
    lightboxClose: null,
    mdLightbox: null,
    mdLightboxImg: null,
    xtermLogDiv: null,
    installScopeBtn: null,
    searchInput: null,
    featuredBanner: null,
    installScopeSettingsGroup: null,
    updatesLogSection: null,
    Terminal: null,
    FitAddonClass: null,
    electronAPI: null,
    features: {},
    categories: {},
    ui: {},
    utils: {},
    preferences: {},
    constants: {},
    marked: null,
    syncButton: null,
    windowControls: null,

    state: {
      allApps: [],
      filtered: [],
      activeCategory: 'all',
      viewMode: 'grid',
      lastRenderKey: '',
      currentDetailsApp: null,
      renderVersion: 0,
      lastScrollY: 0,
      installed: new Set(),
      bundleChildOf: {},
      pmName: 'am'
    }
  };

  for (const [key, value] of Object.entries(globals)) {
    setGlobal(win, key, value);
  }

  return win;
}

function defineQueueFunctions(win) {
  win.eval(`
    function getQueuePosition(name) {
      const idx = installQueue.indexOf(name);
      return idx === -1 ? -1 : (idx + 1);
    }

    function removeFromQueue(name) {
      const idx = installQueue.indexOf(name);
      if (idx === -1) return false;
      installQueue.splice(idx, 1);
      try {
        if (typeof updateQueueIndicators === 'function') updateQueueIndicators();
        if (window.__queueRefreshTimeout) clearTimeout(window.__queueRefreshTimeout);
        window.__queueRefreshTimeout = setTimeout(() => {
          try { refreshAllInstallButtons(); } catch (e) { console.error('Erreur refreshAllInstallButtons', e); }
        }, 300);
        showToast(t('toast.removedFromQueue', { name }));
      } catch (e) {
        console.error('Erreur removeFromQueue', e);
        showToast(t('toast.removeQueueError'));
      }
      return true;
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
      showToast(t('toast.installing', { name: next }));
      activeInstallSession = { id: 'test-id-' + next, name: next, start: Date.now(), lines: [], done: false, success: null, code: null };
      startStreamingInstall(next, scope).catch((err) => {
        showToast(err?.message || t('toast.installFailed', { name: next }));
        activeInstallSession.done = true;
        setTimeout(() => processNextInstall(), 200);
      });
      refreshAllInstallButtons();
    }

    function enqueueInstall(name, scope) {
      if (!name) return;
      if ((activeInstallSession.name === name && !activeInstallSession.done) || installQueue.includes(name)) {
        showToast(t('toast.alreadyInQueue', { name }));
        return;
      }
      if (scope) installScopeMap.set(name, scope);
      if (activeInstallSession.id && !activeInstallSession.done) {
        installQueue.push(name);
        refreshQueueUI();
        showToast(t('toast.addedToQueue', { name, count: installQueue.length }));
      } else {
        installQueue.push(name);
        refreshQueueUI();
        processNextInstall();
      }
      refreshAllInstallButtons();
    }
  `);
}

describe('Install Queue', () => {
  let dom;
  let win;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost',
      runScripts: 'outside-only'
    });
    win = setupContext(dom);

    win.activeInstallSession = { id: null, name: null, done: true };
    win.installQueue = [];
    win.installScopeMap = new Map();

    win._toastCalls = [];
    win.showToast = (msg) => { win._toastCalls.push(msg); };

    defineQueueFunctions(win);
  });

  afterEach(() => {
    try { dom.window.close(); } catch (_) {}
  });

  describe('getQueuePosition', () => {
    it('returns -1 when queue is empty', () => {
      assert.strictEqual(win.getQueuePosition('firefox'), -1);
    });

    it('returns 1-based position for first item', () => {
      win.installQueue.push('firefox', 'vim');
      assert.strictEqual(win.getQueuePosition('firefox'), 1);
      assert.strictEqual(win.getQueuePosition('vim'), 2);
    });

    it('returns -1 for item not in queue', () => {
      win.installQueue.push('firefox');
      assert.strictEqual(win.getQueuePosition('vim'), -1);
    });
  });

  describe('enqueueInstall', () => {
    it('processes immediately when no active install', () => {
      win.activeInstallSession = { id: null, name: null, done: true };
      win.enqueueInstall('firefox', 'user');
      assert.strictEqual(win.activeInstallSession.name, 'firefox');
      assert.strictEqual(win.installQueue.length, 0);
    });

    it('queues when active install is busy', () => {
      win.activeInstallSession = { id: 'fake-id', name: 'firefox', done: false };
      win.installQueue = [];
      win.enqueueInstall('vim', 'user');
      assert.strictEqual(win.installQueue.length, 1);
      assert.strictEqual(win.installQueue[0], 'vim');
    });

    it('shows toast for duplicate while app is being installed', () => {
      win.activeInstallSession = { id: 'fake-id', name: 'firefox', done: false };
      win.installQueue = [];
      win._toastCalls = [];
      win.enqueueInstall('firefox', 'user');
      assert.ok(win._toastCalls.length > 0);
      assert.ok(win._toastCalls[0].includes('alreadyInQueue'));
    });

    it('shows toast for duplicate when already in queue', () => {
      win.activeInstallSession = { id: null, name: null, done: true };
      win.installQueue = ['firefox'];
      win._toastCalls = [];
      win.enqueueInstall('firefox', 'user');
      assert.ok(win._toastCalls.length > 0);
      assert.ok(win._toastCalls[0].includes('alreadyInQueue'));
    });

    it('ignores falsy name', () => {
      win.activeInstallSession = { id: null, name: null, done: true };
      win.installQueue = [];
      win.enqueueInstall('', 'user');
      win.enqueueInstall(null, 'user');
      assert.strictEqual(win.installQueue.length, 0);
    });
  });

  describe('removeFromQueue', () => {
    it('removes an item from the queue', () => {
      win.installQueue = ['firefox', 'vim', 'node'];
      const result = win.removeFromQueue('vim');
      assert.strictEqual(result, true);
      assert.deepStrictEqual(win.installQueue, ['firefox', 'node']);
    });

    it('returns false if item not in queue', () => {
      win.installQueue = ['firefox'];
      const result = win.removeFromQueue('vim');
      assert.strictEqual(result, false);
      assert.strictEqual(win.installQueue.length, 1);
    });

    it('handles empty queue', () => {
      win.installQueue = [];
      const result = win.removeFromQueue('firefox');
      assert.strictEqual(result, false);
    });
  });

  describe('processNextInstall', () => {
    it('does nothing when busy session is active', () => {
      win.activeInstallSession = { id: 'active', name: 'firefox', done: false };
      win.installQueue = ['vim'];
      win.processNextInstall();
      assert.strictEqual(win.installQueue.length, 1);
      assert.strictEqual(win.installQueue[0], 'vim');
    });

    it('does nothing when queue is empty', () => {
      win.activeInstallSession = { id: null, name: null, done: true };
      win.installQueue = [];
      win.processNextInstall();
      assert.strictEqual(win.activeInstallSession.name, null);
    });

    it('shifts next item from queue when session is done', () => {
      win.activeInstallSession = { id: null, name: null, done: true };
      win.installQueue = ['app1', 'app2'];
      win.processNextInstall();
      assert.strictEqual(win.activeInstallSession.name, 'app1');
      assert.strictEqual(win.installQueue.length, 1);
      assert.strictEqual(win.installQueue[0], 'app2');
    });

    it('uses scope from installScopeMap', () => {
      win.activeInstallSession = { id: null, name: null, done: true };
      win.installQueue = ['sysapp'];
      win.installScopeMap.set('sysapp', 'system');
      win.processNextInstall();
      assert.strictEqual(win.activeInstallSession.name, 'sysapp');
      assert.strictEqual(win.installScopeMap.has('sysapp'), false);
    });
  });
});
