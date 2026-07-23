const path = require('path');
const fs = require('fs');
const os = require('os');

function parseListOutput(stdout) {
  const catalogSet = new Set();
  const catalogDesc = new Map();
  const installedFromCatalog = new Set();
  const installedDesc = new Map();
  const diamondSet = new Set();
  let inCatalog = false;
  let seenAppEntry = false;
  let curName = null;
  let curDesc = null;

  const flushEntry = () => {
    if (!curName) return;
    if (!inCatalog) {
      installedFromCatalog.add(curName);
      if (curDesc) installedDesc.set(curName, curDesc);
    } else {
      catalogSet.add(curName);
      if (curDesc) catalogDesc.set(curName, curDesc);
    }
    diamondSet.add(curName);
    curName = null;
    curDesc = null;
  };

  const lines = (stdout || '').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      if (seenAppEntry && !inCatalog) { flushEntry(); inCatalog = true; }
      else { flushEntry(); }
      continue;
    }
    if (line.startsWith('\u25c6')) {
      flushEntry();
      const rest = line.slice(1).trim();
      const colonIdx = rest.indexOf(':');
      let left = rest;
      let desc = null;
      if (colonIdx !== -1) {
        left = rest.slice(0, colonIdx).trim();
        desc = rest.slice(colonIdx + 1).trim() || null;
      }
      const name = left.split(/\s+/)[0].trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name)) continue;
      curName = name;
      curDesc = desc;
      inCatalog = inCatalog;
      seenAppEntry = true;
    } else if (curName && inCatalog) {
      curDesc = curDesc ? curDesc + ' ' + line : line;
    }
  }
  flushEntry();

  return { catalogSet, catalogDesc, installedFromCatalog, installedDesc, diamondSet };
}

function parseInstalledOutput(stdout) {
  const installedEntries = [];
  const installedNameSet = new Set();
  const installedDesc = new Map();
  const installedScope = new Map();
  const seenInstalled = new Set();
  let headerParsed = false;
  let currentScope = null;

  const lines = (stdout || '').split('\n');
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    if (/^-{10,}$/.test(line) || /^={10,}$/.test(line)) { headerParsed = false; continue; }
    if (line.includes('"APPMAN"') || line.includes('\u201cAPPMAN\u201d')) { currentScope = 'user'; continue; }
    if (line.includes('"AM"') || line.includes('\u201cAM\u201d')) {
      if (!line.includes('APPMAN')) currentScope = 'system';
      continue;
    }
    if (!headerParsed && line.startsWith('- ') && line.includes('|')) { headerParsed = true; if (!currentScope) currentScope = 'system'; continue; }
    if (!headerParsed) continue;
    if (line.startsWith('\u25c6')) line = line.slice(1).trim();
    else continue;
    if (!line) continue;
    if (line.includes('|')) {
      const rawCols = line.split('|').map(s => s.trim());
      while (rawCols.length > 1 && rawCols[rawCols.length - 1] === '') rawCols.pop();
      const cols = rawCols;
      const name = cols[0] ? cols[0].split(/\s+/)[0].trim().replace(/\*+$/, '') : null;
      const versionColIdx = (cols.length === 4) ? 1 : 2;
      const version = (versionColIdx >= 0 && versionColIdx < cols.length) ? cols[versionColIdx] : null;
      if (name) {
        const entryKey = (currentScope || '') + ':' + name;
        if (!seenInstalled.has(entryKey)) {
          seenInstalled.add(entryKey);
          installedEntries.push({ name, scope: currentScope || null, version: version || null });
          installedNameSet.add(name);
        }
        if (version) installedDesc.set(name, version);
        if (currentScope) installedScope.set(name, currentScope);
      }
    }
  }

  return { installedEntries, installedNameSet, installedDesc, installedScope };
}

function detectBundles(catalogDesc) {
  const bundleChildOf = {};
  const suitePattern = /installs the full "([^"]+)" suite/i;
  for (const [name, desc] of catalogDesc) {
    const m = suitePattern.exec(desc);
    if (m) bundleChildOf[name] = m[1].toLowerCase();
  }
  return bundleChildOf;
}

