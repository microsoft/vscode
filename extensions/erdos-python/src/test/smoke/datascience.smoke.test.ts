// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from '../../client/common/platform/fs-paths';
import { openFile, waitForCondition } from '../common';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../constants';
import { sleep } from '../core';
import { closeActiveWindows, initializeTest } from '../initialize';

const timeoutForCellToRun = 3 * 60 * 1_000;

suite('Smoke Test: Datascience', () => {
    suiteSetup(async function () {
        return this.skip();
        // if (!IS_SMOKE_TEST) {
        //     return this.skip();
        // }
        // await verifyExtensionIsAvailable(JUPYTER_EXTENSION_ID);
        // await initialize();
        // await setAutoSaveDelayInWorkspaceRoot(1);

        // return undefined;
    });
    setup(initializeTest);
    suiteTeardown(closeActiveWindows);
    teardown(closeActiveWindows);

    test('Run Cell in interactive window', async () => {
        const file = path.join(
            EXTENSION_ROOT_DIR_FOR_TESTS,
            'src',
            'test',
            'python_files',
            'datascience',
            'simple_note_book.py',
        );
        const outputFile = path.join(path.dirname(file), 'ds.log');
        if (await fs.pathExists(outputFile)) {
            await fs.unlink(outputFile);
        }
        const textDocument = await openFile(file);

        // Wait for code lenses to get detected.
        await sleep(1_000);

        await vscode.commands.executeCommand<void>('jupyter.runallcells', textDocument.uri).then(undefined, (err) => {
            assert.fail(`Something went wrong running all cells in the interactive window: ${err}`);
        });
        const checkIfFileHasBeenCreated = () => fs.pathExists(outputFile);
        await waitForCondition(checkIfFileHasBeenCreated, timeoutForCellToRun, `"${outputFile}" file not created`);
    }).timeout(timeoutForCellToRun);

    test('Run Cell in native editor', async () => {
        const file = path.join(
            EXTENSION_ROOT_DIR_FOR_TESTS,
            'src',
            'test',
            'python_files',
            'datascience',
            'simple_nb.ipynb',
        );
        const fileContents = await fs.readFile(file, { encoding: 'utf-8' });
        const outputFile = path.join(path.dirname(file), 'ds_n.log');
        await fs.writeFile(file, fileContents.replace("'ds_n.log'", `'${outputFile.replace(/\\/g, '/')}'`), {
            encoding: 'utf-8',
        });
        if (await fs.pathExists(outputFile)) {
            await fs.unlink(outputFile);
        }

        await vscode.commands.executeCommand('jupyter.opennotebook', vscode.Uri.file(file));

        // Wait for 15 seconds for notebook to launch.
        // Unfortunately there's no way to know for sure it has completely loaded.
        await sleep(15_000);

        await vscode.commands.executeCommand<void>('jupyter.notebookeditor.runallcells').then(undefined, (err) => {
            assert.fail(`Something went wrong running all cells in the native editor: ${err}`);
        });
        const checkIfFileHasBeenCreated = () => fs.pathExists(outputFile);
        await waitForCondition(checkIfFileHasBeenCreated, timeoutForCellToRun, `"${outputFile}" file not created`);

        // Give time for the file to be saved before we shutdown
        await sleep(300);
    }).timeout(timeoutForCellToRun);
});
