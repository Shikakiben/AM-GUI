// Main-process integration test: exercises packageManager, iconCache and the
// categories IPC handlers together with mocked child_process.exec and undici.fetch.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const undici = require('undici');

const repoRoot = path.resolve(__dirname, '..', '..');

describe('main-process modules (integration)', () => {
  const originalExec = childProcess.exec;
  const originalFetch = undici.fetch;
  let tempDir = null;
  let categoriesTempDir = null;
  let categoriesBackup = null;
  let categoriesCachePath;
  let categoriesMetaPath;

  let execInvocations = 0;
  let fakeCommandState = 'am';

  function snapshotCategoriesFiles() {
    return {
      cache: fs.existsSync(categoriesCachePath) ? fs.readFileSync(categoriesCachePath) : null,
      meta: fs.existsSync(categoriesMetaPath) ? fs.readFileSync(categoriesMetaPath) : null
    };
  }

  function restoreCategoriesFiles(snapshot) {
    if (!snapshot) return;
    if (snapshot.cache) fs.writeFileSync(categoriesCachePath, snapshot.cache);
    else if (categoriesCachePath && fs.existsSync(categoriesCachePath)) fs.rmSync(categoriesCachePath);
    if (snapshot.meta) fs.writeFileSync(categoriesMetaPath, snapshot.meta);
    else if (categoriesMetaPath && fs.existsSync(categoriesMetaPath)) fs.rmSync(categoriesMetaPath);
  }

  function createHeadersProxy(headers = {}) {
    const normalized = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v]));
    return { get(name) { return normalized[String(name).toLowerCase()] || null; } };
  }

  function createResponse({ status = 200, ok = true, jsonData = null, textData = '', headers = {} }) {
    return {
      status, ok,
      async json() { if (jsonData === null) throw new Error('JSON payload missing'); return jsonData; },
      async text() { return textData; },
      headers: createHeadersProxy(headers)
    };
  }

  before(() => {
    childProcess.exec = (command, callback = () => {}) => {
      const isAmLookup = /command -v am\b/.test(command);
      const isAppmanLookup = /command -v appman\b/.test(command);
      setImmediate(() => {
        if (isAmLookup) {
          execInvocations += 1;
          if (fakeCommandState === 'am' || fakeCommandState === 'both') return callback(null, '/usr/bin/am');
          return callback(new Error('am not found'));
        }
        if (isAppmanLookup) {
          execInvocations += 1;
          if (fakeCommandState === 'appman' || fakeCommandState === 'both') return callback(null, '/usr/bin/appman');
          return callback(new Error('appman not found'));
        }
        execInvocations += 1;
        callback(new Error(`unsupported command: ${command}`));
      });
    };
  });

  after(() => {
    childProcess.exec = originalExec;
    undici.fetch = originalFetch;
    restoreCategoriesFiles(categoriesBackup);
    try { if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    try { if (categoriesTempDir && fs.existsSync(categoriesTempDir)) fs.rmSync(categoriesTempDir, { recursive: true, force: true }); } catch (_) {}
  });

  describe('packageManager', () => {
    it('detects am, caches, invalidates and handles both', async () => {
      const { detectPackageManager, invalidatePackageManagerCache } = require(path.join(repoRoot, 'src/main/packageManager'));

      const pmFirst = await detectPackageManager();
      assert.strictEqual(pmFirst.pm, 'am');
      const pmSecond = await detectPackageManager();
      assert.strictEqual(pmSecond.pm, 'am', 'cache should preserve result');
      assert.strictEqual(execInvocations, 2, 'expected 2 exec calls (am + appman)');

      invalidatePackageManagerCache();
      fakeCommandState = 'appman';
      const pmThird = await detectPackageManager();
      assert.strictEqual(pmThird.pm, 'appman');
      assert.strictEqual(execInvocations, 4, 'refresh should trigger two extra exec calls');

      invalidatePackageManagerCache();
      fakeCommandState = 'both';
      const pmBoth = await detectPackageManager();
      assert.strictEqual(pmBoth.pm, 'am', 'am takes priority when both present');
      assert.ok(pmBoth.bothFound, 'bothFound should be true');
    });
  });

  describe('iconCache', () => {
    it('registers protocol, creates blank icon and purges', async () => {
      const { createIconCacheManager } = require(path.join(repoRoot, 'src/main/iconCache'));
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
      assert.strictEqual(typeof protocol.handler, 'function', 'protocol handler registered');

      const blankPath = path.join(cacheDir, '__blank.png');
      assert.ok(fs.existsSync(blankPath), 'blank icon created');

      const resolvedBlank = await new Promise((resolve) => {
        protocol.handler({ url: 'appicon://__blank.png' }, resolve);
      });
      assert.ok(resolvedBlank && fs.existsSync(resolvedBlank), 'blank icon resolves');

      const fakeIconPath = path.join(cacheDir, 'dummy.png');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(fakeIconPath, Buffer.alloc(512, 1));
      const purgeResult = await iconManager.purgeCache();
      assert.ok(purgeResult && purgeResult.removed >= 1, 'purge reports removed files');
      assert.ok(!fs.existsSync(fakeIconPath), 'purge deleted dummy icon');
    });
  });

  describe('categories handlers', () => {
    it('fetches, caches, reuses on 304 and deletes', async () => {
      const fileEtags = new Map();
      const markdownByFile = {
        'games.md': `| App | Desc |\n| --- | --- |\n| ***alpha*** | great app |`,
        'tools.md': `| App | Desc |\n| --- | --- |\n| ***beta*** | tool desc |`
      };
      undici.fetch = async (url, options = {}) => {
        const headers = options.headers || {};
        if (url.endsWith('/contents')) {
          return createResponse({ jsonData: [{ name: 'games.md' }, { name: 'tools.md' }, { name: 'README.md' }] });
        }
        const fileName = path.basename(url);
        if (!markdownByFile[fileName]) return createResponse({ status: 404, ok: false, textData: 'missing' });
        const previousEtag = fileEtags.get(fileName);
        if (headers['If-None-Match'] && previousEtag && headers['If-None-Match'] === previousEtag) {
          return createResponse({ status: 304, ok: false });
        }
        const nextEtag = `W/"etag-${fileName}-${Date.now()}"`;
        fileEtags.set(fileName, nextEtag);
        return createResponse({ textData: markdownByFile[fileName], headers: { etag: nextEtag, 'last-modified': new Date().toUTCString() } });
      };

      const { registerCategoryHandlers } = require(path.join(repoRoot, 'src/main/categories'));
      const ipcHandlers = new Map();
      const ipcMain = { handle(channel, handler) { ipcHandlers.set(channel, handler); } };

      categoriesTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gui-cat-test-'));
      categoriesCachePath = path.join(categoriesTempDir, 'categories-cache.json');
      categoriesMetaPath = path.join(categoriesTempDir, 'categories-cache.meta.json');
      categoriesBackup = snapshotCategoriesFiles();
      registerCategoryHandlers(ipcMain, categoriesTempDir);
      assert.ok(ipcHandlers.has('fetch-all-categories'), 'fetch-all-categories handler registered');

      const firstFetch = await ipcHandlers.get('fetch-all-categories')();
      assert.ok(firstFetch.ok, `fetch-all-categories ok: ${firstFetch.error}`);
      assert.strictEqual(firstFetch.categories.length, 2);
      assert.ok(firstFetch.categories[0].apps.includes('alpha'), 'category parsing works');

      const cached = await ipcHandlers.get('get-categories-cache')();
      assert.ok(cached.ok && cached.categories.length === 2, 'get-categories-cache returns data');

      const secondFetch = await ipcHandlers.get('fetch-all-categories')();
      assert.ok(secondFetch.ok, 'second fetch ok with 304');
      assert.strictEqual(secondFetch.categories.length, firstFetch.categories.length, 'reuses cached on 304');

      const deleteResult = await ipcHandlers.get('delete-categories-cache')();
      assert.ok(deleteResult.ok, 'delete-categories-cache ok');
      assert.ok(!fs.existsSync(categoriesCachePath), 'cache file removed');
      assert.ok(!fs.existsSync(categoriesMetaPath), 'cache meta removed');
    });
  });
});
