#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
export DEPLOY_GCONV=0
export DEPLOY_ELECTRON=0
export DEPLOY_OPENGL=0
export DEPLOY_VULKAN=0
export DEPLOY_P11KIT=0

# Désactive le déploiement des dépendances inutiles par quick-sharun
export DEPLOY_OPENGL=0
export DEPLOY_VULKAN=0
export DEPLOY_P11KIT=0
export DEPLOY_GTK=0
export DEPLOY_GDK=0
export DEPLOY_QT=0
export DEPLOY_QT_WEB_ENGINE=0
export DEPLOY_QML=0
export DEPLOY_SDL=0
export DEPLOY_GLYCIN=0
export DEPLOY_IMAGEMAGICK=0
export DEPLOY_LIBHEIF=0
export DEPLOY_GEGL=0
export DEPLOY_BABL=0
export DEPLOY_PIPEWIRE=0
export DEPLOY_GSTREAMER=0
export DEPLOY_GSTREAMER_ALL=0
export DEPLOY_LOCALE=0
export DEPLOY_SYS_PYTHON=0
export DEPLOY_PYTHON=0

# Deploy dependencies
quick-sharun  ./AppDir/bin/am-gui

# Additional changes can be done in between here

# Turn AppDir into AppImage
quick-sharun --make-appimage
