const { app, BrowserWindow, ipcMain, Menu, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const categoriesCachePath = path.join(__dirname, 'categories-cache.json');
const categoriesMetaPath = path.join(__dirname, 'categories-cache.meta.json');
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
  await fsp.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
  const tmpPath = `${filePath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
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
  const chunkSize = Math.max(1, Number(limit) || 1);
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const slice = items.slice(i, i + chunkSize);
    const sliceResults = await Promise.all(slice.map(iteratorFn));
    results.push(...sliceResults);
  }
  return results;
}

// Handler IPC pour supprimer le cache local des catégories
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

// Handler IPC pour lire le cache local des catégories (après import Electron)
ipcMain.handle('get-categories-cache', async () => {
  try {
    const categories = await readJsonSafe(categoriesCachePath, []);
    return { ok: true, categories };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// Handler IPC pour récupérer toutes les catégories et leurs apps
ipcMain.handle('fetch-all-categories', async () => {
  const repo = 'Portable-Linux-Apps/Portable-Linux-Apps.github.io';
  const apiBase = `https://api.github.com/repos/${repo}/contents`;
  const rawBase = `https://raw.githubusercontent.com/${repo}/main`;
  const undici = require('undici');
  const fetch = undici.fetch;

  const parseApps = (markdown) => {
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
  };

  try {
    const [prevCategories, prevMeta] = await Promise.all([
      readJsonSafe(categoriesCachePath, []),
      readJsonSafe(categoriesMetaPath, {})
    ]);
    const previousByName = new Map((prevCategories || []).map(cat => [cat.name, Array.isArray(cat.apps) ? cat.apps : []]));
    const res = await fetch(apiBase, { headers: { 'User-Agent': 'AM-GUI' } });
    if (!res.ok) throw new Error('Erreur requête GitHub: ' + res.status);
    const files = await res.json();
    const mdFiles = files.filter(f => {
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
    await Promise.all([
      updateCategoriesCache(categories),
      writeJsonSafe(categoriesMetaPath, nextMeta).catch((err) => console.warn('Erreur écriture meta catégories:', err))
    ]);
    return { ok: true, categories };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// --- Gestion accélération GPU (doit être AVANT app.whenReady) ---
let disableGpuPref = false;
try {
  const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
  if (fs.existsSync(prefPath)) {
    const raw = fs.readFileSync(prefPath, 'utf8');
    disableGpuPref = JSON.parse(raw).disableGpu === true;
  }
} catch(_){}
if (disableGpuPref && typeof app.disableHardwareAcceleration === 'function') {
  app.disableHardwareAcceleration();
}

const errorLogPath = path.join(app.getPath('userData'), 'error.log');

function logGlobalError(err) {
  const msg = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : err}`;
  try { fs.appendFileSync(errorLogPath, msg + '\n'); } catch(e) {}
  console.error(msg);
}

process.on('uncaughtException', logGlobalError);
process.on('unhandledRejection', logGlobalError);
// Vérifier si app.setName ou équivalent existe et remplacer par 'AM-GUI' si besoin
if (app.setName) {
  app.setName('AM-GUI');
}

// IPC pour lire/écrire la préférence GPU
ipcMain.handle('get-gpu-pref', async () => {
  try {
    const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
    if (fs.existsSync(prefPath)) {
      const raw = fs.readFileSync(prefPath, 'utf8');
      return JSON.parse(raw).disableGpu === true;
    }
  } catch(_){}
  return false;
});
ipcMain.handle('set-gpu-pref', async (_event, val) => {
  try {
    const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
    fs.writeFileSync(prefPath, JSON.stringify({ disableGpu: !!val }));
    return { ok:true };
  } catch(e){ return { ok:false, error: e.message||String(e) }; }
});

// Handler IPC pour envoyer le choix utilisateur lors d'une installation à choix multiples
ipcMain.handle('install-send-choice', async (event, installId, choice) => {
  console.log('[IPC] install-send-choice reçu pour id:', installId, 'choix:', choice);
  const child = activeInstalls.get(installId);
  if (!child) {
    console.warn('[IPC] Aucun process actif pour id:', installId);
    return { ok:false, error:'Processus introuvable' };
  }
  try {
    // Envoyer le choix au processus (stdin)
    console.log(`[INSTALL-CHOICE] Avant write pour id ${installId} :`, choice, 'child:', !!child);
    child.write(choice + '\n');
    if (child._pty && typeof child._pty.flush === 'function') {
      try { child._pty.flush(); } catch(_) {}
    }
    // Loguer la sortie pty après envoi du choix
    setTimeout(() => {
      console.log('[DEBUG] 1s après write, process toujours actif:', !!child);
    }, 1000);
    console.log(`[INSTALL-CHOICE] Après write pour id ${installId}`);
    return { ok:true };
  } catch(e){
    console.error('[IPC] Erreur lors de l’envoi du choix:', e);
    return { ok:false, error: e.message || 'Erreur envoi choix' };
  }
});
const { exec, spawn } = require('child_process');
// ...existing code...
const undici = require('undici');
const fetch = undici.fetch;
// AbortController fallback: prefer global, then undici.AbortController, then optional polyfill
let AbortControllerCtor = globalThis.AbortController || undici.AbortController || null;
try { if (!AbortControllerCtor) AbortControllerCtor = require('abort-controller'); } catch(_) { }

const PM_CACHE_TTL_MS = 60 * 1000;
let cachedPackageManager = null;
let cachedPmTimestamp = 0;

async function detectPackageManager(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedPmTimestamp && (now - cachedPmTimestamp) < PM_CACHE_TTL_MS) {
    return cachedPackageManager;
  }
  const pm = await new Promise((resolve) => {
    exec('command -v am', (err) => {
      if (!err) return resolve('am');
      exec('command -v appman', (err2) => {
        if (!err2) return resolve('appman');
        resolve(null);
      });
    });
  });
  cachedPackageManager = pm;
  cachedPmTimestamp = Date.now();
  return pm;
}

function invalidatePackageManagerCache() {
  cachedPackageManager = null;
  cachedPmTimestamp = 0;
}
// -- Cache icônes via protocole personnalisé appicon:// --
let iconsCacheDir = null;
let blankIconPath = null;
const ICON_TTL_MS = 24 * 3600 * 1000; // 1 jour
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB max cache size

// In-flight downloads deduplication map: fileName -> Promise<string|null>
const inFlightDownloads = new Map();
let iconsMeta = null; // lazy-loaded index { [fileName]: { etag, lastModified, size, mtime } }
let iconsMetaPath = null;

function ensureIconCacheSetup(){
  if (!iconsCacheDir) {
    iconsCacheDir = path.join(app.getPath('userData'), 'icons-cache');
    try { fs.mkdirSync(iconsCacheDir, { recursive: true }); } catch(_){ }
  }
  if (!blankIconPath) {
    blankIconPath = path.join(iconsCacheDir, '__blank.png');
    if (!fs.existsSync(blankIconPath)) {
      // Créer une petite image PNG 1x1 transparente (base64)
      const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4BwQACfsD/QiP3O4AAAAASUVORK5CYII=','base64');
      try { fs.writeFileSync(blankIconPath, png1x1); } catch(_){ }
    }
  }
  if (!iconsMetaPath) iconsMetaPath = path.join(iconsCacheDir, 'index.json');
  // lazy load index
  if (iconsMeta === null) {
    try {
      if (fs.existsSync(iconsMetaPath)) {
        const raw = fs.readFileSync(iconsMetaPath, 'utf8');
        iconsMeta = JSON.parse(raw || '{}');
      } else iconsMeta = {};
    } catch(_) { iconsMeta = {}; }
  }
}

function saveIconsMeta() {
  try {
    if (!iconsMetaPath) return;
    fs.writeFileSync(iconsMetaPath + '.tmp', JSON.stringify(iconsMeta || {}, null, 2));
    fs.renameSync(iconsMetaPath + '.tmp', iconsMetaPath);
  } catch(_) {}
}
function pruneCache() {
  try {
    ensureIconCacheSetup();
    const files = fs.readdirSync(iconsCacheDir).filter(f => f.endsWith('.png') && f !== path.basename(blankIconPath));
    let total = 0;
    const infos = [];
    for (const f of files) {
      try {
        const p = path.join(iconsCacheDir, f);
        const st = fs.statSync(p);
        total += st.size;
        infos.push({ file: f, path: p, size: st.size, mtime: st.mtimeMs });
      } catch(_){ }
    }
    if (total <= MAX_CACHE_SIZE_BYTES) return;
    infos.sort((a,b)=> a.mtime - b.mtime); // oldest first
    for (const info of infos) {
      try { fs.unlinkSync(info.path); total -= info.size; if (iconsMeta && iconsMeta[info.file]) delete iconsMeta[info.file]; } catch(_){ }
      if (total <= MAX_CACHE_SIZE_BYTES) break;
    }
    saveIconsMeta();
  } catch(_) {}
}

function isExpired(file){
  try {
    const st = fs.statSync(file);
    const age = Date.now() - st.mtimeMs;
    return age > ICON_TTL_MS;
  } catch(_) { return true; }
}

function downloadIconToCache(fileName){
  ensureIconCacheSetup();
  const dest = path.join(iconsCacheDir, fileName);
  // Deduplicate concurrent downloads
  if (inFlightDownloads.has(fileName)) return inFlightDownloads.get(fileName);

  const p = new Promise((resolve) => {
    // Quick cache hit if exists and fresh
    try {
      const st = fs.statSync(dest);
      if (st.size > 200 && !isExpired(dest)) {
        // update meta and return
        if (!iconsMeta) iconsMeta = {};
        iconsMeta[fileName] = iconsMeta[fileName] || {};
        iconsMeta[fileName].size = st.size;
        iconsMeta[fileName].mtime = Date.now();
        saveIconsMeta();
        return resolve(dest);
      }
    } catch(_){ }

    // prepare logging
    const logPath = path.join(iconsCacheDir, 'download.log');
    const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
    const MAX_LOG_BACKUPS = 3;
    function rotateLogIfNeeded(){
      try {
        if (!fs.existsSync(logPath)) return;
        const st = fs.statSync(logPath);
        if (st.size <= MAX_LOG_SIZE) return;
        // rotate: download.log.2 -> download.log.3, etc.
        for (let i = MAX_LOG_BACKUPS - 1; i >= 0; i--) {
          const src = i === 0 ? logPath : `${logPath}.${i}`;
          const dst = `${logPath}.${i+1}`;
          if (fs.existsSync(src)) {
            try { fs.renameSync(src, dst); } catch(_){ }
          }
        }
      } catch(_){ }
    }
    function appendLog(msg){
      try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`); } catch(_){ }
      try { rotateLogIfNeeded(); } catch(_){ }
    }

    // Prepare conditional headers from stored metadata
    const meta = iconsMeta && iconsMeta[fileName];
    const baseUrl = `https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/${fileName}`;
    const headersBase = {};
    if (meta) {
      if (meta.etag) headersBase['If-None-Match'] = meta.etag;
      if (meta.lastModified) headersBase['If-Modified-Since'] = meta.lastModified;
    }

    // retry logic
    const maxAttempts = 3;
    let attempt = 0;

    function tryDownload(){
      attempt++;
      appendLog(`Attempt ${attempt} for ${fileName}`);
      const headers = Object.assign({}, headersBase);

      // use undici.fetch with AbortController and a 15s timeout
      (async () => {
  const controller = new (AbortControllerCtor || globalThis.AbortController || (class { constructor(){ throw new Error('AbortController unavailable'); } }))();
  const timeout = setTimeout(() => { try { controller.abort(); } catch(_){} }, 15000);
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
            try { fs.utimesSync(dest, new Date(), new Date()); } catch(_){ }
            iconsMeta = iconsMeta || {};
            iconsMeta[fileName] = iconsMeta[fileName] || {};
            iconsMeta[fileName].mtime = Date.now();
            saveIconsMeta();
            return resolve(dest);
          }
          if (res.status !== 200) {
            appendLog(`${fileName} HTTP ${res.status}`);
            return onFail(`http ${res.status}`);
          }

          const tmpPath = dest + '.tmp';
          try {
            const ab = await res.arrayBuffer();
            const buf = Buffer.from(ab);
            if (buf.length < 200) { appendLog(`${fileName} too small after fetch (${buf.length})`); try { fs.unlinkSync(tmpPath); } catch(_){} return onFail('too-small'); }
            fs.writeFileSync(tmpPath, buf);
            const stat = fs.statSync(tmpPath);
            fs.renameSync(tmpPath, dest);
            const newMeta = { size: stat.size, mtime: Date.now() };
            const etag = res.headers && (res.headers.get ? res.headers.get('etag') : (res.headers && res.headers['etag']));
            const lastMod = res.headers && (res.headers.get ? res.headers.get('last-modified') : (res.headers && res.headers['last-modified']));
            if (etag) newMeta.etag = etag;
            if (lastMod) newMeta.lastModified = lastMod;
            iconsMeta = iconsMeta || {};
            iconsMeta[fileName] = newMeta;
            saveIconsMeta();
            pruneCache();
            appendLog(`${fileName} downloaded OK (${stat.size} bytes)`);
            return resolve(dest);
          } catch (e) {
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch(_){ }
            appendLog(`${fileName} write error: ${e && e.message}`);
            return onFail(e && e.message);
          }
        } catch (e) {
          appendLog(`${fileName} processing error: ${e && e.message}`);
          return onFail(e && e.message);
        }
      })();
    }

    function onFail(reason){
      if (attempt < maxAttempts) {
        const delay = 300 * Math.pow(2, attempt-1);
        appendLog(`${fileName} will retry in ${delay}ms (reason: ${reason})`);
        setTimeout(tryDownload, delay);
      } else {
        appendLog(`${fileName} failed after ${attempt} attempts (reason: ${reason})`);
        // record lastError in iconsMeta for diagnostics
        iconsMeta = iconsMeta || {};
        iconsMeta[fileName] = iconsMeta[fileName] || {};
        iconsMeta[fileName].lastError = String(reason);
        iconsMeta[fileName].mtime = Date.now();
        saveIconsMeta();
        return resolve(null);
      }
    }

    // start first attempt
    tryDownload();
  });

  inFlightDownloads.set(fileName, p);
  // cleanup inFlight map after completion
  p.then(() => inFlightDownloads.delete(fileName), () => inFlightDownloads.delete(fileName));
  return p;
}


