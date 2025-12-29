#!/bin/sh

APPDIR="$(cd "$(dirname "$0")/.." && pwd)"
"$APPDIR/node_modules/electron/dist/electron" "$APPDIR/main.js"
