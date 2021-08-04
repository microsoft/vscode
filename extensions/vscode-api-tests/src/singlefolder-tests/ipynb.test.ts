/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';

suite('ipynb NotebookSerializer', function () {
	test.skip('Can open an ipynb notebook', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		const workspace = vscode.workspace.workspaceFolders[0];
		const uri = vscode.Uri.joinPath(workspace.uri, 'test.ipynb');
		const notebook = await vscode.workspace.openNotebookDocument(uri);
		await vscode.window.showNotebookDocument(notebook);

		const notebookEditor = vscode.window.activeNotebookEditor;
		assert.ok(notebookEditor);

		assert.strictEqual(notebookEditor.document.cellCount, 2);
		assert.strictEqual(notebookEditor.document.cellAt(0).kind, vscode.NotebookCellKind.Markup);
		assert.strictEqual(notebookEditor.document.cellAt(1).kind, vscode.NotebookCellKind.Code);
		assert.strictEqual(notebookEditor.document.cellAt(1).outputs.length, 1);
	});
});
