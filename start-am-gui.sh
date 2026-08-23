#!/bin/sh

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$APP_DIR/node_modules/electron/dist/electron" "$APP_DIR/main.js" --gtk-version=3 "$@"
