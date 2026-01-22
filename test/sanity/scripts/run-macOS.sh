#!/bin/sh
set -e

# Set WebKit browser path for Playwright
export PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH="/Applications/Safari.app/Contents/MacOS/Safari"

echo "Running sanity tests"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
node "$SCRIPT_DIR/../out/index.js" $@
