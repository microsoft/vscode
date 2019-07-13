#!/usr/bin/env bash
echo 1
set -e
echo 2
REPO="$(pwd)"
ROOT="$REPO/.."
echo 3

# Publish Web Client
WEB_BUILD_NAME="vscode-web-standalone"
WEB_TARBALL_FILENAME="vscode-web-standalone.tar.gz"
WEB_TARBALL_PATH="$ROOT/$WEB_TARBALL_FILENAME"

echo rm -rf $ROOT/vscode-web-standalone.tar.*
rm -rf $ROOT/vscode-web-standalone.tar.*

echo (cd $ROOT tar --owner=0 --group=0 -czf $WEB_TARBALL_PATH $WEB_BUILD_NAME)
(cd $ROOT && tar --owner=0 --group=0 -czf $WEB_TARBALL_PATH $WEB_BUILD_NAME)

echo node build/azure-pipelines/common/publish.js "$VSCODE_QUALITY" "web-standalone" archive-unsigned "$WEB_TARBALL_FILENAME" "$VERSION" true "$WEB_TARBALL_PATH"
node build/azure-pipelines/common/publish.js "$VSCODE_QUALITY" "web-standalone" archive-unsigned "$WEB_TARBALL_FILENAME" "$VERSION" true "$WEB_TARBALL_PATH"
