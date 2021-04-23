#!/usr/bin/env bash
set -e

if [ "$VSCODE_ARCH" == "x64" ]; then
	# package Remote Extension Host
	pushd .. && mv vscode-reh-darwin vscode-server-darwin && zip -Xry vscode-server-darwin.zip vscode-server-darwin && popd

	# publish Remote Extension Host
	# node build/azure-pipelines/common/createAsset.js \
	# 	server-darwin \
	# 	archive-unsigned \
	# 	"vscode-server-darwin.zip" \
	# 	../vscode-server-darwin.zip

	# package Remote Extension Host (Web)
	pushd .. && mv vscode-reh-web-darwin vscode-server-darwin-web && zip -Xry vscode-server-darwin-web.zip vscode-server-darwin-web && popd

	# publish Remote Extension Host (Web)
	# node build/azure-pipelines/common/createAsset.js \
	# 	server-darwin-web \
	# 	archive-unsigned \
	# 	"vscode-server-darwin-web.zip" \
	# 	../vscode-server-darwin-web.zip
fi
