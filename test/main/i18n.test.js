// Tests: cohérence des clés i18n — chaque langue doit avoir exactement
// les mêmes clés que en.json (source de référence dans locales/).

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../../src/i18n/locales');

function loadLocales() {
  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
  const locales = {};
  for (const file of files) {
    const lang = path.basename(file, '.json');
    locales[lang] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
  }
  return locales;
}

const locales = loadLocales();
const SECTIONS = ['ui', 'tray', 'contextMenu', 'errors'];

describe('i18n key consistency (locales/*.json)', () => {
  it('has en.json as reference', () => {
    assert.ok(locales.en, 'missing en.json');
  });

  it('every language has the same keys as en.json (all sections)', () => {
    const ref = locales.en;
    let diffs = 0;
    for (const [lang, data] of Object.entries(locales)) {
      if (lang === 'en') continue;
      for (const section of SECTIONS) {
        const refKeys = Object.keys((ref[section]) || {}).sort();
        const keys = Object.keys((data[section]) || {}).sort();
        const missing = refKeys.filter((k) => !keys.includes(k));
        const extra = keys.filter((k) => !refKeys.includes(k));
        if (missing.length || extra.length) {
          diffs++;
          console.warn(`  ${lang}/${section}: missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`);
        }
      }
    }
    assert.strictEqual(diffs, 0, `${diffs} section(s) avec des clés différentes de en.json`);
  });

  it('no empty value in any language', () => {
    let empty = 0;
    for (const [lang, data] of Object.entries(locales)) {
      for (const section of SECTIONS) {
        const obj = data[section] || {};
        for (const [key, value] of Object.entries(obj)) {
          if (!value || String(value).trim().length === 0) {
            empty++;
            if (empty <= 3) console.warn(`  ${lang}/${section}: "${key}" is empty`);
          }
        }
      }
    }
    assert.strictEqual(empty, 0, `${empty} empty value(s) across languages`);
  });

  it('critical UI keys exist everywhere', () => {
    const criticalKeys = [
      'updates.title', 'updates.run',
      'install.status', 'install.done', 'install.cancel',
      'details.install', 'details.uninstall',
      'confirm.installTitle', 'confirm.uninstallTitle',
      'confirm.installMsg', 'confirm.uninstallMsg',
      'toast.updating', 'toast.installing', 'toast.uninstalling',
      'tabs.all', 'tabs.installed', 'tabs.updates',
      'search.placeholder', 'settings.title'
    ];
    let missing = 0;
    for (const lang of Object.keys(locales)) {
      for (const key of criticalKeys) {
        if (!(locales[lang].ui || {})[key]) {
          missing++;
          if (missing <= 3) console.warn(`  ${lang}: missing "${key}"`);
        }
      }
    }
    assert.strictEqual(missing, 0, `${missing} critical key(s) missing`);
  });
});
