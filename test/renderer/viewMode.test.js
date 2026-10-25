// View mode switching must rebuild the tiles.
//
// The tile markup depends on the mode: only the list view builds the .actions
// block that carries the Launch button (issue #97). Switching back to grid
// without a re-render left those buttons behind on the tiles until the view was
// reopened.
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const VIRTUALLIST_SRC = fs.readFileSync(path.join(ROOT, 'src/renderer/ui/virtualList.js'), 'utf8');
const RENDERER_SRC = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');

let dom = null;
afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
});

function setup() {
  dom = new JSDOM(
    `<!DOCTYPE html><html><body class="view-list">
      <div id="apps"></div>
      <div class="scroll-shell"></div>
      <div id="modeMenu" hidden>
        <button class="mode-option" data-mode="grid">Grille</button>
        <button class="mode-option" data-mode="list">Liste</button>
      </div>
    </body></html>`,
    { url: 'http://localhost', runScripts: 'dangerously' }
  );
  const w = dom.window;
  w.t = (key, vars) => {
    const table = {
      'details.launch': 'Lancer',
      'installed.badge': 'installed',
      'installed.localDesc': 'local',
      'installed.availableDesc': 'available'
    };
    let out = table[key] || key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split('{' + k + '}').join(v);
    return out;
  };
  w.eval(VIRTUALLIST_SRC);
  return w;
}

function initList(w) {
  const state = { viewMode: 'list', allApps: [], filtered: [], installed: new Set(['app1']) };
  const appsDiv = w.document.getElementById('apps');
  const api = w.ui.virtualList.init({
    state,
    appsDiv,
    scrollShell: w.document.querySelector('.scroll-shell'),
    t: w.t,
    prettify: (n) => n,
    getIconUrl: (n) => 'x.png',
    getActiveInstallSession: () => ({}),
    getQueuePosition: () => -1,
    isSandboxed: () => false,
    applySandboxBadge: () => {},
    showDetails: () => {},
    documentRef: w.document,
    windowRef: w,
    VISIBLE_COUNT: 50
  });
  return { state, appsDiv, api };
}

describe('view mode and the Launch button', () => {
  it('builds the actions block in list view only', () => {
    const w = setup();
    const { state, appsDiv, api } = initList(w);

    api.setAppList([{ name: 'app1', installed: true }]);
    assert.strictEqual(appsDiv.querySelectorAll('.actions').length, 1, 'list view builds .actions');
    assert.strictEqual(appsDiv.querySelectorAll('.inline-action.launch').length, 1, 'list view shows Launch');

    state.viewMode = 'grid';
    api.setAppList([{ name: 'app1', installed: true }]);
    assert.strictEqual(appsDiv.querySelectorAll('.actions').length, 0, 'grid view must not keep .actions');
    assert.strictEqual(appsDiv.querySelectorAll('.inline-action.launch').length, 0, 'no Launch button in grid view');
  });

  it('the mode menu re-renders the list instead of leaving stale tiles', () => {
    // Source-level guard: the click handler used to set the mode and stop there.
    const start = RENDERER_SRC.indexOf("opt.addEventListener('click'");
    assert.ok(start > 0, 'mode option handler found');
    const block = RENDERER_SRC.slice(start, start + 900);
    assert.ok(
      /rerenderActiveCategory|applySearch|setAppList/.test(block),
      'changing the view mode must trigger a re-render, otherwise the Launch '
      + 'buttons from the list view stay on the tiles'
    );
  });
});
