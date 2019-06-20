#!/usr/bin/env bash
set -e
yarn gulp vscode-reh-linux-alpine-min
VSCODE_WEB_BUILD=true yarn gulp vscode-reh-linux-alpine-min
