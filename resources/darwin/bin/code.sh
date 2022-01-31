#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

CODE_PATH=$(readlink "${0}")
APP_BUNDLE=${CODE_PATH%%${CODE_PATH#*.app}}
ELECTRON="${APP_BUNDLE}/Contents/MacOS/Electron"
CLI="${APP_BUNDLE}/Contents/Resources/app/out/cli.js"
ELECTRON_RUN_AS_NODE=1 "${ELECTRON}" "${CLI}" --ms-enable-electron-run-as-node "${@}"
exit ${?}
