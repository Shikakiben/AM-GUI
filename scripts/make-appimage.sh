#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
#export DEPLOY_ELECTRON=0
export DEPLOY_PULSE=0
export ANYLINUX_LIB=1


# Deploy dependencies + libpixman-1 pour éviter les conflits IFUNC musl/glibc sur Alpine
quick-sharun \
            ./AppDir/bin/am-gui\
          #   /usr/lib/libpixman-1.so*

# Additional changes can be done in between here

# Supprimer les bibliothèques inutiles (audio, locales, etc.)
rm -rf ./AppDir/bin/resources/app.asar.unpacked/node_modules/node-pty/prebuilds/* 2>/dev/null || true
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
find ./AppDir/bin/locales -type f ! -name 'en-US.pak' -delete 2>/dev/null || true

# Ajouter unset des variables problématiques dans .env pour sharun
cat >> ./AppDir/.env << 'EOF'
GIO_MODULE_DIR=/nonexistent
unset GBM_BACKENDS_PATH
unset LIBGL_DRIVERS_PATH
unset __EGL_VENDOR_LIBRARY_FILENAMES
EOF


# Bundle NSS/NSPR (libnss3 / libnspr4) for compatibility with minimal distros (Alpine)
# Copy the libraries from the build host into AppDir/shared/lib if available.
mkdir -p ./AppDir/shared/lib
found=0
for f in $(find /usr/lib /usr/lib64 /lib /lib64 -maxdepth 2 -type f \( -name 'libnss3.so*' -o -name 'libnspr4.so*' \) 2>/dev/null); do
  echo "Bundling $f"
  cp -P "$f" ./AppDir/shared/lib/ || true
  found=1
done
if [ "$found" -eq 0 ]; then
  echo "Warning: libnss3/libnspr not found on build host. Alpine users may need to install 'nss' and 'nspr' inside the container, or add the libs to the AppImage manually."
fi

# Turn AppDir into AppImage
quick-sharun --make-appimage
