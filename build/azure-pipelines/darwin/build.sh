#!/usr/bin/env bash
set -e
yarn gulp vscode-darwin-min
yarn gulp vscode-reh-darwin-min
VSCODE_WEB_BUILD=true yarn gulp vscode-reh-darwin-min
yarn gulp upload-vscode-sourcemaps