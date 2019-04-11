#!/bin/sh
set -e
yarn gulp -- vscode-darwin-min
yarn gulp -- upload-vscode-sourcemaps