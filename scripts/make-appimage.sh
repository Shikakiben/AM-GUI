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


# Utiliser sharun l (lib4bin) pour compatibilité musl sans déploiement de bibliothèques
/tmp/sharun-aio l --hard-links -d ./AppDir ./AppDir/bin/am-gui
echo "Lib4bin terminé"

# Additional changes can be done in between here

# Turn AppDir into AppImage
quick-sharun --make-appimage
