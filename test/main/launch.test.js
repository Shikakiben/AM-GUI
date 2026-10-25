// Launching an installed app from the GUI (issue #97).
// AM creates <name>-AM.desktop launchers; we go through them rather than
// guessing how an app wants to be started.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const repoRoot = path.resolve(__dirname, '..', '..');
const {
  registerLaunchHandlers,
  findLauncher,
  readExecLine,
  launcherCommandName,
  launcherNames,
  dataDirs
} = require(path.join(repoRoot, 'src/main/launch'));

// A fixed XDG layout so the expected paths do not depend on the test machine.
const TEST_ENV = { XDG_DATA_HOME: '/home/u/.local/share', XDG_DATA_DIRS: '/usr/local/share:/usr/share' };

function fakeIpc() {
  const handlers = new Map();
  return { handlers, handle: (channel, fn) => handlers.set(channel, fn) };
}

// Fake spawn that records calls and answers per command name. The launcher uses
// spawn + 'exit' because a GUI app keeps execFile's pipes open forever.
function fakeSpawn(answers) {
  const calls = [];
  const { EventEmitter } = require('events');
  const spawn = (command, args) => {
    calls.push([command, ...args]);
    const child = new EventEmitter();
    child.kill = () => {};
    child.unref = () => {};
    const answer = answers[command];
    // Emit on the next tick, but let the caller attach its listeners first.
    process.nextTick(() => {
      if (answer === 'ok') child.emit('exit', 0, null);
      else if (answer === 'ENOENT') child.emit('error', Object.assign(new Error('spawn failed'), { code: 'ENOENT' }));
      else child.emit('exit', 1, null);
    });
    return child;
  };
  return { spawn, calls };
}

describe('launcher discovery', () => {
  it('builds the names AM uses', () => {
    const names = launcherNames('Brave');
    assert.ok(names.includes('Brave-AM.desktop'));
    assert.ok(names.includes('brave-AM.desktop'));
    assert.deepStrictEqual(launcherNames(''), []);
  });

  it('looks in the XDG data dirs, user first', () => {
    const dirs = dataDirs({ XDG_DATA_HOME: '/home/u/.local/share', XDG_DATA_DIRS: '/usr/local/share:/usr/share' });
    assert.strictEqual(dirs[0], '/home/u/.local/share/applications');
    assert.ok(dirs.includes('/usr/share/applications'));
  });

  it('falls back to the XDG defaults when nothing is set', () => {
    const dirs = dataDirs({});
    assert.ok(dirs[0].endsWith('/.local/share/applications'));
    assert.ok(dirs.includes('/usr/share/applications'));
  });

  it('finds the AM launcher of an installed app', () => {
    const present = new Set(['/home/u/.local/share/applications/beaver-notes-AM.desktop']);
    const found = findLauncher('beaver-notes', TEST_ENV, { exists: (p) => present.has(p) });
    assert.strictEqual(found, '/home/u/.local/share/applications/beaver-notes-AM.desktop');
  });

  it('finds a system-wide launcher too', () => {
    const present = new Set(['/usr/share/applications/brave-AM.desktop']);
    const found = findLauncher('brave', TEST_ENV, { exists: (p) => present.has(p) });
    assert.strictEqual(found, '/usr/share/applications/brave-AM.desktop');
  });

  it('returns null when the app has no launcher', () => {
    assert.strictEqual(findLauncher('nope', TEST_ENV, { exists: () => false }), null);
  });
});

describe('Exec= parsing', () => {
  const desktop = (execLine) => `[Desktop Entry]\nName=Test\n${execLine}\n[Desktop Action new]\nExec=/ignored %U\n`;

  it('reads the command and drops field codes', () => {
    assert.strictEqual(readExecLine('/x.desktop', { readFile: () => desktop('Exec=/home/u/.local/bin/app %U') }), '/home/u/.local/bin/app');
  });

  it('keeps real arguments', () => {
    assert.strictEqual(readExecLine('/x.desktop', { readFile: () => desktop('Exec=/usr/bin/app --show') }), '/usr/bin/app --show');
  });

  it('ignores actions outside [Desktop Entry]', () => {
    const onlyAction = '[Desktop Entry]\nName=X\n[Desktop Action new]\nExec=/should/not/match\n';
    assert.strictEqual(readExecLine('/x.desktop', { readFile: () => onlyAction }), null);
  });

  it('survives a missing or unreadable file', () => {
    assert.strictEqual(readExecLine('/nope.desktop', { readFile: () => { throw new Error('ENOENT'); } }), null);
  });

  it('derives the name gtk-launch expects', () => {
    assert.strictEqual(launcherCommandName('/home/u/.local/share/applications/brave-AM.desktop'), 'brave-AM');
  });
});

