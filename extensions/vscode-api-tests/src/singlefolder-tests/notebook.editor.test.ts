/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as utils from '../utils';

suite.skip('Notebook Editor', function () {

	const contentSerializer = new class implements vscode.NotebookSerializer {
		deserializeNotebook() {
			return new vscode.NotebookData(
				[new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '// code cell', 'javascript')],
			);
		}
		serializeNotebook() {
			return new Uint8Array();
		}
	};

	const disposables: vscode.Disposable[] = [];
	const testDisposables: vscode.Disposable[] = [];

	suiteTeardown(async function () {
		utils.assertNoRpc();
		await utils.revertAllDirty();
		await utils.closeAllEditors();
		utils.disposeAll(disposables);
		disposables.length = 0;

		for (let doc of vscode.workspace.notebookDocuments) {
			assert.strictEqual(doc.isDirty, false, doc.uri.toString());
		}
	});

	suiteSetup(function () {
		disposables.push(vscode.workspace.registerNotebookSerializer('notebook.nbdtest', contentSerializer));
	});

	teardown(async function () {
		utils.disposeAll(testDisposables);
		testDisposables.length = 0;
	});

	test('showNotebookDocment', async function () {

		const notebookDocumentsFromOnDidOpen = new Set<vscode.NotebookDocument>();
		const sub = vscode.workspace.onDidOpenNotebookDocument(e => {
			notebookDocumentsFromOnDidOpen.add(e);
		});

		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');

		const editor = await vscode.window.showNotebookDocument(uri);
		assert.strictEqual(uri.toString(), editor.document.uri.toString());

		assert.strictEqual(notebookDocumentsFromOnDidOpen.has(editor.document), true);

		const includes = vscode.workspace.notebookDocuments.includes(editor.document);
		assert.strictEqual(true, includes);

		sub.dispose();
	});

	// TODO@rebornix deal with getting started
	test.skip('notebook editor has viewColumn', async function () {

		const uri1 = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const editor1 = await vscode.window.showNotebookDocument(uri1);

		assert.strictEqual(editor1.viewColumn, vscode.ViewColumn.One);

		const uri2 = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const editor2 = await vscode.window.showNotebookDocument(uri2, { viewColumn: vscode.ViewColumn.Beside });
		assert.strictEqual(editor2.viewColumn, vscode.ViewColumn.Two);
	});

	test('Opening a notebook should fire activeNotebook event changed only once', async function () {
		const openedEditor = utils.asPromise(vscode.window.onDidChangeActiveNotebookEditor);
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const editor = await vscode.window.showNotebookDocument(resource);
		assert.ok(await openedEditor);
		assert.strictEqual(editor.document.uri.toString(), resource.toString());
	});

	test('Active/Visible Editor', async function () {
		const firstEditorOpen = utils.asPromise(vscode.window.onDidChangeActiveNotebookEditor);
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const firstEditor = await vscode.window.showNotebookDocument(resource);
		await firstEditorOpen;
		assert.strictEqual(vscode.window.activeNotebookEditor, firstEditor);
		assert.strictEqual(vscode.window.visibleNotebookEditors.includes(firstEditor), true);

		const secondEditor = await vscode.window.showNotebookDocument(resource, { viewColumn: vscode.ViewColumn.Beside });
		assert.strictEqual(secondEditor === vscode.window.activeNotebookEditor, true);
		assert.notStrictEqual(firstEditor, secondEditor);
		assert.strictEqual(vscode.window.visibleNotebookEditors.includes(secondEditor), true);
		assert.strictEqual(vscode.window.visibleNotebookEditors.includes(firstEditor), true);
		assert.strictEqual(vscode.window.visibleNotebookEditors.length, 2);
	});

	test('Notebook Editor Event - onDidChangeVisibleNotebookEditors on open/close', async function () {
		const openedEditor = utils.asPromise(vscode.window.onDidChangeVisibleNotebookEditors);
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		await vscode.window.showNotebookDocument(resource);
		assert.ok(await openedEditor);

		const firstEditorClose = utils.asPromise(vscode.window.onDidChangeVisibleNotebookEditors);
		await utils.closeAllEditors();
		await firstEditorClose;
	});

	test('Notebook Editor Event - onDidChangeVisibleNotebookEditors on two editor groups', async function () {
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		let count = 0;
		testDisposables.push(vscode.window.onDidChangeVisibleNotebookEditors(() => {
			count = vscode.window.visibleNotebookEditors.length;
		}));

		await vscode.window.showNotebookDocument(resource, { viewColumn: vscode.ViewColumn.Active });
		assert.strictEqual(count, 1);

		await vscode.window.showNotebookDocument(resource, { viewColumn: vscode.ViewColumn.Beside });
		assert.strictEqual(count, 2);

		await utils.closeAllEditors();
		assert.strictEqual(count, 0);
	});
});
