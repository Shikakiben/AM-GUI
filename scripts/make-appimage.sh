#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="beta-$(date +'%y.%m.%d')"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
export ICON=AM-GUI.png
export DESKTOP=AM-GUI.desktop

# Deploy dependencies
quick-sharun \
	dist/linux-unpacked/am-gui 
	
# Additional changes can be done in between here

# Turn AppDir into AppImage
quick-sharun --make-appimage
