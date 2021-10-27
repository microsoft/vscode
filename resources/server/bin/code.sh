#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#
ROOT=$(dirname "$(dirname "$0")")

APP_NAME="@@APPNAME@@"
VERSION="@@VERSION@@"
COMMIT="@@COMMIT@@"
EXEC_NAME="@@APPNAME@@"
CLI_SCRIPT="$ROOT/out/vs/server/cli.js"
"$ROOT/node" "$CLI_SCRIPT" "$APP_NAME" "$VERSION" "$COMMIT" "$EXEC_NAME" "$@"
