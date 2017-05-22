#!/bin/sh

. ./scripts/env.sh
. ./build/tfs/common/common.sh

export VSCODE_MIXIN_PASSWORD="$1"
export AZURE_STORAGE_ACCESS_KEY="$2"
export AZURE_STORAGE_ACCESS_KEY_2="$3"
export MOONCAKE_STORAGE_ACCESS_KEY="$4"
export AZURE_DOCUMENTDB_MASTERKEY="$5"
VSO_PAT="$6"

echo "machine monacotools.visualstudio.com password $VSO_PAT" > ~/.netrc

step "Install dependencies" \
	npm install

step "Mix in repository from vscode-distro" \
	npm run gulp -- mixin

step "Install distro dependencies" \
	node build/tfs/common/installDistro.js

step "Build minified & upload source maps" \
	npm run gulp -- --max_old_space_size=4096 vscode-darwin-min upload-vscode-sourcemaps

step "Run unit tests" \
	./scripts/test.sh --build --reporter dot

step "Run integration tests" \
	./scripts/test-integration.sh

(cd $BUILD_SOURCESDIRECTORY/build/tfs/common && \
	step "Install build dependencies" \
	npm i)

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
	node build/tfs/common/publish.js --upload-only $VSCODE_QUALITY darwin archive-unsigned VSCode-darwin-$VSCODE_QUALITY-unsigned.zip $VERSION false $UNSIGNEDZIP

step "Sign build" \
	node build/tfs/common/enqueue.js $VSCODE_QUALITY