describe('launch handler', () => {
  const tErr = (key, fallback, vars) => {
    let out = fallback;
    for (const [k, v] of Object.entries(vars || {})) out = out.replace(`{${k}}`, v);
    return out;
  };

  it('rejects an invalid name', async () => {
    const ipc = fakeIpc();
    registerLaunchHandlers(ipc, { tErr, logger: { warn() {} } });
    const result = await ipc.handlers.get('launch-app')(null, '');
    assert.strictEqual(result.ok, false);
  });

  it('reports a missing launcher with a helpful message', async () => {
    const ipc = fakeIpc();
    registerLaunchHandlers(ipc, { tErr, logger: { warn() {} }, env: TEST_ENV });
    const result = await ipc.handlers.get('launch-app')(null, 'app-that-does-not-exist-xyz');
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /No launcher found/);
  });

  it('launches through gio when available', async () => {
    const ipc = fakeIpc();
    const { spawn, calls } = fakeSpawn({ gio: 'ok' });
    const present = new Set(['/home/u/.local/share/applications/beaver-notes-AM.desktop']);
    registerLaunchHandlers(ipc, { tErr, spawn, env: TEST_ENV, logger: { warn() {} } });
    // point the discovery at our fake filesystem
    const realExists = fs.existsSync;
    fs.existsSync = (p) => present.has(p) || false;
    try {
      const result = await ipc.handlers.get('launch-app')(null, 'beaver-notes');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.via, 'gio');
      assert.deepStrictEqual(calls[0], ['gio', 'launch', '/home/u/.local/share/applications/beaver-notes-AM.desktop']);
    } finally {
      fs.existsSync = realExists;
    }
  });

  it('falls back to gtk-launch when gio is missing', async () => {
    const ipc = fakeIpc();
    const { spawn, calls } = fakeSpawn({ gio: 'ENOENT', 'gtk-launch': 'ok' });
    const present = new Set(['/home/u/.local/share/applications/beaver-notes-AM.desktop']);
    registerLaunchHandlers(ipc, { tErr, spawn, env: TEST_ENV, logger: { warn() {} } });
    const realExists = fs.existsSync;
    fs.existsSync = (p) => present.has(p) || false;
    try {
      const result = await ipc.handlers.get('launch-app')(null, 'beaver-notes');
      assert.strictEqual(result.via, 'gtk-launch');
      assert.deepStrictEqual(calls[1], ['gtk-launch', 'beaver-notes-AM']);
    } finally {
      fs.existsSync = realExists;
    }
  });

  it('falls back to the Exec command as a last resort', async () => {
    const ipc = fakeIpc();
    const { spawn, calls } = fakeSpawn({ gio: 'ENOENT', 'gtk-launch': 'ENOENT', '/usr/bin/myapp': 'ok' });
    const present = new Set(['/home/u/.local/share/applications/myapp-AM.desktop']);
    registerLaunchHandlers(ipc, {
      tErr,
      spawn,
      env: TEST_ENV,
      logger: { warn() {} },
      readFile: () => '[Desktop Entry]\nExec=/usr/bin/myapp --flag\n'
    });
    const realExists = fs.existsSync;
    fs.existsSync = (p) => present.has(p) || false;
    try {
      const result = await ipc.handlers.get('launch-app')(null, 'myapp');
      assert.strictEqual(result.via, 'exec');
      assert.deepStrictEqual(calls[2], ['/usr/bin/myapp', '--flag']);
    } finally {
      fs.existsSync = realExists;
    }
  });

  it('reports a clear failure when every method fails', async () => {
    const ipc = fakeIpc();
    const { spawn } = fakeSpawn({ gio: 'ENOENT', 'gtk-launch': 'ENOENT' });
    const present = new Set(['/home/u/.local/share/applications/myapp-AM.desktop']);
    registerLaunchHandlers(ipc, { tErr, spawn, env: TEST_ENV, logger: { warn() {} }, readFile: () => '[Desktop Entry]\nExec=/usr/bin/myapp\n' });
    const realExists = fs.existsSync;
    fs.existsSync = (p) => present.has(p) || false;
    try {
      const result = await ipc.handlers.get('launch-app')(null, 'myapp');
      assert.strictEqual(result.ok, false);
      assert.match(result.error, /Could not start myapp/);
      assert.ok(result.details, 'the failure keeps the per-method reasons');
    } finally {
      fs.existsSync = realExists;
    }
  });
});
