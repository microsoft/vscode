#!/usr/bin/env bash
set -e
REPO="$(pwd)"
ROOT="$REPO/.."

# Publish Web Client
WEB_BUILD_NAME="vscode-web"
WEB_TARBALL_FILENAME="vscode-web.tar.gz"
WEB_TARBALL_PATH="$ROOT/$WEB_TARBALL_FILENAME"

rm -rf $ROOT/vscode-web.tar.*

(cd $ROOT && tar --owner=0 --group=0 -czf $WEB_TARBALL_PATH $WEB_BUILD_NAME)

node build/azure-pipelines/common/createAsset.js web-standalone archive-unsigned "$WEB_TARBALL_FILENAME" "$WEB_TARBALL_PATH"
