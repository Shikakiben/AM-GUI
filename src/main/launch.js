// Launch an installed application from the GUI (issue #97).
//
// AM creates a .desktop launcher for every installed app in
// $XDG_DATA_HOME/applications/<name>-AM.desktop (or the system-wide
// /usr/local/share/applications for system installs), and a command in
// $XDG_BIN_HOME. Going through the .desktop file is the right way: it carries
// the exact command AM chose, including the args and the environment, so we do
// not guess how an app wants to be started.
//
// Launch order:
//   1. `gio launch <file.desktop>`  — the freedesktop way, no extra dependency
//      on GTK-only helpers, works on GNOME, KDE, XFCE...
//   2. `gtk-launch <name>`          — fallback when gio is absent
//   3. the Exec= command itself     — last resort
//
// A GUI app started from a sandboxed/AppImage context can fail silently, so the
// launcher reports what it actually ran and why it failed.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function dataDirs(env = process.env) {
  const dirs = [];
  const xdgData = env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  dirs.push(path.join(xdgData, 'applications'));
  for (const entry of (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')) {
    if (!entry) continue;
    dirs.push(path.join(entry, 'applications'));
  }
  return dirs;
}

// AM writes "<name>-AM.desktop" for its own launchers; the app name is
// normalised (lowercase, spaces to dashes) in the file name.
function launcherNames(appName) {
  const base = String(appName || '').trim();
  if (!base) return [];
  const candidates = new Set([base, base.toLowerCase()]);
  return [...candidates].flatMap((name) => [`${name}-AM.desktop`, `${name}.desktop`]);
}

function findLauncher(appName, env = process.env, options = {}) {
  const exists = options.exists || ((p) => fs.existsSync(p));
  const names = launcherNames(appName);
  for (const dir of dataDirs(env)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }
  // AM also keeps the generated launchers in applications/AppImages/
  for (const dir of dataDirs(env)) {
    for (const name of names) {
      const candidate = path.join(dir, 'AppImages', name);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

// Reads Exec= from a .desktop file. Handles the quoted form and the field codes
// (%U, %f, %F...) that must be dropped when launching without a file argument.
function readExecLine(desktopPath, options = {}) {
  const readFile = options.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  let raw;
  try {
    raw = readFile(desktopPath);
  } catch (_) {
    return null;
  }
  let inEntry = false;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inEntry = trimmed === '[Desktop Entry]';
      continue;
    }
    if (!inEntry) continue;
    const match = /^Exec\s*=\s*(.+)$/.exec(trimmed);
    if (!match) continue;
    const command = match[1]
      .replace(/%[fFuUdDnNickvm]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return command || null;
  }
  return null;
}

function launcherCommandName(desktopPath) {
  return path.basename(desktopPath).replace(/\.desktop$/, '');
}

function run(command, args, options = {}) {
  const exec = options.exec || execFile;
  return new Promise((resolve) => {
    try {
      exec(command, args, { timeout: 15000 }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          error: error ? (error.code || error.message || String(error)) : null,
          stdout: stdout || '',
          stderr: stderr || ''
        });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error), stdout: '', stderr: '' });
    }
  });
}

function registerLaunchHandlers(ipcMain, deps = {}) {
  const tErr = deps.tErr || ((_key, fallback) => fallback);
  const env = deps.env || process.env;
  const logger = deps.logger || console;

  ipcMain.handle('launch-app', async (_event, appName) => {
    if (!appName || typeof appName !== 'string') {
      return { ok: false, error: tErr('errInvalidName', 'Invalid name') };
    }
    const desktopFile = findLauncher(appName, env);
    if (!desktopFile) {
      return {
        ok: false,
        error: tErr('errLauncherMissing', 'No launcher found for {name}.', { name: appName })
      };
    }

    // 1. gio launch: the freedesktop entry point.
    const gio = await run('gio', ['launch', desktopFile], { exec: deps.exec });
    if (gio.ok) return { ok: true, via: 'gio', desktopFile };

    // 2. gtk-launch: same thing, GTK-only helper.
    const gtk = await run('gtk-launch', [launcherCommandName(desktopFile)], { exec: deps.exec });
    if (gtk.ok) return { ok: true, via: 'gtk-launch', desktopFile };

    // 3. The Exec= command itself, as a last resort.
    const execLine = readExecLine(desktopFile, { readFile: deps.readFile });
    if (execLine) {
      const [command, ...args] = execLine.split(' ').filter(Boolean);
      const direct = await run(command, args, { exec: deps.exec });
      if (direct.ok) return { ok: true, via: 'exec', desktopFile };
    }

    logger.warn?.('[launch] all methods failed for', appName, {
      gio: gio.error,
      gtk: gtk.error
    });
    return {
      ok: false,
      desktopFile,
      error: tErr('errLaunchFailed', 'Could not start {name}.', { name: appName }),
      details: { gio: gio.error, gtk: gtk.error }
    };
  });
}

module.exports = {
  registerLaunchHandlers,
  findLauncher,
  readExecLine,
  launcherCommandName,
  launcherNames,
  dataDirs
};
