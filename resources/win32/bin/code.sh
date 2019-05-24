#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
COMMIT="@@COMMIT@@"
APP_NAME="@@APPNAME@@"
QUALITY="@@QUALITY@@"
NAME="@@NAME@@"
VSCODE_PATH="$(dirname "$(dirname "$(realpath "$0")")")"
ELECTRON="$VSCODE_PATH/$NAME.exe"
if grep -qi Microsoft /proc/version; then
	# in a wsl shell
	WSL_BUILD=$(uname -r | sed -E 's/^.+-([0-9]+)-[Mm]icrosoft/\1/')
	if [ $WSL_BUILD -ge 17063 ] 2> /dev/null; then
		# WSLPATH is available since WSL build 17046
		# WSLENV is available since WSL build 17063
		export WSLENV=ELECTRON_RUN_AS_NODE/w:$WSLENV

		# use the Remote WSL extension if installed
		pushd "$VSCODE_PATH" > /dev/null
		WSL_EXT_ID="ms-vscode-remote.remote-wsl"
		WSL_EXT_WLOC=$(ELECTRON_RUN_AS_NODE=1 "$ELECTRON" ".\resources\app\out\cli.js" --locate-extension $WSL_EXT_ID)
		popd > /dev/null

		if ! [ -z "$WSL_EXT_WLOC" ]; then
			# replace \r\n with \n in WSL_EXT_WLOC
			WSL_CODE=$(wslpath -u "${WSL_EXT_WLOC%%[[:cntrl:]]}")/scripts/wslCode.sh
			WIN_CODE_CMD=$(wslpath -w "$VSCODE_PATH/bin/$APP_NAME.cmd")
			"$WSL_CODE" $COMMIT $QUALITY "$WIN_CODE_CMD" "$APP_NAME" "$@"
			exit $?
		else
			CLI=$(wslpath -m "$VSCODE_PATH/resources/app/out/cli.js")
		fi
	else
		# If running under older WSL, don't pass cli.js to Electron as
		# environment vars cannot be transferred from WSL to Windows
		# See: https://github.com/Microsoft/BashOnWindows/issues/1363
		#      https://github.com/Microsoft/BashOnWindows/issues/1494
		"$ELECTRON" "$@"
		exit $?
	fi
elif [ -x "$(command -v cygpath)" ]; then
	CLI=$(cygpath -m "$VSCODE_PATH/resources/app/out/cli.js")
else
	CLI="$VSCODE_PATH/resources/app/out/cli.js"
fi
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?