const { app, BrowserWindow, ipcMain, Menu, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { registerCategoryHandlers } = require('./src/main/categories');
const { detectPackageManager, invalidatePackageManagerCache } = require('./src/main/packageManager');
const { createIconCacheManager } = require('./src/main/iconCache');

const iconCacheManager = createIconCacheManager(app);
registerCategoryHandlers(ipcMain);

// --- Gestion accélération GPU (doit être AVANT app.whenReady) ---
let disableGpuPref = false;
try {
  const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
  if (fs.existsSync(prefPath)) {
    const raw = fs.readFileSync(prefPath, 'utf8');
    disableGpuPref = JSON.parse(raw).disableGpu === true;
  }
} catch(_){ }
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
  } catch(_){ }
  return false;
});
ipcMain.handle('set-gpu-pref', async (_event, val) => {
  try {
    const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
    fs.writeFileSync(prefPath, JSON.stringify({ disableGpu: !!val }));
    return { ok:true };
  } catch(e){ return { ok:false, error: e.message||String(e) }; }
});

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
  try { iconCacheManager.registerProtocol(protocol); } catch(e) { console.warn('Protocole appicon échec:', e); }
  createWindow();
});

// IPC: purge complète du cache d'icônes
ipcMain.handle('purge-icons-cache', async () => iconCacheManager.purgeCache());

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

ipcMain.handle('install-send-choice', async (_event, installId, choice) => {
  if (!installId) return { ok:false, error: 'ID manquant' };
  const child = activeInstalls.get(installId);
  if (!child) return { ok:false, error: 'Processus introuvable' };
  const normalizedChoice = (() => {
    if (typeof choice === 'number' && Number.isFinite(choice)) return String(choice);
    if (typeof choice === 'string') return choice.trim();
    return '';
  })();
  if (!normalizedChoice) return { ok:false, error: 'Choix invalide' };
  try {
    child.write(normalizedChoice + '\n');
    return { ok:true };
  } catch (err) {
    return { ok:false, error: err?.message || 'Échec envoi du choix' };
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
ipcMain.handle('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  switch(action){
    case 'min': win.minimize(); break;
    case 'max': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close': win.close(); break;
  }
});



