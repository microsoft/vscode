#!/usr/bin/env bash
set -e
yarn gulp vscode-darwin-min
yarn gulp vscode-reh-darwin-min
# TODO@vs-remote: DO NOT ADD SOURCEMAP TASK! (OTHERWISE SOURCES - VIA SOURCEMAPS - WILL BE PUBLIC)
# yarn gulp upload-vscode-sourcemaps