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
	fallback() {
		# If running under older WSL, don't pass cli.js to Electron as
		# environment vars cannot be transferred from WSL to Windows
		# See: https://github.com/Microsoft/BashOnWindows/issues/1363
		#      https://github.com/Microsoft/BashOnWindows/issues/1494
		"$ELECTRON" "$@"
		exit $?
	}
	WSL_BUILD=$(uname -r | sed -E 's/^.+-([0-9]+)-Microsoft/\1/')
	# wslpath is not available prior to WSL build 17046
	# See: https://docs.microsoft.com/en-us/windows/wsl/release-notes#build-17046
	if [ -x /bin/wslpath ]; then
		WIN_CODE_CMD=$(wslpath -w "$(dirname "$(realpath "$0")")/$APP_NAME.cmd")
		# make sure the cwd is in the windows fs, otherwise there will be a warning from cmd
		pushd "$(dirname "$0")" > /dev/null
		WSL_EXT_ID="ms-vscode-remote.remote-wsl"
		WSL_EXT_WLOC=$(cmd.exe /c "$WIN_CODE_CMD" --locate-extension $WSL_EXT_ID)
		popd > /dev/null
		if ! [ -z "$WSL_EXT_WLOC" ]; then
			# replace \r\n with \n in WSL_EXT_WLOC, get linux path for
			WSL_CODE=$(wslpath -u "${WSL_EXT_WLOC%%[[:cntrl:]]}")/scripts/wslCode.sh
			"$WSL_CODE" $COMMIT $QUALITY "$WIN_CODE_CMD" "$APP_NAME" "$@"
			exit $?
		elif [ $WSL_BUILD -ge 17063 ] 2> /dev/null; then
			# Since WSL build 17063, we just need to set WSLENV so that
			# ELECTRON_RUN_AS_NODE is visible to the win32 process
			# See: https://docs.microsoft.com/en-us/windows/wsl/release-notes#build-17063
			export WSLENV=ELECTRON_RUN_AS_NODE/w:$WSLENV
			CLI=$(wslpath -m "$VSCODE_PATH/resources/app/out/cli.js")
		else # $WSL_BUILD ∈ [17046, 17063) OR $WSL_BUILD is indeterminate
			fallback "$@"
		fi
	else
		fallback "$@"
	fi
elif [ -x "$(command -v cygpath)" ]; then
	CLI=$(cygpath -m "$VSCODE_PATH/resources/app/out/cli.js")
else
	CLI="$VSCODE_PATH/resources/app/out/cli.js"
fi
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?