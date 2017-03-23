#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

NAME="@@NAME@@"
VSCODE_PATH="$(dirname "$(dirname "$(realpath "$0")")")"
ELECTRON="$VSCODE_PATH/$NAME.exe"
if grep -q Microsoft /proc/version; then
	# If running under WSL don't pass cli.js to Electron as environment vars
	# cannot be transferred from WSL to Windows
	# See: https://github.com/Microsoft/BashOnWindows/issues/1363
	#      https://github.com/Microsoft/BashOnWindows/issues/1494
	"$ELECTRON" "$@"
	exit $?
fi
if [ "$(expr substr $(uname -s) 1 9)" == "CYGWIN_NT" ]; then
	CLI=$(cygpath -m "$VSCODE_PATH/resources/app/out/cli.js")
else
	CLI="$VSCODE_PATH/resources/app/out/cli.js"
fi
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
