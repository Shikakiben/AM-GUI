const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  PLA_INSTALL_SCHEME,
  PREFIX,
  extractPlaInstallUrl,
  isPlaInstallUrl,
  parsePlaInstallUrl,
} = require(path.resolve(__dirname, '../../src/main/plaInstall.js'));

describe('plaInstall URL parsing', () => {
  it('exposes the scheme and prefix', () => {
    assert.strictEqual(PLA_INSTALL_SCHEME, 'pla-install');
    assert.strictEqual(PREFIX, 'pla-install://');
  });

  it('extracts a pla-install:// URL from argv', () => {
    const argv = ['/usr/bin/electron', '/home/user/AM-GUI', 'pla-install://firefox'];
    assert.strictEqual(extractPlaInstallUrl(argv), 'pla-install://firefox');
  });

  it('returns null when no pla-install URL is present', () => {
    assert.strictEqual(extractPlaInstallUrl(['/usr/bin/electron', '--flag']), null);
    assert.strictEqual(extractPlaInstallUrl(undefined), null);
    assert.strictEqual(extractPlaInstallUrl('not-an-array'), null);
  });

  it('parses a simple app name', () => {
    assert.deepStrictEqual(parsePlaInstallUrl('pla-install://firefox'), { name: 'firefox', scope: null });
  });

  it('parses a trailing slash', () => {
    assert.deepStrictEqual(parsePlaInstallUrl('pla-install://firefox/'), { name: 'firefox', scope: null });
  });

  it('parses an optional scope query parameter', () => {
    assert.deepStrictEqual(parsePlaInstallUrl('pla-install://firefox?scope=system'), { name: 'firefox', scope: 'system' });
    assert.deepStrictEqual(parsePlaInstallUrl('pla-install://firefox?scope=user'), { name: 'firefox', scope: 'user' });
  });

  it('ignores an invalid scope value', () => {
    assert.deepStrictEqual(parsePlaInstallUrl('pla-install://firefox?scope=invalid'), { name: 'firefox', scope: null });
  });

  it('decodes percent-encoded names', () => {
    assert.deepStrictEqual(parsePlaInstallUrl('pla-install://vs%20code'), { name: 'vs code', scope: null });
  });

  it('rejects invalid URLs', () => {
    assert.strictEqual(parsePlaInstallUrl('pla-install://'), null);
    assert.strictEqual(parsePlaInstallUrl('pla-install:firefox'), null);
    assert.strictEqual(parsePlaInstallUrl('https://example.com'), null);
    assert.strictEqual(parsePlaInstallUrl(null), null);
    assert.strictEqual(parsePlaInstallUrl(undefined), null);
  });

  it('isPlaInstallUrl detects the scheme', () => {
    assert.strictEqual(isPlaInstallUrl('pla-install://firefox'), true);
    assert.strictEqual(isPlaInstallUrl('https://example.com'), false);
    assert.strictEqual(isPlaInstallUrl(null), false);
  });
});