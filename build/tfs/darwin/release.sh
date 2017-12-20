#!/bin/sh

. ./scripts/env.sh
. ./build/tfs/common/common.sh

REPO=`pwd`
ZIP=$REPO/../VSCode-darwin-selfsigned.zip
UNSIGNEDZIP=$REPO/../VSCode-darwin-unsigned.zip
BUILD=$REPO/../VSCode-darwin
PACKAGEJSON=`ls $BUILD/*.app/Contents/Resources/app/package.json`
VERSION=`node -p "require(\"$PACKAGEJSON\").version"`

rm -rf $UNSIGNEDZIP
(cd $BUILD && \
	step "Create unsigned archive" \
	zip -r -X -y $UNSIGNEDZIP *)

step "Upload unsigned archive" \
	node build/tfs/common/publish.js $VSCODE_QUALITY darwin archive-unsigned VSCode-darwin-$VSCODE_QUALITY-unsigned.zip $VERSION false $UNSIGNEDZIP

step "Sign build" \
	node build/tfs/common/enqueue.js $VSCODE_QUALITY