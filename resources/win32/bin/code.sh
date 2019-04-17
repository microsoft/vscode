#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
COMMIT="@@COMMIT@@"
APP_NAME="@@APPNAME@@"
QUALITY="@@QUALITY@@"
NAME="@@NAME@@"

if grep -qi Microsoft /proc/version; then
	# in a wsl shell
	WIN_CODE_CMD=$(wslpath -w "$(dirname "$(realpath "$0")")/$APP_NAME.cmd")
	if ! [ -z "$WIN_CODE_CMD" ]; then
		WSL_EXT_ID="ms-vscode.remote-wsl"
		WSL_EXT_WLOC=$(cmd.exe /c "$WIN_CODE_CMD" --locate-extension $WSL_EXT_ID)
		if ! [ -z "$WSL_EXT_WLOC" ]; then
			# replace \r\n with \n in WSL_EXT_WLOC, get linux path for
			WSL_CODE=$(wslpath -u "${WSL_EXT_WLOC%%[[:cntrl:]]}")/scripts/wslCode.sh
			$WSL_CODE $COMMIT $QUALITY "$WIN_CODE_CMD" "$APP_NAME" "$@"
			exit $?
		fi
	fi
fi

VSCODE_PATH="$(dirname "$(dirname "$(realpath "$0")")")"

if [ -x "$(command -v cygpath)" ]; then
	CLI=$(cygpath -m "$VSCODE_PATH/resources/app/out/cli.js")
else
	CLI="$VSCODE_PATH/resources/app/out/cli.js"
fi
ELECTRON="$VSCODE_PATH/$NAME.exe"
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?