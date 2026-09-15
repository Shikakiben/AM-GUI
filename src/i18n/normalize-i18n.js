#!/usr/bin/env node
// Normalizes the key order of all locales/*.json files so they exactly
// match en.json (reference language).
// Run after adding a new key to en.json.
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

// Reorders an object's keys according to referenceKeys.
// Keys present in obj but missing from referenceKeys are appended at the end.
function reorderKeys(obj, referenceKeys) {
  const ordered = {};
  for (const key of referenceKeys) {
    if (key in obj) ordered[key] = obj[key];
  }
  // Extra keys (not in the reference) → appended at the end
  for (const key of Object.keys(obj)) {
    if (!(key in ordered)) ordered[key] = obj[key];
  }
  return ordered;
}

function main() {
  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
  const langs = files.map((f) => path.basename(f, '.json')).sort();

  // en.json = key order reference
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
      // Only reorder when the order differs
      if (JSON.stringify(currentKeys) !== JSON.stringify(refKeys)) {
        data[section] = reorderKeys(data[section], refKeys);
        modified = true;
      }
    }

    if (modified) {
      writeJson(file, data);
      changed++;
      console.log('Reordered: ' + lang + '.json');
    }
  }

  if (changed === 0) {
    console.log('All files already follow the en.json key order.');
  } else {
    console.log(changed + ' file(s) reordered.');
  }
}

main();
