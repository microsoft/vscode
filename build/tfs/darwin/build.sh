#!/bin/sh
set -e

export VSCODE_MIXIN_PASSWORD="$1"
export AZURE_STORAGE_ACCESS_KEY="$2"
export AZURE_STORAGE_ACCESS_KEY_2="$3"
export MOONCAKE_STORAGE_ACCESS_KEY="$4"
export AZURE_DOCUMENTDB_MASTERKEY="$5"

# set agent specific npm cache
if [ -n "$AGENT_WORKFOLDER" ]
then
	export npm_config_cache="$AGENT_WORKFOLDER/npm-cache"
	echo "Using npm cache: $npm_config_cache"
fi

# log build step
STEP() {
	echo ""
	echo "********************************************************************************"
	echo "*** $*"
	echo "********************************************************************************"
	echo ""
}

STEP "Install dependencies"
./scripts/npm.sh install

STEP "Mix in repository from vscode-distro"
npm run gulp -- mixin

STEP "Build minified & upload source maps"
npm run gulp -- --max_old_space_size=4096 vscode-darwin-min upload-vscode-sourcemaps

STEP "Run unit tests"
./scripts/test.sh --build --reporter dot

STEP "Run integration tests"
./scripts/test-integration.sh

STEP "Install build dependencies"
(cd $BUILD_SOURCESDIRECTORY/build/tfs/common && npm i)

REPO=`pwd`
ZIP=$REPO/../VSCode-darwin-selfsigned.zip
UNSIGNEDZIP=$REPO/../VSCode-darwin-unsigned.zip
BUILD=$REPO/../VSCode-darwin
PACKAGEJSON=`ls $BUILD/*.app/Contents/Resources/app/package.json`
VERSION=`node -p "require(\"$PACKAGEJSON\").version"`

STEP "Create unsigned archive"
( rm -rf $UNSIGNEDZIP ; cd $BUILD && zip -r -X -y $UNSIGNEDZIP * )

STEP "Publish unsigned archive"
node build/tfs/common/publish.js $VSCODE_QUALITY darwin archive-unsigned VSCode-darwin-$VSCODE_QUALITY-unsigned.zip $VERSION false $UNSIGNEDZIP

STEP "Sign build"
node build/tfs/common/enqueue.js $VSCODE_QUALITY