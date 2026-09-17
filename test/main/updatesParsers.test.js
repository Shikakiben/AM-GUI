// Main-process tests: updates parsers integrity
// Parses real output from appman -u to validate regexes

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Replicate the parser logic from updates/index.js for testing
function stripAnsiSequences(text = '') {
  return text
    .replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
    .replace(/\][0-9]+;[^\\\x07]*(\x07|\\)/g, '')
    .replace(/[\x07\x08]/g, '');
}

function parseUpdatedApps(text) {
  const cleaned = stripAnsiSequences(text);
  const updated = new Set();
  const lines = cleaned.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let name = null;
    let m;
    if ((m = line.match(/^\u2714\s+([A-Za-z0-9._-]+)/))) name = m[1];
    else if ((m = line.match(/^\*\s*([A-Za-z0-9._-]+)\s+->/))) name = m[1];
    else if ((m = line.match(/^([A-Za-z0-9._-]+)\s*\([^)]*->[^)]*\)/))) name = m[1];
    if (name && !name.toLowerCase().endsWith('.am')) {
      updated.add(name.toLowerCase());
    }
  }
  return updated;
}

function parseUpdatedBlock(text) {
  const updated = new Set();
  const newVersions = new Map();
  const lines = text.split(/\r?\n/);
  const SEP_SKIP = 4;
  let sepCount = 0;
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^[-=]{5,}$/.test(lines[i].trim())) {
      sepCount++;
      if (sepCount === SEP_SKIP) { startIdx = i + 1; break; }
    }
  }
  if (startIdx === -1) return { updated, newVersions, hasStructure: false };

  const blockLines = lines.slice(startIdx);
  const QUAL = '(?:\\s+\\((?:AppMan|AM)\\))?';
  const VER = '[^\\s()]+';
  const NOTE = '(?:\\s+\\([^)]*\\))?';
  const ROW_RE = new RegExp(
    '^\\s*\\d+\\.\\s+([A-Za-z0-9._-]+)\\s+' + VER + QUAL + '\\s+' + VER + QUAL + NOTE + '\\s*$'
  );
  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i].trim();
    if (!ROW_RE.test(line)) continue;
    const m = line.match(/^\s*\d+\.\s+([A-Za-z0-9._-]+)\s+(.*)/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    // Drop every "(...)" group — "(AppMan)", "(AM)" and the translated note —
    // before reading the two versions.
    const tokens = (m[2].replace(/\([^)]*\)/g, ' ').match(/\S+/g) || []);
    if (tokens.length < 2) continue;
    const oldVer = tokens[tokens.length - 2];
    const newVer = tokens[tokens.length - 1];
    const key = name + '|system';
    if (!name.endsWith('.am')) {
      updated.add(key);
      newVersions.set(key, { old: oldVer, new: newVer, name, scope: 'system' });
    }
  }
  return { updated, newVersions, hasStructure: true };
}