function registerIconProtocol(){
  ensureIconCacheSetup();
  protocol.registerFileProtocol('appicon', (request, callback) => {
    try {
      // Formats acceptés: appicon://name ou appicon://name.png
      let urlPath = request.url.replace(/^appicon:\/\//i, '');
      if (!urlPath) return callback(blankIconPath);
      // Sécuriser (retirer éventuels ../)
      urlPath = urlPath.replace(/\?.*$/, '').replace(/#.*/, '');
      urlPath = path.basename(urlPath); // garde seulement le fichier
      if (!/\.png$/i.test(urlPath)) urlPath += '.png';
      const localPath = path.join(iconsCacheDir, urlPath);
      // Vérifier en cache
      try {
        const st = fs.statSync(localPath);
        if (st.size > 200 && !isExpired(localPath)) return callback(localPath);
      } catch(_){}
      // Télécharger sinon
      downloadIconToCache(urlPath).then(result => {
        if (result) return callback(result);
        callback(blankIconPath);
      });
    } catch(_) {
      callback(blankIconPath);
    }
  });
}

function createWindow () {
  // Détection simple de l'environnement de bureau pour stylage léger
  function detectDesktopEnv() {
    const env = process.env;
    const xdg = (env.XDG_CURRENT_DESKTOP || '').toLowerCase();
    const session = (env.DESKTOP_SESSION || '').toLowerCase();
    if (xdg.includes('gnome') || session.includes('gnome')) return 'gnome';
    if (xdg.includes('kde') || xdg.includes('plasma') || session.includes('plasma') || session.includes('kde')) return 'plasma';
    if (xdg.includes('xfce') || session.includes('xfce')) return 'xfce';
    if (xdg.includes('cinnamon') || session.includes('cinnamon')) return 'cinnamon';
    if (xdg.includes('unity') || session.includes('unity')) return 'unity';
    return 'generic';
  }
  const deTag = detectDesktopEnv();
  const sysLocale = (app.getLocale && typeof app.getLocale === 'function') ? app.getLocale() : (process.env.LANG || 'en');
  // Icône PNG
  const iconPath = path.join(__dirname, 'app-icon.png');
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    frame: false, // retour à la barre personnalisée
    title: 'AM-GUI',
    icon: iconPath,
    backgroundColor: '#f6f8fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      additionalArguments: [ `--de=${deTag}`, `--locale=${sysLocale}` ]
    }
  });

  // Supprimer la barre de menu par défaut (File, Edit, View, etc.)
  try { Menu.setApplicationMenu(null); } catch(_) {}
  // Cacher la barre au cas où certaines plateformes la garderaient
  win.setMenuBarVisibility(false);

  win.loadFile('index.html');
  // Forcer un titre vide après affichage (on affiche le faux header)
  win.once('ready-to-show', () => {
  // Le titre est déjà défini à la création, inutile de le modifier
  });

  // Raccourci clavier manuel pour ouvrir DevTools (menu supprimé)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key && input.key.toLowerCase() === 'i') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Menu contextuel (clic droit) basique pour copier / coller
  win.webContents.on('context-menu', (event, params) => {
    const { selectionText, isEditable } = params;
    const hasSelection = selectionText && selectionText.trim().length > 0;
    const template = [];

    if (isEditable) {
      template.push(
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'delete', label: 'Supprimer' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      );
    } else if (hasSelection) {
      template.push(
        { role: 'copy', label: 'Copier' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      );
    } else {
      // Conserver une option sélectionner tout même sans sélection
      template.push({ role: 'selectAll', label: 'Tout sélectionner' });
    }

    template.push({ type: 'separator' }, { role: 'toggleDevTools', label: 'Outils de développement' });
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win });
  });
}

