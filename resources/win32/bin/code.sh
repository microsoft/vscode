#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

NAME="@@NAME@@"
VSCODE_PATH="$(dirname "$(dirname "$(realpath "$0")")")"
ELECTRON="$VSCODE_PATH/$NAME.exe"
CLI="$VSCODE_PATH/resources/app/out/cli.js"
ELECTRON_NO_ATTACH_CONSOLE=1 ATOM_SHELL_INTERNAL_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
