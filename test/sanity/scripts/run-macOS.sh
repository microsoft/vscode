#!/bin/sh
set -e

echo "Installing Playwright WebKit browser"
npx playwright install --with-deps webkit

echo "Running sanity tests"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
node "$SCRIPT_DIR/../out/index.js" $@
