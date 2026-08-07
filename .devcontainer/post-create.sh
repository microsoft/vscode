#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
sh "$SCRIPT_DIR/normalize-git-identity.sh"

npm i
npm run electron
