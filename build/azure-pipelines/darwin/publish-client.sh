#!/usr/bin/env bash
set -e

# publish the x64 build
node build/azure-pipelines/common/createAsset.js \
	"darwin" \
	archive \
	"VSCode-darwin.zip" \
	../VSCode-darwin-x64.zip

# publish the arm64 build
node build/azure-pipelines/common/createAsset.js \
	"darwin-arm64" \
	archive \
	"VSCode-darwin-arm64.zip" \
	../VSCode-darwin-arm64.zip

# publish the universal build
node build/azure-pipelines/common/createAsset.js \
	"darwin-universal" \
	archive \
	"VSCode-darwin-universal.zip" \
	../VSCode-darwin-universal.zip
