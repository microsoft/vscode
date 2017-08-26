#!/bin/bash
set -e

. ./build/tfs/common/node.sh
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
	npm run gulp -- "vscode-linux-$ARCH-min"

function configureEnvironment {
	id -u testuser &>/dev/null || (useradd -m testuser; chpasswd <<< testuser:testpassword)
	sudo -i -u testuser git config --global user.name "VS Code Agent"
	sudo -i -u testuser git config --global user.email "monacotools@microsoft.com"
	chown -R testuser $AGENT_BUILDDIRECTORY
}

function runTest {
	pushd test/smoke
	npm install
	sudo -u testuser -H xvfb-run -a -s "-screen 0 1024x768x8" npm test -- --latest "$AGENT_BUILDDIRECTORY/VSCode-linux-ia32/code-insiders"
	popd
}

step "Configure environment" configureEnvironment

step "Run smoke test" runTest

