#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
exec npm run package-linux-appimage
