const path = require('path');
const fs = require('fs');
const undici = require('undici');

function createIconCacheManager(app, options = {}) {
  if (!app || typeof app.getPath !== 'function') {
    throw new Error('Electron app instance is required to manage the icon cache.');
  }

  // The caller passes main.js's netFetch, so icons go through Chromium's own
  // network stack: the machine's proxy, and its authentication, just work.
  // undici.fetch remains the fallback for callers that pass nothing (tests).
  const fetch = typeof options.fetch === 'function' ? options.fetch : undici.fetch;
  let AbortControllerCtor = globalThis.AbortController || undici.AbortController || null;
  try { if (!AbortControllerCtor) AbortControllerCtor = require('abort-controller'); } catch (_) {}

  // Icons for applications barely ever change. With stale-while-revalidate in
  // registerProtocol, this only controls how often a background refresh is
  // attempted, not whether a cached icon can be served: 24h made every icon
  // older than a day pay a full network round trip (measured 271-402 ms) for a
  // file that was already on disk.
  const ICON_TTL_MS = 30 * 24 * 3600 * 1000;
  // 8930 icons at a measured 11.4 KB each need ~102 MB. At 50 MB the cache held
  // about 4400 of them and evicted icons it had just downloaded, so scrolling
  // back up re-downloaded them. 120 MB holds ~10750 icons: the whole set plus
  // room for ~1800 more applications.
  const MAX_CACHE_SIZE_BYTES = 120 * 1024 * 1024;
  // Refreshing must not recreate the request storm that the 407 handling fixed:
  // a handful at a time, and never the same icon twice in a short window.
  const REFRESH_CONCURRENCY = 4;
  const REFRESH_RETRY_MS = 10 * 60 * 1000;
  const inFlightDownloads = new Map();
  const recentRefreshes = new Map();
  let refreshActive = 0;
  const refreshQueue = [];

  let iconsCacheDir = null;
  let blankIconPath = null;
  let iconsMeta = null;
  let iconsMetaPath = null;

  function ensureIconCacheSetup() {
    if (!iconsCacheDir) {
      iconsCacheDir = path.join(app.getPath('userData'), 'icons-cache');
      try { fs.mkdirSync(iconsCacheDir, { recursive: true }); } catch (_) {}
    }
    if (!blankIconPath) {
      blankIconPath = path.join(iconsCacheDir, '__blank.png');
      if (!fs.existsSync(blankIconPath)) {
        const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4BwQACfsD/QiP3O4AAAAASUVORK5CYII=', 'base64');
        try { fs.writeFileSync(blankIconPath, png1x1); } catch (_) {}
      }
    }
    if (!iconsMetaPath) iconsMetaPath = path.join(iconsCacheDir, 'index.json');
    if (iconsMeta === null) {
      try {
        if (fs.existsSync(iconsMetaPath)) {
          const raw = fs.readFileSync(iconsMetaPath, 'utf8');
          iconsMeta = JSON.parse(raw || '{}');
        } else {
          iconsMeta = {};
        }
      } catch (_) {
        iconsMeta = {};
      }
    }
  }

  // Writing this file costs ~3.4 ms and rewrites ~483 KB, and it was done
  // synchronously once per downloaded icon. At the measured peak of 50-70
  // icons/s that alone saturated the main process, which is also the thread
  // serving appicon:// — so icons arrived late and the window stuttered.
  // Coalesce the writes instead: the file is a cache, losing the last second
  // of it on a crash costs nothing.
  let metaSaveTimer = null;

  function saveIconsMetaNow() {
    try {
      if (!iconsMetaPath) return;
      fs.writeFileSync(iconsMetaPath + '.tmp', JSON.stringify(iconsMeta || {}, null, 2));
      fs.renameSync(iconsMetaPath + '.tmp', iconsMetaPath);
    } catch (_) {}
  }

  function saveIconsMeta() {
    if (metaSaveTimer) return;
    metaSaveTimer = setTimeout(() => {
      metaSaveTimer = null;
      saveIconsMetaNow();
    }, 1200);
    if (typeof metaSaveTimer.unref === 'function') metaSaveTimer.unref();
  }

  function flushIconsMeta() {
    if (metaSaveTimer) {
      clearTimeout(metaSaveTimer);
      metaSaveTimer = null;
    }
    saveIconsMetaNow();
  }

  try { app.on('before-quit', flushIconsMeta); } catch (_) {}

  // Scanning the cache costs ~22.6 ms (3027 png, 33.5 MB). It ran after every
  // single download, which is the other half of the main-process saturation.
  // Track the total in memory and only scan when the limit is actually reached.
  let cacheTotalBytes = null;

  function measureCacheBytes() {
    try {
      ensureIconCacheSetup();
      let total = 0;
      for (const f of fs.readdirSync(iconsCacheDir)) {
        if (!f.endsWith('.png') || f === path.basename(blankIconPath)) continue;
        try { total += fs.statSync(path.join(iconsCacheDir, f)).size; } catch (_) {}
      }
      return total;
    } catch (_) {
      return 0;
    }
  }

  function maybePruneCache(addedBytes) {
    if (cacheTotalBytes === null) cacheTotalBytes = measureCacheBytes();
    cacheTotalBytes += addedBytes || 0;
    if (cacheTotalBytes <= MAX_CACHE_SIZE_BYTES) return;
    pruneCache();
    cacheTotalBytes = measureCacheBytes();
  }

  function pruneCache() {
    try {
      ensureIconCacheSetup();
      const files = fs
        .readdirSync(iconsCacheDir)
        .filter((f) => f.endsWith('.png') && f !== path.basename(blankIconPath));
      let total = 0;
      const infos = [];
      for (const f of files) {
        try {
          const p = path.join(iconsCacheDir, f);
          const st = fs.statSync(p);
          total += st.size;
          infos.push({ file: f, path: p, size: st.size, mtime: st.mtimeMs });
        } catch (_) {}
      }
      if (total <= MAX_CACHE_SIZE_BYTES) return;
      infos.sort((a, b) => a.mtime - b.mtime);
      for (const info of infos) {
        try {
          fs.unlinkSync(info.path);
          total -= info.size;
          if (iconsMeta && iconsMeta[info.file]) delete iconsMeta[info.file];
        } catch (_) {}
        if (total <= MAX_CACHE_SIZE_BYTES) break;
      }
      // Files were just deleted: persist that now rather than on the debounce.
      saveIconsMetaNow();
    } catch (_) {}
  }

  function isExpired(file) {
    try {
      const st = fs.statSync(file);
      const age = Date.now() - st.mtimeMs;
      return age > ICON_TTL_MS;
    } catch (_) {
      return true;
    }
  }

  function downloadIconToCache(fileName, options = {}) {
    ensureIconCacheSetup();
    const dest = path.join(iconsCacheDir, fileName);
    if (inFlightDownloads.has(fileName)) return inFlightDownloads.get(fileName);
    const force = options.force === true;

    const p = new Promise((resolve) => {
      if (!force) {
        try {
          const st = fs.statSync(dest);
          if (st.size > 200 && !isExpired(dest)) {
            iconsMeta = iconsMeta || {};
            iconsMeta[fileName] = iconsMeta[fileName] || {};
            iconsMeta[fileName].size = st.size;
            iconsMeta[fileName].mtime = Date.now();
            saveIconsMeta();
            return resolve(dest);
          }
        } catch (_) {}
      }

      const logPath = path.join(iconsCacheDir, 'download.log');
      const MAX_LOG_SIZE = 5 * 1024 * 1024;
      const MAX_LOG_BACKUPS = 3;

      function rotateLogIfNeeded() {
        try {
          if (!fs.existsSync(logPath)) return;
          const st = fs.statSync(logPath);
          if (st.size <= MAX_LOG_SIZE) return;
          for (let i = MAX_LOG_BACKUPS - 1; i >= 0; i--) {
            const src = i === 0 ? logPath : `${logPath}.${i}`;
            const dst = `${logPath}.${i + 1}`;
            if (fs.existsSync(src)) {
              try { fs.renameSync(src, dst); } catch (_) {}
            }
          }
        } catch (_) {}
      }

      function appendLog(msg) {
        try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
        try { rotateLogIfNeeded(); } catch (_) {}
      }

      const meta = iconsMeta && iconsMeta[fileName];
      const baseUrl = `https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/${fileName}`;
      const headersBase = {};
      if (meta) {
        if (meta.etag) headersBase['If-None-Match'] = meta.etag;
        if (meta.lastModified) headersBase['If-Modified-Since'] = meta.lastModified;
      }

      const maxAttempts = 3;
      let attempt = 0;

      function onFail(reason, options = {}) {
        // A 407 means the proxy wants a password: repeating the same request
        // cannot help, and it produced 97 requests in 40 s in a measured test.
        const noRetry = options.noRetry === true;
        if (attempt < maxAttempts && !noRetry) {
          const delay = 300 * Math.pow(2, attempt - 1);
          appendLog(`${fileName} will retry in ${delay}ms (reason: ${reason})`);
          setTimeout(tryDownload, delay);
        } else {
          appendLog(`${fileName} failed after ${attempt} attempt(s) (reason: ${reason})`);
          iconsMeta = iconsMeta || {};
          iconsMeta[fileName] = iconsMeta[fileName] || {};
          iconsMeta[fileName].lastError = String(reason);
          iconsMeta[fileName].mtime = Date.now();
          saveIconsMeta();
          resolve(null);
        }
      }

      function tryDownload() {
        attempt++;
        appendLog(`Attempt ${attempt} for ${fileName}`);
        const headers = Object.assign({}, headersBase);

        (async () => {
          const Controller = AbortControllerCtor || globalThis.AbortController || (class { constructor() { throw new Error('AbortController unavailable'); } });
          const controller = new Controller();
          const timeout = setTimeout(() => {
            try { controller.abort(); } catch (_) {}
          }, 15000);
          let res;
          try {
            res = await fetch(baseUrl, { method: 'GET', headers, signal: controller.signal });
          } catch (err) {
            clearTimeout(timeout);
            const msg = err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || String(err);
            appendLog(`${fileName} fetch error: ${msg}`);
            return onFail(msg);
          }
          clearTimeout(timeout);

          try {
            if (res.status === 304) {
              appendLog(`${fileName} not modified (304)`);
              try { fs.utimesSync(dest, new Date(), new Date()); } catch (_) {}
              iconsMeta = iconsMeta || {};
              iconsMeta[fileName] = iconsMeta[fileName] || {};
              iconsMeta[fileName].mtime = Date.now();
              saveIconsMeta();
              return resolve(dest);
            }
            if (res.status !== 200) {
              appendLog(`${fileName} HTTP ${res.status}`);
              // A 4xx means the request itself was wrong: the icon does not
              // exist upstream (404), or the proxy wants a password (407).
              // Repeating it cannot succeed, and it showed in the log: 479
              // requests spent on 159 icons that will never load. 408 and 429
              // are the two 4xx that really are temporary.
              const permanent = res.status >= 400 && res.status < 500
                && res.status !== 408 && res.status !== 429;
              return onFail(`http ${res.status}`, { noRetry: permanent });
            }

            const tmpPath = dest + '.tmp';
            try {
              const ab = await res.arrayBuffer();
              const buf = Buffer.from(ab);
              if (buf.length < 200) {
                appendLog(`${fileName} too small after fetch (${buf.length})`);
                try { fs.unlinkSync(tmpPath); } catch (_) {}
                return onFail('too-small');
              }
              fs.writeFileSync(tmpPath, buf);
              const stat = fs.statSync(tmpPath);
              fs.renameSync(tmpPath, dest);
              const newMeta = { size: stat.size, mtime: Date.now() };
              const etag = res.headers?.get?.('etag');
              const lastMod = res.headers?.get?.('last-modified');
              if (etag) newMeta.etag = etag;
              if (lastMod) newMeta.lastModified = lastMod;
              iconsMeta = iconsMeta || {};
              iconsMeta[fileName] = newMeta;
              saveIconsMeta();
              maybePruneCache(stat.size);
              appendLog(`${fileName} downloaded OK (${stat.size} bytes)`);
              return resolve(dest);
            } catch (e) {
              try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
              appendLog(`${fileName} write error: ${e && e.message}`);
              return onFail(e && e.message);
            }
          } catch (e) {
            appendLog(`${fileName} processing error: ${e && e.message}`);
            return onFail(e && e.message);
          }
        })();
      }

      tryDownload();
    });

    inFlightDownloads.set(fileName, p);
    p.then(() => inFlightDownloads.delete(fileName), () => inFlightDownloads.delete(fileName));
    return p;
  }

  // Stale-while-revalidate. The file on disk is served immediately whatever its
  // age, and a refresh is queued behind it. This is what makes a second visit to
  // an application instant instead of a 300 ms network round trip.
  function refreshIconInBackground(fileName) {
    if (inFlightDownloads.has(fileName)) return;
    const last = recentRefreshes.get(fileName);
    if (last && Date.now() - last < REFRESH_RETRY_MS) return;
    if (refreshQueue.indexOf(fileName) !== -1) return;
    recentRefreshes.set(fileName, Date.now());
    refreshQueue.push(fileName);
    pumpRefreshQueue();
  }

  function pumpRefreshQueue() {
    while (refreshActive < REFRESH_CONCURRENCY && refreshQueue.length) {
      const fileName = refreshQueue.shift();
      refreshActive++;
      downloadIconToCache(fileName, { force: true })
        .catch(() => {})
        .then(() => {
          refreshActive--;
          pumpRefreshQueue();
        });
    }
  }

  function registerProtocol(protocol) {
    if (!protocol) throw new Error('protocol module is required to register appicon://');
    ensureIconCacheSetup();
    protocol.registerFileProtocol('appicon', (request, callback) => {
      try {
        let urlPath = request.url.replace(/^appicon:\/\//i, '');
        if (!urlPath) return callback(blankIconPath);
        urlPath = urlPath.replace(/\?.*$/, '').replace(/#.*/, '');
        urlPath = path.basename(urlPath);
        if (!/\.png$/i.test(urlPath)) urlPath += '.png';
        const localPath = path.join(iconsCacheDir, urlPath);
        try {
          const st = fs.statSync(localPath);
          if (st.size > 200) {
            // Serve what is on disk, then revalidate behind it. Blocking here on
            // an expired file made a cached icon cost as much as a missing one.
            if (isExpired(localPath)) refreshIconInBackground(urlPath);
            return callback(localPath);
          }
        } catch (_) {}
        downloadIconToCache(urlPath).then((result) => {
          if (result) return callback(result);
          callback(blankIconPath);
        });
      } catch (_) {
        callback(blankIconPath);
      }
    });
  }

  async function purgeCache() {
    ensureIconCacheSetup();
    let removed = 0;
    try {
      const files = fs
        .readdirSync(iconsCacheDir)
        .filter((f) => f.endsWith('.png') && f !== path.basename(blankIconPath));
      for (const f of files) {
        try {
          fs.unlinkSync(path.join(iconsCacheDir, f));
          removed++;
        } catch (_) {}
      }
      iconsMeta = {};
      inFlightDownloads.clear();
      if (iconsMetaPath) {
        try { fs.writeFileSync(iconsMetaPath, '{}'); } catch (_) {}
      }
    } catch (_) {}
    return { removed };
  }

  return {
    registerProtocol,
    purgeCache
  };
}

module.exports = { createIconCacheManager };
