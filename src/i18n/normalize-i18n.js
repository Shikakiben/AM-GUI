#!/usr/bin/env node
// Normalise l'ordre des clés de tous les fichiers locales/*.json
// pour qu'ils suivent exactement l'ordre de en.json (langue de référence).
// À lancer après avoir ajouté une nouvelle clé dans en.json.
'use strict';

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, 'locales');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

// Réordonne les clés d'un objet selon l'ordre de referenceKeys.
// Les clés présentes dans obj mais absentes de referenceKeys sont placées à la fin.
function reorderKeys(obj, referenceKeys) {
  const ordered = {};
  for (const key of referenceKeys) {
    if (key in obj) ordered[key] = obj[key];
  }
  // Clés supplémentaires (non présentes dans la référence) → à la fin
  for (const key of Object.keys(obj)) {
    if (!(key in ordered)) ordered[key] = obj[key];
  }
  return ordered;
}

function main() {
  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
  const langs = files.map((f) => path.basename(f, '.json')).sort();

  // en.json = référence d'ordre
  const ref = readJson(path.join(LOCALES_DIR, 'en.json'));
  const sections = ['ui', 'tray', 'contextMenu', 'errors'];

  let changed = 0;
  for (const lang of langs) {
    const file = path.join(LOCALES_DIR, lang + '.json');
    const data = readJson(file);

    let modified = false;
    for (const section of sections) {
      if (!data[section] || !ref[section]) continue;
      const refKeys = Object.keys(ref[section]);
      const currentKeys = Object.keys(data[section]);
      // Ne réordonner que si l'ordre diffère
      if (JSON.stringify(currentKeys) !== JSON.stringify(refKeys)) {
        data[section] = reorderKeys(data[section], refKeys);
        modified = true;
      }
    }

    if (modified) {
      writeJson(file, data);
      changed++;
      console.log('Réordonné: ' + lang + '.json');
    }
  }

  if (changed === 0) {
    console.log('Tous les fichiers sont déjà dans l\'ordre de en.json.');
  } else {
    console.log(changed + ' fichier(s) réordonné(s).');
  }
}

main();