app.whenReady().then(() => {
  try { registerIconProtocol(); } catch(e) { console.warn('Protocole appicon échec:', e); }
  createWindow();
});

// IPC: purge complète du cache d'icônes
ipcMain.handle('purge-icons-cache', async () => {
  ensureIconCacheSetup();
  let removed = 0;
  try {
    const files = fs.readdirSync(iconsCacheDir).filter(f => f.endsWith('.png') && f !== path.basename(blankIconPath));
    for (const f of files) {
      try { fs.unlinkSync(path.join(iconsCacheDir, f)); removed++; } catch(_){}
    }
    // Réinitialiser les variables internes
    iconsMeta = {};
    inFlightDownloads.clear();
    // Sauvegarder l'état vide
    if (iconsMetaPath) {
      try { fs.writeFileSync(iconsMetaPath, '{}'); } catch(_){}
    }
  } catch(_){}
  return { removed };
});

// Ouvrir une URL dans le navigateur externe
ipcMain.handle('open-external', async (_event, url) => {
  try {
    // validation basique
    if (!url || typeof url !== 'string') return { ok: false, error: 'invalid url' };
    // Autoriser seulement http/https
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'scheme not allowed' };
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});


// Action générique: install / uninstall / update (simple)
ipcMain.handle('am-action', async (event, action, software) => {
  const pm = await detectPackageManager();
  if (!pm) return "Aucun gestionnaire 'am' ou 'appman' trouvé";

  if (action === '__update_all__') {
    return new Promise((resolve) => {
      const child = spawn(pm, ['-u']);
      let stdoutBuf = '';
      let stderrBuf = '';
      const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch(_){} }, 5*60*1000);
      child.stdout.on('data', d => { stdoutBuf += d.toString(); });
      child.stderr.on('data', d => { stderrBuf += d.toString(); });
      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0) return resolve(stdoutBuf || '');
        resolve(stderrBuf || stdoutBuf || `Processus terminé avec code ${code}`);
      });
      child.on('error', (err) => {
        clearTimeout(killTimer);
        invalidatePackageManagerCache();
        resolve(err.message || 'Erreur inconnue');
      });
    });
  }

  // Pour install/désinstall, utiliser node-pty pour la gestion du mot de passe
  let args;
  if (action === 'install') args = ['-i', software];
  else if (action === 'uninstall') args = ['-R', software];
  else return `Action inconnue: ${action}`;

  return new Promise((resolve) => {
    try {
      const pty = require('node-pty');
      const env = Object.assign({}, process.env, {
        TERM: 'xterm',
        COLS: '80',
        ROWS: '30',
        FORCE_COLOR: '1',
      });
      const child = pty.spawn(pm, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env
      });
      let output = '';
      let done = false;
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
      // Gestion du prompt mot de passe sudo
      passwordWaiters.set(id, (password) => {
        if (typeof password === 'string') {
          try { child.write(password + '\n'); } catch(_) {}
        } else {
          try { child.kill('SIGKILL'); } catch(_) {}
        }
      });
      child.onData((txt) => {
        output += txt;
        if (/mot de passe.*:|password.*:/i.test(txt)) {
          // Demander le mot de passe au renderer via IPC
          if (event.sender) event.sender.send('password-prompt', { id });
        }
      });
      child.onExit((evt) => {
        if (done) return;
        done = true;
        passwordWaiters.delete(id);
        resolve(output);
      });
      child.on?.('error', (err) => {
        if (done) return;
        done = true;
        passwordWaiters.delete(id);
        invalidatePackageManagerCache();
        resolve(err?.message || 'Erreur inconnue');
      });
    } catch (e) {
      invalidatePackageManagerCache();
      return resolve(e && e.message ? e.message : String(e));
    }
  });
});

