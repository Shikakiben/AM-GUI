#!/bin/sh
export TERM=xterm-256color
export COLORTERM=truecolor
APPDIR="$(cd "$(dirname "$0")/.." && pwd)"
"$APPDIR/node_modules/electron/dist/electron" "$APPDIR/main.js"
