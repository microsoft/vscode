#!/usr/bin/env bash
set -e
yarn gulp vscode-darwin-min
yarn gulp vscode-reh-darwin-min

# upload-vscode-sourcemaps only publishes client maps (out-vscode-min), not server (out-vscode-reh-min)
yarn gulp upload-vscode-sourcemaps