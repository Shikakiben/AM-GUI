#!/bin/sh

set -eu

ARCH=$(uname -m)

echo "Installing package dependencies..."
echo "---------------------------------------------------------------"
pacman -Syu --noconfirm  \
            python       \
            at-spi2-core

echo "Installing debloated packages..."
echo "---------------------------------------------------------------"
get-debloated-pkgs --add-common --prefer-nano

# Comment this out if you need an AUR package
#make-aur-package PACKAGENAME

# If the application needs to be manually built that has to be done down here

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.6/install.sh | bash
          . "$HOME/.nvm/nvm.sh"
          nvm install 24
          node -v
          npm -v
          npm install       
          npm run dist

mkdir -p ./AppDir/bin
if [ "$ARCH" = "x86_64" ]; then
  cp -rv dist/linux-unpacked/* ./AppDir/bin/
else
  cp -rv dist/linux-arm64-unpacked/* ./AppDir/bin/
fi
cp -v  AM-GUI.png            ./AppDir/.DirIcon
cp -v  AM-GUI.desktop        ./AppDir
find ./AppDir/bin/locales -type f ! -name 'en-US.pak' -delete 2>/dev/null || true