function parseChangedScripts(text) {
  const changed = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('\u25c6')) continue;
    const name = (line.slice(1).trim().split(/\s+/)[0] || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9._+-]*$/.test(name)) continue;
    const urlLine = (lines[i + 1] || '').trim();
    const urlMatch = urlLine.match(/(https:\/\/github\.com\/[^\s]*\/programs\/[^/\s]+\/([^\s/?#]+))/);
    if (!urlMatch || urlMatch[2].toLowerCase() !== name) continue;
    changed.push({ name, url: urlMatch[1] });
  }
  return changed;
}

// ------------------------------------------------------------------
describe('parseUpdatedApps', () => {
  it('detects apps with ✔ prefix', () => {
    const input = ' ✔ FIREFOX is updated, 1 second elapsed!';
    const result = parseUpdatedApps(input);
    assert.ok(result.has('firefox'), 'should detect firefox');
  });

  it('detects apps with * prefix and arrow', () => {
    const input = ' * firefox -> 120.0';
    const result = parseUpdatedApps(input);
    assert.ok(result.has('firefox'));
  });

  it('detects apps with (v1->v2) pattern', () => {
    const input = 'firefox (118.0 -> 120.0)';
    const result = parseUpdatedApps(input);
    assert.ok(result.has('firefox'));
  });

  it('ignores .am-files', () => {
    const input = ' ✔ firefox.am 1 second elapsed!';
    const result = parseUpdatedApps(input);
    assert.strictEqual(result.has('firefox.am'), false);
  });

  it('returns empty set for empty input', () => {
    assert.strictEqual(parseUpdatedApps('').size, 0);
  });
});

describe('parseUpdatedBlock', () => {
  const realOutput = [
    '-----------------------------------------------------------------------------', // 1
    ' dummy header',
    '-----------------------------------------------------------------------------', // 2
    ' more dummy',
    '-----------------------------------------------------------------------------', // 3
    ' The following apps have been updated:',
    '',
    '     App                Previous  Current ',
    '-----------------------------------------------------------------------------', // 4 → start parsing here
    ' 1.  brave              1.92.143  1.92.143  (checksum changed)',
    ' 2.  gimp               3.2.4-2   3.2.4-2   (checksum changed)',
    ' 3.  dolphin-emu        2606      2606      (checksum changed)',
    ' 4.  firefox            118.0     120.0',
    '-----------------------------------------------------------------------------',
  ].join('\n');

  it('parses table with checksum changed suffix', () => {
    const result = parseUpdatedBlock(realOutput);
    assert.ok(result.hasStructure, 'should detect table structure');
    assert.ok(result.updated.has('brave|system'), 'brave should be detected');
    assert.ok(result.updated.has('gimp|system'), 'gimp should be detected');
    assert.ok(result.updated.has('dolphin-emu|system'));
    assert.ok(result.updated.has('firefox|system'));
    // Versions
    const braveVer = result.newVersions.get('brave|system');
    assert.strictEqual(braveVer.old, '1.92.143');
    assert.strictEqual(braveVer.new, '1.92.143');
    const ffVer = result.newVersions.get('firefox|system');
    assert.strictEqual(ffVer.old, '118.0');
    assert.strictEqual(ffVer.new, '120.0');
  });

  it('reads rows whose trailing note is translated', () => {
    // "(somme de contrôle modifiée)" is AM's French translation of
    // "(checksum changed)": same version, different checksum.
    const result = parseUpdatedBlock([
      '-----------------------------------------------------------------------------',
      ' dummy header',
      '-----------------------------------------------------------------------------',
      ' more dummy',
      '-----------------------------------------------------------------------------',
      ' Les applications suivantes ont été mises à jour :',
      '',
      '     App                Précédente  Actuelle ',
      '-----------------------------------------------------------------------------',
      ' 1.  thunderbird        128.0      128.0     (somme de contrôle modifiée)',
      ' 2.  firefox            118.0      120.0',
      '-----------------------------------------------------------------------------',
    ].join('\n'));
    assert.ok(result.updated.has('thunderbird|system'), 'thunderbird should be detected');
    assert.ok(result.updated.has('firefox|system'));
    const tb = result.newVersions.get('thunderbird|system');
    assert.strictEqual(tb.old, '128.0');
    assert.strictEqual(tb.new, '128.0');
  });

  it('returns hasStructure=false when no separator block found', () => {
    const result = parseUpdatedBlock('no table here');
    assert.strictEqual(result.hasStructure, false);
  });

  it('ignores rows not matching the table format', () => {
    const result = parseUpdatedBlock(
      '-----\n-----\n-----\n-----\n   App                Previous  Current \n-----\n 1.  firefox  118.0  120.0\n  junk line\n-----'
    );
    assert.strictEqual(result.updated.size, 1);
    assert.ok(result.updated.has('firefox|system'));
  });
});

describe('parseChangedScripts', () => {
  const realOutput = [
    ' Checking for changes of the installation scripts in the online database...',
    ' ◆ eden has changed, you may need to reinstall it, see',
    '   https://github.com/ivan-hc/AM/blob/main/programs/x86_64/eden',
    ' ◆ gimp has changed, you may need to reinstall it, see',
    '   https://github.com/ivan-hc/AM/blob/main/programs/x86_64/gimp',
    ' ◆ mpv has changed, you may need to reinstall it, see',
    '   https://github.com/ivan-hc/AM/blob/main/programs/x86_64/mpv',
    ' To fix the above, just run "appman reinstall", without arguments',
  ].join('\n');

  // Same output with AM translated to French ("am translate fr"): the sentence
  // changes, the bullet and the URL do not.
  const frenchOutput = [
    ' V\u00e9rification des modifications des scripts d\u2019installation dans la base de donn\u00e9es en ligne...',
    ' \u25c6 qbittorrent a chang\u00e9, vous devrez peut-\u00eatre le r\u00e9installer, voir',
    '   https://github.com/ivan-hc/AM/blob/main/programs/x86_64/qbittorrent',
    ' \u25c6 qbittorrent est verrouill\u00e9, voir',
    '   https://github.com/ivan-hc/AM/blob/main/programs/x86_64/another-app',
    ' \u25c6 Updates check finished! ',
    ' Pour corriger ce qui pr\u00e9c\u00e8de, ex\u00e9cutez simplement "am reinstall", sans arguments',
  ].join('\n');

  it('detects all changed scripts with URLs', () => {
    const result = parseChangedScripts(realOutput);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].name, 'eden');
    assert.ok(result[0].url?.includes('eden'));
    assert.strictEqual(result[1].name, 'gimp');
    assert.ok(result[1].url?.includes('gimp'));
    assert.strictEqual(result[2].name, 'mpv');
  });

  it('detects changed scripts when AM is not in English', () => {
    const result = parseChangedScripts(frenchOutput);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'qbittorrent');
    assert.strictEqual(result[0].url, 'https://github.com/ivan-hc/AM/blob/main/programs/x86_64/qbittorrent');
  });

  it('returns empty array when no scripts changed', () => {
    const result = parseChangedScripts('no changes found');
    assert.deepStrictEqual(result, []);
  });

  it('ignores a bullet line whose URL is not the script of that app', () => {
    const result = parseChangedScripts(
      '\u25c6 gimp a chang\u00e9, vous devrez peut-\u00eatre le r\u00e9installer, voir\n' +
      '   https://github.com/ivan-hc/AM/blob/main/programs/x86_64/mpv'
    );
    assert.deepStrictEqual(result, []);
  });

  it('ignores the other bullet lines AM can print during an update', () => {
    const result = parseChangedScripts(
      '\u25c6 Updates check finished! \n' +
      ' \u25c6 Downloading modules/management.am...\n' +
      ' \u25c6 File: /home/user/AppImages/foo.AppImage'
    );
    assert.deepStrictEqual(result, []);
  });
});
