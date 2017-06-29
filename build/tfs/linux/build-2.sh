#!/bin/bash
set -e

# set agent specific npm cache
if [ -n "$AGENT_WORKFOLDER" ]
then
	export npm_config_cache="$AGENT_WORKFOLDER/npm-cache"
	echo "Using npm cache: $npm_config_cache"
fi

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

npm install --arch=$ARCH --unsafe-perm

npm run gulp -- mixin

npm run gulp -- "electron-$ARCH"

node build/tfs/common/installDistro.js --arch=$ARCH

npm run gulp -- --max_old_space_size=4096 "vscode-linux-$ARCH-min"

./scripts/test.sh --xvfb --build --reporter dot

./build/tfs/linux/release.sh