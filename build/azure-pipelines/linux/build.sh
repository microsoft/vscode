#!/usr/bin/env bash
set -e
yarn gulp "vscode-linux-$VSCODE_ARCH-min"

if [[ "$VSCODE_ARCH" != "ia32" ]]; then
	yarn gulp vscode-reh-linux-$VSCODE_ARCH-min
fi