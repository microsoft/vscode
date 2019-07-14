#!/usr/bin/env bash
set -e

# remove pkg from archive
zip -d ../VSCode-darwin.zip "*.pkg"

# publish the build
PACKAGEJSON=`ls ../VSCode-darwin/*.app/Contents/Resources/app/package.json`
VERSION=`node -p "require(\"$PACKAGEJSON\").version"`
node build/azure-pipelines/common/publish.js \
	"$VSCODE_QUALITY" \
	darwin \
	archive \
	"VSCode-darwin-$VSCODE_QUALITY.zip" \
	$VERSION \
	true \
	../VSCode-darwin.zip

# package Remote Extension Host
pushd .. && mv vscode-reh-darwin vscode-server-darwin && zip -Xry vscode-server-darwin.zip vscode-server-darwin && popd

# publish Remote Extension Host
node build/azure-pipelines/common/publish.js \
	"$VSCODE_QUALITY" \
	server-darwin \
	archive-unsigned \
	"vscode-server-darwin.zip" \
	$VERSION \
	true \
	../vscode-server-darwin.zip

# package Remote Extension Host (Web)
pushd .. && mv vscode-reh-web-darwin vscode-server-darwin-web && zip -Xry vscode-server-darwin-web.zip vscode-server-darwin-web && popd

# publish Remote Extension Host (Web)
node build/azure-pipelines/common/publish.js \
	"$VSCODE_QUALITY" \
	server-darwin-web \
	archive-unsigned \
	"vscode-server-darwin-web.zip" \
	$VERSION \
	true \
	../vscode-server-darwin-web.zip

# publish hockeyapp symbols
node build/azure-pipelines/common/symbols.js "$VSCODE_MIXIN_PASSWORD" "$VSCODE_HOCKEYAPP_TOKEN" "$VSCODE_ARCH" "$VSCODE_HOCKEYAPP_ID_MACOS"

# upload configuration
yarn gulp upload-vscode-configuration
