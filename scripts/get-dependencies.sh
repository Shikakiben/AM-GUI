#!/bin/sh

set -eu

ARCH=$(uname -m)

echo "Installing package dependencies..."
echo "---------------------------------------------------------------"
pacman -Syu --noconfirm python


echo "Installing debloated packages..."
echo "---------------------------------------------------------------"
#get-debloated-pkgs --add-common --prefer-nano

# Comment this out if you need an AUR package
#make-aur-package PACKAGENAME

# If the application needs to be manually built that has to be done down here

mkdir -p ./AppDir/bin
cp -rv dist/linux-unpacked/*    ./AppDir/bin
cp -v  AM-GUI.png               ./AppDir/.DirIcon
cp -v  AM-GUI.desktop           ./AppDir
cp -v  AppRun                   ./AppDir
