#!/bin/sh

set -eu

ARCH=$(uname -m)
# No default version: the workflows always pass VERSION (workflow input).
VERSION="${VERSION:?VERSION is required (ex: VERSION=1.1.0)}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"

# Deploy dependencies
quick-sharun \
             ./AppDir/bin/* \
             /usr/bin/ps \
             /usr/bin/grep
             
# Additional changes can be done in between here

# Turn AppDir into AppImage
quick-sharun --make-appimage

# Test the app for 12 seconds, if the test fails due to the app
# having issues running in the CI use --simple-test instead
quick-sharun --test ./dist/*.AppImage
