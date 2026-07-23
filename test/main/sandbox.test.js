const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/sandbox.js');

function reloadModule() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

describe('normalizeCustomSandboxPath', () => {
  let normalizeCustomSandboxPath;

  beforeEach(() => {
    ({ normalizeCustomSandboxPath } = reloadModule());
  });

  it('returns empty string for empty string input', () => {
    assert.strictEqual(normalizeCustomSandboxPath(''), '');
  });

  it('returns empty string for undefined input', () => {
    assert.strictEqual(normalizeCustomSandboxPath(undefined), '');
  });

  it('returns empty string for null input', () => {
    assert.strictEqual(normalizeCustomSandboxPath(null), '');
  });

  it('expands ~/Documents to homedir/Documents', () => {
    const result = normalizeCustomSandboxPath('~/Documents');
    const expected = path.resolve(path.join(os.homedir(), 'Documents'));
    assert.strictEqual(result, expected);
  });

  it('expands ~ to homedir', () => {
    const result = normalizeCustomSandboxPath('~');
    assert.strictEqual(result, os.homedir());
  });

  it('resolves an absolute path as-is', () => {
    const result = normalizeCustomSandboxPath('/absolute/path');
    assert.strictEqual(result, path.resolve('/absolute/path'));
  });

  it('returns empty string for whitespace-only string', () => {
    assert.strictEqual(normalizeCustomSandboxPath('   '), '');
  });

  it('returns empty string for number input', () => {
    assert.strictEqual(normalizeCustomSandboxPath(123), '');
  });
});

describe('buildSandboxAnswerScript', () => {
  let buildSandboxAnswerScript;

  beforeEach(() => {
    ({ buildSandboxAnswerScript } = reloadModule());
  });

  it('returns just n when shouldConfigure is false', () => {
    assert.strictEqual(buildSandboxAnswerScript(false, {}, ''), 'n\n');
  });

  it('returns y + 7 dir ns + n for custom when no dirs and no customPath', () => {
    const result = buildSandboxAnswerScript(true, {}, '');
    assert.strictEqual(result, 'y\nn\nn\nn\nn\nn\nn\nn\nn\n');
  });

  it('returns y + correct dir selections when desktop and documents are selected', () => {
    const result = buildSandboxAnswerScript(true, { desktop: true, documents: true }, '');
    assert.strictEqual(result, 'y\ny\ny\nn\nn\nn\nn\nn\nn\n');
  });

  it('returns y + all dir ns + y + customPath when custom path is provided', () => {
    const result = buildSandboxAnswerScript(true, {}, '/tmp/test');
    assert.strictEqual(result, 'y\nn\nn\nn\nn\nn\nn\nn\ny\n/tmp/test\n');
  });

  it('throws when dirSelections is null', () => {
    assert.throws(() => buildSandboxAnswerScript(true, null, ''), /Cannot read propert|TypeError/);
  });

  it('throws when dirSelections is undefined', () => {
    assert.throws(() => buildSandboxAnswerScript(true, undefined, ''), /Cannot read propert|TypeError/);
  });

  it('handles combination of dir selections and custom path', () => {
    const result = buildSandboxAnswerScript(true, { pictures: true, videos: true }, '/opt/share');
    assert.strictEqual(result, 'y\nn\nn\nn\nn\nn\ny\ny\ny\n/opt/share\n');
  });

  it('treats 0 (falsy) same as false', () => {
    const result = buildSandboxAnswerScript(0, {}, '');
    assert.strictEqual(result, 'n\n');
  });
});

describe('getForbiddenSandboxPaths', () => {
  let getForbiddenSandboxPaths;

  beforeEach(() => {
    ({ getForbiddenSandboxPaths } = reloadModule());
  });

  it('returns a Set', () => {
    const result = getForbiddenSandboxPaths();
    assert.ok(result instanceof Set);
  });

  it('contains home directory', () => {
    const result = getForbiddenSandboxPaths();
    assert.ok(result.has(path.resolve(os.homedir())));
  });

  it('contains resolved root', () => {
    const result = getForbiddenSandboxPaths();
    assert.ok(result.has(path.resolve('/')));
  });

  it('contains resolved /home', () => {
    const result = getForbiddenSandboxPaths();
    assert.ok(result.has(path.resolve('/home')));
  });

  it('contains XDG_DATA_HOME or its default', () => {
    const result = getForbiddenSandboxPaths();
    const dataDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
    assert.ok(result.has(path.resolve(dataDir)));
  });

  it('contains XDG_CONFIG_HOME or its default', () => {
    const result = getForbiddenSandboxPaths();
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    assert.ok(result.has(path.resolve(configDir)));
  });

  it('contains XDG_BIN_HOME or its default', () => {
    const result = getForbiddenSandboxPaths();
    const binDir = process.env.XDG_BIN_HOME || path.join(os.homedir(), '.local/bin');
    assert.ok(result.has(path.resolve(binDir)));
  });
});

describe('SANDBOX_DIR_KEYS', () => {
  it('is an array with the expected 7 directory keys', () => {
    const { SANDBOX_DIR_KEYS } = reloadModule();
    assert.deepStrictEqual(SANDBOX_DIR_KEYS, [
      'desktop', 'documents', 'downloads', 'games', 'music', 'pictures', 'videos'
    ]);
  });
});
