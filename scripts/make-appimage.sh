#!/bin/sh

set -eu

ARCH=$(uname -m)
VERSION="${VERSION:-beta-0.1}"
export ARCH VERSION
export OUTPATH=./dist
export ADD_HOOKS="self-updater.bg.hook:fix-namespaces.hook"
export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
# Skip automatic dependency detection to avoid bloat
export SKIP_DEPS=1

# Use linux-unpacked directly without scanning for dependencies
# Just create AppImage from existing AppDir structure
quick-sharun --make-appimage
