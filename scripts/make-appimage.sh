#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
export DEPLOY_ELECTRON=0
export DEPLOY_OPENGL=0
export DEPLOY_VULKAN=0
export DEPLOY_P11KIT=0
export DEPLOY_PULSE=0
export DEPLOY_LOCALE=0

# Deploy dependencies
quick-sharun  ./AppDir/bin/am-gui

# Supprimer les bibliothèques inutiles/problématiques (déployées par lib4bin via ldd)
rm -rf ./AppDir/shared/lib/gbm 2>/dev/null || true
rm -rf ./AppDir/shared/lib/gconv 2>/dev/null || true
rm -f ./AppDir/shared/lib/libopus* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libsndfile* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libvorbis* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libFLAC* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libmp3lame* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libmpg123* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libsystemd* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libogg* 2>/dev/null || true

# Additional changes can be done in between here

# Turn AppDir into AppImage
quick-sharun --make-appimage
