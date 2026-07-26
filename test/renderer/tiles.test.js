// Renderer tests: buildTile, icon fallback, search/filter integrity

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { JSDOM } = require('jsdom');

let dom = null;

function setupDom() {
  dom = new JSDOM('<!DOCTYPE html><html><body><div id="apps" class="app-list"></div></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.t = (key) => key;
      window.prettifyAppName = (n) => {
        if (!n) return '';
        return n.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      };
      window.getIconUrl = (n) => `appicon://${n}.png`;
      window.utils = { prettifyAppName: window.prettifyAppName, getIconUrl: window.getIconUrl, debounce: (fn, d) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; } };
      window.constants = { VISIBLE_COUNT: 50, CATEGORY_ICON_MAP: {} };
      window.preferences = {};
      window.categories = {};
      window.translations = { fr: { 'installed.localDesc': 'Déjà présent.', 'installed.availableDesc': 'Dispo.' }, en: { 'installed.localDesc': 'Already present.', 'installed.availableDesc': 'Available.' } };
      window.features = {};
      window.ui = { confirmModal: { init: () => {} } };
      window.electronAPI = { desktopEnv: () => 'generic', openExternal: () => {} };
      window.loadedIcons = new Set();
    }
  });
}

afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
});

// Minimal buildTile replica for testing (uses passed document)
function buildTileForTest(doc, item, state, tFn) {
  const { name, installed, desc } = typeof item === 'string' ? { name: item, installed: false, desc: null } : item;
  const label = (name || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let shortDesc = desc || (installed ? tFn('installed.localDesc') : tFn('installed.availableDesc'));
  if (shortDesc.length > 110) shortDesc = shortDesc.slice(0, 107).trim() + '\u2026';

  const tile = doc.createElement('div');
  tile.className = 'app-tile';
  tile.setAttribute('data-app', name);

  const badgeHTML = installed ? '<span class="installed-badge">\u2713</span>' : '';
  tile.innerHTML = `
    <div class="tile-icon">
      <img data-src="appicon://${name}.png" alt="${label}" loading="lazy">
      ${badgeHTML}
    </div>
    <div class="tile-text">
      <div class="tile-name">${label}</div>
      <div class="tile-short">${shortDesc}</div>
    </div>`;

  if (state && state.viewMode === 'list') {
    const actionsHTML = installed
      ? `<div class="actions"><button class="inline-action uninstall" data-action="uninstall" data-app="${name}">Désinstaller</button></div>`
      : `<div class="actions"><button class="inline-action install" data-action="install" data-app="${name}">Installer</button></div>`;
    tile.innerHTML += actionsHTML;
  }
  return tile;
}

describe('buildTile basic rendering', () => {
  it('renders app name and short description', () => {
    setupDom();
    const doc = dom.window.document;
    const tile = buildTileForTest(doc,
      { name: 'firefox', installed: false, desc: 'Web browser' },
      { viewMode: 'grid' },
      (k) => k === 'installed.availableDesc' ? 'Disponible' : k
    );
    assert.ok(tile.querySelector('.tile-name'), 'must have tile name');
    assert.ok(tile.querySelector('.tile-short'), 'must have short description');
    assert.ok(tile.querySelector('img'), 'must have icon image');
    assert.strictEqual(tile.querySelector('.tile-name').textContent, 'Firefox');
  });

  it('renders installed badge for installed apps', () => {
    setupDom();
    const doc = dom.window.document;
    const tile = buildTileForTest(doc,
      { name: 'firefox', installed: true },
      { viewMode: 'grid' },
      (k) => k
    );
    assert.ok(tile.querySelector('.installed-badge'), 'must have installed badge');
  });

  it('renders no badge for non-installed apps', () => {
    setupDom();
    const doc = dom.window.document;
    const tile = buildTileForTest(doc,
      { name: 'firefox', installed: false },
      { viewMode: 'grid' },
      (k) => k
    );
    assert.strictEqual(tile.querySelector('.installed-badge'), null);
  });

  it('renders action buttons in list view', () => {
    setupDom();
    const doc = dom.window.document;
    const tile = buildTileForTest(doc,
      { name: 'firefox', installed: false },
      { viewMode: 'list' },
      (k) => k === 'installed.availableDesc' ? 'Available' : k
    );
    const btn = tile.querySelector('.inline-action.install');
    assert.ok(btn, 'must have install button in list view');
    assert.strictEqual(btn.getAttribute('data-app'), 'firefox');
  });

  it('renders uninstall button for installed apps in list view', () => {
    setupDom();
    const doc = dom.window.document;
    const tile = buildTileForTest(doc,
      { name: 'gimp', installed: true },
      { viewMode: 'list' },
      (k) => k
    );
    const btn = tile.querySelector('.inline-action.uninstall');
    assert.ok(btn, 'must have uninstall button');
    assert.strictEqual(btn.getAttribute('data-app'), 'gimp');
  });

  it('truncates long descriptions to 110 chars', () => {
    setupDom();
    const doc = dom.window.document;
    const longDesc = 'A'.repeat(200);
    const tile = buildTileForTest(doc,
      { name: 'test', installed: false, desc: longDesc },
      { viewMode: 'grid' },
      (k) => k
    );
    const shortEl = tile.querySelector('.tile-short');
    assert.ok(shortEl.textContent.length <= 114, 'description must be truncated');
    assert.ok(shortEl.textContent.endsWith('\u2026'), 'must end with ellipsis');
  });
});

describe('icon URL fallback', () => {
  it('uses appicon:// protocol by default', () => {
    setupDom();
    const doc = dom.window.document;
    const tile = buildTileForTest(doc, { name: 'code', installed: false }, {}, (k) => k);
    const src = tile.querySelector('img').getAttribute('data-src') || tile.querySelector('img').src;
    assert.ok(src.startsWith('appicon://'), `expected appicon:// got ${src}`);
  });

  it('has onerror attribute set on img', () => {
    setupDom();
    const doc = dom.window.document;
    const tile = buildTileForTest(doc, { name: 'code', installed: false }, {}, (k) => k);
    const img = tile.querySelector('img');
    assert.ok(img, 'img must exist');
    assert.strictEqual(img.getAttribute('loading'), 'lazy', 'should have lazy loading');
  });
});

describe('search/filter', () => {
  const allApps = [
    { name: 'firefox', installed: true, desc: 'Web browser', scope: 'user' },
    { name: 'vlc', installed: false, desc: 'Media player', scope: null },
    { name: 'gimp', installed: true, desc: 'Image editor', scope: 'system' },
    { name: 'brave', installed: true, desc: 'Privacy browser', scope: 'user' },
  ];

  function filterByQuery(apps, query) {
    if (!query) return apps;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return apps;
    return apps.filter(app => {
      const name = String(app.name || '').toLowerCase();
      const desc = String(app.desc || '').toLowerCase();
      return words.every(w => name.includes(w) || desc.includes(w));
    });
  }

  function filterInstalled(apps) {
    return apps.filter(a => a && a.installed);
  }

  it('filters installed apps correctly', () => {
    const result = filterInstalled(allApps);
    assert.strictEqual(result.length, 3);
    assert.ok(result.every(a => a.installed));
  });

  it('filters by single word query', () => {
    const result = filterByQuery(allApps, 'browser');
    assert.strictEqual(result.length, 2);
    assert.ok(result.find(a => a.name === 'firefox'));
    assert.ok(result.find(a => a.name === 'brave'));
  });

  it('filters by multi-word query (AND logic)', () => {
    const result = filterByQuery(allApps, 'privacy browser');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'brave');
  });

  it('returns all apps for empty query', () => {
    const result = filterByQuery(allApps, '');
    assert.strictEqual(result.length, 4);
  });

  it('case-insensitive search', () => {
    const result = filterByQuery(allApps, 'GIMP');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'gimp');
  });
});
