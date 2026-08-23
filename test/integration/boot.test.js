// Boot integration test: loads all renderer scripts in the exact order declared
// in index.html inside a jsdom environment, then fires DOMContentLoaded. Catches
// load-time crashes (TDZ / ReferenceError / missing files) that unit tests miss
// because they exercise modules in isolation, not the full page boot.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML = path.join(ROOT, 'index.html');

const EXPECTED_FEATURES = ['sandbox', 'updates', 'installer', 'appLoader', 'search', 'details', 'featured'];
const EXPECTED_UI = ['toast', 'virtualList', 'settingsPanel', 'passwordPrompt', 'layout', 'confirmModal', 'lightbox'];

describe('renderer boot (full page load)', () => {
  let window;
  let scripts;
  let _dom;

  before(function () {
    this.timeout = 10000;
  });

  before(() => {
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    _dom = new JSDOM(html, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://localhost/',
    });
    window = _dom.window;

    window.electronAPI = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'listAppsDetailed') {
          return () => Promise.resolve({ pmFound: true, all: [], installed: [], pmName: 'am', bundleChildOf: {} });
        }
        return () => Promise.resolve(undefined);
      }
    });
    window.Terminal = function () { return { open() {}, write() {}, reset() {}, clear() {}, loadAddon() {} }; };
    window.FitAddon = { FitAddon: function () { return { fit() {} }; } };
    window.marked = { parse: (s) => s };

    scripts = [...window.document.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src'))
      .filter((src) => src && !/^https?:/i.test(src));
  });

  after(() => {
    // Close jsdom window to prevent lingering timers keeping node alive.
    try { _dom?.window?.close?.(); } catch (_) {}
    _dom = null;
    window = null;
    scripts = null;
  });

  it('references only scripts that exist on disk', () => {
    const missing = scripts.filter((src) => !fs.existsSync(path.join(ROOT, src)));
    assert.deepStrictEqual(missing, [], `index.html references missing scripts: ${missing.join(', ')}`);
  });

  it('executes every script in order without load-time errors', () => {
    const context = vm.createContext(window);
    for (const src of scripts) {
      const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
      assert.doesNotThrow(
        () => vm.runInContext(code, context, { filename: src }),
        `Script threw during load: ${src}`
      );
    }
  });

  it('registers all expected feature modules on window.features', () => {
    const features = window.features || {};
    const missing = EXPECTED_FEATURES.filter((f) => !features[f] || typeof features[f].init !== 'function');
    assert.deepStrictEqual(missing, [], `window.features missing init() for: ${missing.join(', ')}`);
  });

  it('registers the categories API on window.categories', () => {
    assert.strictEqual(typeof window.categories?.initDropdown, 'function', 'window.categories.initDropdown missing');
  });

  it('registers all expected UI modules on window.ui', () => {
    const ui = window.ui || {};
    const missing = EXPECTED_UI.filter((u) => !ui[u]);
    assert.deepStrictEqual(missing, [], `window.ui missing: ${missing.join(', ')}`);
  });

  it('handles DOMContentLoaded without throwing', () => {
    assert.doesNotThrow(() => {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    });
  });
});
