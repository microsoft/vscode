#!/usr/bin/env bash
set -e
REPO="$(pwd)"
ROOT="$REPO/.."

# Publish Web Client
WEB_BUILD_NAME="vscode-web"
WEB_TARBALL_FILENAME="vscode-web.tar.gz"
WEB_TARBALL_PATH="$ROOT/$WEB_TARBALL_FILENAME"
BUILD="$ROOT/$WEB_BUILD_NAME"
PACKAGEJSON="$BUILD/package.json"
VERSION=$(node -p "require(\"$PACKAGEJSON\").version")

rm -rf $ROOT/vscode-web.tar.*

(cd $ROOT && tar --owner=0 --group=0 -czf $WEB_TARBALL_PATH $WEB_BUILD_NAME)

node build/azure-pipelines/common/publish.js "$VSCODE_QUALITY" "web-standalone" archive-unsigned "$WEB_TARBALL_FILENAME" "$VERSION" true "$WEB_TARBALL_PATH"
