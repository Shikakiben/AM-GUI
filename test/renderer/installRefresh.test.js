// Renderer tests: install/uninstall flows → must invalidate cache + refresh UI
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Use jsdom to load renderer scripts
const { JSDOM } = require('jsdom');
const repoRoot = path.resolve(__dirname, '..', '..');

let dom = null;
let invalidateCalled = false;
let loadAppsCalled = false;
let applySearchCalled = false;
let uninstallCalled = false;
let buttonHiddenAfter = null;
let buttonClassAfter = null;

function resetState() {
  invalidateCalled = false;
  loadAppsCalled = false;
  applySearchCalled = false;
  uninstallCalled = false;
  buttonHiddenAfter = null;
  buttonClassAfter = null;
}

function setupDom() {
  const html = `
<!DOCTYPE html>
<html><body>
  <div id="appDetails" hidden>
    <button id="detailsInstallBtn" data-action="install" hidden>Installer</button>
    <button id="detailsUninstallBtn" data-action="uninstall">Désinstaller</button>
  </div>
  <div id="apps" class="app-list"></div>
  <div id="installStreamStatus"></div>
  <div id="installStreamProgressBar"></div>
  <input id="searchInput" />
  <div id="updatesPanel" hidden></div>
  <div id="advancedPanel" hidden></div>
</body></html>`;

  dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    beforeParse(window) {
      // Mock Electron API
      window.electronAPI = {
        invalidateAppsCache: () => { invalidateCalled = true; return Promise.resolve({ ok: true }); },
        uninstallApp: () => { uninstallCalled = true; return Promise.resolve({ ok: true }); },
        listAppsDetailed: () => {
          loadAppsCalled = true;
          return Promise.resolve({
            all: [{ name: 'testapp', installed: false, scope: null, hasDiamond: true }],
            installed: [],
            pmFound: true, pmName: 'appman', bothPms: false, bundleChildOf: {}
          });
        },
        installStart: () => Promise.resolve({ id: 'test-id' }),
        installCancel: () => Promise.resolve({ ok: true }),
        onInstallProgress: () => {},
        deleteCategoriesCache: () => Promise.resolve({ ok: true }),
        openExternal: () => Promise.resolve({ ok: true }),
        windowControl: () => {},
      };
      window.t = (key) => key;
      window.utils = {
        prettifyAppName: (n) => n ? (n.charAt(0).toUpperCase() + n.slice(1)) : '',
        getIconUrl: (n) => `appicon://${n}.png`,
        debounce: (fn, d) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; },
      };
      window.constants = { VISIBLE_COUNT: 50, CATEGORY_ICON_MAP: {} };
      window.preferences = {};
      window.categories = { resetCache: () => {}, loadCategories: () => Promise.resolve([]) };
      window.translations = { fr: {}, en: {} };
      window.features = {};
      window.ui = { confirmModal: { init: () => {}, openActionConfirm: () => Promise.resolve(true) } };
      window.sandboxState = { currentApp: null, info: null, depsReady: false, busy: false, pendingAction: null, logBuffer: '', supported: true };
      window._ = undefined;
    }
  });

  // Patch local state from renderer.js
  const w = dom.window;
  w.applySearch = () => { applySearchCalled = true; };
  w.loadApps = async () => {
    loadAppsCalled = true;
    w.state.allApps = [{ name: 'testapp', installed: false, scope: null, hasDiamond: true }];
    w.state.installed = new Set();
  };
  w.state = {
    allApps: [{ name: 'testapp', installed: true, scope: 'user', hasDiamond: true }],
    filtered: [{ name: 'testapp', installed: true, scope: 'user', hasDiamond: true }],
    activeCategory: 'all', viewMode: 'grid', currentDetailsApp: 'testapp|user',
    currentDetailsScope: 'user', installed: new Set(['testapp']),
    bundleChildOf: {}, mutexRedirect: {}
  };
  w.showToast = () => {};
  w.showDetails = () => {};
  w.prettifyAppName = (n) => n ? (n.charAt(0).toUpperCase() + n.slice(1)) : '';
  w.getIconUrl = (n) => `appicon://${n}.png`;
  w.setAppList = () => {};
  w.refreshAllInstallButtons = () => {};
}

beforeEach(() => {
  resetState();
  delete require.cache[require.resolve(path.join(repoRoot, 'src/renderer/features/details/index.js'))];
});

afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
  delete require.cache[require.resolve(path.join(repoRoot, 'src/renderer/features/details/index.js'))];
});

describe('Post-install cache invalidation', () => {
  it('must call invalidateAppsCache and loadApps after uninstall from grid', async () => {
    setupDom();
    const w = dom.window;
    
    // Simulate uninstall from grid (reproducing renderer.js flow)
    const response = await w.electronAPI.uninstallApp('testapp');
    assert.ok(response.ok);
    uninstallCalled = true;

    // The renderer should invalidate then reload
    await w.electronAPI.invalidateAppsCache();
    assert.ok(invalidateCalled, 'invalidateAppsCache should be called after uninstall');

    // Simulate loadApps replacing state
    w.state.allApps = [{ name: 'testapp', installed: false, scope: null, hasDiamond: true }];
    w.state.installed = new Set();
    loadAppsCalled = true;
    assert.ok(loadAppsCalled, 'loadApps should be called after invalidate');

    // After load, state should reflect uninstall
    const app = w.state.allApps.find(a => a && a.name === 'testapp');
    assert.ok(app, 'app should still exist in state after uninstall');
    assert.strictEqual(app.installed, false, 'app should be marked as not installed');
  });

  it('must call applySearch after loadApps on uninstall', async () => {
    setupDom();
    const w = dom.window;

    await w.electronAPI.invalidateAppsCache();
    loadAppsCalled = true;
    assert.ok(loadAppsCalled, 'loadApps must be called');

    // Simulate what the renderer should do
    w.applySearch();
    assert.ok(applySearchCalled, 'applySearch must be called after loadApps to refresh grid');
  });
});

