#!/bin/bash

. ./scripts/env.sh
. ./build/tfs/common/common.sh

# step "Build snap package" \
#	npm run gulp -- "vscode-linux-$ARCH-build-snap"

# Variables
PLATFORM_SNAP="linux-snap-$ARCH"
REPO="`pwd`"
ROOT="$REPO/.."
BUILDNAME="VSCode-$PLATFORM_LINUX"
BUILD="$ROOT/$BUILDNAME"
PACKAGEJSON="$BUILD/resources/app/package.json"
# VERSION=$(node -p "require(\"$PACKAGEJSON\").version")

# SNAP_FILENAME="$(ls $REPO/.build/linux/snap/$ARCH/ | grep .snap)"
# SNAP_PATH="$REPO/.build/linux/snap/$ARCH/$SNAP_FILENAME"

# step "Publish Snap package" \
# 	node build/tfs/common/publish.js $VSCODE_QUALITY $PLATFORM_SNAP package $SNAP_FILENAME $VERSION true $SNAP_PATH

wget https://az764295.vo.msecnd.net/insider/17e511973822098b8b122c7653b6b7809db16f14/code-insiders-1.20.0-1517509866-x64.snap
SNAP_PATH=code-insiders-1.20.0-1517509866-x64.snap

if [ -z "$VSCODE_QUALITY" ]; then
	echo "VSCODE_QUALITY is not set, skipping repo package publish"
elif [ "$IS_FROZEN" = "true" ]; then
	echo "$VSCODE_QUALITY is frozen, skipping repo package publish"
elif [ -z "$SNAPCRAFT_MACAROON" ] || [ -z "$SNAPCRAFT_UNBOUND_DISCHARGE" ]; then
	echo "SNAPCRAFT_MACAROON or SNAPCRAFT_UNBOUND_DISCHARGE is not set, skipping repo package publish"
else
	#if [ "$BUILD_SOURCEBRANCH" = "master" ] || [ "$BUILD_SOURCEBRANCH" = "refs/heads/master" ]; then
	#	if [[ $BUILD_QUEUEDBY = *"Project Collection Service Accounts"* || $BUILD_QUEUEDBY = *"Microsoft.VisualStudio.Services.TFS"* ]]; then
			LOGIN_FILE=snapcraft_login_file
			echo -e '[login.ubuntu.com]\nmacaroon = '$SNAPCRAFT_MACAROON'\nunbound_discharge = '$SNAPCRAFT_UNBOUND_DISCHARGE'\nemail = '$VSCODE_SNAP_LOGIN'\n' > $LOGIN_FILE
			snapcraft login --with $LOGIN_FILE
			snapcraft push $SNAP_PATH
	#	fi
	#fi
fi