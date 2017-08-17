#!/bin/sh

. ./build/tfs/common/node.sh
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

step "Hygiene" \
	npm run gulp -- hygiene

step "Mix in repository from vscode-distro" \
	npm run gulp -- mixin

step "Install distro dependencies" \
	node build/tfs/common/installDistro.js

step "Build minified & upload source maps" \
	npm run gulp -- vscode-darwin-min upload-vscode-sourcemaps

# step "Create loader snapshot"
#	node build/lib/snapshotLoader.js

step "Run unit tests" \
	./scripts/test.sh --build --reporter dot

step "Run integration tests" \
	./scripts/test-integration.sh

step "Publish release" \
	./build/tfs/darwin/release.sh