// --- Installation streaming (Étapes 1 & 2) ---
// Fournit un suivi ligne à ligne pour l'installation d'un paquet.
// Retourne { id } immédiatement, puis envoie des événements 'install-progress'
// { id, kind:'start', name }
// { id, kind:'line', line }
// { id, kind:'done', code, success, duration, output }
// { id, kind:'error', message }
// Ajout : gestion du prompt mot de passe sudo
const activeInstalls = new Map();
const passwordWaiters = new Map();
ipcMain.on('password-response', (event, payload) => {
  if (!payload || !payload.id) return;
  const waiter = passwordWaiters.get(payload.id);
  if (waiter) {
    waiter(payload.password);
    passwordWaiters.delete(payload.id);
  }
});
ipcMain.handle('install-start', async (event, name) => {
  console.log('IPC install-start reçu pour', name);
  const pm = await detectPackageManager();
  // Log le lancement du processus
  console.log('Processus lancé:', pm, ['-i', name]);
  if (!pm) return { error: "Aucun gestionnaire 'am' ou 'appman' trouvé" };
  if (!name || typeof name !== 'string') return { error: 'Nom invalide' };
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  let output = '';
  const startedAt = Date.now();
  let stdoutRemainder = '';
  let stderrRemainder = '';
  const pty = require('node-pty');
  const env = Object.assign({}, process.env, {
    TERM: 'xterm',
    COLS: '80',
    ROWS: '30',
    FORCE_COLOR: '1',
    // Ajoute d'autres variables si besoin
  });
  let child;
  try {
    child = pty.spawn(pm, ['-i', name], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env
    });
  } catch (err) {
    invalidatePackageManagerCache();
    return { error: err?.message || 'Impossible de démarrer le processus.' };
  }
  activeInstalls.set(id, child);
  console.log('[ACTIVE-INSTALLS] Ajout process id:', id);
  const wc = event.sender;
  const send = (payload) => { try { wc.send('install-progress', Object.assign({ id }, payload)); } catch(_) {} };
  send({ kind:'start', name });
  const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch(_){} }, 10*60*1000); // 10 min sécurité
  function flushLines(chunk, isErr){
    // Log chaque chunk reçu du processus
    const txt = chunk.toString();
    output += txt;
    // Détection du prompt mot de passe sudo
    if (/mot de passe.*:|password.*:/i.test(txt)) {
      // Demander le mot de passe au renderer via IPC
      wc.send('password-prompt', { id });
      // Attendre la réponse avant d'envoyer le mot de passe au process
      passwordWaiters.set(id, (password) => {
        if (typeof password === 'string') {
          try { child.write(password + '\n'); } catch(_) {}
        } else {
          // Si annulé, tuer le process
          try { child.kill('SIGKILL'); } catch(_) {}
        }
      });
    }
    // Envoi du chunk brut pour affichage terminal fidèle
    send({ kind: 'line', raw: txt, stream: isErr ? 'stderr' : 'stdout' });
    // Ancien découpage en lignes pour prompts interactifs
    let buffer = (isErr ? stderrRemainder : stdoutRemainder) + txt;
    const lines = buffer.split(/\r?\n/);
    if (lines.length > 1) {
      // conserver la dernière partielle
      if (isErr) stderrRemainder = lines.pop(); else stdoutRemainder = lines.pop();
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line) continue;
        // Détection du prompt de choix interactif (évite de matcher la ligne concaténée avec la réponse)
        if ((/Choose which version|Which version you choose.*press ENTER|Please choose/i.test(line)) && !/\?\d+$/.test(line)) {
          // Collecter toutes les options numérotées dans les lignes suivantes jusqu'à la fin du buffer
          const options = [];
          for (let j = idx + 1; j < lines.length; j++) {
            let l = lines[j].trim();
            if (!l || /^[-=]+$/.test(l)) continue;
            if (l.includes('|')) {
              // Colonnes détectées : logique inchangée
              const parts = l.split('|').map(p => p.trim());
              parts.forEach(part => {
                if (/^\s*\d+[\.|\)]/.test(part)) options.push(part);
              });
            } else {
              // Pas de colonne : possibilité d'ajouter la ligne suivante
              if (/^\s*\d+[\.|\)]/.test(l)) {
                let opt = l;
                // Vérifier si la ligne suivante existe et ne commence pas par un chiffre
                if (j + 1 < lines.length) {
                  let next = lines[j + 1].trim();
                  if (next && !/^\s*\d+[\.|\)]/.test(next) && !/^[-=]+$/.test(next)) {
                    opt += ' ' + next;
                    j++; // Sauter la ligne suivante
                  }
                }
                options.push(opt);
              }
            }
          }
          // Trier les options par numéro croissant
          options.sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
            const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
            return na - nb;
          });
          console.log('[CHOICE-PROMPT] prompt:', line, 'options:', options);
          send({ kind:'choice-prompt', options, prompt: line });
        }
      }
    } else {
      if (isErr) stderrRemainder = lines[0]; else stdoutRemainder = lines[0];
    }
  }
  // node-pty : toute la sortie arrive sur onData (stdout+stderr)
  child.onData((d) => flushLines(d, false));
  child.onExit((evt) => {
    clearTimeout(killTimer);
    // Log de sortie du process
    console.log('[PTY] Process terminé pour id:', id, 'code:', evt.exitCode, 'durée:', (Date.now() - startedAt), 'ms');
    // Émettre éventuelles dernières lignes partielles
    if (stdoutRemainder && stdoutRemainder.trim()) send({ kind:'line', line: stdoutRemainder.trim(), stream:'stdout' });
    if (stderrRemainder && stderrRemainder.trim()) send({ kind:'line', line: stderrRemainder.trim(), stream:'stderr' });
    // Vérifier que le process est bien terminé avant suppression
    if (activeInstalls.has(id)) {
      activeInstalls.delete(id);
      console.log('[ACTIVE-INSTALLS] Suppression process id:', id);
    } else {
      console.warn('[ACTIVE-INSTALLS] Tentative de suppression d’un process déjà supprimé pour id:', id);
    }
    const duration = Date.now() - startedAt;
    const code = evt.exitCode;
    const success = code === 0;
    send({ kind:'done', code, success, duration, output });
  });
  child.on?.('error', (err) => {
    clearTimeout(killTimer);
    invalidatePackageManagerCache();
    try { activeInstalls.delete(id); } catch(_){ }
    send({ kind:'error', message: err?.message || 'Erreur processus' });
  });
  return { id };
});

