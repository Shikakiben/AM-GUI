#!/bin/sh

export GDK_BACKEND=x11
"/home/moi/AM-GUI/node_modules/electron/dist/electron" "/home/moi/AM-GUI/main.js" "$@"
