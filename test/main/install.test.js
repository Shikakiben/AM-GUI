const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/install.js');
const Module = require('module');
const _originalRequire = Module.prototype.require;

let handlers;
let detectPmResult;
let activeInstalls;
let installAppManAutoFn;

const fakePty = {
  spawn() {
    const child = {
      onData(cb) { child._onData = cb; },
      onExit(cb) { child._onExit = cb; },
      kill() {},
      write() {},
      on() {},
    };
    return child;
  },
};

function makeEvent(send) {
  return { sender: { send: send || (() => {}) } };
}

beforeEach(() => {
  delete require.cache[require.resolve(MODULE_PATH)];
  detectPmResult = { pm: null };
  activeInstalls = new Map();
  installAppManAutoFn = () => { throw new Error('installAppManAuto not mocked'); };

  Module.prototype.require = function (id) {
    if (id === 'node-pty') return fakePty;
    return _originalRequire.apply(this, arguments);
  };

  const fakeIpcMain = {
    _handlers: {},
    handle(name, fn) { this._handlers[name] = fn; },
    on() {},
  };

  const deps = {
    tErr: (_, msg) => msg,
    detectPackageManager: async () => detectPmResult,
    invalidatePackageManagerCache: () => {},
    passwordWaiters: new Map(),
    activeInstalls,
    installAppManAuto(...args) { return installAppManAutoFn(...args); },
  };

  const { registerInstallHandlers } = require(MODULE_PATH);
  registerInstallHandlers(fakeIpcMain, deps);
  handlers = fakeIpcMain._handlers;
});

afterEach(() => {
  Module.prototype.require = _originalRequire;
  delete require.cache[require.resolve(MODULE_PATH)];
});

describe('install-start handler', () => {
  it('should return error when pm is not found', async () => {
    detectPmResult = { pm: null };
    const result = await handlers['install-start'](null, 'firefox');
    assert.ok(result.error);
    assert.strictEqual('ok' in result, false);
  });

  it('should return error when name is empty string', async () => {
    detectPmResult = { pm: 'am' };
    const result = await handlers['install-start'](null, '');
    assert.ok(result.error);
    assert.strictEqual('ok' in result, false);
  });

  it('should return error when name is undefined', async () => {
    detectPmResult = { pm: 'am' };
    const result = await handlers['install-start'](null, undefined);
    assert.ok(result.error);
    assert.strictEqual('ok' in result, false);
  });

  it('should return id when pm and name are valid', async () => {
    detectPmResult = { pm: 'am' };
    const result = await handlers['install-start'](makeEvent(), 'firefox');
    assert.ok(result.id);
    assert.strictEqual(typeof result.id, 'string');
    const child = activeInstalls.get(result.id);
    if (child && child._onExit) {
      child._onExit({ exitCode: 0 });
    }
  });
});

describe('dep-install handler', () => {
  it('should return error when pm is not found', async () => {
    detectPmResult = { pm: null };
    const result = await handlers['dep-install'](null, 'firefox');
    assert.ok(result.error);
  });

  it('should return error when name is invalid', async () => {
    detectPmResult = { pm: 'am' };
    const result = await handlers['dep-install'](null, '');
    assert.ok(result.error);
  });
});

describe('install-appman-auto handler', () => {
  it('should return ok when installAppManAuto succeeds', async () => {
    installAppManAutoFn = async () => 'installed';
    const result = await handlers['install-appman-auto']();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result, 'installed');
  });
});

describe('install-cancel handler', () => {
  it('should return error when id is missing', async () => {
    const result = await handlers['install-cancel'](null, null);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });

  it('should return error when id is not found', async () => {
    const result = await handlers['install-cancel'](null, 'nonexistent');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });
});

describe('install-send-choice handler', () => {
  it('should return error when id is missing', async () => {
    const result = await handlers['install-send-choice'](null, null, '1');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });
});
