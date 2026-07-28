#!/bin/sh
set -e

echo "System: $(uname -s) $(uname -r) $(uname -m)"
echo "Memory: $(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 )) GB"
echo "Disk: $(df -h / | awk 'NR==2 {print $2 " total, " $3 " used, " $4 " available"}')"

echo "Installing Playwright WebKit browser"
npx playwright install --with-deps webkit

echo "Running sanity tests"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
node "$SCRIPT_DIR/../out/index.js" $@
