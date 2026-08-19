'use strict';

// Support for the pla-install:// URL scheme used by the PLA website.
// Clicking "Install" on an app page sends pla-install://<appname>,
// which should open AM-GUI and trigger the install of that app.

const PLA_INSTALL_SCHEME = 'pla-install';
const PREFIX = 'pla-install://';
const VALID_SCOPES = new Set(['user', 'system']);

// Returns the first pla-install:// URL found in an argv list (e.g. process.argv).
function extractPlaInstallUrl(argv) {
  if (!Array.isArray(argv)) return null;
  const found = argv.find((a) => typeof a === 'string' && a.startsWith(PREFIX));
  return found || null;
}

function isPlaInstallUrl(url) {
  return typeof url === 'string' && url.startsWith(PREFIX);
}

// Parses "pla-install://<appname>" (optionally with ?scope=user|system)
// into { name, scope }. Returns null when the URL is invalid.
function parsePlaInstallUrl(url) {
  if (!isPlaInstallUrl(url)) return null;
  const m = /^pla-install:\/\/([^/?#]+)/i.exec(url);
  if (!m) return null;
  let name;
  try {
    name = decodeURIComponent(m[1]);
  } catch (_) {
    name = m[1];
  }
  name = name.trim();
  if (!name) return null;
  const scopeMatch = /[?&]scope=([^&#]+)/i.exec(url);
  let scope = scopeMatch ? scopeMatch[1].toLowerCase() : null;
  if (scope && !VALID_SCOPES.has(scope)) scope = null;
  return { name, scope };
}

module.exports = { PLA_INSTALL_SCHEME, PREFIX, extractPlaInstallUrl, isPlaInstallUrl, parsePlaInstallUrl };