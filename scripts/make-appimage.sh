#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"

# Télécharger sharun
echo "Téléchargement de sharun..."
curl -s https://github.com/VHSgunzo/sharun/releases/latest/download/sharun-x86_64-aio -o /tmp/sharun-aio
chmod +x /tmp/sharun-aio
echo "Sharun téléchargé, exécution de lib4bin..."


# Configurer les variables d'environnement pour sharun (comme quick-sharun)
export DST_DIR="./AppDir"
export HARD_LINKS=1
export GEN_LIB_PATH=1
export WITH_HOOKS=1
export STRACE_MODE=1
export VERBOSE=1

# Debug: vérifier que le binaire existe
echo "=== DEBUG: Contenu de ./AppDir/bin/ ==="
ls -la ./AppDir/bin/ | head -10
echo "=== DEBUG: Type du binaire am-gui ==="
file ./AppDir/bin/am-gui || echo "am-gui introuvable"
echo "=== DEBUG: ldd am-gui ==="
ldd ./AppDir/bin/am-gui 2>&1 | head -20

# Utiliser sharun l (lib4bin) pour compatibilité musl
echo "=== Exécution de sharun lib4bin ==="
/tmp/sharun-aio l ./AppDir/bin/am-gui 2>&1

echo "=== DEBUG: Contenu de ./AppDir après lib4bin ==="
ls -la ./AppDir/ | head -15
ls -la ./AppDir/shared/ 2>/dev/null || echo "Pas de dossier shared/"
echo "Lib4bin terminé"

# Additional changes can be done in between here

# Turn AppDir into AppImage
quick-sharun --make-appimage
