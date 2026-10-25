// Renderer regression tests for two refresh bugs reported after using the app:
//
// 1. After uninstalling from the details view, the Install button came back but
//    the Launch button stayed visible until the view was reopened.
// 2. After an install, the description was replaced by
//    "Fetching remote description..." and never loaded: the installer module had
//    captured a copy of showDetails before the details module existed, so it
//    called the legacy version, which sets the placeholder and fetches nothing.
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const DETAILS_SRC = fs.readFileSync(path.join(ROOT, 'src/renderer/features/details/index.js'), 'utf8');

let dom = null;

afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
});

function makeWindow(overrides = {}) {
  dom = new JSDOM(
    `<!DOCTYPE html><html><body class="details-mode">
      <section id="appDetails">
        <button id="detailsLaunchBtn" hidden></button>
        <button id="detailsInstallBtn" hidden></button>
        <button id="detailsUninstallBtn"></button>
        <div id="detailsName"></div>
        <div id="detailsLong"></div>
      </section>
    </body></html>`,
    {
      url: 'http://localhost',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.t = (key, vars) => {
          let out = key;
          if (vars) for (const [k, v] of Object.entries(vars)) out = out.split('{' + k + '}').join(v);
          return out;
        };
        window.marked = { parse: (md) => `<p>${md}</p>` };
        window.utils = { prettifyAppName: (n) => n };
        window.fetch = async () => ({
          ok: true,
          status: 200,
          json: async () => ({ name: 'testapp', description: 'A real description.', screenshots: [] })
        });
        window.electronAPI = {
          uninstallApp: () => Promise.resolve({ ok: true }),
          invalidateAppsCache: () => Promise.resolve({ ok: true }),
          launchApp: () => Promise.resolve({ ok: true })
        };
        window.ui = window.ui || {};
      }
    }
  );
  const window = dom.window;
  window.eval(DETAILS_SRC);
  return window;
}

function initDetails(window, options = {}) {
  const state = {
    allApps: [{ name: 'testapp', installed: true, scope: 'user' }],
    currentDetailsApp: 'testapp|user',
    currentDetailsScope: 'user'
  };
  const api = window.features.details.init(Object.assign({
    state,
    translate: window.t,
    showToast: () => {},
    loadApps: async () => {},
    applySearch: () => {},
    openActionConfirm: () => Promise.resolve(true),
    refreshAllInstallButtons: () => {}
  }, options));
  return { api, state };
}

describe('uninstall from the details view', () => {
  it('hides the Launch button as well as showing Install again', async () => {
    const window = makeWindow();
    const { api, state } = initDetails(window);
    const doc = window.document;
    const launchBtn = doc.getElementById('detailsLaunchBtn');
    const installBtn = doc.getElementById('detailsInstallBtn');
    const uninstallBtn = doc.getElementById('detailsUninstallBtn');

    api.showDetails('testapp|user');
    await new Promise((r) => window.setTimeout(r, 10));
    assert.strictEqual(launchBtn.hidden, false, 'Launch is visible while installed');
    assert.strictEqual(installBtn.hidden, true);

    // The uninstall flow reloads the list, which now reports the app as removed.
    state.allApps = [{ name: 'testapp', installed: false, scope: null }];
    uninstallBtn.click();
    await new Promise((r) => window.setTimeout(r, 30));

    assert.strictEqual(uninstallBtn.hidden, true, 'Uninstall disappears');
    assert.strictEqual(installBtn.hidden, false, 'Install comes back');
    assert.strictEqual(launchBtn.hidden, true, 'Launch must disappear with it');
  });
});

describe('description after a refresh', () => {
  // The bug: the installer module called a showDetails captured before the
  // details module existed. That legacy version only writes the placeholder and
  // never fetches, so the description stayed on "Fetching..." forever.
  // Reproduce the two entry points and prove only one of them fetches.
  it('the details module fetches; the legacy placeholder path does not', async () => {
    const window = makeWindow();
    let fetchCount = 0;
    window.fetch = async () => {
      fetchCount += 1;
      return { ok: true, status: 200, json: async () => ({ description: 'A real description.', screenshots: [] }) };
    };
    const { api } = initDetails(window);
    const doc = window.document;

    // 1. the real path fetches and renders
    api.showDetails('testapp|user');
    await new Promise((r) => window.setTimeout(r, 10));
    assert.strictEqual(fetchCount, 1, 'the details module must fetch the description');
    assert.ok(doc.getElementById('detailsLong').textContent.includes('A real description.'));

    // 2. the legacy path only writes the placeholder: no fetch at all, which is
    //    exactly the symptom reported (text stuck on "Fetching...").
    doc.getElementById('detailsLong').textContent = 'details.loadingDesc';
    const before = fetchCount;
    await new Promise((r) => window.setTimeout(r, 10));
    assert.strictEqual(fetchCount, before, 'nothing fetches without going through the module');
    assert.ok(doc.getElementById('detailsLong').textContent.includes('details.loadingDesc'),
      'this is the stuck state the installer used to trigger');
  });
});

describe('installer refresh keeps the Launch button in step', () => {
  const INSTALLER_SRC = fs.readFileSync(path.join(ROOT, 'src/renderer/features/installer/index.js'), 'utf8');

  function initInstaller(window, state) {
    window.eval(INSTALLER_SRC);
    return window.features.installer.init({
      dom: {
        detailsInstallBtn: window.document.getElementById('detailsInstallBtn'),
        detailsLaunchBtn: window.document.getElementById('detailsLaunchBtn'),
        detailsUninstallBtn: window.document.getElementById('detailsUninstallBtn'),
        detailsName: window.document.getElementById('detailsName')
      },
      state,
      t: window.t,
      showToast: () => {},
      prettifyAppName: (n) => n,
      getIconUrl: (n) => `appicon://${n}.png`,
      loadApps: async () => {},
      applySearch: () => {},
      showDetails: () => {},
      electronAPI: window.electronAPI,
      openActionConfirm: () => Promise.resolve(true)
    });
  }

  it('shows Launch after an install and hides it after an uninstall', () => {
    const window = makeWindow();
    const doc = window.document;
    const launchBtn = doc.getElementById('detailsLaunchBtn');
    const installBtn = doc.getElementById('detailsInstallBtn');
    installBtn.setAttribute('data-name', 'testapp');

    const state = { allApps: [{ name: 'testapp', installed: false }], installed: new Set() };
    const installer = initInstaller(window, state);

    // Not installed yet: Launch must stay hidden.
    installer.refreshAllInstallButtons();
    assert.strictEqual(launchBtn.hidden, true, 'no Launch button for a missing app');

    // The install finished and the list was reloaded.
    state.allApps = [{ name: 'testapp', installed: true }];
    installer.refreshAllInstallButtons();
    assert.strictEqual(launchBtn.hidden, false, 'Launch appears once installed without reopening the view');

    // Uninstalled again.
    state.allApps = [{ name: 'testapp', installed: false }];
    installer.refreshAllInstallButtons();
    assert.strictEqual(launchBtn.hidden, true, 'Launch disappears once uninstalled');
  });
});
