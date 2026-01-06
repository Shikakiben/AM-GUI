const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const undici = require('undici');

const projectRoot = path.resolve(__dirname, '..', '..');
const categoriesCachePath = path.join(projectRoot, 'categories-cache.json');
const categoriesMetaPath = path.join(projectRoot, 'categories-cache.meta.json');
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

async function updateCategoriesCache(categories) {
  try {
    await writeJsonSafe(categoriesCachePath, categories);
  } catch (e) {
    console.error('Erreur écriture cache catégories:', e);
  }
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

const repo = 'Portable-Linux-Apps/Portable-Linux-Apps.github.io';
const apiBase = `https://api.github.com/repos/${repo}/contents`;
const rawBase = `https://raw.githubusercontent.com/${repo}/main`;
const fetch = undici.fetch;

function parseApps(markdown) {
  const apps = [];
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    if ((line.match(/\|/g) || []).length < 2) continue;
    const matches = [...line.matchAll(/\*\*\*(.*?)\*\*\*/g)];
    for (const match of matches) {
      if (match[1]) apps.push(match[1].trim());
    }
  }
  return apps;
}

function registerCategoryHandlers(ipcMain) {
  if (!ipcMain) throw new Error('ipcMain instance is required');

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
      const res = await fetch(apiBase, { headers: { 'User-Agent': 'AM-GUI' } });
      if (!res.ok) throw new Error('Erreur requête GitHub: ' + res.status);
      const files = await res.json();
      const mdFiles = files.filter((f) => {
        if (!f.name.endsWith('.md')) return false;
        const lower = f.name.toLowerCase();
        if (lower === 'apps.md' || lower === 'index.md') return false;
        if (lower.includes('readme') || lower.includes('changelog') || lower.includes('contribut')) return false;
        return true;
      });
      if (!mdFiles.length) throw new Error('Aucune catégorie trouvée');

      const nextMeta = {};
      const results = await mapWithConcurrency(
        MAX_CATEGORY_FETCH_CONCURRENCY,
        mdFiles,
        async (file) => {
          const catName = file.name.replace(/\.md$/, '');
          const headers = { 'User-Agent': 'AM-GUI' };
          const previousMeta = prevMeta && prevMeta[file.name];
          if (previousMeta?.etag) headers['If-None-Match'] = previousMeta.etag;
          if (previousMeta?.lastModified) headers['If-Modified-Since'] = previousMeta.lastModified;

          let mdResponse;
          try {
            mdResponse = await fetch(`${rawBase}/${file.name}`, { headers });
          } catch (err) {
            console.warn('[categories] fetch échoué pour', file.name, err?.message || err);
            if (previousMeta) nextMeta[file.name] = previousMeta;
            return null;
          }

          if (mdResponse.status === 304) {
            if (previousMeta) nextMeta[file.name] = previousMeta;
            if (previousByName.has(catName)) {
              return { name: catName, apps: previousByName.get(catName) };
            }
            return null;
          }
          if (!mdResponse.ok) {
            console.warn('[categories] HTTP', mdResponse.status, 'pour', file.name);
            if (previousMeta) nextMeta[file.name] = previousMeta;
            return null;
          }
          const mdText = await mdResponse.text();
          const apps = parseApps(mdText);
          const etag = mdResponse.headers?.get?.('etag');
          const lastModified = mdResponse.headers?.get?.('last-modified');
          if (etag || lastModified) {
            nextMeta[file.name] = Object.fromEntries(
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
        writeJsonSafe(categoriesMetaPath, finalMeta).catch((err) => console.warn('Erreur écriture meta catégories:', err))
      ]);
      return { ok: true, categories: finalCategories };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('fetch-first-category', async () => {
    try {
      const res = await fetch(apiBase, { headers: { 'User-Agent': 'AM-GUI' } });
      if (!res.ok) throw new Error('Erreur requête GitHub: ' + res.status);
      const files = await res.json();
      const mdFiles = files.filter((f) => {
        if (!f.name.endsWith('.md')) return false;
        const lower = f.name.toLowerCase();
        if (lower.includes('readme') || lower.includes('changelog') || lower.includes('contribut')) return false;
        return true;
      });
      if (!mdFiles.length) throw new Error('Aucune catégorie trouvée');
      const file = mdFiles[0];
      const catName = file.name.replace(/\.md$/, '');
      const mdRes = await fetch(`${rawBase}/${file.name}`, { headers: { 'User-Agent': 'AM-GUI' } });
      if (!mdRes.ok) throw new Error('Erreur requête GitHub: ' + mdRes.status);
      const mdText = await mdRes.text();
      const apps = parseApps(mdText);
      return { ok: true, category: { name: catName, apps } };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });
}

module.exports = { registerCategoryHandlers };
