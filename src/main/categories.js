const { tErr } = require('../i18n/translations');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const undici = require('undici');

const MAX_CATEGORY_FETCH_CONCURRENCY = 6;

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

async function writeJsonSafe(filePath, data) {
  const payload = JSON.stringify(data, null, 2);
  try {
    const existing = await fsp.readFile(filePath, 'utf8');
    if (existing === payload) return;
  } catch (_) {
    // ignore read errors (file absent or unreadable), we'll rewrite
  }
  await fsp.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
  const tmpPath = `${filePath}.tmp`;
  await fsp.writeFile(tmpPath, payload, 'utf8');
  await fsp.rename(tmpPath, filePath);
}

async function mapWithConcurrency(limit, items, iteratorFn) {
  if (!Array.isArray(items) || !items.length) return [];
  const maxWorkers = Math.max(1, Number(limit) || 1);
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await iteratorFn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(maxWorkers, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

const SITE_BASE = 'https://portable-linux-apps.github.io';
const CATEGORY_INDEX_URL = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/cat_page.in';
const fetch = undici.fetch;

function parseCategoryNames(html) {
  const names = [];
  const re = /class="category-link"\s+href="([a-z0-9-]+)\.html"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (match[1] && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

function appsFromCategoryJson(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.keys(data)
    .filter((name) => typeof name === 'string' && name)
    .sort((a, b) => a.localeCompare(b));
}

function registerCategoryHandlers(ipcMain, cacheDir) {
  if (!ipcMain) throw new Error('ipcMain instance is required');
  if (typeof cacheDir !== 'string' || !path.isAbsolute(cacheDir) || cacheDir.split(path.sep).includes('..')) {
    throw new Error('Invalid cache directory');
  }
  const categoriesCachePath = `${cacheDir}${path.sep}categories-cache.json`;
  const categoriesMetaPath = `${cacheDir}${path.sep}categories-cache.meta.json`;

  async function updateCategoriesCache(categories) {
    try {
      await writeJsonSafe(categoriesCachePath, categories);
    } catch (e) {
      console.error('Error writing categories cache:', e);
    }
  }

  ipcMain.handle('delete-categories-cache', async () => {
    try {
      await Promise.all([
        fsp.rm(categoriesCachePath, { force: true }).catch(() => {}),
        fsp.rm(categoriesMetaPath, { force: true }).catch(() => {})
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('get-categories-cache', async () => {
    try {
      const categories = await readJsonSafe(categoriesCachePath, []);
      return { ok: true, categories };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('fetch-all-categories', async () => {
    try {
      const [prevCategories, prevMeta] = await Promise.all([
        readJsonSafe(categoriesCachePath, []),
        readJsonSafe(categoriesMetaPath, {})
      ]);
      const previousByName = new Map((prevCategories || []).map((cat) => [cat.name, Array.isArray(cat.apps) ? cat.apps : []]));
      const idxRes = await fetch(CATEGORY_INDEX_URL, { headers: { 'User-Agent': 'AM-GUI' }, redirect: 'error' });
      if (!idxRes.ok) throw new Error(tErr('errGitHubRequest', 'GitHub request error: {msg}', { msg: idxRes.status }));
      const html = await idxRes.text();
      const catNames = parseCategoryNames(html);
      if (!catNames.length) throw new Error(tErr('errNoCategories', 'No categories found'));

      const nextMeta = {};
      const results = await mapWithConcurrency(
        MAX_CATEGORY_FETCH_CONCURRENCY,
        catNames,
        async (catName) => {
          const url = `${SITE_BASE}/categories/${encodeURIComponent(catName)}.json`;
          const headers = { 'User-Agent': 'AM-GUI' };
          const previousMeta = prevMeta && prevMeta[catName];
          if (previousMeta?.etag) headers['If-None-Match'] = previousMeta.etag;
          if (previousMeta?.lastModified) headers['If-Modified-Since'] = previousMeta.lastModified;

          let catResponse;
          try {
            catResponse = await fetch(url, { headers, redirect: 'error' });
          } catch (err) {
            console.warn('[categories] fetch failed for', catName, err?.message || err);
            if (previousMeta) nextMeta[catName] = previousMeta;
            return null;
          }

          if (catResponse.status === 304) {
            if (previousMeta) nextMeta[catName] = previousMeta;
            if (previousByName.has(catName)) {
              return { name: catName, apps: previousByName.get(catName) };
            }
            return null;
          }
          if (!catResponse.ok) {
            console.warn('[categories] HTTP', catResponse.status, 'pour', catName);
            if (previousMeta) nextMeta[catName] = previousMeta;
            return null;
          }
          const data = await catResponse.json();
          const apps = appsFromCategoryJson(data);
          const etag = catResponse.headers?.get?.('etag');
          const lastModified = catResponse.headers?.get?.('last-modified');
          if (etag || lastModified) {
            nextMeta[catName] = Object.fromEntries(
              Object.entries({ etag, lastModified }).filter(([, v]) => !!v)
            );
          }
          return { name: catName, apps };
        }
      );

      const categories = results.filter(Boolean);
      const finalCategories = categories.length ? categories : prevCategories;
      const finalMeta = Object.keys(nextMeta).length ? nextMeta : prevMeta || {};
      await Promise.all([
        updateCategoriesCache(finalCategories),
        writeJsonSafe(categoriesMetaPath, finalMeta).catch((err) => console.warn('Error writing categories meta:', err))
      ]);
      return { ok: true, categories: finalCategories };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('fetch-first-category', async () => {
    try {
      const idxRes = await fetch(CATEGORY_INDEX_URL, { headers: { 'User-Agent': 'AM-GUI' }, redirect: 'error' });
      if (!idxRes.ok) throw new Error(tErr('errGitHubRequest', 'GitHub request error: {msg}', { msg: idxRes.status }));
      const html = await idxRes.text();
      const catNames = parseCategoryNames(html);
      if (!catNames.length) throw new Error(tErr('errNoCategories', 'No categories found'));
      const catName = catNames[0];
      const catRes = await fetch(`${SITE_BASE}/categories/${encodeURIComponent(catName)}.json`, { headers: { 'User-Agent': 'AM-GUI' }, redirect: 'error' });
      if (!catRes.ok) throw new Error(tErr('errGitHubRequest', 'GitHub request error: {msg}', { msg: catRes.status }));
      const data = await catRes.json();
      const apps = appsFromCategoryJson(data);
      return { ok: true, category: { name: catName, apps } };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });
}

module.exports = { registerCategoryHandlers };