// Annulation forcée d'une installation en cours
ipcMain.handle('install-cancel', async (event, installId) => {
  if (!installId) return { ok:false, error:'ID manquant' };
  const child = activeInstalls.get(installId);
  if (!child) return { ok:false, error:'Processus introuvable' };
  try {
    // Annulation immédiate demandée: SIGKILL (destruction directe)
    // NOTE: Pas de nettoyage applicatif dans l'outil am/appman si transaction partielle.
    child.kill('SIGKILL');
    // Émettre un événement immédiat de type 'cancelled' (le close suivra quand le process aura réellement quitté)
    try { event.sender.send('install-progress', { id: installId, kind:'cancelled' }); } catch(_){ }
    return { ok:true };
  } catch(e){
    return { ok:false, error: e.message || 'Annulation échouée' };
  }
});


// Liste détaillée: distingue installées vs catalogue
ipcMain.handle('list-apps-detailed', async () => {
  const pm = await detectPackageManager();
  if (!pm) {
    return { installed: [], all: [], pmFound: false, error: "Aucun gestionnaire 'am' ou 'appman' détecté dans le PATH." };
  }
  // We call both `pm -l` (catalog) and `pm -f` (installed files list). Some pm implementations
  // (notably appman) print only a summary in `-l` and not the installed items — `-f` contains
  // the actual list of installed programs. Run both and merge results.
  const listCmd = `${pm} -l`;
  const installedCmd = `${pm} -f`;
  const execPromise = (cmd) => new Promise(res => {
    exec(cmd, (err, stdout) => res({ err, stdout: stdout || '' }));
  });
  return new Promise(async (resolve) => {
    try {
      const [listRes, instRes] = await Promise.all([execPromise(listCmd), execPromise(installedCmd)]);
      if ((listRes.err && listRes.err.code === 127) || (instRes.err && instRes.err.code === 127)) {
        invalidatePackageManagerCache();
      }
      if ((listRes.err || !listRes.stdout) && (instRes.err || !instRes.stdout)) {
        return resolve({ installed: [], all: [], pmFound: true, error: 'Échec exécution commande liste.' });
      }

      const catalogSet = new Set();
      const catalogDesc = new Map();
      const installedSet = new Set();
      const installedDesc = new Map();
  const diamondSet = new Set(); // apps that were listed with leading '◆' in catalog output

      // Parse catalog from -l output (same rules as before)
      try {
        const lines = (listRes.stdout || '').split('\n');
        let inInstalled = false;
        let inCatalog = false;
        const ignoreNamePatterns = [
          /^YOU/i,
          /^-/,
          /^TOTAL/i,
          /^\*has/i
        ];
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          if (line.startsWith('YOU HAVE INSTALLED')) { inInstalled = true; continue; }
          if (line.startsWith('To list all installable programs')) { inInstalled = false; continue; }
          if (line.startsWith('LIST OF')) { inCatalog = true; continue; }
          if (!line.startsWith('\u25c6')) continue;
          const rest = line.slice(1).trim();
          const colonIdx = rest.indexOf(':');
          let desc = null;
          let left = rest;
          if (colonIdx !== -1) {
            left = rest.slice(0, colonIdx).trim();
            desc = rest.slice(colonIdx + 1).trim();
            if (desc === '') desc = null;
          }
          const name = left.split(/\s+/)[0].trim();
          if (ignoreNamePatterns.some(re => re.test(name))) continue;
          if (inInstalled && !inCatalog) {
            if (name) {
              installedSet.add(name);
              diamondSet.add(name);
              if (desc) installedDesc.set(name, desc);
            }
          } else if (inCatalog) {
            if (name) {
              catalogSet.add(name);
              // The line had a leading '◆' (we trimmed it earlier), treat it as diamond-marked
              diamondSet.add(name);
              if (desc) catalogDesc.set(name, desc);
            }
          }
        }
      } catch (e) {
        // ignore parse errors from catalog
      }

      // Parse installed list from -f output (appman -f prints installed programs)
      // Example -f lines:
      // "◆ pycharm             | 2025.2.2               | appimage       | 823 MiB"
      try {
        const lines = (instRes.stdout || '').split('\n');
        const ignoreNamePatterns = [
          /^YOU/i,
          /^-/,
          /^TOTAL/i,
          /^\*has/i
        ];
        for (const raw of lines) {
          let line = raw.trim();
          if (!line) continue;
          if (line.startsWith('\u25c6')) line = line.slice(1).trim();
          if (!line) continue;
          // Try to parse "name | version | type | size" separated by | if present
          if (line.includes('|')) {
            const cols = line.split('|').map(s => s.trim()).filter(Boolean);
            const name = cols[0] ? cols[0].split(/\s+/)[0].trim() : null;
            const version = cols[1] ? cols[1] : null;
            if (name && !ignoreNamePatterns.some(re => re.test(name))) {
              installedSet.add(name);
              if (version) installedDesc.set(name, version);
            }
          } else {
            // Fallback: first token is name, second token may be version
            const parts = line.split(/\s+/).filter(Boolean);
            const name = parts[0] || null;
            const version = parts[1] || null;
            if (name && !ignoreNamePatterns.some(re => re.test(name))) {
              installedSet.add(name);
              if (version) installedDesc.set(name, version);
            }
          }
        }
      } catch (e) {
        // ignore parse errors from installed
      }

      const allSet = new Set([...catalogSet, ...installedSet]);
      const all = Array.from(allSet).map(name => ({
        name,
        installed: installedSet.has(name),
        hasDiamond: diamondSet.has(name),
        version: installedDesc.get(name) || null,
        desc: catalogDesc.get(name) || null
      }));
      const installed = Array.from(installedSet).map(name => ({ name, installed: true, hasDiamond: diamondSet.has(name), version: installedDesc.get(name) || null, desc: catalogDesc.get(name) || null }));
      return resolve({ installed, all, pmFound: true });
    } catch (e) {
      return resolve({ installed: [], all: [], pmFound: true, error: 'Erreur interne lors du parsing.' });
    }
  });
});

