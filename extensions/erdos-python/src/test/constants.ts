// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { IS_CI_SERVER, IS_CI_SERVER_TEST_DEBUGGER } from './ciConstants';

// Activating extension for Multiroot and Debugger CI tests for Windows takes just over 2 minutes sometimes, so 3 minutes seems like a safe margin
export const MAX_EXTENSION_ACTIVATION_TIME = 180_000;
export const TEST_TIMEOUT = 60_000;
export const TEST_RETRYCOUNT = 3;
export const IS_SMOKE_TEST = process.env.VSC_PYTHON_SMOKE_TEST === '1';
export const IS_PERF_TEST = process.env.VSC_PYTHON_PERF_TEST === '1';
export const IS_MULTI_ROOT_TEST = isMultitrootTest();

// If running on CI server, then run debugger tests ONLY if the corresponding flag is enabled.
export const TEST_DEBUGGER = IS_CI_SERVER ? IS_CI_SERVER_TEST_DEBUGGER : true;

function isMultitrootTest() {
    // No need to run smoke nor perf tests in a multi-root environment.
    if (IS_SMOKE_TEST || IS_PERF_TEST) {
        return false;
    }
    try {
        const vscode = require('vscode');
        const workspace = vscode.workspace;
        return Array.isArray(workspace.workspaceFolders) && workspace.workspaceFolders.length > 1;
    } catch {
        // being accessed, when VS Code hasn't been launched.
        return false;
    }
}

export const EXTENSION_ROOT_DIR_FOR_TESTS = path.join(__dirname, '..', '..');
export const PVSC_EXTENSION_ID_FOR_TESTS = 'ms-python.python';

export const SMOKE_TEST_EXTENSIONS_DIR = path.join(
    EXTENSION_ROOT_DIR_FOR_TESTS,
    'tmp',
    'ext',
    'smokeTestExtensionsFolder',
);
