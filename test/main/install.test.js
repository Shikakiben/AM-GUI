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
      written: [],
      onData(cb) { child._onData = cb; },
      onExit(cb) { child._onExit = cb; },
      kill() {},
      write(d) { child.written.push(d); },
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

  it('should return error when id is unknown', async () => {
    const result = await handlers['install-send-choice'](null, 'nope', '1');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });

  // Free-form prompts: an empty string means "just press Enter", which is a
  // valid answer (e.g. accept the default local install path). It must be
  // forwarded as a bare newline, not rejected.
  it('accepts an empty string as a valid answer (pressed Enter)', async () => {
    detectPmResult = { pm: 'am' };
    const started = await handlers['install-start'](makeEvent(), 'firefox');
    const child = activeInstalls.get(started.id);

    const result = await handlers['install-send-choice'](null, started.id, '');

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(child.written, ['\n']);
    if (child._onExit) child._onExit({ exitCode: 0 });
  });

  it('writes a typed free-form answer followed by a newline', async () => {
    detectPmResult = { pm: 'am' };
    const started = await handlers['install-start'](makeEvent(), 'firefox');
    const child = activeInstalls.get(started.id);

    const result = await handlers['install-send-choice'](null, started.id, '/home/user/Apps');

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(child.written, ['/home/user/Apps\n']);
    if (child._onExit) child._onExit({ exitCode: 0 });
  });

  it('rejects a non-string, non-number choice', async () => {
    detectPmResult = { pm: 'am' };
    const started = await handlers['install-start'](makeEvent(), 'firefox');
    const child = activeInstalls.get(started.id);

    const result = await handlers['install-send-choice'](null, started.id, null);

    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
    assert.deepStrictEqual(child.written, []);
    if (child._onExit) child._onExit({ exitCode: 0 });
  });
});

describe('free-form prompt detection', () => {
  // A free-form prompt (e.g. "where do you want to install the apps?") has no
  // numbered options. When AM goes quiet, AM-GUI must surface the WHOLE block,
  // not just the last line, so the user keeps the context.
  it('forwards the whole block, not only the last line', async () => {
    detectPmResult = { pm: 'am' };
    const sent = [];
    // install-progress is sent as wc.send(channel, payload), so collect arg 2.
    const started = await handlers['install-start'](makeEvent((_channel, msg) => sent.push(msg)), 'mpv');
    const child = activeInstalls.get(started.id);

    let prompt;
    try {
      const block = [
        '----------------------------',
        '>>> Configure AppMan',
        '----------------------------',
        ' Where do you want to install the apps?',
        '',
        ' Write the path or just press Enter to use the default:',
        '----------------------------',
      ].join('\r\n');
      child._onData(block);

      // The silence watchdog waits ~2.5s before firing.
      await new Promise((r) => setTimeout(r, 2700));
      prompt = sent.find((m) => m.kind === 'choice-prompt');
    } finally {
      // Always exit the child: it clears the 10-minute kill timer that would
      // otherwise keep the test process alive.
      if (child._onExit) child._onExit({ exitCode: 0 });
    }

    assert.ok(prompt, 'a choice-prompt should have been sent');
    assert.strictEqual(prompt.freeform, true);
    assert.deepStrictEqual(prompt.options, []);
    assert.match(prompt.prompt, /Configure AppMan/);
    assert.match(prompt.prompt, /just press Enter to use the default:/);
  });
});