// Contrôles de fenêtre pour le mode frameless
// Handler IPC pour récupérer dynamiquement la première catégorie existante et ses apps
ipcMain.handle('fetch-first-category', async () => {
  const repo = 'Portable-Linux-Apps/Portable-Linux-Apps.github.io';
  const apiBase = `https://api.github.com/repos/${repo}/contents`;
  const rawBase = `https://raw.githubusercontent.com/${repo}/main`;
  const undici = require('undici');
  const fetch = undici.fetch;
  try {
    // Récupère la liste des fichiers markdown
    const res = await fetch(apiBase);
    if (!res.ok) throw new Error('Erreur requête GitHub: ' + res.status);
    const files = await res.json();
    // Exclure README.md et tout fichier .md non catégorie (ex: readme, changelog, etc.)
    const mdFiles = files.filter(f => {
      if (!f.name.endsWith('.md')) return false;
      const lower = f.name.toLowerCase();
      if (lower.includes('readme') || lower.includes('changelog') || lower.includes('contribut')) return false;
      return true;
    });
    if (mdFiles.length === 0) throw new Error('Aucune catégorie trouvée');
    const file = mdFiles[0];
    const catName = file.name.replace(/\.md$/, '');
    // Récupère le contenu brut du markdown
    const mdRes = await fetch(`${rawBase}/${file.name}`);
    if (!mdRes.ok) throw new Error('Erreur requête GitHub: ' + mdRes.status);
    const mdText = await mdRes.text();
    // Parse les apps : extrait les noms entre *** dans les lignes du tableau
    const apps = [];
    const lines = mdText.split(/\r?\n/);
    for (const line of lines) {
      // Ne garder que les lignes du tableau (au moins deux '|')
      if ((line.match(/\|/g) || []).length < 2) continue;
      const matches = [...line.matchAll(/\*\*\*(.*?)\*\*\*/g)];
      for (const m of matches) {
        if (m[1]) apps.push(m[1].trim());
      }
    }
    return { ok: true, category: { name: catName, apps } };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});
ipcMain.handle('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  switch(action){
    case 'min': win.minimize(); break;
    case 'max': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close': win.close(); break;
  }
});



