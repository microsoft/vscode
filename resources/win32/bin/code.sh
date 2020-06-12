#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
if [ "$VSCODE_WSL_DEBUG_INFO" = true ]; then
	set -x
fi

COMMIT="@@COMMIT@@"
APP_NAME="@@APPNAME@@"
QUALITY="@@QUALITY@@"
NAME="@@NAME@@"
DATAFOLDER="@@DATAFOLDER@@"
VSCODE_PATH="$(dirname "$(dirname "$(realpath "$0")")")"
ELECTRON="$VSCODE_PATH/$NAME.exe"
if grep -qi Microsoft /proc/version; then
	# in a wsl shell
	WSL_BUILD=$(wmic.exe os get version | awk -F '.' '{print $3}')
	read MAJOR_VERSION MINOR_VERSION SUBLEVEL_VERSION <<<$(uname -r | sed -e 's/[^0-9.]//g' | awk -F '.' '{print $1, $2, $3}')
	if [ -z "$WSL_BUILD" ]; then
		WSL_BUILD=0
	fi

	if [ $WSL_BUILD -ge 17063 ]; then
		# $WSL_DISTRO_NAME is available since WSL builds 18362, also for WSL2
		# WSLPATH is available since WSL build 17046
		# WSLENV is available since WSL build 17063
		export WSLENV=ELECTRON_RUN_AS_NODE/w:$WSLENV
		CLI=$(wslpath -m "$VSCODE_PATH/resources/app/out/cli.js")

		# use the Remote WSL extension if installed
		WSL_EXT_ID="ms-vscode-remote.remote-wsl"

		if [ $MAJOR_VERSION -eq 4 ] && [ $MINOR_VERSION -eq 19 ] && [ $SUBLEVEL_VERSION -ge 55 ] || [ $SUBLEVEL_VERSION -le 59 ] ; then
			# WSL2 workaround for https://github.com/microsoft/WSL/issues/4337
			CWD="$(pwd)"
			cd "$VSCODE_PATH"
			cmd.exe /C ".\\bin\\$APP_NAME.cmd --locate-extension $WSL_EXT_ID >%TEMP%\\remote-wsl-loc.txt"
			WSL_EXT_WLOC=$(cmd.exe /C type %TEMP%\\remote-wsl-loc.txt)
			cd "$CWD"
		else
			ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" --locate-extension $WSL_EXT_ID >/tmp/remote-wsl-loc.txt 2>/dev/null
			WSL_EXT_WLOC=$(cat /tmp/remote-wsl-loc.txt)
		fi
		if [ -n "$WSL_EXT_WLOC" ]; then
			# replace \r\n with \n in WSL_EXT_WLOC
			WSL_CODE=$(wslpath -u "${WSL_EXT_WLOC%%[[:cntrl:]]}")/scripts/wslCode.sh
			"$WSL_CODE" "$COMMIT" "$QUALITY" "$ELECTRON" "$APP_NAME" "$DATAFOLDER" "$@"
			exit $?
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
