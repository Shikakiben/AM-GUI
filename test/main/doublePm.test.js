// Main-process tests: PM cache invalidation
// Must run standalone due to exec mocking: node --test test/main/doublePm.test.js

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const childProcess = require('child_process');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/packageManager.js');

let originalExec;
let mod = null;

beforeEach(() => {
  originalExec = childProcess.exec;
  delete require.cache[require.resolve(MODULE_PATH)];
  mod = require(MODULE_PATH);
});

afterEach(() => {
  childProcess.exec = originalExec;
  delete require.cache[require.resolve(MODULE_PATH)];
  mod = null;
});

describe('PM detection + cache', () => {
  it('full cycle: detect → cache → invalidate → re-detect', async () => {
    // 1) appman found
    childProcess.exec = (cmd, opts, cb) => {
      const cbFn = typeof opts === 'function' ? opts : cb;
      if (cmd.includes('appman')) return cbFn(null);
      return cbFn(new Error('not found'));
    };
    const r1 = await mod.detectPackageManager();
    assert.strictEqual(r1.pm, 'appman');
    assert.strictEqual(r1.bothFound, false);

    // 2) cache hides PM disappearance
    childProcess.exec = (cmd, opts, cb) => {
      const cbFn = typeof opts === 'function' ? opts : cb;
      return cbFn(new Error('not found'));
    };
    const r2 = await mod.detectPackageManager();
    assert.strictEqual(r2.pm, 'appman', 'cache must return stale value');

    // 3) invalidate → re-detect → nothing found
    mod.invalidatePackageManagerCache();
    const r3 = await mod.detectPackageManager();
    assert.strictEqual(r3.pm, null, 'must detect nothing after invalidation');
    assert.strictEqual(r3.bothFound, false);

    // 4) both PMs appear (need fresh detection, cache still holds null)
    mod.invalidatePackageManagerCache();
    childProcess.exec = (cmd, opts, cb) => {
      const cbFn = typeof opts === 'function' ? opts : cb;
      return cbFn(null);
    };
    const r4 = await mod.detectPackageManager();
    assert.strictEqual(r4.bothFound, true);
  });
});

