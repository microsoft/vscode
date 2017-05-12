#!/bin/sh
set -e

# log build step
STEP() {
	echo "********************************************************************************"
	echo "*** $*"
	echo "********************************************************************************"
	echo ""
}

STEP "npm install"
./scripts/npm.sh install

STEP "mixin repository from vscode-distro"
npm run gulp -- mixin

STEP "build minified win32, upload source maps"
npm run gulp -- --max_old_space_size=4096 vscode-darwin-min upload-vscode-sourcemaps

STEP "run unit tests"
./scripts/test.sh --build --reporter dot

STEP "run integration tests"
./scripts/test-integration.sh

STEP "npm install build dependencies"
(cd $BUILD_SOURCESDIRECTORY/build/tfs && npm i)

REPO=`pwd`
ZIP=$REPO/../VSCode-darwin-selfsigned.zip
UNSIGNEDZIP=$REPO/../VSCode-darwin-unsigned.zip
BUILD=$REPO/../VSCode-darwin
PACKAGEJSON=`ls $BUILD/*.app/Contents/Resources/app/package.json`
VERSION=`node -p "require(\"$PACKAGEJSON\").version"`

STEP "create unsigned archive"
( rm -rf $UNSIGNEDZIP ; cd $BUILD && zip -r -X -y $UNSIGNEDZIP * )

STEP "publish unsigned archive"
node build/tfs/out/publish.js $VSCODE_QUALITY darwin archive-unsigned VSCode-darwin-$VSCODE_QUALITY-unsigned.zip $VERSION false $UNSIGNEDZIP

STEP "create signing request"
node build/tfs/out/enqueue.js $VSCODE_QUALITY

STEP "wait for signed build"
node build/tfs/out/waitForSignedBuild.js $VSCODE_QUALITY