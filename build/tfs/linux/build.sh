#!/bin/bash

. ./build/tfs/common/node.sh
. ./scripts/env.sh
. ./build/tfs/common/common.sh

export ARCH="$1"
export VSCODE_MIXIN_PASSWORD="$2"
export AZURE_STORAGE_ACCESS_KEY="$3"
export AZURE_STORAGE_ACCESS_KEY_2="$4"
export MOONCAKE_STORAGE_ACCESS_KEY="$5"
export AZURE_DOCUMENTDB_MASTERKEY="$6"
export LINUX_REPO_PASSWORD="$7"
VSO_PAT="$8"

echo "machine monacotools.visualstudio.com password $VSO_PAT" > ~/.netrc

step "Install dependencies" \
	npm install --arch=$ARCH --unsafe-perm

step "Hygiene" \
	npm run gulp -- hygiene

step "Mix in repository from vscode-distro" \
	npm run gulp -- mixin

step "Get Electron" \
	npm run gulp -- "electron-$ARCH"

step "Install distro dependencies" \
	node build/tfs/common/installDistro.js --arch=$ARCH

step "Build minified" \
	npm run gulp -- "vscode-linux-$ARCH-min"

# step "Create loader snapshot"
# 	node build/lib/snapshotLoader.js --arch=$ARCH

step "Run unit tests" \
	./scripts/test.sh --build --reporter dot

step "Publish release" \
	./build/tfs/linux/release.sh
