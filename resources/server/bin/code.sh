#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

ROOT="$(dirname "$(dirname "$(realpath "$0")")")"

APP_NAME="@@APPNAME@@"
VERSION="@@VERSION@@"
COMMIT="@@COMMIT@@"
EXEC_NAME="@@APPNAME@@"
CLI_SCRIPT="$ROOT/out/remoteCli.js"
"$ROOT/node" "$CLI_SCRIPT" "$APP_NAME" "$VERSION" "$COMMIT" "$EXEC_NAME" "$VSCODE_CLIENT_COMMAND" "$@"