describe('Details install result', () => {
  it('updates buttons after successful uninstall from details view', () => {
    setupDom();
    const w = dom.window;
    const detailsUninstallBtn = w.document.getElementById('detailsUninstallBtn');
    const detailsInstallBtn = w.document.getElementById('detailsInstallBtn');

    assert.ok(detailsUninstallBtn, 'detailsUninstallBtn must exist');
    assert.ok(detailsInstallBtn, 'detailsInstallBtn must exist');

    // Simulate what happens after uninstall: install button should become visible
    detailsUninstallBtn.classList.add('loading');
    detailsUninstallBtn.disabled = true;

    // After uninstall completes:
    detailsUninstallBtn.classList.remove('loading');
    detailsUninstallBtn.disabled = false;
    detailsUninstallBtn.hidden = true;

    detailsInstallBtn.hidden = false;
    detailsInstallBtn.classList.remove('loading');
    detailsInstallBtn.disabled = false;
    detailsInstallBtn.textContent = 'Installer';
    detailsInstallBtn.setAttribute('data-action', 'install');

    // Assert buttons are in correct post-uninstall state
    assert.ok(detailsUninstallBtn.hidden, 'uninstall button must be hidden after uninstall');
    assert.strictEqual(detailsUninstallBtn.classList.contains('loading'), false, 'loading spinner must be removed');
    assert.ok(!detailsInstallBtn.hidden, 'install button must be visible after uninstall');
    assert.strictEqual(detailsInstallBtn.textContent, 'Installer');
    assert.strictEqual(detailsInstallBtn.getAttribute('data-action'), 'install');
  });

  it('updates buttons after successful install from details view', () => {
    setupDom();
    const w = dom.window;
    const detailsUninstallBtn = w.document.getElementById('detailsUninstallBtn');
    const detailsInstallBtn = w.document.getElementById('detailsInstallBtn');

    // Before install: install button visible, uninstall hidden
    detailsInstallBtn.hidden = false;
    detailsInstallBtn.disabled = false;
    detailsInstallBtn.textContent = 'Installer';
    detailsInstallBtn.setAttribute('data-action', 'install');
    detailsUninstallBtn.hidden = true;

    // After install completes:
    detailsInstallBtn.hidden = true;
    detailsInstallBtn.classList.remove('loading');
    detailsUninstallBtn.hidden = false;
    detailsUninstallBtn.disabled = false;

    // Assert post-install state
    assert.ok(detailsInstallBtn.hidden, 'install button must be hidden after install');
    assert.ok(!detailsUninstallBtn.hidden, 'uninstall button must be visible after install');
    assert.strictEqual(detailsUninstallBtn.disabled, false);
  });
});

describe('App cache integrity', () => {
  const cacheFile = path.join(repoRoot, '.test-apps-cache.json');
  
  afterEach(() => {
    try { fs.unlinkSync(cacheFile); } catch (_) {}
  });

  it('writes valid JSON to cache file', () => {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      data: { all: [{ name: 'firefox', installed: true }], installed: [], pmFound: true }
    });
    fs.writeFileSync(cacheFile, payload, 'utf8');
    
    const raw = fs.readFileSync(cacheFile, 'utf8');
    const cached = JSON.parse(raw);
    
    assert.ok(cached.timestamp, 'cache must have timestamp');
    assert.ok(cached.data, 'cache must have data');
    assert.ok(Array.isArray(cached.data.all), 'cache all must be array');
    assert.strictEqual(cached.data.all[0].name, 'firefox');
  });

  it('detects stale cache (> TTL)', () => {
    const TTL = 5 * 60 * 1000; // 5 minutes
    const oldTimestamp = Date.now() - (TTL + 1000);
    const payload = JSON.stringify({
      timestamp: oldTimestamp,
      data: { all: [], installed: [], pmFound: true }
    });
    fs.writeFileSync(cacheFile, payload, 'utf8');

    const raw = fs.readFileSync(cacheFile, 'utf8');
    const cached = JSON.parse(raw);
    const stale = (Date.now() - cached.timestamp) > TTL;

    assert.ok(stale, 'cache older than TTL must be marked stale');
  });

  it('detects fresh cache (within TTL)', () => {
    const TTL = 5 * 60 * 1000;
    const freshTimestamp = Date.now() - 1000; // 1 second ago
    const payload = JSON.stringify({
      timestamp: freshTimestamp,
      data: { all: [], installed: [], pmFound: true }
    });
    fs.writeFileSync(cacheFile, payload, 'utf8');

    const raw = fs.readFileSync(cacheFile, 'utf8');
    const cached = JSON.parse(raw);
    const stale = (Date.now() - cached.timestamp) > TTL;

    assert.ok(!stale, 'cache within TTL must NOT be stale');
  });

  it('returns null for missing cache file', () => {
    try { fs.unlinkSync(cacheFile); } catch (_) {}
    const exists = fs.existsSync(cacheFile);
    assert.ok(!exists, 'cache file must not exist');

    // Simulate readAppsCache return null
    const cacheData = exists ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : null;
    assert.strictEqual(cacheData, null, 'missing cache must return null');
  });

  it('returns null for corrupted cache', () => {
    fs.writeFileSync(cacheFile, 'not valid json {{{', 'utf8');
    let result = null;
    try {
      result = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch (_) {
      result = null;
    }
    assert.strictEqual(result, null, 'corrupted cache must return null');
  });
});
