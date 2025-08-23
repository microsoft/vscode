import * as vscode from 'vscode';
import * as path from 'path';
import { assert } from 'chai';
import * as fs from '../../client/common/platform/fs-paths';
import { EXTENSION_ROOT_DIR_FOR_TESTS, IS_SMOKE_TEST } from '../constants';
import { closeActiveWindows, initialize, initializeTest } from '../initialize';
import { openFile, waitForCondition } from '../common';

suite('Smoke Test: Run Smart Selection and Advance Cursor', async () => {
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

    test('Smart Send', async () => {
        const file = path.join(
            EXTENSION_ROOT_DIR_FOR_TESTS,
            'src',
            'testMultiRootWkspc',
            'smokeTests',
            'create_delete_file.py',
        );
        const outputFile = path.join(
            EXTENSION_ROOT_DIR_FOR_TESTS,
            'src',
            'testMultiRootWkspc',
            'smokeTests',
            'smart_send_smoke.txt',
        );

        await fs.remove(outputFile);

        const textDocument = await openFile(file);

        if (vscode.window.activeTextEditor) {
            const myPos = new vscode.Position(0, 0);
            vscode.window.activeTextEditor!.selections = [new vscode.Selection(myPos, myPos)];
        }
        await vscode.commands
            .executeCommand<void>('python.execSelectionInTerminal', textDocument.uri)
            .then(undefined, (err) => {
                assert.fail(`Something went wrong running the Python file in the terminal: ${err}`);
            });

        const checkIfFileHasBeenCreated = () => fs.pathExists(outputFile);
        await waitForCondition(checkIfFileHasBeenCreated, 20_000, `"${outputFile}" file not created`);

        await vscode.commands
            .executeCommand<void>('python.execSelectionInTerminal', textDocument.uri)
            .then(undefined, (err) => {
                assert.fail(`Something went wrong running the Python file in the terminal: ${err}`);
            });
        await vscode.commands
            .executeCommand<void>('python.execSelectionInTerminal', textDocument.uri)
            .then(undefined, (err) => {
                assert.fail(`Something went wrong running the Python file in the terminal: ${err}`);
            });

        async function wait() {
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 10000);
            });
        }

        await wait();

        const deletedFile = !(await fs.pathExists(outputFile));
        if (deletedFile) {
            assert.ok(true, `"${outputFile}" file has been deleted`);
        } else {
            assert.fail(`"${outputFile}" file still exists`);
        }
    });
});
