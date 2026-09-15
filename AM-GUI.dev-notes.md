# AM-GUI — Notes du dépôt

> Fichier de sauvegarde de la mémoire du dépôt (Copilot).
> En cas de reset de VSCodium, copier ce contenu vers `/memories/repo/AM-GUI.md` pour restaurer la mémoire.
> ⚠️ Les deux fichiers (`AM-GUI.dev-notes.md` et `/memories/repo/AM-GUI.md`) doivent toujours rester synchronisés.

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
- `npm run build:i18n` → `node src/i18n/build-i18n.js` (régénère translations.js depuis locales/*.json)

## Architecture
- `main.js` : point d'entrée Electron ; `preload.js` : pont IPC
- `src/main/` : processus principal — appList, appManAuto, categories, gpu, iconCache, install, packageManager, sandbox, tray, uninstall, updates
- `src/renderer/` : renderer — `features/` (appLoader, categories, details, featured, installer, sandbox, search, updates), `services/preferences.js`, `ui/` (confirmModal, gallery, passwordPrompt, settingsPanel, syncButton, toast, virtualList), `utils.js`
  - **Galerie de captures** (`src/renderer/ui/gallery.js`, module autonome ~266 lignes ; `features/details/index.js` ne fait plus que l'appeler) : API `init({ t, isActive })` → `{ html(sources, appName), refresh(container, appRef), attach(container) }`. Les apps avec plusieurs images (`screenshots` du JSON PLA, ~5 % du catalogue, 95 % n'en ont qu'une) affichent un carrousel reprenant celui du site (`app_page.js`) : flèches ❮❯ désactivées aux extrémités, points cliquables, flèches clavier ⬅️➡️, préchargement des images.
    Dans le **lightbox** : flèches `❮ ❯` cliquables (markup dans `index.html`, affichées via la classe `has-gallery`, grisées aux extrémités) **et** molette de la souris (throttlée à 300 ms, car une molette/trackpad émet une rafale d'évènements). Un clic sur une flèche ne doit **jamais** fermer le lightbox (le clic ailleurs le ferme). Fermer le lightbox laisse la galerie sur la capture consultée. **Pas d'auto-défilement** (choix volontaire : c'est le lecteur qui décide). **Pas de titre** au-dessus des captures, et **aucune clé i18n propre** : les libellés des flèches réutilisent `featured.prev` / `featured.next` (déjà traduits), l'`alt` de l'image est le nom de l'app, et les points sont `aria-hidden` + `tabindex="-1"` (raccourci souris ; les flèches restent les vrais contrôles). Contrôles **délégués** sur le conteneur (le contenu est réinjecté via `innerHTML` à chaque render) ; `details` appelle `refresh()` après chaque réinjection pour revenir sur la capture consultée ; `isActive` (= mode détails ouvert) coupe les flèches clavier hors de la vue détail. 1 seule image = aucune flèche ni point. ⚠️ Le conteneur est en `white-space: pre-wrap` : le HTML généré doit rester **sur une seule ligne**.
- `src/i18n/` : `locales/*.json` (source de vérité, 4 sections ui/tray/contextMenu/errors) → `build-i18n.js` génère `translations.js` (ne pas éditer à la main) ; `README.md` pour les traducteurs
  - **Pourquoi JSON et pas `.po`/`.xliff`** (décision issue #74) : le renderer n'a AUCUNE étape de build (balises `<script>` simples, pas de bundler). `.po`/`.xliff` demanderaient un parseur runtime ou un build step. Le JSON donne la plupart des bénéfices des outils de traduction (Crowdin/Weblate/Poedit importent le JSON) sans build step. Migration vers `.po` possible plus tard en échangeant juste le format source + adaptant le générateur (les traducteurs ne verraient pas la différence).
- `src/assets/tray/` : icônes tray (extraResources du build)
- `test/` : main / renderer / integration

## Protocole pla-install:// (bouton « Install » du site PLA)
- Le site PLA (Portable-Linux-Apps) envoie `pla-install://<appname>` quand on clique sur Install.
- Implémenté : `src/main/plaInstall.js` (parse/extract), `main.js` (setAsDefaultProtocolClient + second-instance + open-url + did-finish-load), `preload.js` (`onPlaInstall`), `renderer.js` (ouvre les détails + confirmation via `confirmModal.openActionConfirm` puis `enqueueInstall`), `package.json` (build.protocols), `AM-GUI.desktop` (MimeType=x-scheme-handler/pla-install;).
- Tests : `test/main/plaInstall.test.js`.

## Divers
- `start-am-gui.sh`, `appimage-build/get-dependencies.sh`, `appimage-build/make-appimage.sh`
- Build AppImage via le template pkgforge (Anylinux-AppImages)
- Fichier de cache des catégories : `categories-cache.json`
- **Sync langue AM/AppMan (opt-in)** : checkbox `settings.syncAmLocale` (localStorage `syncAmLocale`) → au changement de langue, IPC `sync-am-locale` → `translatePackageManagerLocale()` dans `packageManager.js` (exécute `<pm> translate <code>`, timeout 60 s, AM ≥ 9.8). ⚠️ Modifie la config d'AM de l'utilisateur (sort du mode auto).

## Portail PLA — format JSON (site réécrit, 2026)
- ⚠️ **Les JSON sont servis depuis la racine du site** (le site a reverté le préfixe de langue le 2026-09-14) :
  - `/categories/<nom>.json`, `/app/<nom>.json`, `/apps.json` → **racine** ; les URLs `/<lang>/…json` renvoient **404**
  - **Seules les pages HTML** vivent dans des dossiers de langue (`/en/`, `/it/`)
  - La liste des catégories n'existe **que** dans une page de langue → `CATEGORY_INDEX_URL` = `https://portable-linux-apps.github.io/en/index.html`
    (34 catégories ; slugs **identiques** en `en` et `it` ; `en` = langue de repli du site ; la page racine `/index.html` n'en liste aucune)
  - ⚠️ L'ancien `cat_page.in` est devenu un **template** (variables `$LANG`, `$CAT_NAME`) : inutilisable pour extraire la liste
- **Aucune logique de langue côté AM-GUI** : les URLs PLA sont fixes. Le module `src/i18n/pla-fetch.js` (préfixe langue + fallback)
  a été supprimé le 2026-09-14, ainsi que la fonctionnalité « descriptions traduites des tuiles » (voir ci-dessous).
- **Descriptions des tuiles** : elles viennent d'`am -l` (`desc` dans `appList.js`). Le site fournit aussi des descriptions
  dans `/categories/<nom>.json`, mais elles sont **identiques** (même source AM : `◆ anydesk : Unofficial. Remote desktop application.`)
  et **en anglais uniquement** → aucun gain, d'où le retrait du code.
- Descriptions (page détails) : `https://portable-linux-apps.github.io/app/<nom>.json`
  - champs : `name`, `description` (markdown), `screenshots` (chemins relatifs), `sites`, `sources`, `buttons` (`"Label::URL"`, `_` = espace)
  - champs optionnels (PR #192 mergé 2026-08-24) : `archived` (bool), `obsolete` (u16 = année) → badge dans les détails
  - wording badge neutre (aligné AM qui affiche `is ARCHIVED` / `of <year>`) : `details.archived` = « Source archivée », `details.obsolete` = « Pas de mise à jour depuis {year} »
  - géré dans `src/renderer/features/details/index.js` (`loadRemoteDescription`)
- Catégories : `https://portable-linux-apps.github.io/categories/<nom>.json`
  - objet `{ appName: { description, archs } }`, apps = `Object.keys(json)`
  - géré dans `src/main/categories.js`
  - **Cache** : `categories-cache.json` = **tableau simple**. La lecture tolère l'ancien format `{ lang, categories }` (utilisé
    brièvement en 2026-09) et le réécrit en tableau au fetch suivant.
- Icônes : `https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/<nom>.png`
- Liste complète : `https://portable-linux-apps.github.io/apps.json` (même format que categories, ~3500 apps).
  - ⚠️ NE PAS l'utiliser pour remplacer `am -l` dans `appList.js` : elle n'a que `description`+`archs` (pas installé/version/scope/diamond) et ajouterait un fetch réseau au démarrage. `am -l` local + cache reste mieux.
- Ancien format `.md` (racine du dépôt PLA + `apps/<nom>.md`) : supprimé.

## Pièges
- **Lightbox Markdown (`#mdLightbox`)** : géré **uniquement** par `src/renderer/ui/gallery.js` (qui possède aussi la galerie). Il existait un **doublon** dans `renderer.js` (`initMarkdownLightbox` : ouverture + fermeture sur n'importe quel clic) → les flèches `❮ ❯` de la galerie fermaient le lightbox au lieu de changer d'image. Doublon supprimé : ne pas recréer de gestionnaire `mdLightbox` ailleurs.
- `.content` : ne jamais mettre `overflow-x: hidden` → transforme `overflow-y` en `auto` et fait de `.content` le vrai scrolleur (à la place de `.scroll-shell`), ce qui casse le reset du scroll au changement d'onglet. Utiliser `overflow-x: clip`.

- Le reset scroll (`scrollShell.scrollTop = 0`) ne fonctionne que si `.scroll-shell` est bien l'élément scrollant.
## Debug
- Lancer l'app avec CDP pour inspecter le vrai DOM :
  `./node_modules/electron/dist/electron . --gtk-version=3 --remote-debugging-port=9223 --user-data-dir=/tmp/amgui-cdp`
  puis `curl http://127.0.0.1:9223/json` → se connecter via WebSocket (Node ≥22 a `WebSocket` global) → `Runtime.evaluate`.
- Pour un bug de scroll : vérifier QUEL élément scrolle réellement (`scrollHeight` vs `clientHeight` + `getComputedStyle(el).overflowY`), ne pas supposer que c'est `.scroll-shell`.
