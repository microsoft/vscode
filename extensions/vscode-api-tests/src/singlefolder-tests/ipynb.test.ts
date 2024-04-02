/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('ipynb NotebookSerializer', function () {
	test('Can open an ipynb notebook', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		const workspace = vscode.workspace.workspaceFolders[0];
		const uri = vscode.Uri.joinPath(workspace.uri, 'test.ipynb');
		const notebook = await vscode.workspace.openNotebookDocument(uri);
		await vscode.window.showNotebookDocument(notebook);

		const notebookEditor = vscode.window.activeNotebookEditor;
		assert.ok(notebookEditor);

		assert.strictEqual(notebookEditor.notebook.cellCount, 2);
		assert.strictEqual(notebookEditor.notebook.cellAt(0).kind, vscode.NotebookCellKind.Markup);
		assert.strictEqual(notebookEditor.notebook.cellAt(1).kind, vscode.NotebookCellKind.Code);
		assert.strictEqual(notebookEditor.notebook.cellAt(1).outputs.length, 1);
	});
});
