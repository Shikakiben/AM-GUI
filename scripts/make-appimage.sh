#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
#export DEPLOY_ELECTRON=0
#export ANYLINUX_LIB=1
#export DEPLOY_GTK=0
#export DEPLOY_P11KIT=0
#export DEPLOY_GDK=0
#export DEPLOY_PULSE=0
#export DEPLOY_GLYCIN=0

# Deploy dependencies
quick-sharun \
             ./AppDir/bin/*             
             #/usr/lib/libpixman-1.so*\
             #/usr/lib/libGL.so.1*\
             #/usr/lib/libatk-bridge-2.0.so.0*\
             #/usr/lib/libatk-1.0.so.0*\
             #/usr/lib/libgtk-3.so.0*\
             #/usr/lib/libcups.so.2*
             #/usr/lib/libnss3.so*

# Additional changes can be done in between here
cp -rv dist/linux-unpacked/resources/app.asar.unpacked/node_modules/node-pty/build \
        ./AppDir/bin/resources/app.asar.unpacked/node_modules/node-pty/build

# Supprimer les bibliothèques inutiles (audio, locales, etc.)
#rm -rf ./AppDir/shared/lib/gbm 2>/dev/null || true
#rm -rf ./AppDir/shared/lib/gconv 2>/dev/null || true
#rm -rf ./AppDir/shared/lib/locale 2>/dev/null || true
#rm -f ./AppDir/shared/lib/libopus* 2>/dev/null || true
#rm -f ./AppDir/shared/lib/libsndfile* 2>/dev/null || true
#rm -f ./AppDir/shared/lib/libvorbis* 2>/dev/null || true
#rm -f ./AppDir/shared/lib/libFLAC* 2>/dev/null || true
#rm -f ./AppDir/shared/lib/libmp3lame* 2>/dev/null || true
#rm -f ./AppDir/shared/lib/libmpg123* 2>/dev/null || true
#rm -f ./AppDir/shared/lib/libogg* 2>/dev/null || true


# Ajouter unset des variables problématiques dans .env pour sharun
#cat >> ./AppDir/.env << 'EOF'
#GIO_MODULE_DIR=/nonexistent
#unset GBM_BACKENDS_PATH
#unset LIBGL_DRIVERS_PATH
#unset __EGL_VENDOR_LIBRARY_FILENAMES
#EOF


# Turn AppDir into AppImage
quick-sharun --make-appimage