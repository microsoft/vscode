#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
sh "$SCRIPT_DIR/normalize-git-identity.sh"

# Install the pnpm version that the `packageManager` field of package.json pins
npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('+')[0].split('@')[1]")"
pnpm install
pnpm run electron
