#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
export DEPLOY_ELECTRON=0
export DEPLOY_PULSE=0
export ANYLINUX_LIB=1

# Deploy dependencies
quick-sharun  ./AppDir/bin/am-gui

# Additional changes can be done in between here

# Supprimer les bibliothèques inutiles/problématiques 
rm -rf ./AppDir/shared/lib/gbm 2>/dev/null || true
rm -rf ./AppDir/shared/lib/gconv 2>/dev/null || true
rm -rf ./AppDir/shared/lib/locale 2>/dev/null || true
rm -f ./AppDir/shared/lib/libopus* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libsndfile* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libvorbis* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libFLAC* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libmp3lame* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libmpg123* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libsystemd* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libogg* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libgbm* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libdrm* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libblkid* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libmount* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libudev* 2>/dev/null || true
rm -f ./AppDir/bin/LICENSES.chromium.html 2>/dev/null || true
rm -f ./AppDir/bin/LICENSE.electron.txt 2>/dev/null || true
find ./AppDir/bin/locales -type f ! -name 'en-US.pak' -delete 2>/dev/null || true

# Ajouter unset des variables problématiques dans .env pour sharun
cat >> ./AppDir/.env << 'EOF'
GIO_MODULE_DIR=/nonexistent
unset GBM_BACKENDS_PATH
unset LIBGL_DRIVERS_PATH
EOF


# Turn AppDir into AppImage
quick-sharun --make-appimage
