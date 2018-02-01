#!/bin/bash

. ./scripts/env.sh
. ./build/tfs/common/common.sh

step "Build snap package" \
	npm run gulp -- "vscode-linux-$ARCH-build-snap"

# Variables
PLATFORM_SNAP="linux-snap-$ARCH"
REPO="`pwd`"
ROOT="$REPO/.."
BUILDNAME="VSCode-$PLATFORM_LINUX"
BUILD="$ROOT/$BUILDNAME"
PACKAGEJSON="$BUILD/resources/app/package.json"
VERSION=$(node -p "require(\"$PACKAGEJSON\").version")

SNAP_FILENAME="$(ls $REPO/.build/linux/snap/$ARCH/ | grep .snap)"
SNAP_PATH="$REPO/.build/linux/snap/$ARCH/$SNAP_FILENAME"

step "Publish Snap package" \
	node build/tfs/common/publish.js $VSCODE_QUALITY $PLATFORM_SNAP package $SNAP_FILENAME $VERSION true $SNAP_PATH
