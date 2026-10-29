// AM can be slow or hang: with a proxy configured, `am -l` performs network
// checks that go through it. Two failures were observed in practice:
//   - the GUI waited forever with an empty window;
//   - every refresh stacked another pair of processes (six `appman -l` were
//     seen running at once).
// These tests cover the two guards: a hard timeout per command, and a single
// in-flight fetch shared by every caller.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const childProcess = require('child_process');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/appList.js');

let tempDir = null;
let originalExec = null;

function makeIpc() {
  const handlers = new Map();
  return { handlers, handle: (channel, fn) => handlers.set(channel, fn) };
}

beforeEach(() => {
  delete require.cache[require.resolve(MODULE_PATH)];
  originalExec = childProcess.exec;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gui-timeout-'));
});

afterEach(() => {
  childProcess.exec = originalExec;
  delete require.cache[require.resolve(MODULE_PATH)];
  try { if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
});

// The module detects the package manager through `command -v`; answer that, and
// let the caller decide what `-l` / `-f` do.
function stubExec({ onList, onFull }) {
  const calls = [];
  childProcess.exec = (command, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : (options || {});
    calls.push({ command, opts });
    if (/command -v am\b/.test(command)) return void setImmediate(() => cb(null, '/usr/bin/am\n', ''));
    if (/command -v appman\b/.test(command)) return void setImmediate(() => cb(new Error('not found'), '', ''));
    if (/\s-l$/.test(command)) return onList(cb, opts);
    if (/\s-f$/.test(command)) return onFull(cb, opts);
    return void setImmediate(() => cb(new Error('unexpected: ' + command), '', ''));
  };
  return calls;
}

describe('AM command timeout', () => {
  it('gives up instead of waiting forever, and says why', async () => {
    // `am -l` never answers; the timeout option must fire.
    stubExec({
      onList: (cb) => setTimeout(() => cb(Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' }), '', ''), 10),
      onFull: (cb) => setTimeout(() => cb(Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' }), '', ''), 10)
    });
    const { registerAppListHandlers } = require(MODULE_PATH);
    const ipc = makeIpc();
    registerAppListHandlers(ipc, {
      tErr: (key, fallback, vars) => {
        let out = fallback;
        for (const [k, v] of Object.entries(vars || {})) out = out.replace(`{${k}}`, v);
        return out;
      },
      detectPackageManager: async () => ({ pm: 'am', bothFound: false }),
      invalidatePackageManagerCache: () => {},
      userDataPath: tempDir
    });

    const result = await ipc.handlers.get('list-apps-detailed')({ sender: null });
    assert.strictEqual(result.timedOut, true, 'the timeout must be reported, not hidden');
    assert.ok(result.error, 'the user gets a message');
    assert.match(result.error, /45/, 'the message names the delay');
    assert.deepStrictEqual(result.all, [], 'no partial list');
  });

  it('passes the timeout to every AM command', async () => {
    const calls = stubExec({
      onList: (cb) => setImmediate(() => cb(null, '◆ a: desc\n', '')),
      onFull: (cb) => setImmediate(() => cb(null, '', ''))
    });
    const { registerAppListHandlers } = require(MODULE_PATH);
    const ipc = makeIpc();
    registerAppListHandlers(ipc, {
      tErr: (_k, f) => f,
      detectPackageManager: async () => ({ pm: 'am', bothFound: false }),
      invalidatePackageManagerCache: () => {},
      userDataPath: tempDir
    });
    await ipc.handlers.get('list-apps-detailed')({ sender: null });

    const listCalls = calls.filter((c) => /\sam\s-l$/.test(c.command) || /\s-l$/.test(c.command));
    assert.ok(listCalls.length > 0, 'the list command ran');
    for (const call of listCalls) {
      assert.strictEqual(call.opts.timeout, 45000, 'a timeout is set on every AM call');
      assert.strictEqual(call.opts.killSignal, 'SIGKILL', 'the process is really killed');
    }
  });
});

describe('concurrent fetches', () => {
  it('shares one fetch between simultaneous callers', async () => {
    // Every caller used to start its own pair of AM processes: six `appman -l`
    // were seen running at once.
    let listRuns = 0;
    stubExec({
      onList: (cb) => { listRuns += 1; setTimeout(() => cb(null, '◆ a: desc\n', ''), 30); },
      onFull: (cb) => setTimeout(() => cb(null, '', ''), 30)
    });
    const { registerAppListHandlers } = require(MODULE_PATH);
    const ipc = makeIpc();
    registerAppListHandlers(ipc, {
      tErr: (_k, f) => f,
      detectPackageManager: async () => ({ pm: 'am', bothFound: false }),
      invalidatePackageManagerCache: () => {},
      userDataPath: tempDir
    });

    // No cache on disk, so each call would normally fetch fresh.
    const handler = ipc.handlers.get('list-apps-detailed');
    const results = await Promise.all([
      handler({ sender: null }),
      handler({ sender: null }),
      handler({ sender: null })
    ]);

    assert.strictEqual(listRuns, 1, `AM must run once, not ${listRuns} times`);
    for (const r of results) {
      assert.ok(Array.isArray(r.all), 'every caller gets the result');
    }
  });
});
