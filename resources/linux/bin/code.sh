#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

ARGS=$@

if [ ! -L $0 ]; then
	# if path is not a symlink, find relatively
	VSCODE_PATH="$(dirname $0)/.."
else
	if which readlink >/dev/null; then
		# if readlink exists, follow the symlink and find relatively
		VSCODE_PATH="$(dirname $(readlink $0))/.."
	else
		# else use the standard install location
		VSCODE_PATH="/usr/share/@@NAME@@"
	fi
fi

ELECTRON="$VSCODE_PATH/@@NAME@@"
CLI="$VSCODE_PATH/resources/app/out/cli.js"
ATOM_SHELL_INTERNAL_RUN_AS_NODE=1 "$ELECTRON" "$CLI" $ARGS
exit $?