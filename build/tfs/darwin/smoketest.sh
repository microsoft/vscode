#!/bin/sh

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
	npm run gulp -- --max_old_space_size=4096 vscode-darwin-min

step "Run unit tests" \
	./scripts/test.sh --build --reporter dot

step "Run integration tests" \
	./scripts/test-integration.sh