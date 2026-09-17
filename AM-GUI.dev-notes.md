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
- `src/renderer/` : renderer — `features/` (appLoader, categories, details, featured, installer, sandbox, search, updates), `services/preferences.js`, `ui/` (confirmModal, gallery, icons, passwordPanel…), `utils.js`
  - **Icônes monochromes (option)** : réglage **désactivé par défaut** (localStorage `iconStyle`, absent = emoji). Quand il est coché, les emojis d'interface (catégories, 🔍, ⚙, 👤, 🂠, 🔒) sont remplacés par des **SVG Lucide intégrés** — `src/renderer/ui/icons.js`, 40 icônes générées depuis `lucide-static@0.473.0` (licence ISC). API : `icons.icon(name[, class])`, `icons.choose(name, emoji[, class])` (choix selon la préférence), `icons.preferred()`, `icons.lucideNameForCategory(key)`, `icons.applyAll(root, style)` (remplit les `[data-icon]` de `index.html` et sait remettre l'emoji). **Les emojis restent dans `index.html`** : ce sont eux la source de vérité, le script ne fait que les remplacer. Les symboles géométriques (✕ ✓ ▼ ▸ ◀ ▶ ❮ ❯ ▦ ≣ ◻) n'ont **pas** été touchés : ils sont déjà monochromes. Correspondances catégories → icônes fournies par la PR #68 (⚠️ `bar-chart-2` → `chart-no-axes-column` et `help-circle` → `circle-help` : noms renommés dans Lucide 0.473).
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

## Builds & releases (GitHub Actions)
- `.github/workflows/ci.yml` : lint + `npm test` sur push/PR vers `main` et `test`.
- `.github/workflows/appimage.yml` (**stable**) : `workflow_dispatch` uniquement, avec l'input obligatoire `version` (ex. `1.1.0`) ; le job `release` est conditionné par `if: github.ref_name == 'main'`. Utilise `pkgforge-dev/make-stable-appimage-release` → publie en **normal** + `make_latest: true` (donc « Latest », la cible du `UPINFO`) et committe `LATEST_VERSION`.
- `.github/workflows/appimage-beta.yml` (**beta** — ex `appimage-nightly.yml`, renommé le 2026-09-16) : `workflow_dispatch` uniquement, **aucun `schedule`** (choix assumé). Construit toujours `ref: test`, `VERSION=beta`, tag/release **`beta`** (titre « Beta build (YYYY-MM-DD) », `prerelease: true`, `make_latest: false`).
  - ⚠️ **Pourquoi pas de cron** : (1) un `schedule:` ne s'exécute que depuis la **branche par défaut** → un cron mergé dans `test` ne se déclenche pas ; (2) un rebuild sans changement produit quand même un **binaire différent** (`pacman -Syu` sur le conteneur Arch rolling + `npm install`) → les testeurs re-téléchargent ~100 Mo pour rien ; (3) le dépôt peut rester des semaines sans push. Canal renommé « beta » et déclenché à la main, quand les changements du jour sont prêts.
  - L'action `pkgforge-dev/make-nightly-appimage-release` a été remplacée par un `softprops/action-gh-release` inline : elle imposait le tag/titre « nightly » et ne permettait pas de `body` (d'où une release sans description). Le body contient maintenant le SHA buildé + l'avertissement « development version ».
  - Le tag est posé sur le SHA **réellement construit** (`target_commitish: ${{ needs.build.outputs.sha }}`, via `id: checkout` + `steps.checkout.outputs.commit`) et non sur la branche depuis laquelle le workflow est lancé.
  - ⚠️ `UPINFO` (`appimage-build/make-appimage.sh`) pointe **en dur sur `latest`** → un beta-testeur qui fait un zsync repart sur la **stable**, pas sur la beta.
