#!/bin/bash
set -e

. ./scripts/env.sh
. ./build/tfs/common/common.sh

export ARCH="$1"
export VSCODE_MIXIN_PASSWORD="$2"
VSO_PAT="$3"

echo "machine monacotools.visualstudio.com password $VSO_PAT" > ~/.netrc

step "Install dependencies" \
	npm install --arch=$ARCH --unsafe-perm

step "Mix in repository from vscode-distro" \
	npm run gulp -- mixin

step "Get Electron" \
	npm run gulp -- "electron-$ARCH"

step "Install distro dependencies" \
	node build/tfs/common/installDistro.js --arch=$ARCH

step "Build minified" \
	npm run gulp -- --max_old_space_size=4096 "vscode-linux-$ARCH-min"

step "Run smoke test" \
	pushd test/smoke
	npm install
	npm run compile
	xvfb-run -a node src/main.js --latest "$AGENT_BUILDDIRECTORY/VSCode-linux-ia32/code-insiders"
	popd