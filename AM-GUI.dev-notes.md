# AM-GUI — Notes du dépôt

> Fichier de sauvegarde de la mémoire du dépôt (Copilot).
> En cas de reset de VSCodium, copier ce contenu vers `/memories/repo/AM-GUI.md` pour restaurer la mémoire.

## Rôle
Frontend graphique Electron pour l'outil **AM** (ivan-hc) : installer, mettre à jour et gérer les AppImages et formats portables sur Linux.

## Stack
- Electron ^43, node-pty, @xterm/xterm + addon-fit, undici
- Tests : runner natif Node (`node --test`), jsdom pour le renderer
- Lint : ESLint 9

## Commandes
- `npm start` → `electron . --gtk-version=3`
- `npm test` / `npm run test:main` / `test:renderer` / `test:integration`
- `npm run lint` → `eslint main.js preload.js src/**/*.js`
- `npm run dist` → `electron-builder --linux dir`
- `npm run download-icons` → `node scripts/download-icons.js --limit=500 --concurrency=8`

## Architecture
- `main.js` : point d'entrée Electron ; `preload.js` : pont IPC
- `src/main/` : processus principal — appList, appManAuto, categories, gpu, iconCache, install, packageManager, sandbox, tray, uninstall, updates
- `src/renderer/` : renderer — `features/` (appLoader, categories, details, featured, installer, sandbox, search, updates), `services/preferences.js`, `ui/` (confirmModal, lightbox, passwordPrompt, settingsPanel, syncButton, toast, virtualList), `utils/`
- `src/i18n/translations.js` : traductions
- `src/assets/tray/` : icônes tray (extraResources du build)
- `test/` : main / renderer / integration

## Protocole pla-install:// (bouton « Install » du site PLA)
- Le site PLA (Portable-Linux-Apps) envoie `pla-install://<appname>` quand on clique sur Install.
- Implémenté : `src/main/plaInstall.js` (parse/extract), `main.js` (setAsDefaultProtocolClient + second-instance + open-url + did-finish-load), `preload.js` (`onPlaInstall`), `renderer.js` (ouvre les détails + confirmation via `confirmModal.openActionConfirm` puis `enqueueInstall`), `package.json` (build.protocols), `AM-GUI.desktop` (MimeType=x-scheme-handler/pla-install;).
- Tests : `test/main/plaInstall.test.js`.

## Divers
- `start-am-gui.sh`, `scripts/get-dependencies.sh`, `scripts/make-appimage.sh`
- Build AppImage via le template pkgforge (Anylinux-AppImages)
- Fichier de cache des catégories : `categories-cache.json`
