#!/bin/sh
set -e

# npm install
./scripts/npm.sh install

# mixin
npm run gulp -- mixin

# compile & upload source maps
npm run gulp -- --max_old_space_size=4096 vscode-darwin-min upload-vscode-sourcemaps

# run tests
./scripts/test.sh --build --reporter dot

# run integration tests
./scripts/test-integration.sh

# npm install publish tools
(cd $BUILD_SOURCESDIRECTORY/build/tfs && npm i)

# set up variables
REPO=`pwd`
ZIP=$REPO/../VSCode-darwin-selfsigned.zip
UNSIGNEDZIP=$REPO/../VSCode-darwin-unsigned.zip
BUILD=$REPO/../VSCode-darwin
PACKAGEJSON=`ls $BUILD/*.app/Contents/Resources/app/package.json`
VERSION=`node -p "require(\"$PACKAGEJSON\").version"`

# archive unsigned build
( rm -rf $UNSIGNEDZIP ; cd $BUILD && zip -r -X -y $UNSIGNEDZIP * )

# publish unsigned build
node build/tfs/out/publish.js $VSCODE_QUALITY darwin archive-unsigned VSCode-darwin-$VSCODE_QUALITY-unsigned.zip $VERSION false $UNSIGNEDZIP

# create signing request
node build/tfs/out/enqueue.js $VSCODE_QUALITY

# wait for signed build
node build/tfs/out/waitForSignedBuild.js $VSCODE_QUALITY