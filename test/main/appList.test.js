const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

beforeEach(() => {
  delete require.cache[require.resolve('/home/moi/AM-GUI/src/main/appList.js')];
});

afterEach(() => {
  delete require.cache[require.resolve('/home/moi/AM-GUI/src/main/appList.js')];
});

describe('parseListOutput', () => {
  it('parses catalog apps after empty line separator', () => {
    const { parseListOutput } = require('/home/moi/AM-GUI/src/main/appList.js');
    const input = [
      '\u25c6 firefox: Firefox browser',
      '\u25c6 vlc: VLC player',
      '',
      '\u25c6 gimp: Image editor',
    ].join('\n');
    const result = parseListOutput(input);
    assert.deepStrictEqual([...result.installedFromCatalog].sort(), ['firefox', 'vlc']);
    assert.deepStrictEqual([...result.catalogSet].sort(), ['gimp']);
    assert.deepStrictEqual([...result.diamondSet].sort(), ['firefox', 'gimp', 'vlc']);
    assert.strictEqual(result.installedDesc.get('firefox'), 'Firefox browser');
    assert.strictEqual(result.installedDesc.get('vlc'), 'VLC player');
    assert.strictEqual(result.catalogDesc.get('gimp'), 'Image editor');
  });

  it('returns empty sets for empty input', () => {
    const { parseListOutput } = require('/home/moi/AM-GUI/src/main/appList.js');
    const result = parseListOutput('');
    assert.strictEqual(result.catalogSet.size, 0);
    assert.strictEqual(result.catalogDesc.size, 0);
    assert.strictEqual(result.installedFromCatalog.size, 0);
    assert.strictEqual(result.installedDesc.size, 0);
    assert.strictEqual(result.diamondSet.size, 0);
  });

  it('collects descriptions from catalog entries', () => {
    const { parseListOutput } = require('/home/moi/AM-GUI/src/main/appList.js');
    const input = [
      '\u25c6 firefox: Firefox web browser',
      '\u25c6 vlc: VLC media player',
      '',
      '\u25c6 extra-app: An extra app',
    ].join('\n');
    const result = parseListOutput(input);
    assert.strictEqual(result.installedDesc.get('firefox'), 'Firefox web browser');
    assert.strictEqual(result.installedDesc.get('vlc'), 'VLC media player');
    assert.strictEqual(result.catalogDesc.get('extra-app'), 'An extra app');
  });
});

describe('parseInstalledOutput', () => {
  it('parses table with name, version, scope', () => {
    const { parseInstalledOutput } = require('/home/moi/AM-GUI/src/main/appList.js');
    const input = [
      '  - NAME | VER | SOURCE | STATUS   ',
      '\u25c6 firefox | 120.0 | am | \u2714    ',
    ].join('\n');
    const result = parseInstalledOutput(input);
    assert.strictEqual(result.installedEntries.length, 1);
    assert.strictEqual(result.installedEntries[0].name, 'firefox');
    assert.strictEqual(result.installedEntries[0].version, '120.0');
    assert.strictEqual(result.installedEntries[0].scope, 'system');
    assert.strictEqual(result.installedNameSet.has('firefox'), true);
    assert.strictEqual(result.installedDesc.get('firefox'), '120.0');
    assert.strictEqual(result.installedScope.get('firefox'), 'system');
  });

  it('handles empty input', () => {
    const { parseInstalledOutput } = require('/home/moi/AM-GUI/src/main/appList.js');
    const result = parseInstalledOutput('');
    assert.strictEqual(result.installedEntries.length, 0);
    assert.strictEqual(result.installedNameSet.size, 0);
    assert.strictEqual(result.installedDesc.size, 0);
    assert.strictEqual(result.installedScope.size, 0);
  });

  it('detects user vs system scope', () => {
    const { parseInstalledOutput } = require('/home/moi/AM-GUI/src/main/appList.js');
    const userInput = [
      '"APPMAN"',
      '  - NAME | VER | SOURCE | STATUS   ',
      '\u25c6 firefox | 120.0 | am | \u2714    ',
    ].join('\n');
    const userResult = parseInstalledOutput(userInput);
    assert.strictEqual(userResult.installedEntries[0].scope, 'user');
    assert.strictEqual(userResult.installedScope.get('firefox'), 'user');

    const systemInput = [
      '"AM"',
      '  - NAME | VER | SOURCE | STATUS   ',
      '\u25c6 gimp | 2.10 | am | \u2714    ',
    ].join('\n');
    const systemResult = parseInstalledOutput(systemInput);
    assert.strictEqual(systemResult.installedEntries[0].scope, 'system');
    assert.strictEqual(systemResult.installedScope.get('gimp'), 'system');
  });
});

describe('detectBundles', () => {
  it('detects suite bundles', () => {
    const { detectBundles } = require('/home/moi/AM-GUI/src/main/appList.js');
    const catalogDesc = new Map([['libreoffice-writer', 'installs the full "libreoffice" suite']]);
    const result = detectBundles(catalogDesc);
    assert.deepStrictEqual(result, { 'libreoffice-writer': 'libreoffice' });
  });
});
