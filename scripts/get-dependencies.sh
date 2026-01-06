#!/bin/sh

set -eu

ARCH=$(uname -m)

echo "Installing package dependencies..."
echo "---------------------------------------------------------------"
pacman -Syu --noconfirm python


echo "Installing debloated packages..."
echo "---------------------------------------------------------------"
get-debloated-pkgs --add-common --prefer-nano

# Comment this out if you need an AUR package
#make-aur-package PACKAGENAME

# If the application needs to be manually built that has to be done down here

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
          . "$HOME/.nvm/nvm.sh"
          nvm install 22
          node -v
          npm -v
          npm install       
          npm run dist

mkdir -p ./AppDir/bin
cp -rv dist/linux-unpacked/*    ./AppDir/bin
cp -v  AM-GUI.png               ./AppDir/.DirIcon
cp -v  AM-GUI.desktop           ./AppDir
