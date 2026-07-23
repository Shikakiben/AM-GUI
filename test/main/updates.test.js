const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/updates.js');
const Module = require('module');
const _originalRequire = Module.prototype.require;

let handlers;
let isExternalUpdateRunning;
let detectPmResult;
let activeUpdates;
let externalUpdateRunning;

const fakePty = {
  spawn() {
    return {
      onData() {},
      onExit() {},
      kill() {},
      write() {},
      on() {},
    };
  },
};

function makeFakeChildProcess() {
  return {
    exec(cmd, cb) {
      if (externalUpdateRunning) {
        cb(null, '', '');
      } else {
        cb(new Error('not found'), '', '');
      }
    },
    spawn() {
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on() {},
        kill() {},
      };
    },
  };
}

beforeEach(() => {
  delete require.cache[require.resolve(MODULE_PATH)];
  detectPmResult = { pm: null };
  activeUpdates = new Map();
  externalUpdateRunning = false;

  Module.prototype.require = function (id) {
    if (id === 'node-pty') return fakePty;
    if (id === 'child_process') return makeFakeChildProcess();
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
    activeUpdates,
  };

  const updates = require(MODULE_PATH);
  updates.registerUpdatesHandlers(fakeIpcMain, deps);
  handlers = fakeIpcMain._handlers;
  isExternalUpdateRunning = updates.isExternalUpdateRunning;
});

afterEach(() => {
  Module.prototype.require = _originalRequire;
  delete require.cache[require.resolve(MODULE_PATH)];
});

describe('isExternalUpdateRunning', () => {
  it('should return true when an external update process is running', async () => {
    externalUpdateRunning = true;
    const result = await isExternalUpdateRunning('am');
    assert.strictEqual(result, true);
  });

  it('should return false when no update process is running', async () => {
    externalUpdateRunning = false;
    const result = await isExternalUpdateRunning('am');
    assert.strictEqual(result, false);
  });
});

describe('updates-start handler', () => {
  it('should return error when pm is not found', async () => {
    detectPmResult = { pm: null };
    const result = await handlers['updates-start'](null);
    assert.ok(result.error);
  });

  it('should return error when external update is already running', async () => {
    detectPmResult = { pm: 'am' };
    externalUpdateRunning = true;
    const result = await handlers['updates-start'](null);
    assert.strictEqual(result.error, 'external-update-running');
  });
});

describe('updates-cancel handler', () => {
  it('should return error when id is missing', async () => {
    const result = await handlers['updates-cancel'](null, null);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });

  it('should return error when id is not found', async () => {
    const result = await handlers['updates-cancel'](null, 'nonexistent');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });
});

describe('updates-bulk handler', () => {
  it('should return error when pm is not found', async () => {
    detectPmResult = { pm: null };
    const result = await handlers['updates-bulk'](null);
    assert.ok(result.error);
  });

  it('should return error when external update is running', async () => {
    detectPmResult = { pm: 'am' };
    externalUpdateRunning = true;
    const result = await handlers['updates-bulk'](null);
    assert.strictEqual(result.error, 'external-update-running');
  });
});
