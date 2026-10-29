// `am -l` lists every available application with its description: measured at
// 1,109,062 bytes, above Node's default maxBuffer of 1 MiB. The command then
// fails with ERR_CHILD_PROCESS_STDIO_MAXBUFFER and the output is cut mid-line,
// which silently dropped 505 applications from the list (8538 shown of 9043).
// This is a silent data loss, so it gets a test.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const childProcess = require('child_process');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/appList.js');

let tempDir = null;
let originalExec = null;

beforeEach(() => {
  delete require.cache[require.resolve(MODULE_PATH)];
  originalExec = childProcess.exec;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gui-maxbuffer-'));
});

afterEach(() => {
  childProcess.exec = originalExec;
  delete require.cache[require.resolve(MODULE_PATH)];
  try { if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
});

function makeIpc() {
  const handlers = new Map();
  return { handlers, handle: (channel, fn) => handlers.set(channel, fn) };
}

function runWith(listOutput) {
  const calls = [];
  childProcess.exec = (command, options, callback) => {
    calls.push({ command, options });
    if (/command -v am\b/.test(command)) return void setImmediate(() => callback(null, '/usr/bin/am\n', ''));
    if (/command -v appman\b/.test(command)) return void setImmediate(() => callback(new Error('not found'), '', ''));
    if (/\s-l$/.test(command)) return void setImmediate(() => callback(null, listOutput, ''));
    if (/\s-f$/.test(command)) return void setImmediate(() => callback(null, '', ''));
    return void setImmediate(() => callback(new Error('unexpected: ' + command), '', ''));
  };
  const { registerAppListHandlers } = require(MODULE_PATH);
  const ipc = makeIpc();
  registerAppListHandlers(ipc, {
    tErr: (_k, f) => f,
    detectPackageManager: async () => ({ pm: 'am', bothFound: false }),
    invalidatePackageManagerCache: () => {},
    userDataPath: tempDir
  });
  return { handler: ipc.handlers.get('list-apps-detailed'), calls };
}

describe('package manager output size', () => {
  it('gives the list command room for the whole catalogue', async () => {
    // The default (1 MiB) is smaller than the real output.
    const { handler, calls } = runWith('◆ app1: desc\n');
    await handler({ sender: null });
    const listCall = calls.find((c) => /am -l$/.test(c.command));
    assert.ok(listCall, 'the list command ran');
    assert.ok(
      listCall.options.maxBuffer >= 8 * 1024 * 1024,
      `maxBuffer must be generous, got ${listCall.options.maxBuffer}`
    );
  });

  it('applies the same room to the installed command', async () => {
    const { handler, calls } = runWith('◆ app1: desc\n');
    await handler({ sender: null });
    const fullCall = calls.find((c) => /am -f$/.test(c.command));
    assert.ok(fullCall);
    assert.ok(fullCall.options.maxBuffer >= 8 * 1024 * 1024, 'the installed list gets the same buffer');
  });

  it('keeps every application of a large catalogue', async () => {
    // Real output shape: installed applications first, a blank line, then the
    // catalogue. The truncation measured in the wild cut into the catalogue, so
    // that is where the loss happens.
    const installed = ['\u25c6 firefox: Browser', '\u25c6 vlc: Player'];
    const catalogue = [];
    for (let i = 0; i < 6000; i += 1) catalogue.push(`\u25c6 app${i}: A description long enough to look real, number ${i}`);
    const { handler } = runWith([...installed, '', ...catalogue].join('\n'));
    const result = await handler({ sender: null });
    assert.strictEqual(result.all.length, 6002, 'no application may be dropped');
  });

  it('warns instead of silently truncating if the limit is ever reached', async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      childProcess.exec = (command, options, callback) => {
        if (/command -v am\b/.test(command)) return void setImmediate(() => callback(null, '/usr/bin/am\n', ''));
        if (/command -v appman\b/.test(command)) return void setImmediate(() => callback(new Error('nope'), '', ''));
        const err = Object.assign(new Error('stdout maxBuffer length exceeded'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
        return void setImmediate(() => callback(err, '◆ app1: desc\n', ''));
      };
      const { registerAppListHandlers } = require(MODULE_PATH);
      const ipc = makeIpc();
      registerAppListHandlers(ipc, {
        tErr: (_k, f) => f,
        detectPackageManager: async () => ({ pm: 'am', bothFound: false }),
        invalidatePackageManagerCache: () => {},
        userDataPath: tempDir
      });
      await ipc.handlers.get('list-apps-detailed')({ sender: null });
      assert.ok(
        warnings.some((w) => /maxBuffer|incomplete/i.test(w)),
        'a truncated list must be reported, not silently accepted'
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
