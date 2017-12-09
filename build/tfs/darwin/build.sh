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
	yarn

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

# function smoketest {
# 	ARTIFACTS="$AGENT_BUILDDIRECTORY/smoketest-artifacts"
# 	rm -rf $ARTIFACTS

# 	[[ "$VSCODE_QUALITY" == "insider" ]] && VSCODE_APPNAME="Visual Studio Code - Insiders" || VSCODE_APPNAME="Visual Studio Code"
# 	npm run smoketest -- --build "$AGENT_BUILDDIRECTORY/VSCode-darwin/$VSCODE_APPNAME.app" --log $ARTIFACTS
# }

# step "Run smoke test" \
# 	smoketest

step "Publish release" \
	./build/tfs/darwin/release.sh

step "Generate and upload configuration.json" \
	npm run gulp -- upload-vscode-configuration
