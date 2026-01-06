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
export DEPLOY_GTK=0
export DEPLOY_GDK=0
export DEPLOY_P11KIT=0
export DEPLOY_OPENGL=0
export DEPLOY_VULKAN=0
export DEPLOY_WEBKIT2GTK=0
export DEPLOY_GSTREAMER=0

# Deploy dependencies + libpixman-1 pour éviter les conflits IFUNC musl/glibc sur Alpine
quick-sharun \
            ./AppDir/bin/am-gui\
             /usr/lib/libpixman-1.so*

# Additional changes can be done in between here

# Supprimer les bibliothèques inutiles (audio, locales, etc.)
rm -rf ./AppDir/shared/lib/gbm 2>/dev/null || true
rm -rf ./AppDir/shared/lib/gconv 2>/dev/null || true
rm -rf ./AppDir/shared/lib/locale 2>/dev/null || true
rm -f ./AppDir/shared/lib/libopus* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libsndfile* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libvorbis* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libFLAC* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libmp3lame* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libmpg123* 2>/dev/null || true
rm -f ./AppDir/shared/lib/libogg* 2>/dev/null || true
rm -f ./AppDir/bin/LICENSES.chromium.html 2>/dev/null || true
rm -f ./AppDir/bin/LICENSE.electron.txt 2>/dev/null || true
find ./AppDir/bin/locales -type f ! -name 'en-US.pak' -delete 2>/dev/null || true

# Supprimer seulement les libs optionnelles (ffmpeg et vulkan si non utilisés)
rm -f ./AppDir/bin/libffmpeg.so ./AppDir/shared/lib/bin/libffmpeg.so 2>/dev/null || true
rm -f ./AppDir/bin/libvulkan.so* ./AppDir/bin/libvk_swiftshader.so ./AppDir/bin/libGLESv2.so 2>/dev/null || true

# Ajouter unset des variables problématiques dans .env pour sharun
cat >> ./AppDir/.env << 'EOF'
GIO_MODULE_DIR=/nonexistent
unset GBM_BACKENDS_PATH
unset LIBGL_DRIVERS_PATH
EOF


# Turn AppDir into AppImage
quick-sharun --make-appimage
