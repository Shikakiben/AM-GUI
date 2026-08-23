const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/uninstall.js');
const Module = require('module');
const _originalRequire = Module.prototype.require;

let handler;
let detectPmResult;

beforeEach(() => {
  delete require.cache[require.resolve(MODULE_PATH)];
  detectPmResult = { pm: null };

  Module.prototype.require = function (id) {
    if (id === 'node-pty') {
      throw new Error('FakePty: node-pty mocked for tests');
    }
    return _originalRequire.apply(this, arguments);
  };

  const fakeIpcMain = {
    _handlers: {},
    handle(name, fn) { this._handlers[name] = fn; },
  };

  const deps = {
    tErr: (_, msg) => msg,
    detectPackageManager: async () => detectPmResult,
    invalidatePackageManagerCache: () => {},
    passwordWaiters: new Map(),
  };

  const { registerUninstallHandler } = require(MODULE_PATH);
  registerUninstallHandler(fakeIpcMain, deps);
  handler = fakeIpcMain._handlers['uninstall-app'];
});

afterEach(() => {
  Module.prototype.require = _originalRequire;
  delete require.cache[require.resolve(MODULE_PATH)];
});

describe('uninstall-app handler', () => {
  it('should return error when pm is not found', async () => {
    detectPmResult = { pm: null };
    const result = await handler(null, 'firefox');
    assert.ok(result.error, 'expected error property');
    assert.strictEqual('ok' in result, false);
  });

  it('should return error when appName is empty string', async () => {
    detectPmResult = { pm: 'am' };
    const result = await handler(null, '');
    assert.ok(result.error, 'expected error property');
    assert.strictEqual('ok' in result, false);
  });

  it('should return error when appName is undefined', async () => {
    detectPmResult = { pm: 'am' };
    const result = await handler(null, undefined);
    assert.ok(result.error, 'expected error property');
    assert.strictEqual('ok' in result, false);
  });

  it('should pass guard clauses with valid pm and appName', async () => {
    detectPmResult = { pm: 'am' };
    const result = await handler(null, 'firefox');
    assert.strictEqual(result.ok, false, 'expected ok=false from pty catch block');
    assert.ok(result.error, 'expected error message from pty catch block');
  });
});
