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

if [ -z "$VSCODE_QUALITY" ]; then
	echo "VSCODE_QUALITY is not set, skipping repo package publish"
else
	if [ -z "$SNAPCRAFT_LOGIN" ] || [ -z "$SNAPCRAFT_MACAROON" ] || [ -z "$SNAPCRAFT_UNBOUND_DISCHARGE" ]; then
		echo "SNAPCRAFT* env vars not set, skipping repo package publish"
	else
		IS_FROZEN="$(node build/tfs/linux/frozen-check.js $VSCODE_QUALITY)"
		AUTO_RELEASE=0
		if [ "$IS_FROZEN" != "true" ]; then
			if [ "$BUILD_SOURCEBRANCH" = "master" ] || [ "$BUILD_SOURCEBRANCH" = "refs/heads/master" ]; then
				if [[ $BUILD_QUEUEDBY = *"Project Collection Service Accounts"* || $BUILD_QUEUEDBY = *"Microsoft.VisualStudio.Services.TFS"* ]]; then
					if [ "$VSCODE_QUALITY" = "insider" ]; then
						AUTO_RELEASE=1
					fi
				fi
			fi
		fi

		LOGIN_FILE=snapcraft_login_file
		echo -e '[login.ubuntu.com]\nmacaroon = '$SNAPCRAFT_MACAROON'\nunbound_discharge = '$SNAPCRAFT_UNBOUND_DISCHARGE'\nemail = '$VSCODE_SNAP_LOGIN'\n' > $LOGIN_FILE
		snapcraft login --with $LOGIN_FILE
		if [ "$AUTO_RELEASE" = "1" ]; then
			echo "Pushing and releasing to Snap Store stable channel"
			snapcraft push $SNAP_PATH --release stable
		else
			echo "Pushing to Snap Store"
			snapcraft push $SNAP_PATH
		fi
	fi
fi