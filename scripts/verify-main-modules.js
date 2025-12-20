const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const undici = require('undici');

const originalExec = childProcess.exec;
const originalFetch = undici.fetch;
let tempDir = null;
let success = false;
let categoriesBackup = null;

(async () => {
  let execInvocations = 0;
  let fakeCommandState = 'am';

  childProcess.exec = (command, callback = () => {}) => {
    const isAmLookup = /command -v am\b/.test(command);
    const isAppmanLookup = /command -v appman\b/.test(command);
    setImmediate(() => {
      if (isAmLookup) {
        execInvocations += 1;
        if (fakeCommandState === 'am') return callback(null, '/usr/bin/am');
        return callback(new Error('am not found'));
      }
      if (isAppmanLookup) {
        execInvocations += 1;
        if (fakeCommandState === 'appman') return callback(null, '/usr/bin/appman');
        return callback(new Error('appman not found'));
      }
      execInvocations += 1;
      callback(new Error(`unsupported command: ${command}`));
    });
  };

  const repoRoot = path.resolve(__dirname, '..');
  const categoriesCachePath = path.join(repoRoot, 'categories-cache.json');
  const categoriesMetaPath = path.join(repoRoot, 'categories-cache.meta.json');

  function snapshotCategoriesFiles() {
    return {
      cache: fs.existsSync(categoriesCachePath) ? fs.readFileSync(categoriesCachePath) : null,
      meta: fs.existsSync(categoriesMetaPath) ? fs.readFileSync(categoriesMetaPath) : null
    };
  }

  function restoreCategoriesFiles(snapshot) {
    if (!snapshot) return;
    if (snapshot.cache) fs.writeFileSync(categoriesCachePath, snapshot.cache);
    else if (fs.existsSync(categoriesCachePath)) fs.rmSync(categoriesCachePath);
    if (snapshot.meta) fs.writeFileSync(categoriesMetaPath, snapshot.meta);
    else if (fs.existsSync(categoriesMetaPath)) fs.rmSync(categoriesMetaPath);
  }

  function createHeadersProxy(headers = {}) {
    const normalized = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v])
    );
    return {
      get(name) {
        return normalized[String(name).toLowerCase()] || null;
      }
    };
  }

  function createResponse({ status = 200, ok = true, jsonData = null, textData = '', headers = {} }) {
    return {
      status,
      ok,
      async json() {
        if (jsonData === null) throw new Error('JSON payload missing');
        return jsonData;
      },
      async text() {
        return textData;
      },
      headers: createHeadersProxy(headers)
    };
  }

  try {
    categoriesBackup = snapshotCategoriesFiles();

    const { detectPackageManager, invalidatePackageManagerCache } = require('../src/main/packageManager');
    const { createIconCacheManager } = require('../src/main/iconCache');

    const pmFirst = await detectPackageManager();
    if (pmFirst !== 'am') throw new Error(`Expected first detection to return "am", got ${pmFirst}`);
    const pmSecond = await detectPackageManager();
    if (pmSecond !== 'am') throw new Error('Cache should preserve initial detection result');
    if (execInvocations !== 1) throw new Error(`Expected 1 exec invocation, got ${execInvocations}`);

    invalidatePackageManagerCache();
    fakeCommandState = 'appman';
    const pmThird = await detectPackageManager();
    if (pmThird !== 'appman') throw new Error(`Expected refreshed detection to return "appman", got ${pmThird}`);
    if (execInvocations !== 3) throw new Error('Refresh should trigger two extra exec calls (am + appman).');

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gui-icon-test-'));
    const cacheDir = path.join(tempDir, 'icons-cache');
    const fakeApp = {
      getPath(name) {
        if (name === 'userData') return tempDir;
        throw new Error(`Unexpected path request: ${name}`);
      }
    };

    const protocol = {
      handler: null,
      registerFileProtocol(scheme, handler) {
        if (scheme !== 'appicon') throw new Error(`Unexpected scheme: ${scheme}`);
        this.handler = handler;
      }
    };

    const iconManager = createIconCacheManager(fakeApp);
    iconManager.registerProtocol(protocol);
    if (typeof protocol.handler !== 'function') throw new Error('Protocol handler was not registered');

    const blankPath = path.join(cacheDir, '__blank.png');
    if (!fs.existsSync(blankPath)) throw new Error('Blank icon was not created');

    const resolvedBlank = await new Promise((resolve) => {
      protocol.handler({ url: 'appicon://__blank.png' }, resolve);
    });
    if (!resolvedBlank || !fs.existsSync(resolvedBlank)) throw new Error('Blank icon resolution failed');

    const fakeIconPath = path.join(cacheDir, 'dummy.png');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(fakeIconPath, Buffer.alloc(512, 1));
    const purgeResult = await iconManager.purgeCache();
    if (!purgeResult || purgeResult.removed < 1) throw new Error('Purge cache did not report removed files');
    if (fs.existsSync(fakeIconPath)) throw new Error('Purge cache did not delete dummy icon');

    const fileEtags = new Map();
    const markdownByFile = {
      'games.md': `| App | Desc |\n| --- | --- |\n| ***alpha*** | great app |`,
      'tools.md': `| App | Desc |\n| --- | --- |\n| ***beta*** | tool desc |`
    };

    undici.fetch = async (url, options = {}) => {
      const headers = options.headers || {};
      if (url.endsWith('/contents')) {
        return createResponse({
          jsonData: [
            { name: 'games.md' },
            { name: 'tools.md' },
            { name: 'README.md' }
          ]
        });
      }
      const fileName = path.basename(url);
      if (!markdownByFile[fileName]) {
        return createResponse({ status: 404, ok: false, textData: 'missing' });
      }
      const previousEtag = fileEtags.get(fileName);
      if (headers['If-None-Match'] && previousEtag && headers['If-None-Match'] === previousEtag) {
        return createResponse({ status: 304, ok: false });
      }
      const nextEtag = `W/"etag-${fileName}-${Date.now()}"`;
      fileEtags.set(fileName, nextEtag);
      return createResponse({
        textData: markdownByFile[fileName],
        headers: { etag: nextEtag, 'last-modified': new Date().toUTCString() }
      });
    };

    const { registerCategoryHandlers } = require('../src/main/categories');
    const ipcHandlers = new Map();
    const ipcMain = {
      handle(channel, handler) {
        ipcHandlers.set(channel, handler);
      }
    };

    registerCategoryHandlers(ipcMain);
    if (!ipcHandlers.has('fetch-all-categories')) throw new Error('fetch-all-categories handler missing');

    const firstFetch = await ipcHandlers.get('fetch-all-categories')();
    if (!firstFetch.ok) throw new Error(`fetch-all-categories failed: ${firstFetch.error}`);
    if (!Array.isArray(firstFetch.categories) || firstFetch.categories.length !== 2) {
      throw new Error('Unexpected categories payload on first fetch');
    }
    if (!firstFetch.categories[0].apps.includes('alpha')) throw new Error('Category parsing failed');

    const cached = await ipcHandlers.get('get-categories-cache')();
    if (!cached.ok || cached.categories.length !== 2) throw new Error('get-categories-cache returned invalid data');

    const secondFetch = await ipcHandlers.get('fetch-all-categories')();
    if (!secondFetch.ok) throw new Error('Second fetch should still be ok (even with 304)');
    if (secondFetch.categories.length !== firstFetch.categories.length) {
      throw new Error('Second fetch should reuse cached categories when not modified');
    }

    const deleteResult = await ipcHandlers.get('delete-categories-cache')();
    if (!deleteResult.ok) throw new Error('delete-categories-cache failed');
    if (fs.existsSync(categoriesCachePath)) throw new Error('Cache file still present after deletion');
    if (fs.existsSync(categoriesMetaPath)) throw new Error('Cache meta file still present after deletion');

    success = true;
    console.log('✔ Main-process modules verified successfully.');
  } catch (err) {
    console.error('✖ Verification failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn('Warning: failed to clean temporary directory:', cleanupErr.message);
    }
    childProcess.exec = originalExec;
    undici.fetch = originalFetch;
    restoreCategoriesFiles(categoriesBackup);
    if (success) {
      process.exitCode = 0;
    }
  }
})();
