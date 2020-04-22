#!/usr/bin/env bash
set -e

# publish the build
node build/azure-pipelines/common/createAsset.js \
	darwin \
	archive \
	"VSCode-darwin-$VSCODE_QUALITY.zip" \
	../VSCode-darwin.zip

# package Remote Extension Host
pushd .. && mv vscode-reh-darwin vscode-server-darwin && zip -Xry vscode-server-darwin.zip vscode-server-darwin && popd

# publish Remote Extension Host
node build/azure-pipelines/common/createAsset.js \
	server-darwin \
	archive-unsigned \
	"vscode-server-darwin.zip" \
	../vscode-server-darwin.zip

# publish hockeyapp symbols
# node build/azure-pipelines/common/symbols.js "$VSCODE_MIXIN_PASSWORD" "$VSCODE_HOCKEYAPP_TOKEN" x64 "$VSCODE_HOCKEYAPP_ID_MACOS"
# Skip hockey app because build failure.
# https://github.com/microsoft/vscode/issues/90491

# upload configuration
yarn gulp upload-vscode-configuration