- `LATEST_VERSION` : écrit par l'action stable, **lu par personne** (aucune référence dans le code). Vaut `1.0.0` sur `main` et `beta-1.92` sur `test`.

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
- **`style.css`, région `#selectedCategoryBar` (bug latent, préexistant, NON corrigé)** : il manque l'accolade fermante de `#selectedCategoryBar` après `gap: 12px;`, et la règle `.category-btn` a **perdu son sélecteur** (ses propriétés — `background`, `border`, `width:100%`, `cursor:pointer`, `display:block`… — retombent donc sur `#selectedCategoryBar`, et `width:100%` y écrase même le `display:flex`). Conséquence directe : **`.cat-icon` est imbriqué dans `#selectedCategoryBar`** (le CSS nesting le transforme en `#selectedCategoryBar .cat-icon`), donc il ne s'applique PAS au bouton de catégorie, et `.category-btn` n'a aucun style de base. Vérifié : la règle `.category-btn {` n'existe dans **aucun** commit de l'historique — ce n'est pas une régression. ⚠️ Piège pour toute nouvelle règle : ne rien insérer entre `gap: 12px;` et le `background:` qui suit (on croit ajouter une règle racine, elle est en fait imbriquée). Mettre ses règles **au niveau racine**, p. ex. près du bloc « Icônes monochromes ».
- **Icônes SVG : toujours porter la taille dans le balisage** (`width="1em" height="1em"`). Un `<svg>` sans attribut de taille ne se comporte PAS comme un glyphe : il s'étire pour remplir son conteneur (`width: 100%` par défaut) → icône énorme. Les emojis, eux, sont des caractères : ils se dimensionnent tout seuls avec la police. C'est pour ça qu'un SVG doit ressembler à un caractère : même structure (`<span class="cat-icon">GLYPH</span>`) et taille dans le balisage.
- **Lightbox Markdown (`#mdLightbox`)** : géré **uniquement** par `src/renderer/ui/gallery.js` (qui possède aussi la galerie). Il existait un **doublon** dans `renderer.js` (`initMarkdownLightbox` : ouverture + fermeture sur n'importe quel clic) → les flèches `❮ ❯` de la galerie fermaient le lightbox au lieu de changer d'image. Doublon supprimé : ne pas recréer de gestionnaire `mdLightbox` ailleurs.
- `.content` : ne jamais mettre `overflow-x: hidden` → transforme `overflow-y` en `auto` et fait de `.content` le vrai scrolleur (à la place de `.scroll-shell`), ce qui casse le reset du scroll au changement d'onglet. Utiliser `overflow-x: clip`.

- **Scripts d'installation modifiés + table des mises à jour : ne jamais matcher du texte traduit.** `parseChangedScripts` (features/updates) repère la ligne `◆ <nom>` **par l'URL non traduite** de la ligne suivante (`/programs/<arch>/<nom>`), pas par la phrase d'AM (`am translate fr` la change : « ◆ qbittorrent a changé, vous devrez peut-être le réinstaller, voir »). `parseUpdatedBlock` accepte **n'importe quelle parenthèse finale** (const `NOTE`) et retire toutes les parenthèses avant de lire les deux versions, car AM traduit aussi `(checksum changed)` → « (somme de contrôle modifiée) ». ⚠️ Les tests de `test/main/updatesParsers.test.js` **recopient** ces parsers : modifier les deux.
- **Fenêtre « gelée » / machine qui freeze pendant une mise à jour : `disable-frame-rate-limit` + un spinner infini.** ⚠️ Ne PAS remettre `app.commandLine.appendSwitch('disable-gpu-vsync' / 'disable-frame-rate-limit')` dans `main.js` (supprimés le 2026-09-17). Ces switches enlèvent le plafond de frames : le spinner CSS du bouton « Mettre à jour » (`.btn.loading::after`, `animation:spin .7s linear infinite`, actif **pendant toute la mise à jour**) faisait produire **~4500 images/s** → renderer à **93 % de CPU**, GPU process à 32 %, et la souris qui se fige plusieurs secondes. Mesuré : spinner allumé = 4522 fps / 93 % CPU ; switches retirés = 122 fps / 3,2 % CPU.
  - Méthode de diagnostic (à refaire au besoin) : lancer l'app avec `--remote-debugging-port=9223`, puis par CDP (`curl 127.0.0.1:9223/json` → WebSocket → `Runtime.evaluate`) compter `document.getAnimations()` et mesurer le fps réel via `requestAnimationFrame`. Côté système : `top -H -p <pid du renderer>` → un thread `Compositor` à 100 % avec le thread JS au repos = animation CSS, pas une boucle JS.
- Le reset scroll (`scrollShell.scrollTop = 0`) ne fonctionne que si `.scroll-shell` est bien l'élément scrollant.
- **Fenêtre « gelée » au retour pendant une mise à jour** : xterm (5.5.0) parse son buffer d'écriture par tranches de 12 ms **replanifiées via `setTimeout`** (`_innerWrite` dans `node_modules/@xterm/xterm/lib/xterm.js`), et le log des mises à jour y est écrit en continu. Avec `backgroundThrottling` (défaut d'Electron), Chromium étrangle les timers dès que la fenêtre est cachée/occultée → tout l'arriéré s'accumule, puis est avalé d'un coup au retour : l'UI ne répond plus jusqu'à la fin de la mise à jour. Corrigé par `backgroundThrottling: false` dans les `webPreferences` de `main.js` (⚠️ ne pas le retirer). Le flow control xterm (`term.write` + pause du pty) ne réglerait pas ce point ; il ne sert qu'à éviter la limite des 50 Mo en attente.
## Debug
- Lancer l'app avec CDP pour inspecter le vrai DOM :
  `./node_modules/electron/dist/electron . --gtk-version=3 --remote-debugging-port=9223 --user-data-dir=/tmp/amgui-cdp`
  puis `curl http://127.0.0.1:9223/json` → se connecter via WebSocket (Node ≥22 a `WebSocket` global) → `Runtime.evaluate`.
- Pour un bug de scroll : vérifier QUEL élément scrolle réellement (`scrollHeight` vs `clientHeight` + `getComputedStyle(el).overflowY`), ne pas supposer que c'est `.scroll-shell`.
