#!/usr/bin/env bash
set -e
REPO="$(pwd)"

# Publish webview contents
PACKAGEJSON="$REPO/package.json"
VERSION=$(node -p "require(\"$PACKAGEJSON\").version")

node build/azure-pipelines/common/publish-webview.js "$REPO/src/vs/workbench/contrib/webview/browser/pre/"
