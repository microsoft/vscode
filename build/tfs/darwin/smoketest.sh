#!/bin/sh

. ./build/tfs/common/node.sh
. ./scripts/env.sh
. ./build/tfs/common/common.sh

export VSCODE_MIXIN_PASSWORD="$1"
VSO_PAT="$2"

echo "machine monacotools.visualstudio.com password $VSO_PAT" > ~/.netrc

step "Install dependencies" \
	npm install

step "Mix in repository from vscode-distro" \
	npm run gulp -- mixin

step "Install distro dependencies" \
	node build/tfs/common/installDistro.js

step "Build minified & upload source maps" \
	npm run gulp -- vscode-darwin-min

step "Run smoke test" \
	pushd test/smoke
	npm install
	npm test -- --latest "$AGENT_BUILDDIRECTORY/VSCode-darwin/Visual Studio Code - Insiders.app/Contents/MacOS/Electron"
	popd