// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from '../../client/common/platform/fs-paths';
import { openFile, waitForCondition } from '../common';
import { EXTENSION_ROOT_DIR_FOR_TESTS, IS_SMOKE_TEST } from '../constants';

import { closeActiveWindows, initialize, initializeTest } from '../initialize';

suite('Smoke Test: Jedi LSP', () => {
    suiteSetup(async function () {
        if (!IS_SMOKE_TEST) {
            return this.skip();
        }
        await initialize();
        return undefined;
    });
    setup(initializeTest);
    suiteTeardown(closeActiveWindows);
    teardown(closeActiveWindows);

    test('Verify diagnostics on a python file', async () => {
        const file = path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'test', 'python_files', 'intellisense', 'test.py');
        const outputFile = path.join(path.dirname(file), 'ds.log');
        if (await fs.pathExists(outputFile)) {
            await fs.unlink(outputFile);
        }
        const textDocument = await openFile(file);

        waitForCondition(
            async () => {
                const diagnostics = vscode.languages.getDiagnostics(textDocument.uri);
                return diagnostics && diagnostics.length >= 1;
            },
            60_000,
            `No diagnostics found in file with invalid syntax`,
        );
    });
});
