#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

# when run in remote terminal, use the remote cli
if [ -n "$VSCODE_IPC_HOOK_CLI" ]; then
	REMOTE_CLI="$(which -a '@@APPNAME@@' | grep /remote-cli/)"
	if [ -n "$REMOTE_CLI" ]; then
		"$REMOTE_CLI" "$@"
		exit $?
	fi
fi

function app_realpath() {
	SOURCE=$1
	while [ -h "$SOURCE" ]; do
		DIR=$(dirname "$SOURCE")
		SOURCE=$(readlink "$SOURCE")
		[[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE
	done
	SOURCE_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
	echo "${SOURCE_DIR%%${SOURCE_DIR#*.app}}"
}

APP_PATH="$(app_realpath "${BASH_SOURCE[0]}")"
if [ -z "$APP_PATH" ]; then
	echo "Unable to determine app path from symlink : ${BASH_SOURCE[0]}"
	exit 1
fi
CONTENTS="$APP_PATH/Contents"
ELECTRON="$CONTENTS/MacOS/Electron"
CLI="$CONTENTS/Resources/app/out/cli.js"
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
