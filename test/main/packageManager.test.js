const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const childProcess = require('child_process');

let originalExec;

beforeEach(() => {
  originalExec = childProcess.exec;
  delete require.cache[require.resolve('/home/moi/AM-GUI/src/main/packageManager.js')];
});

afterEach(() => {
  childProcess.exec = originalExec;
  delete require.cache[require.resolve('/home/moi/AM-GUI/src/main/packageManager.js')];
});

describe('detectPackageManager', () => {
  it("returns 'am' only when only am is found", async () => {
    childProcess.exec = (cmd, callback) => {
      if (cmd === 'command -v am') return callback(null);
      return callback(new Error('not found'));
    };
    const { detectPackageManager } = require('/home/moi/AM-GUI/src/main/packageManager.js');
    const result = await detectPackageManager(true);
    assert.strictEqual(result.pm, 'am');
    assert.strictEqual(result.bothFound, false);
  });

  it("returns 'appman' only when only appman is found", async () => {
    childProcess.exec = (cmd, callback) => {
      if (cmd === 'command -v appman') return callback(null);
      return callback(new Error('not found'));
    };
    const { detectPackageManager } = require('/home/moi/AM-GUI/src/main/packageManager.js');
    const result = await detectPackageManager(true);
    assert.strictEqual(result.pm, 'appman');
    assert.strictEqual(result.bothFound, false);
  });

  it('returns bothFound=true when both are found', async () => {
    childProcess.exec = (cmd, callback) => callback(null);
    const { detectPackageManager } = require('/home/moi/AM-GUI/src/main/packageManager.js');
    const result = await detectPackageManager(true);
    assert.strictEqual(result.pm, 'am');
    assert.strictEqual(result.bothFound, true);
  });

  it('returns pm=null when neither is found', async () => {
    childProcess.exec = (cmd, callback) => callback(new Error('not found'));
    const { detectPackageManager } = require('/home/moi/AM-GUI/src/main/packageManager.js');
    const result = await detectPackageManager(true);
    assert.strictEqual(result.pm, null);
    assert.strictEqual(result.bothFound, false);
  });

  it('caches results for 60s', async () => {
    let execCount = 0;
    childProcess.exec = (cmd, callback) => {
      execCount++;
      callback(null);
    };
    const { detectPackageManager } = require('/home/moi/AM-GUI/src/main/packageManager.js');
    await detectPackageManager();
    await detectPackageManager();
    assert.strictEqual(execCount, 2);
  });

  it('invalidatePackageManagerCache clears cache', async () => {
    let execCount = 0;
    childProcess.exec = (cmd, callback) => {
      execCount++;
      callback(null);
    };
    const { detectPackageManager, invalidatePackageManagerCache } = require('/home/moi/AM-GUI/src/main/packageManager.js');
    await detectPackageManager();
    invalidatePackageManagerCache();
    await detectPackageManager();
    assert.strictEqual(execCount, 4);
  });
});