function registerAppListHandlers(ipcMain, deps) {
  const { tErr, detectPackageManager, invalidatePackageManagerCache } = deps;

  ipcMain.handle('list-apps-detailed', async () => {
    const { pm, bothFound } = await detectPackageManager();
    if (!pm) {
      return { installed: [], all: [], pmFound: false, error: tErr('errNoPmPath', "No 'am' or 'appman' package manager detected in PATH.") };
    }
    if (bothFound) {
      return { installed: [], all: [], pmFound: true, pmName: pm, bothPms: true, bundleChildOf: {} };
    }

    return new Promise(async (resolve) => {
      let tmpDir1, tmpDir2;
      try {
        const realXdgCacheHome = process.env.HOST_XDG_CACHE_HOME || process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
        const realPmCacheDir = path.join(realXdgCacheHome, pm);

        tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-' + pm + '-l-'));
        fs.mkdirSync(path.join(tmpDir1, pm), { recursive: true });
        tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-' + pm + '-f-'));
        fs.mkdirSync(path.join(tmpDir2, pm), { recursive: true });

        if (fs.existsSync(realPmCacheDir)) {
          const entries = fs.readdirSync(realPmCacheDir);
          for (const entry of entries) {
            if (entry.endsWith('.tmp')) continue;
            const src = path.join(realPmCacheDir, entry);
            if (fs.statSync(src).isFile()) {
              for (const destDir of [tmpDir1, tmpDir2]) {
                fs.copyFileSync(src, path.join(destDir, pm, entry));
              }
            }
          }
        }

        const { exec } = require('child_process');
        const [listRes, instRes] = await Promise.all([
          new Promise(res => exec(`${pm} -l`, { env: { ...process.env, XDG_CACHE_HOME: tmpDir1 } }, (err, stdout) => res({ err, stdout: stdout || '' }))),
          new Promise(res => exec(`${pm} -f`, { env: { ...process.env, XDG_CACHE_HOME: tmpDir2 } }, (err, stdout) => res({ err, stdout: stdout || '' })))
        ]);

        for (const srcDir of [tmpDir1, tmpDir2]) {
          const pmSrc = path.join(srcDir, pm);
          if (fs.existsSync(pmSrc) && fs.existsSync(realPmCacheDir)) {
            for (const entry of fs.readdirSync(pmSrc)) {
              if (entry.endsWith('.tmp')) continue;
              const src = path.join(pmSrc, entry);
              if (fs.statSync(src).isFile()) {
                fs.copyFileSync(src, path.join(realPmCacheDir, entry));
              }
            }
          }
        }

        if ((listRes.err && listRes.err.code === 127) || (instRes.err && instRes.err.code === 127)) {
          try { invalidatePackageManagerCache(); } catch (_) {}
        }
        if ((listRes.err || !listRes.stdout) && (instRes.err || !instRes.stdout)) {
          return resolve({ installed: [], all: [], pmFound: true, error: tErr('errListExecFailed', 'List command execution failed.') });
        }

        const listData = parseListOutput(listRes.stdout);
        const instData = parseInstalledOutput(instRes.stdout);

        if ((instData.installedEntries.length === 0 && listData.installedFromCatalog.size > 0) ||
            (listData.catalogSet.size > 0 && instData.installedEntries.length >= listData.catalogSet.size)) {
          if (listData.installedFromCatalog.size > 0 && listData.installedFromCatalog.size < listData.catalogSet.size) {
            instData.installedEntries.length = 0;
            instData.installedNameSet.clear();
            for (const n of listData.installedFromCatalog) {
              instData.installedEntries.push({ name: n, scope: null, version: listData.installedDesc.get(n) || null });
              instData.installedNameSet.add(n);
            }
          }
        }

        const bundleChildOf = detectBundles(listData.catalogDesc);

        const all = [];
        const allSeen = new Set();
        for (const entry of instData.installedEntries) {
          if (entry.name.toLowerCase() === 'am') continue;
          const key = (entry.scope || '') + ':' + entry.name;
          if (allSeen.has(key)) continue;
          allSeen.add(key);
          all.push({ name: entry.name, installed: true, hasDiamond: listData.diamondSet.has(entry.name), version: entry.version || null, desc: listData.catalogDesc.get(entry.name) || null, scope: entry.scope || null });
        }
        for (const name of listData.catalogSet) {
          if (name.toLowerCase() === 'am') continue;
          if (instData.installedNameSet.has(name)) continue;
          if (!allSeen.has(name)) {
            allSeen.add(name);
            all.push({ name, installed: false, hasDiamond: listData.diamondSet.has(name), version: null, desc: listData.catalogDesc.get(name) || null, scope: null });
          }
        }
        const installed = instData.installedEntries
          .filter(e => e.name.toLowerCase() !== 'am')
          .map(entry => ({ name: entry.name, installed: true, hasDiamond: listData.diamondSet.has(entry.name), version: entry.version || null, desc: listData.catalogDesc.get(entry.name) || null, scope: entry.scope || null }));
        return resolve({ installed, all, pmFound: true, pmName: pm, bothPms: !!bothFound, bundleChildOf });
      } catch (e) {
        return resolve({ installed: [], all: [], pmFound: true, error: tErr('errInternalParsing', 'Internal parsing error.') });
      } finally {
        try { if (tmpDir1) fs.rmSync(tmpDir1, { recursive: true, force: true }); } catch (_) {}
        try { if (tmpDir2) fs.rmSync(tmpDir2, { recursive: true, force: true }); } catch (_) {}
      }
    });
  });
}

module.exports = { parseListOutput, parseInstalledOutput, detectBundles, registerAppListHandlers };
