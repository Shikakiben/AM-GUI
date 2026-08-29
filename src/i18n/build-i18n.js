#!/usr/bin/env node
// Régénère src/i18n/translations.js depuis src/i18n/locales/*.json
// À lancer après toute modification des fichiers JSON de traduction.
'use strict';

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, 'locales');
const OUT_FILE = path.join(__dirname, 'translations.js');

// Sérialise un objet en littéral JS (clés/valeurs en double quotes, indenté).
function serializeObject(obj, indent) {
  if (!obj || Object.keys(obj).length === 0) return '{}';
  const json = JSON.stringify(obj, null, 2);
  const lines = json.split('\n');
  const pad = ' '.repeat(indent);
  const inner = lines.slice(1, -1).map((line) => pad + line).join('\n');
  return '{\n' + inner + '\n' + ' '.repeat(Math.max(0, indent - 2)) + '}';
}

// Partie "logique" du fichier généré : identique à l'ancien translations.js.
const FOOTER = [
  "  if (typeof module !== 'undefined' && module.exports) {",
  "    let currentLocale = 'en';",
  '',
  '    function getTrayLabels(locale) {',
  "      if (!locale || locale === 'auto') return translations._tray.en;",
  '      const base = locale.slice(0, 2);',
  '      return translations._tray[base] || translations._tray.en;',
  '    }',
  '',
  '    function getContextMenuLabels(locale) {',
  "      if (!locale || locale === 'auto') return translations._contextMenu.en;",
  '      const base = locale.slice(0, 2);',
  '      return translations._contextMenu[base] || translations._contextMenu.en;',
  '    }',
  '',
  '    function getMainErrorLabels(locale) {',
  "      if (!locale || locale === 'auto') return translations._mainErrors.en;",
  '      const base = locale.slice(0, 2);',
  '      return translations._mainErrors[base] || translations._mainErrors.en;',
  '    }',
  '',
  '    function applyVars(str, vars) {',
  '      if (!vars) return str;',
  '      for (const [k, v] of Object.entries(vars)) {',
  "        str = str.replace(new RegExp('\\\\{' + k + '\\\\}', 'g'), v);",
  '      }',
  '      return str;',
  '    }',
  '',
  '    function tErr(key, fallbackStr, vars) {',
  '      const labels = getMainErrorLabels(currentLocale);',
  '      let str = labels[key];',
  '      if (str === undefined || str === null) str = fallbackStr;',
  '      return applyVars(str, vars);',
  '    }',
  '',
  '    function setLocale(locale) {',
  "      if (locale && locale !== 'auto') currentLocale = locale;",
  '    }',
  '',
  '    module.exports = { translations, getTrayLabels, getContextMenuLabels, tErr, setLocale };',
  '  } else {',
  '    window.i18n = window.i18n || {};',
  '    window.i18n.catalog = translations;',
  '    window.translations = translations;',
  '  }',
  '})();'
];

function main() {
  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
  const langs = files.map((f) => path.basename(f, '.json')).sort();
  if (!langs.length) throw new Error('Aucun fichier de langue dans ' + LOCALES_DIR);

  const locales = {};
  for (const lang of langs) {
    const file = path.join(LOCALES_DIR, lang + '.json');
    locales[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  const out = [];
  out.push('(function registerTranslations(){');
  out.push('  const translations = {');

  for (const lang of langs) {
    out.push('    ' + lang + ': ' + serializeObject(locales[lang].ui, 6) + ',');
  }

  const tray = {};
  const contextMenu = {};
  const errors = {};
  for (const lang of langs) {
    if (locales[lang].tray) tray[lang] = locales[lang].tray;
    if (locales[lang].contextMenu) contextMenu[lang] = locales[lang].contextMenu;
    if (locales[lang].errors) errors[lang] = locales[lang].errors;
  }
  out.push('    _tray: ' + serializeObject(tray, 6) + ',');
  out.push('    _contextMenu: ' + serializeObject(contextMenu, 6) + ',');
  out.push('    _mainErrors: ' + serializeObject(errors, 6));
  out.push('  };');
  out.push('');
  out.push(...FOOTER);

  fs.writeFileSync(OUT_FILE, out.join('\n') + '\n');
  console.log('Généré src/i18n/translations.js (' + langs.length + ' langues)');
}

main();
