// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import * as glob from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from '../../client/common/platform/fs-paths';
import { JUPYTER_EXTENSION_ID } from '../../client/common/constants';
import { SMOKE_TEST_EXTENSIONS_DIR } from '../constants';
import { noop, sleep } from '../core';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
export async function updateSetting(setting: string, value: any): Promise<void> {
    const resource = vscode.workspace.workspaceFolders![0].uri;
    await vscode.workspace
        .getConfiguration('python', resource)
        .update(setting, value, vscode.ConfigurationTarget.WorkspaceFolder);
}
export async function removeLanguageServerFiles(): Promise<void> {
    const folders = await getLanguageServerFolders();
    await Promise.all(folders.map((item) => fs.remove(item).catch(noop)));
}
async function getLanguageServerFolders(): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        glob.default('languageServer.*', { cwd: SMOKE_TEST_EXTENSIONS_DIR }, (ex, matches) => {
            if (ex) {
                reject(ex);
            } else {
                resolve(matches.map((item) => path.join(SMOKE_TEST_EXTENSIONS_DIR, item)));
            }
        });
    });
}
export function isJediEnabled(): boolean {
    const resource = vscode.workspace.workspaceFolders![0].uri;
    const settings = vscode.workspace.getConfiguration('python', resource);
    return settings.get<string>('languageServer') === 'Jedi';
}
export async function enableJedi(enable: boolean | undefined): Promise<void> {
    if (isJediEnabled() === enable) {
        return;
    }
    await updateSetting('languageServer', 'Jedi');
}

export async function openNotebook(file: string): Promise<vscode.NotebookDocument> {
    await verifyExtensionIsAvailable(JUPYTER_EXTENSION_ID);
    await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(file), 'jupyter-notebook');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notebook = (vscode.window.activeTextEditor!.document as any | undefined)?.notebook as vscode.NotebookDocument;
    assert.ok(notebook, 'Notebook did not open');
    return notebook;
}

export async function openNotebookAndWaitForLS(file: string): Promise<vscode.NotebookDocument> {
    const notebook = await openNotebook(file);
    // Make sure LS completes file loading and analysis.
    // In test mode it awaits for the completion before trying
    // to fetch data for completion, hover.etc.
    await vscode.commands.executeCommand(
        'vscode.executeCompletionItemProvider',
        notebook.cellAt(0).document.uri,
        new vscode.Position(0, 0),
    );
    // For for LS to get extracted.
    await sleep(10_000);
    return notebook;
}

export async function openFileAndWaitForLS(file: string): Promise<vscode.TextDocument> {
    const textDocument = await vscode.workspace.openTextDocument(file).then(
        (result) => result,
        (err) => {
            assert.fail(`Something went wrong opening the text document: ${err}`);
        },
    );
    await vscode.window.showTextDocument(textDocument).then(undefined, (err) => {
        assert.fail(`Something went wrong showing the text document: ${err}`);
    });
    assert.ok(vscode.window.activeTextEditor, 'No active editor');
    // Make sure LS completes file loading and analysis.
    // In test mode it awaits for the completion before trying
    // to fetch data for completion, hover.etc.
    await vscode.commands
        .executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            textDocument.uri,
            new vscode.Position(0, 0),
        )
        .then(undefined, (err) => {
            assert.fail(`Something went wrong opening the file: ${err}`);
        });
    // For for LS to get extracted.
    await sleep(10_000);
    return textDocument;
}

export async function verifyExtensionIsAvailable(extensionId: string): Promise<void> {
    const extension = vscode.extensions.all.find((e) => e.id === extensionId);
    assert.ok(
        extension,
        `Extension ${extensionId} not installed. ${JSON.stringify(vscode.extensions.all.map((e) => e.id))}`,
    );
    await extension.activate();
}
