/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as utils from '../utils';

suite('Notebook Editor', function () {

	const contentProvider = new class implements vscode.NotebookContentProvider {
		async openNotebook(uri: vscode.Uri, _openContext: vscode.NotebookDocumentOpenContext): Promise<vscode.NotebookData> {
			return new vscode.NotebookData(
				[new vscode.NotebookCellData(vscode.NotebookCellKind.Code, uri.toString(), 'javascript')],
				new vscode.NotebookDocumentMetadata()
			);

		}
		async resolveNotebook(_document: vscode.NotebookDocument, _webview: vscode.NotebookCommunication) {
			//
		}
		async saveNotebook(_document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) {
			//
		}
		async saveNotebookAs(_targetResource: vscode.Uri, _document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) {
			//
		}
		async backupNotebook(_document: vscode.NotebookDocument, _context: vscode.NotebookDocumentBackupContext, _cancellation: vscode.CancellationToken) {
			return { id: '', delete() { } };
		}
	};

	const disposables: vscode.Disposable[] = [];

	suiteTeardown(async function () {
		utils.assertNoRpc();
		await utils.revertAllDirty();
		await utils.closeAllEditors();
		utils.disposeAll(disposables);
		disposables.length = 0;

		for (let doc of vscode.notebook.notebookDocuments) {
			assert.strictEqual(doc.isDirty, false, doc.uri.toString());
		}
	});

	suiteSetup(function () {
		disposables.push(vscode.notebook.registerNotebookContentProvider('notebook.nbdtest', contentProvider));
	});


	test('showNotebookDocment', async function () {

		const count1 = vscode.notebook.notebookDocuments.length;

		const p = utils.asPromise(vscode.notebook.onDidOpenNotebookDocument);
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');

		const editor = await vscode.window.showNotebookDocument(uri);
		assert.strictEqual(uri.toString(), editor.document.uri.toString());

		const event = await p;
		assert.strictEqual(event.uri.toString(), uri.toString());

		const count2 = vscode.notebook.notebookDocuments.length;
		assert.strictEqual(count1 + 1, count2);

	});

	test.skip('Opening a notebook should fire activeNotebook event changed only once', async function () {
		const openedEditor = utils.asPromise(vscode.window.onDidChangeActiveNotebookEditor);
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const editor = await vscode.window.showNotebookDocument(resource);
		assert.ok(await openedEditor);
		assert.strictEqual(editor.document.uri.toString(), resource.toString());
	});
});
