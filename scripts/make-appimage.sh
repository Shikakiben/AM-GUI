#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"

# Télécharger sharun
curl -s https://github.com/VHSgunzo/sharun/releases/latest/download/sharun-x86_64-aio -o /tmp/sharun-aio
chmod +x /tmp/sharun-aio
# Utiliser sharun lib4bin pour compatibilité musl sans déploiement de bibliothèques
/tmp/sharun-aio lib4bin --hard-links --dst-dir ./AppDir ./AppDir/bin/am-gui

# Additional changes can be done in between here

# Turn AppDir into AppImage
quick-sharun --make-appimage
