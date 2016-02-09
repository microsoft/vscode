#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

if [[ "$OSTYPE" == "darwin"* ]]; then
	if [ -x "/Applications/Visual Studio Code.app" ]; then
		VSCODE_DIR="/Applications/Visual Studio Code.app/Contents/MacOS"
	elif [ -x "$HOME/Applications/Visual Studio Code.app" ]; then
		VSCODE_DIR="$HOME/Applications/Visual Studio Code.app/Contents/MacOS"
	else
		echo "Could not locate Visual Studio Code.app"
		exit 1
	fi
	ELECTRON_FILE="Electron"
else
	VSCODE_DIR="/usr/share/code"
	if [ -x "$VSCODE_DIR/Code" ]; then
		ELECTRON_FILE="Code"
	elif [ -x "$VSCODE_DIR/Code - OSS" ]; then
		ELECTRON_FILE="Code - OSS"
	else
		echo "Could not locate Visual Studio Code executable."
		exit 1
	fi
fi

VSCODE_LAUNCHER="$VSCODE_DIR/launcher.js"

ATOM_SHELL_INTERNAL_RUN_AS_NODE=1 VSCODE_PATH="$VSCODE_DIR/$ELECTRON_FILE" \
	"$VSCODE_DIR/$ELECTRON_FILE" $VSCODE_LAUNCHER "$@"
exit $?
