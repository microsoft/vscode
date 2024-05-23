/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as utils from '../utils';

suite('Notebook Document', function () {

	const simpleContentProvider = new class implements vscode.NotebookSerializer {
		deserializeNotebook(_data: Uint8Array): vscode.NotebookData | Thenable<vscode.NotebookData> {
			return new vscode.NotebookData(
				[new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '// SIMPLE', 'javascript')],
			);
		}
		serializeNotebook(_data: vscode.NotebookData): Uint8Array | Thenable<Uint8Array> {
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
	});

	teardown(async function () {
		utils.disposeAll(testDisposables);
		testDisposables.length = 0;
	});

	suiteSetup(function () {
		disposables.push(vscode.workspace.registerNotebookSerializer('notebook.nbdtest', simpleContentProvider));
	});

	test('cannot open unknown types', async function () {
		try {
			await vscode.workspace.openNotebookDocument(vscode.Uri.parse('some:///thing.notTypeKnown'));
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});

	test('document basics', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const notebook = await vscode.workspace.openNotebookDocument(uri);

		assert.strictEqual(notebook.uri.toString(), uri.toString());
		assert.strictEqual(notebook.isDirty, false);
		assert.strictEqual(notebook.isUntitled, false);
		assert.strictEqual(notebook.cellCount, 1);

		assert.strictEqual(notebook.notebookType, 'notebook.nbdtest');
	});

	test('notebook open/close, notebook ready when cell-document open event is fired', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		let didHappen = false;

		const p = new Promise<void>((resolve, reject) => {
			const sub = vscode.workspace.onDidOpenTextDocument(doc => {
				if (doc.uri.scheme !== 'vscode-notebook-cell') {
					// ignore other open events
					return;
				}
				const notebook = vscode.workspace.notebookDocuments.find(notebook => {
					const cell = notebook.getCells().find(cell => cell.document === doc);
					return Boolean(cell);
				});
				assert.ok(notebook, `notebook for cell ${doc.uri} NOT found`);
				didHappen = true;
				sub.dispose();
				resolve();
			});

			setTimeout(() => {
				sub.dispose();
				reject(new Error('TIMEOUT'));
			}, 15000);
		});

		await vscode.workspace.openNotebookDocument(uri);
		await p;
		assert.strictEqual(didHappen, true);
	});

	test('notebook open/close, all cell-documents are ready', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');

		const p = utils.asPromise(vscode.workspace.onDidOpenNotebookDocument).then(notebook => {
			for (let i = 0; i < notebook.cellCount; i++) {
				const cell = notebook.cellAt(i);

				const doc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === cell.document.uri.toString());
				assert.ok(doc);
				assert.strictEqual(doc === cell.document, true);
				assert.strictEqual(doc?.languageId, cell.document.languageId);
				assert.strictEqual(doc?.isDirty, false);
				assert.strictEqual(doc?.isClosed, false);
			}
		});

		await vscode.workspace.openNotebookDocument(uri);
		await p;
	});

	test('open untitled notebook', async function () {
		const nb = await vscode.workspace.openNotebookDocument('notebook.nbdtest');
		assert.strictEqual(nb.isUntitled, true);
		assert.strictEqual(nb.isClosed, false);
		assert.strictEqual(nb.uri.scheme, 'untitled');
		// assert.strictEqual(nb.cellCount, 0); // NotebookSerializer ALWAYS returns something here
	});

	test('open untitled with data', async function () {
		const nb = await vscode.workspace.openNotebookDocument(
			'notebook.nbdtest',
			new vscode.NotebookData([
				new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'console.log()', 'javascript'),
				new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, 'Hey', 'markdown'),
			])
		);
		assert.strictEqual(nb.isUntitled, true);
		assert.strictEqual(nb.isClosed, false);
		assert.strictEqual(nb.uri.scheme, 'untitled');
		assert.strictEqual(nb.cellCount, 2);
		assert.strictEqual(nb.cellAt(0).kind, vscode.NotebookCellKind.Code);
		assert.strictEqual(nb.cellAt(1).kind, vscode.NotebookCellKind.Markup);
	});


	test('workspace edit API (replaceCells)', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');

		const document = await vscode.workspace.openNotebookDocument(uri);
		assert.strictEqual(document.cellCount, 1);

		// inserting two new cells
		{
			const edit = new vscode.WorkspaceEdit();
			edit.set(document.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, 0), [{
				kind: vscode.NotebookCellKind.Markup,
				languageId: 'markdown',
				metadata: undefined,
				outputs: [],
				value: 'new_markdown'
			}, {
				kind: vscode.NotebookCellKind.Code,
				languageId: 'fooLang',
				metadata: undefined,
				outputs: [],
				value: 'new_code'
			}])]);

			const success = await vscode.workspace.applyEdit(edit);
			assert.strictEqual(success, true);
		}

		assert.strictEqual(document.cellCount, 3);
		assert.strictEqual(document.cellAt(0).document.getText(), 'new_markdown');
		assert.strictEqual(document.cellAt(1).document.getText(), 'new_code');

		// deleting cell 1 and 3
		{
			const edit = new vscode.WorkspaceEdit();
			edit.set(document.uri, [
				vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, 1), []),
				vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(2, 3), [])
			]);
			const success = await vscode.workspace.applyEdit(edit);
			assert.strictEqual(success, true);
		}

		assert.strictEqual(document.cellCount, 1);
		assert.strictEqual(document.cellAt(0).document.getText(), 'new_code');

		// replacing all cells
		{
			const edit = new vscode.WorkspaceEdit();
			edit.set(document.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, 1), [{
				kind: vscode.NotebookCellKind.Markup,
				languageId: 'markdown',
				metadata: undefined,
				outputs: [],
				value: 'new2_markdown'
			}, {
				kind: vscode.NotebookCellKind.Code,
				languageId: 'fooLang',
				metadata: undefined,
				outputs: [],
				value: 'new2_code'
			}])]);
			const success = await vscode.workspace.applyEdit(edit);
			assert.strictEqual(success, true);
		}
		assert.strictEqual(document.cellCount, 2);
		assert.strictEqual(document.cellAt(0).document.getText(), 'new2_markdown');
		assert.strictEqual(document.cellAt(1).document.getText(), 'new2_code');

		// remove all cells
		{
			const edit = new vscode.WorkspaceEdit();
			edit.set(document.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, document.cellCount), [])]);
			const success = await vscode.workspace.applyEdit(edit);
			assert.strictEqual(success, true);
		}
		assert.strictEqual(document.cellCount, 0);
	});

	test('workspace edit API (replaceCells, event)', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await vscode.workspace.openNotebookDocument(uri);
		assert.strictEqual(document.cellCount, 1);

		const edit = new vscode.WorkspaceEdit();
		edit.set(document.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, 0), [{
			kind: vscode.NotebookCellKind.Markup,
			languageId: 'markdown',
			metadata: undefined,
			outputs: [],
			value: 'new_markdown'
		}, {
			kind: vscode.NotebookCellKind.Code,
			languageId: 'fooLang',
			metadata: undefined,
			outputs: [],
			value: 'new_code'
		}])]);

		const event = utils.asPromise<vscode.NotebookDocumentChangeEvent>(vscode.workspace.onDidChangeNotebookDocument);

		const success = await vscode.workspace.applyEdit(edit);
		assert.strictEqual(success, true);

		const data = await event;

		// check document
		assert.strictEqual(document.cellCount, 3);
		assert.strictEqual(document.cellAt(0).document.getText(), 'new_markdown');
		assert.strictEqual(document.cellAt(1).document.getText(), 'new_code');

		// check event data
		assert.strictEqual(data.notebook === document, true);
		assert.strictEqual(data.contentChanges.length, 1);
		assert.strictEqual(data.contentChanges[0].range.isEmpty, true);
		assert.strictEqual(data.contentChanges[0].removedCells.length, 0);
		assert.strictEqual(data.contentChanges[0].addedCells.length, 2);
		assert.strictEqual(data.contentChanges[0].addedCells[0], document.cellAt(0));
		assert.strictEqual(data.contentChanges[0].addedCells[1], document.cellAt(1));
	});

	test('workspace edit API (replaceMetadata)', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await vscode.workspace.openNotebookDocument(uri);

		const edit = new vscode.WorkspaceEdit();
		edit.set(document.uri, [vscode.NotebookEdit.updateCellMetadata(0, { inputCollapsed: true })]);
		const success = await vscode.workspace.applyEdit(edit);
		assert.strictEqual(success, true);
		assert.strictEqual(document.cellAt(0).metadata.inputCollapsed, true);
	});

	test('workspace edit API (replaceMetadata, event)', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await vscode.workspace.openNotebookDocument(uri);

		const edit = new vscode.WorkspaceEdit();
		const event = utils.asPromise<vscode.NotebookDocumentChangeEvent>(vscode.workspace.onDidChangeNotebookDocument);

		edit.set(document.uri, [vscode.NotebookEdit.updateCellMetadata(0, { inputCollapsed: true })]);
		const success = await vscode.workspace.applyEdit(edit);
		assert.strictEqual(success, true);
		const data = await event;

		// check document
		assert.strictEqual(document.cellAt(0).metadata.inputCollapsed, true);

		// check event data
		assert.strictEqual(data.notebook === document, true);
		assert.strictEqual(data.contentChanges.length, 0);
		assert.strictEqual(data.cellChanges.length, 1);
		assert.strictEqual(data.cellChanges[0].cell.index, 0);
	});

	test('workspace edit API (notebookMetadata)', async function () {
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await vscode.workspace.openNotebookDocument(uri);

		const edit = new vscode.WorkspaceEdit();
		const metdataEdit = vscode.NotebookEdit.updateNotebookMetadata({ ...document.metadata, extraNotebookMetadata: true });
		edit.set(document.uri, [metdataEdit]);
		const success = await vscode.workspace.applyEdit(edit);
		assert.equal(success, true);
		assert.ok(document.metadata.extraNotebookMetadata, `Test metadata not found`);
	});

	test('setTextDocumentLanguage for notebook cells', async function () {

		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const notebook = await vscode.workspace.openNotebookDocument(uri);
		const first = notebook.cellAt(0);
		assert.strictEqual(first.document.languageId, 'javascript');

		const pclose = utils.asPromise(vscode.workspace.onDidCloseTextDocument);
		const popen = utils.asPromise(vscode.workspace.onDidOpenTextDocument);

		await vscode.languages.setTextDocumentLanguage(first.document, 'css');
		assert.strictEqual(first.document.languageId, 'css');

		const closed = await pclose;
		const opened = await popen;

		assert.strictEqual(closed.uri.toString(), first.document.uri.toString());
		assert.strictEqual(opened.uri.toString(), first.document.uri.toString());
		assert.strictEqual(opened === closed, true);
	});

	test('setTextDocumentLanguage when notebook editor is not open', async function () {
		const uri = await utils.createRandomFile('', undefined, '.nbdtest');
		const notebook = await vscode.workspace.openNotebookDocument(uri);
		const firstCelUri = notebook.cellAt(0).document.uri;
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

		let cellDoc = await vscode.workspace.openTextDocument(firstCelUri);
		cellDoc = await vscode.languages.setTextDocumentLanguage(cellDoc, 'css');
		assert.strictEqual(cellDoc.languageId, 'css');
	});

	test('dirty state - serializer', async function () {
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await vscode.workspace.openNotebookDocument(resource);
		assert.strictEqual(document.isDirty, false);

		const edit = new vscode.WorkspaceEdit();
		edit.set(document.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, document.cellCount), [])]);
		assert.ok(await vscode.workspace.applyEdit(edit));

		assert.strictEqual(document.isDirty, true);

		await document.save();
		assert.strictEqual(document.isDirty, false);
	});

	test.skip('onDidOpenNotebookDocument - emit event only once when opened in two editors', async function () { // TODO@rebornix https://github.com/microsoft/vscode/issues/157222
		const uri = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		let counter = 0;
		testDisposables.push(vscode.workspace.onDidOpenNotebookDocument(nb => {
			if (uri.toString() === nb.uri.toString()) {
				counter++;
			}
		}));

		const notebook = await vscode.workspace.openNotebookDocument(uri);
		assert.strictEqual(counter, 1);

		await vscode.window.showNotebookDocument(notebook, { viewColumn: vscode.ViewColumn.Active });
		assert.strictEqual(counter, 1);
		assert.strictEqual(vscode.window.visibleNotebookEditors.length, 1);

		await vscode.window.showNotebookDocument(notebook, { viewColumn: vscode.ViewColumn.Beside });
		assert.strictEqual(counter, 1);
		assert.strictEqual(vscode.window.visibleNotebookEditors.length, 2);
	});
});
