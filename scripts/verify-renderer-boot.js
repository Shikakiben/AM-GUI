// Boot verification: loads all renderer scripts in the exact order declared in
// index.html inside a jsdom environment, then fires DOMContentLoaded. Catches
// load-time crashes (TDZ / ReferenceError / missing files) that unit tests miss
// because they exercise modules in isolation, not the full page boot.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');

// Modules expected to be registered after all scripts load.
const EXPECTED_FEATURES = ['sandbox', 'updates', 'installer', 'appLoader', 'search', 'details', 'featured'];
const EXPECTED_UI = ['toast', 'virtualList', 'settingsPanel', 'passwordPrompt', 'layout', 'confirmModal', 'lightbox'];

function fail(msg, err) {
  console.error(`\u2717 ${msg}`);
  if (err) {
    console.error('  ' + (err.stack || err.message || err).split('\n').slice(0, 6).join('\n  '));
  }
  process.exit(1);
}

const html = fs.readFileSync(INDEX_HTML, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://localhost/', // non-opaque origin so localStorage works
});
const { window } = dom;

// --- Minimal stubs for the Electron preload API + third-party globals ---
window.electronAPI = new Proxy({}, {
  get(_target, prop) {
    // Return a no-op function for any method; listeners just ignore callbacks;
    // data fetchers resolve to empty results.
    if (prop === 'listAppsDetailed') {
      return () => Promise.resolve({ pmFound: true, all: [], installed: [], pmName: 'am', bundleChildOf: {} });
    }
    return (..._args) => Promise.resolve(undefined);
  }
});
window.Terminal = function () { return { open() {}, write() {}, reset() {}, clear() {}, loadAddon() {} }; };
window.FitAddon = { FitAddon: function () { return { fit() {} }; } };
window.marked = { parse: (s) => s };

// Collect local script sources in declaration order.
const scripts = [...window.document.querySelectorAll('script[src]')]
  .map((s) => s.getAttribute('src'))
  .filter((src) => src && !/^https?:/i.test(src));

// --- Check 1: every referenced local script exists on disk ---
const missing = scripts.filter((src) => !fs.existsSync(path.join(ROOT, src)));
if (missing.length) {
  fail(`index.html references ${missing.length} missing script(s):\n  ` + missing.join('\n  '));
}
console.log(`  OK: ${scripts.length} script src(s) exist on disk`);

// --- Check 2: all scripts execute in order without throwing ---
const context = vm.createContext(window);
for (const src of scripts) {
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  try {
    vm.runInContext(code, context, { filename: src });
  } catch (e) {
    fail(`Script threw during load: ${src}\n  -> ${e.message}`, e);
  }
}
console.log('  OK: all scripts executed without load-time errors');

// --- Check 3: expected feature/ui modules registered on window ---
const features = window.features || {};
const missingFeatures = EXPECTED_FEATURES.filter((f) => !features[f] || typeof features[f].init !== 'function');
if (missingFeatures.length) {
  fail(`window.features missing init() for: ${missingFeatures.join(', ')}`);
}
console.log(`  OK: window.features registered (${EXPECTED_FEATURES.length} modules)`);

// categories registers a different shape (window.categories API, not init())
if (!window.categories || typeof window.categories.initDropdown !== 'function') {
  fail('window.categories API not registered (expected initDropdown)');
}
console.log('  OK: window.categories API registered');

const ui = window.ui || {};
const missingUi = EXPECTED_UI.filter((u) => !ui[u]);
if (missingUi.length) {
  fail(`window.ui missing: ${missingUi.join(', ')}`);
}
console.log(`  OK: window.ui registered (${EXPECTED_UI.length} modules)`);

// --- Check 4: DOMContentLoaded fires without crashing the renderer ---
try {
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
} catch (e) {
  fail('DOMContentLoaded handler threw', e);
}
console.log('  OK: DOMContentLoaded handled without error');

// Give any queued microtasks a tick, then confirm success and exit.
setTimeout(() => {
  console.log('\n\u2714 Renderer boot verified successfully.');
  process.exit(0);
}, 300);
