#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

NAME="@@NAME@@"
VSCODE_PATH="/usr/share/$NAME"
ELECTRON="$VSCODE_PATH/$NAME"
CLI="$VSCODE_PATH/resources/app/out/cli.js"
ATOM_SHELL_INTERNAL_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
