/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { createRandomFile, asPromise, disposeAll, closeAllEditors, revertAllDirty } from '../utils';

// Since `workbench.action.splitEditor` command does await properly
// Notebook editor/document events are not guaranteed to be sent to the ext host when promise resolves
// The workaround here is waiting for the first visible notebook editor change event.
async function splitEditor() {
	const once = asPromise(vscode.window.onDidChangeVisibleNotebookEditors);
	await vscode.commands.executeCommand('workbench.action.splitEditor');
	await once;
}

async function saveFileAndCloseAll(resource: vscode.Uri) {
	const documentClosed = new Promise<void>((resolve, _reject) => {
		const d = vscode.notebook.onDidCloseNotebookDocument(e => {
			if (e.uri.toString() === resource.toString()) {
				d.dispose();
				resolve();
			}
		});
	});
	await vscode.commands.executeCommand('workbench.action.files.save');
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	await documentClosed;
}

async function saveAllFilesAndCloseAll(resource: vscode.Uri | undefined) {
	const documentClosed = new Promise<void>((resolve, _reject) => {
		if (!resource) {
			return resolve();
		}
		const d = vscode.notebook.onDidCloseNotebookDocument(e => {
			if (e.uri.toString() === resource.toString()) {
				d.dispose();
				resolve();
			}
		});
	});
	await vscode.commands.executeCommand('workbench.action.files.saveAll');
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	await documentClosed;
}

async function updateCellMetadata(uri: vscode.Uri, cell: vscode.NotebookCell, newMetadata: vscode.NotebookCellMetadata) {
	const edit = new vscode.WorkspaceEdit();
	edit.replaceNotebookCellMetadata(uri, cell.index, newMetadata);
	await vscode.workspace.applyEdit(edit);
}

async function updateNotebookMetadata(uri: vscode.Uri, newMetadata: vscode.NotebookDocumentMetadata) {
	const edit = new vscode.WorkspaceEdit();
	edit.replaceNotebookMetadata(uri, newMetadata);
	await vscode.workspace.applyEdit(edit);
}

async function withEvent<T>(event: vscode.Event<T>, callback: (e: Promise<T>) => Promise<void>) {
	const e = asPromise<T>(event);
	await callback(e);
}

function assertInitalState() {
	// no-op unless we figure out why some documents are opened after the editor is closed

	// assert.strictEqual(vscode.window.activeNotebookEditor, undefined);
	// assert.strictEqual(vscode.notebook.notebookDocuments.length, 0);
	// assert.strictEqual(vscode.notebook.visibleNotebookEditors.length, 0);
}

suite('Notebook API tests', function () {

	const disposables: vscode.Disposable[] = [];

	suiteTeardown(async function () {
		await revertAllDirty();
		await closeAllEditors();

		disposeAll(disposables);
		disposables.length = 0;
	});

	suiteSetup(function () {
		disposables.push(vscode.notebook.registerNotebookContentProvider('notebookCoreTest', {
			openNotebook: async (_resource: vscode.Uri): Promise<vscode.NotebookData> => {
				if (/.*empty\-.*\.vsctestnb$/.test(_resource.path)) {
					return {
						metadata: {},
						cells: []
					};
				}

				const dto: vscode.NotebookData = {
					metadata: {
						custom: { testMetadata: false }
					},
					cells: [
						{
							source: 'test',
							language: 'typescript',
							cellKind: vscode.NotebookCellKind.Code,
							outputs: [],
							metadata: {
								custom: { testCellMetadata: 123 }
							}
						}
					]
				};
				return dto;
			},
			resolveNotebook: async (_document: vscode.NotebookDocument) => {
				return;
			},
			saveNotebook: async (_document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) => {
				return;
			},
			saveNotebookAs: async (_targetResource: vscode.Uri, _document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) => {
				return;
			},
			backupNotebook: async (_document: vscode.NotebookDocument, _context: vscode.NotebookDocumentBackupContext, _cancellation: vscode.CancellationToken) => {
				return {
					id: '1',
					delete: () => { }
				};
			}
		}));


		const kernel: vscode.NotebookKernel = {
			id: 'mainKernel',
			label: 'Notebook Test Kernel',
			isPreferred: true,
			supportedLanguages: ['typescript'],
			executeAllCells: async (_document: vscode.NotebookDocument) => {
				const edit = new vscode.WorkspaceEdit();

				edit.replaceNotebookCellOutput(_document.uri, 0, [new vscode.NotebookCellOutput([
					new vscode.NotebookCellOutputItem('text/plain', ['my output'], undefined)
				])]);
				return vscode.workspace.applyEdit(edit);
			},
			cancelAllCellsExecution: async (_document: vscode.NotebookDocument) => { },
			executeCell: async (document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) => {
				if (!cell) {
					cell = document.cells[0];
				}

				if (document.uri.path.endsWith('customRenderer.vsctestnb')) {
					const edit = new vscode.WorkspaceEdit();
					edit.replaceNotebookCellOutput(document.uri, cell.index, [new vscode.NotebookCellOutput([
						new vscode.NotebookCellOutputItem('text/custom', ['test'], undefined)
					])]);

					return vscode.workspace.applyEdit(edit);
				}

				const edit = new vscode.WorkspaceEdit();
				// const previousOutputs = cell.outputs;
				edit.replaceNotebookCellOutput(document.uri, cell.index, [new vscode.NotebookCellOutput([
					new vscode.NotebookCellOutputItem('text/plain', ['my output'], undefined)
				])]);

				return vscode.workspace.applyEdit(edit);
			},
			cancelCellExecution: async (_document: vscode.NotebookDocument, _cell: vscode.NotebookCell) => { }
		};

		const kernel2: vscode.NotebookKernel = {
			id: 'secondaryKernel',
			label: 'Notebook Secondary Test Kernel',
			isPreferred: false,
			supportedLanguages: ['typescript'],
			executeAllCells: async (_document: vscode.NotebookDocument) => {
				const edit = new vscode.WorkspaceEdit();
				edit.replaceNotebookCellOutput(_document.uri, 0, [new vscode.NotebookCellOutput([
					new vscode.NotebookCellOutputItem('text/plain', ['my second output'], undefined)
				])]);

				return vscode.workspace.applyEdit(edit);
			},
			cancelAllCellsExecution: async (_document: vscode.NotebookDocument) => { },
			executeCell: async (document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) => {
				if (!cell) {
					cell = document.cells[0];
				}

				const edit = new vscode.WorkspaceEdit();

				if (document.uri.path.endsWith('customRenderer.vsctestnb')) {
					edit.replaceNotebookCellOutput(document.uri, cell.index, [new vscode.NotebookCellOutput([
						new vscode.NotebookCellOutputItem('text/custom', ['test 2'], undefined)
					])]);
				} else {
					edit.replaceNotebookCellOutput(document.uri, cell.index, [new vscode.NotebookCellOutput([
						new vscode.NotebookCellOutputItem('text/plain', ['my second output'], undefined)
					])]);
				}

				return vscode.workspace.applyEdit(edit);
			},
			cancelCellExecution: async (_document: vscode.NotebookDocument, _cell: vscode.NotebookCell) => { }
		};

		disposables.push(vscode.notebook.registerNotebookKernelProvider({ filenamePattern: '*.vsctestnb' }, {
			provideKernels: async () => {
				return [kernel, kernel2];
			}
		}));
	});

	// test.only('crash', async function () {
	// 	for (let i = 0; i < 200; i++) {
	// 		let resource = vscode.Uri.file(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
	// 		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');

	// 		resource = vscode.Uri.file(join(vscode.workspace.rootPath || '', './empty.vsctestnb'));
	// 		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
	// 	}
	// });

	// test.only('crash', async function () {
	// 	for (let i = 0; i < 200; i++) {
	// 		let resource = vscode.Uri.file(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
	// 		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 		await vscode.commands.executeCommand('workbench.action.files.save');
	// 		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	// 		resource = vscode.Uri.file(join(vscode.workspace.rootPath || '', './empty.vsctestnb'));
	// 		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 		await vscode.commands.executeCommand('workbench.action.files.save');
	// 		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	// 	}
	// });

	test('document open/close event', async function () {
		assertInitalState();

		const resource = await createRandomFile('', undefined, '.vsctestnb');
		const firstDocumentOpen = asPromise(vscode.notebook.onDidOpenNotebookDocument);
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await firstDocumentOpen;

		const firstDocumentClose = asPromise(vscode.notebook.onDidCloseNotebookDocument);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await firstDocumentClose;
	});

	test('shared document in notebook editors', async function () {
		assertInitalState();

		const resource = await createRandomFile('', undefined, '.vsctestnb');
		let counter = 0;
		const disposables: vscode.Disposable[] = [];
		disposables.push(vscode.notebook.onDidOpenNotebookDocument(() => {
			counter++;
		}));
		disposables.push(vscode.notebook.onDidCloseNotebookDocument(() => {
			counter--;
		}));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(counter, 1);

		await splitEditor();
		assert.strictEqual(counter, 1);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		assert.strictEqual(counter, 0);

		disposables.forEach(d => d.dispose());
	});

	test('editor open/close event', async function () {
		assertInitalState();

		const resource = await createRandomFile('', undefined, '.vsctestnb');
		const firstEditorOpen = asPromise(vscode.window.onDidChangeVisibleNotebookEditors);
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await firstEditorOpen;

		const firstEditorClose = asPromise(vscode.window.onDidChangeVisibleNotebookEditors);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await firstEditorClose;
	});

	test('editor open/close event 2', async function () {
		assertInitalState();

		const resource = await createRandomFile('', undefined, '.vsctestnb');
		let count = 0;
		const disposables: vscode.Disposable[] = [];
		disposables.push(vscode.window.onDidChangeVisibleNotebookEditors(() => {
			count = vscode.window.visibleNotebookEditors.length;
		}));

		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(count, 1);

		await splitEditor();
		assert.strictEqual(count, 2);

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		assert.strictEqual(count, 0);
	});

	test('editor editing event 2', async function () {
		assertInitalState();

		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		const cellChangeEventRet = await cellsChangeEvent;
		assert.strictEqual(cellChangeEventRet.document, vscode.window.activeNotebookEditor?.document);
		assert.strictEqual(cellChangeEventRet.changes.length, 1);
		assert.deepStrictEqual(cellChangeEventRet.changes[0], {
			start: 1,
			deletedCount: 0,
			deletedItems: [],
			items: [
				vscode.window.activeNotebookEditor!.document.cells[1]
			]
		});

		const secondCell = vscode.window.activeNotebookEditor!.document.cells[1];

		const moveCellEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.moveUp');
		const moveCellEventRet = await moveCellEvent;
		assert.deepStrictEqual(moveCellEventRet, {
			document: vscode.window.activeNotebookEditor!.document,
			changes: [
				{
					start: 1,
					deletedCount: 1,
					deletedItems: [secondCell],
					items: []
				},
				{
					start: 0,
					deletedCount: 0,
					deletedItems: [],
					items: [vscode.window.activeNotebookEditor?.document.cells[0]]
				}
			]
		});

		const cellOutputChange = asPromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.execute');
		const cellOutputsAddedRet = await cellOutputChange;
		assert.deepStrictEqual(cellOutputsAddedRet, {
			document: vscode.window.activeNotebookEditor!.document,
			cells: [vscode.window.activeNotebookEditor!.document.cells[0]]
		});
		assert.strictEqual(cellOutputsAddedRet.cells[0].outputs.length, 1);

		const cellOutputClear = asPromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.clearOutputs');
		const cellOutputsCleardRet = await cellOutputClear;
		assert.deepStrictEqual(cellOutputsCleardRet, {
			document: vscode.window.activeNotebookEditor!.document,
			cells: [vscode.window.activeNotebookEditor!.document.cells[0]]
		});
		assert.strictEqual(cellOutputsAddedRet.cells[0].outputs.length, 0);

		// const cellChangeLanguage = getEventOncePromise<vscode.NotebookCellLanguageChangeEvent>(vscode.notebook.onDidChangeCellLanguage);
		// await vscode.commands.executeCommand('notebook.cell.changeToMarkdown');
		// const cellChangeLanguageRet = await cellChangeLanguage;
		// assert.deepStrictEqual(cellChangeLanguageRet, {
		// 	document: vscode.window.activeNotebookEditor!.document,
		// 	cells: vscode.window.activeNotebookEditor!.document.cells[0],
		// 	language: 'markdown'
		// });

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('editor move cell event', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('notebook.focusTop');

		const activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);
		const moveChange = asPromise(vscode.notebook.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.moveDown');
		const ret = await moveChange;
		assert.deepStrictEqual(ret, {
			document: vscode.window.activeNotebookEditor?.document,
			changes: [
				{
					start: 0,
					deletedCount: 1,
					deletedItems: [activeCell],
					items: []
				},
				{
					start: 1,
					deletedCount: 0,
					deletedItems: [],
					items: [activeCell]
				}
			]
		});

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');

		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		const firstEditor = vscode.window.activeNotebookEditor;
		assert.strictEqual(firstEditor?.document.cells.length, 1);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('notebook editor active/visible', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		const firstEditor = vscode.window.activeNotebookEditor;
		assert.strictEqual(firstEditor && vscode.window.visibleNotebookEditors.indexOf(firstEditor) >= 0, true);

		await splitEditor();
		const secondEditor = vscode.window.activeNotebookEditor;
		assert.strictEqual(secondEditor && vscode.window.visibleNotebookEditors.indexOf(secondEditor) >= 0, true);
		assert.notStrictEqual(firstEditor, secondEditor);
		assert.strictEqual(firstEditor && vscode.window.visibleNotebookEditors.indexOf(firstEditor) >= 0, true);
		assert.strictEqual(vscode.window.visibleNotebookEditors.length, 2);

		const untitledEditorChange = asPromise(vscode.window.onDidChangeActiveNotebookEditor);
		await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
		await untitledEditorChange;
		assert.strictEqual(firstEditor && vscode.window.visibleNotebookEditors.indexOf(firstEditor) >= 0, true);
		assert.notStrictEqual(firstEditor, vscode.window.activeNotebookEditor);
		assert.strictEqual(secondEditor && vscode.window.visibleNotebookEditors.indexOf(secondEditor) < 0, true);
		assert.notStrictEqual(secondEditor, vscode.window.activeNotebookEditor);
		assert.strictEqual(vscode.window.visibleNotebookEditors.length, 1);

		const activeEditorClose = asPromise(vscode.window.onDidChangeActiveNotebookEditor);
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await activeEditorClose;
		assert.strictEqual(secondEditor, vscode.window.activeNotebookEditor);
		assert.strictEqual(vscode.window.visibleNotebookEditors.length, 2);
		assert.strictEqual(secondEditor && vscode.window.visibleNotebookEditors.indexOf(secondEditor) >= 0, true);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('notebook active editor change', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		const firstEditorOpen = asPromise(vscode.window.onDidChangeActiveNotebookEditor);
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await firstEditorOpen;

		const firstEditorDeactivate = asPromise(vscode.window.onDidChangeActiveNotebookEditor);
		await vscode.commands.executeCommand('workbench.action.splitEditor');
		await firstEditorDeactivate;

		await saveFileAndCloseAll(resource);
	});

	test('edit API (replaceCells)', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCells(1, 0, [{ cellKind: vscode.NotebookCellKind.Code, language: 'javascript', source: 'test 2', outputs: [], metadata: undefined }]);
		});

		const cellChangeEventRet = await cellsChangeEvent;
		assert.strictEqual(cellChangeEventRet.document === vscode.window.activeNotebookEditor?.document, true);
		assert.strictEqual(cellChangeEventRet.document.isDirty, true);
		assert.strictEqual(cellChangeEventRet.changes.length, 1);
		assert.strictEqual(cellChangeEventRet.changes[0].start, 1);
		assert.strictEqual(cellChangeEventRet.changes[0].deletedCount, 0);
		assert.strictEqual(cellChangeEventRet.changes[0].items[0] === vscode.window.activeNotebookEditor!.document.cells[1], true);

		await saveAllFilesAndCloseAll(resource);
	});

	test('edit API (replaceOutput, USE NotebookCellOutput-type)', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCellOutput(0, [new vscode.NotebookCellOutput([
				new vscode.NotebookCellOutputItem('application/foo', 'bar'),
				new vscode.NotebookCellOutputItem('application/json', { data: true }, { metadata: true }),
			])]);
		});

		const document = vscode.window.activeNotebookEditor?.document!;
		assert.strictEqual(document.isDirty, true);
		assert.strictEqual(document.cells.length, 1);
		assert.strictEqual(document.cells[0].outputs.length, 1);

		// consuming is OLD api (for now)
		const [output] = document.cells[0].outputs;

		assert.strictEqual(output.outputs.length, 2);
		assert.strictEqual(output.outputs[0].mime, 'application/foo');
		assert.strictEqual(output.outputs[0].value, 'bar');
		assert.strictEqual(output.outputs[1].mime, 'application/json');
		assert.deepStrictEqual(output.outputs[1].value, { data: true });

		await saveAllFilesAndCloseAll(undefined);
	});

	test('edit API (replaceOutput)', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCellOutput(0, [new vscode.NotebookCellOutput([
				new vscode.NotebookCellOutputItem('foo', 'bar')
			])]);
		});

		const document = vscode.window.activeNotebookEditor?.document!;
		assert.strictEqual(document.isDirty, true);
		assert.strictEqual(document.cells.length, 1);
		assert.strictEqual(document.cells[0].outputs.length, 1);
		assert.strictEqual(document.cells[0].outputs[0].outputs.length, 1);
		assert.strictEqual(document.cells[0].outputs[0].outputs[0].mime, 'foo');
		assert.strictEqual(document.cells[0].outputs[0].outputs[0].value, 'bar');

		await saveAllFilesAndCloseAll(undefined);
	});

	test('edit API (replaceOutput, event)', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const outputChangeEvent = asPromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCellOutput(0, [new vscode.NotebookCellOutput([
				new vscode.NotebookCellOutputItem('foo', 'bar')
			])]);
		});

		const value = await outputChangeEvent;
		assert.strictEqual(value.document === vscode.window.activeNotebookEditor?.document, true);
		assert.strictEqual(value.document.isDirty, true);
		assert.strictEqual(value.cells.length, 1);
		assert.strictEqual(value.document.cells.length, 1);
		assert.strictEqual(value.document.cells[0].outputs.length, 1);
		assert.strictEqual(value.document.cells[0].outputs[0].outputs.length, 1);
		assert.strictEqual(value.document.cells[0].outputs[0].outputs[0].mime, 'foo');
		assert.strictEqual(value.document.cells[0].outputs[0].outputs[0].value, 'bar');

		await saveAllFilesAndCloseAll(undefined);
	});

	test('edit API (replaceMetadata)', async function () {

		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCellMetadata(0, { inputCollapsed: true, executionOrder: 17 });
		});

		const document = vscode.window.activeNotebookEditor?.document!;
		assert.strictEqual(document.cells.length, 1);
		assert.strictEqual(document.cells[0].metadata.executionOrder, 17);
		assert.strictEqual(document.cells[0].metadata.inputCollapsed, true);

		assert.strictEqual(document.isDirty, true);
		await saveFileAndCloseAll(resource);
	});

	test('edit API (replaceMetadata, event)', async function () {

		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const event = asPromise<vscode.NotebookCellMetadataChangeEvent>(vscode.notebook.onDidChangeCellMetadata);

		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCellMetadata(0, { inputCollapsed: true, executionOrder: 17 });
		});

		const data = await event;
		assert.strictEqual(data.document, vscode.window.activeNotebookEditor?.document);
		assert.strictEqual(data.cell.metadata.executionOrder, 17);
		assert.strictEqual(data.cell.metadata.inputCollapsed, true);

		assert.strictEqual(data.document.isDirty, true);
		await saveFileAndCloseAll(resource);
	});

	test('edit API batch edits', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		const cellMetadataChangeEvent = asPromise<vscode.NotebookCellMetadataChangeEvent>(vscode.notebook.onDidChangeCellMetadata);
		const version = vscode.window.activeNotebookEditor!.document.version;
		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCells(1, 0, [{ cellKind: vscode.NotebookCellKind.Code, language: 'javascript', source: 'test 2', outputs: [], metadata: undefined }]);
			editBuilder.replaceCellMetadata(0, { runnable: false });
		});

		await cellsChangeEvent;
		await cellMetadataChangeEvent;
		assert.strictEqual(version + 1, vscode.window.activeNotebookEditor!.document.version);
		await saveAllFilesAndCloseAll(resource);
	});

	test('edit API batch edits undo/redo', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		const cellMetadataChangeEvent = asPromise<vscode.NotebookCellMetadataChangeEvent>(vscode.notebook.onDidChangeCellMetadata);
		const version = vscode.window.activeNotebookEditor!.document.version;
		await vscode.window.activeNotebookEditor!.edit(editBuilder => {
			editBuilder.replaceCells(1, 0, [{ cellKind: vscode.NotebookCellKind.Code, language: 'javascript', source: 'test 2', outputs: [], metadata: undefined }]);
			editBuilder.replaceCellMetadata(0, { runnable: false });
		});

		await cellsChangeEvent;
		await cellMetadataChangeEvent;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 2);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[0]?.metadata?.runnable, false);
		assert.strictEqual(version + 1, vscode.window.activeNotebookEditor!.document.version);

		await vscode.commands.executeCommand('undo');
		assert.strictEqual(version + 2, vscode.window.activeNotebookEditor!.document.version);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[0]?.metadata?.runnable, undefined);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 1);

		await saveAllFilesAndCloseAll(resource);
	});

	test('initialzation should not emit cell change events.', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');

		let count = 0;
		const disposables: vscode.Disposable[] = [];
		disposables.push(vscode.notebook.onDidChangeNotebookCells(() => {
			count++;
		}));

		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(count, 0);

		disposables.forEach(d => d.dispose());

		await saveFileAndCloseAll(resource);
	});
	// });

	// suite('notebook workflow', () => {

	test('notebook open', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), 'test');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.notEqual(vscode.window.activeNotebookEditor!.selection, undefined);
		assert.strictEqual(activeCell!.document.getText(), '');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 3);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('notebook cell actions', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), 'test');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		// ---- insert cell below and focus ---- //
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

		// ---- insert cell above and focus ---- //
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		let activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.notEqual(vscode.window.activeNotebookEditor!.selection, undefined);
		assert.strictEqual(activeCell!.document.getText(), '');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 3);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);

		// ---- focus bottom ---- //
		await vscode.commands.executeCommand('notebook.focusBottom');
		activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 2);

		// ---- focus top and then copy down ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);

		await vscode.commands.executeCommand('notebook.cell.copyDown');
		activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.strictEqual(activeCell?.document.getText(), 'test');

		await vscode.commands.executeCommand('notebook.cell.delete');
		activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.strictEqual(activeCell?.document.getText(), '');

		// ---- focus top and then copy up ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		await vscode.commands.executeCommand('notebook.cell.copyUp');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 4);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[0].document.getText(), 'test');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[1].document.getText(), 'test');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[2].document.getText(), '');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[3].document.getText(), '');
		activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);


		// ---- move up and down ---- //

		await vscode.commands.executeCommand('notebook.cell.moveDown');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(vscode.window.activeNotebookEditor!.selection!), 1,
			`first move down, active cell ${vscode.window.activeNotebookEditor!.selection!.uri.toString()}, ${vscode.window.activeNotebookEditor!.selection!.document.getText()}`);

		// await vscode.commands.executeCommand('notebook.cell.moveDown');
		// activeCell = vscode.window.activeNotebookEditor!.selection;

		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 2,
		// 	`second move down, active cell ${vscode.window.activeNotebookEditor!.selection!.uri.toString()}, ${vscode.window.activeNotebookEditor!.selection!.document.getText()}`);
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[0].document.getText(), 'test');
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[1].document.getText(), '');
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[2].document.getText(), 'test');
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells[3].document.getText(), '');

		// ---- ---- //

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('notebook join cells', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), 'test');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(vscode.window.activeNotebookEditor!.selection!.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.joinAbove');
		await cellsChangeEvent;

		assert.deepStrictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText().split(/\r\n|\r|\n/), ['test', 'var abc = 0;']);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('move cells will not recreate cells in ExtHost', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('notebook.focusTop');

		const activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);
		await vscode.commands.executeCommand('notebook.cell.moveDown');
		await vscode.commands.executeCommand('notebook.cell.moveDown');

		const newActiveCell = vscode.window.activeNotebookEditor!.selection;
		assert.deepStrictEqual(activeCell, newActiveCell);

		await saveFileAndCloseAll(resource);
		// TODO@rebornix, there are still some events order issue.
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(newActiveCell!), 2);
	});

	// test.only('document metadata is respected', async function () {
	// 	const resource = await createRandomFile('', undefined, '.vsctestnb');
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

	// 	assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
	// 	const editor = vscode.window.activeNotebookEditor!;

	// 	assert.strictEqual(editor.document.cells.length, 1);
	// 	editor.document.metadata.editable = false;
	// 	await editor.edit(builder => builder.delete(0));
	// 	assert.strictEqual(editor.document.cells.length, 1, 'should not delete cell'); // Not editable, no effect
	// 	await editor.edit(builder => builder.insert(0, 'test', 'python', vscode.CellKind.Code, [], undefined));
	// 	assert.strictEqual(editor.document.cells.length, 1, 'should not insert cell'); // Not editable, no effect

	// 	editor.document.metadata.editable = true;
	// 	await editor.edit(builder => builder.delete(0));
	// 	assert.strictEqual(editor.document.cells.length, 0, 'should delete cell'); // Editable, it worked
	// 	await editor.edit(builder => builder.insert(0, 'test', 'python', vscode.CellKind.Code, [], undefined));
	// 	assert.strictEqual(editor.document.cells.length, 1, 'should insert cell'); // Editable, it worked

	// 	// await vscode.commands.executeCommand('workbench.action.files.save');
	// 	await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	// });

	test('cell runnable metadata is respected', async () => {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;

		await vscode.commands.executeCommand('notebook.focusTop');
		const cell = editor.document.cells[0];
		assert.strictEqual(cell.outputs.length, 0);

		let metadataChangeEvent = asPromise<vscode.NotebookCellMetadataChangeEvent>(vscode.notebook.onDidChangeCellMetadata);
		await updateCellMetadata(resource, cell, { ...cell.metadata, runnable: false });
		await metadataChangeEvent;

		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(cell.outputs.length, 0, 'should not execute'); // not runnable, didn't work

		metadataChangeEvent = asPromise<vscode.NotebookCellMetadataChangeEvent>(vscode.notebook.onDidChangeCellMetadata);
		await updateCellMetadata(resource, cell, { ...cell.metadata, runnable: true });
		await metadataChangeEvent;

		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('document runnable metadata is respected', async () => {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;

		const cell = editor.document.cells[0];
		assert.strictEqual(cell.outputs.length, 0);

		await withEvent(vscode.notebook.onDidChangeNotebookDocumentMetadata, async event => {
			updateNotebookMetadata(editor.document.uri, { ...editor.document.metadata, runnable: false });
			await event;
		});

		await vscode.commands.executeCommand('notebook.execute');
		assert.strictEqual(cell.outputs.length, 0, 'should not execute'); // not runnable, didn't work

		await withEvent(vscode.notebook.onDidChangeNotebookDocumentMetadata, async event => {
			updateNotebookMetadata(editor.document.uri, { ...editor.document.metadata, runnable: true });
			await event;
		});

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		});

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});


	// TODO@rebornix this is wrong, `await vscode.commands.executeCommand('notebook.execute');` doesn't wait until the workspace edit is applied
	test.skip('cell execute command takes arguments', async () => {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cells[0];

		await vscode.commands.executeCommand('notebook.execute');
		assert.strictEqual(cell.outputs.length, 0, 'should not execute'); // not runnable, didn't work

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('cell execute command takes arguments 2', async () => {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cells[0];

		await withEvent(vscode.notebook.onDidChangeNotebookDocumentMetadata, async event => {
			updateNotebookMetadata(editor.document.uri, { ...editor.document.metadata, runnable: true });
			await event;
		});

		await withEvent(vscode.notebook.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		});

		await withEvent(vscode.notebook.onDidChangeCellOutputs, async event => {
			await vscode.commands.executeCommand('notebook.cell.clearOutputs');
			await event;
			assert.strictEqual(cell.outputs.length, 0, 'should clear');
		});

		const secondResource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.cell.execute', { start: 0, end: 1 }, resource);
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(vscode.window.activeNotebookEditor?.document.uri.fsPath, secondResource.fsPath);
		});

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('document execute command takes arguments', async () => {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cells[0];

		const metadataChangeEvent = asPromise<vscode.NotebookDocumentMetadataChangeEvent>(vscode.notebook.onDidChangeNotebookDocumentMetadata);
		updateNotebookMetadata(editor.document.uri, { ...editor.document.metadata, runnable: true });
		await metadataChangeEvent;
		assert.strictEqual(editor.document.metadata.runnable, true);

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		});

		const clearChangeEvent = asPromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.clearOutputs');
		await clearChangeEvent;
		assert.strictEqual(cell.outputs.length, 0, 'should clear');

		const secondResource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute', resource);
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(vscode.window.activeNotebookEditor?.document.uri.fsPath, secondResource.fsPath);
		});

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('cell execute and select kernel', async () => {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cells[0];

		const metadataChangeEvent = asPromise<vscode.NotebookDocumentMetadataChangeEvent>(vscode.notebook.onDidChangeNotebookDocumentMetadata);
		updateNotebookMetadata(editor.document.uri, { ...editor.document.metadata, runnable: true });
		await metadataChangeEvent;

		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		assert.strictEqual(cell.outputs[0].outputs.length, 1);
		assert.strictEqual(cell.outputs[0].outputs[0].mime, 'text/plain');
		assert.deepStrictEqual(cell.outputs[0].outputs[0].value, [
			'my output'
		]);

		await vscode.commands.executeCommand('notebook.selectKernel', { extension: 'vscode.vscode-api-tests', id: 'secondaryKernel' });
		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		assert.strictEqual(cell.outputs[0].outputs.length, 1);
		assert.strictEqual(cell.outputs[0].outputs[0].mime, 'text/plain');
		assert.deepStrictEqual(cell.outputs[0].outputs[0].value, [
			'my second output'
		]);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});
	// });

	// suite('notebook dirty state', () => {
	test('notebook open', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), 'test');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.notStrictEqual(vscode.window.activeNotebookEditor!.selection, undefined);
		assert.strictEqual(activeCell!.document.getText(), '');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 3);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);

		await withEvent(vscode.workspace.onDidChangeTextDocument, async event => {
			const edit = new vscode.WorkspaceEdit();
			edit.insert(activeCell!.uri, new vscode.Position(0, 0), 'var abc = 0;');
			await vscode.workspace.applyEdit(edit);
			await event;
			assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
			assert.strictEqual(vscode.window.activeNotebookEditor?.selection !== undefined, true);
			assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells[1], vscode.window.activeNotebookEditor?.selection);
			assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), 'var abc = 0;');
		});

		await saveFileAndCloseAll(resource);
	});
	// });

	// suite('notebook undo redo', () => {
	test('notebook open', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), 'test');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.notStrictEqual(vscode.window.activeNotebookEditor!.selection, undefined);
		assert.strictEqual(activeCell!.document.getText(), '');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 3);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);


		// modify the second cell, delete it
		const edit = new vscode.WorkspaceEdit();
		edit.insert(vscode.window.activeNotebookEditor!.selection!.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);
		await vscode.commands.executeCommand('notebook.cell.delete');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 2);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(vscode.window.activeNotebookEditor!.selection!), 1);


		// undo should bring back the deleted cell, and revert to previous content and selection
		await vscode.commands.executeCommand('undo');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 3);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(vscode.window.activeNotebookEditor!.selection!), 1);
		assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), 'var abc = 0;');

		// redo
		// await vscode.commands.executeCommand('notebook.redo');
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 2);
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(vscode.window.activeNotebookEditor!.selection!), 1);
		// assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), 'test');

		await saveFileAndCloseAll(resource);
	});

	// test.skip('execute and then undo redo', async function () {
	// 	assertInitalState();
	// 	const resource = await createRandomFile('', undefined, '.vsctestnb');
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

	// 	const cellsChangeEvent = getEventOncePromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
	// 	await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
	// 	const cellChangeEventRet = await cellsChangeEvent;
	// 	assert.strictEqual(cellChangeEventRet.document, vscode.window.activeNotebookEditor?.document);
	// 	assert.strictEqual(cellChangeEventRet.changes.length, 1);
	// 	assert.deepStrictEqual(cellChangeEventRet.changes[0], {
	// 		start: 1,
	// 		deletedCount: 0,
	// 		deletedItems: [],
	// 		items: [
	// 			vscode.window.activeNotebookEditor!.document.cells[1]
	// 		]
	// 	});

	// 	const secondCell = vscode.window.activeNotebookEditor!.document.cells[1];

	// 	const moveCellEvent = getEventOncePromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
	// 	await vscode.commands.executeCommand('notebook.cell.moveUp');
	// 	const moveCellEventRet = await moveCellEvent;
	// 	assert.deepStrictEqual(moveCellEventRet, {
	// 		document: vscode.window.activeNotebookEditor!.document,
	// 		changes: [
	// 			{
	// 				start: 1,
	// 				deletedCount: 1,
	// 				deletedItems: [secondCell],
	// 				items: []
	// 			},
	// 			{
	// 				start: 0,
	// 				deletedCount: 0,
	// 				deletedItems: [],
	// 				items: [vscode.window.activeNotebookEditor?.document.cells[0]]
	// 			}
	// 		]
	// 	});

	// 	const cellOutputChange = getEventOncePromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
	// 	await vscode.commands.executeCommand('notebook.cell.execute');
	// 	const cellOutputsAddedRet = await cellOutputChange;
	// 	assert.deepStrictEqual(cellOutputsAddedRet, {
	// 		document: vscode.window.activeNotebookEditor!.document,
	// 		cells: [vscode.window.activeNotebookEditor!.document.cells[0]]
	// 	});
	// 	assert.strictEqual(cellOutputsAddedRet.cells[0].outputs.length, 1);

	// 	const cellOutputClear = getEventOncePromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
	// 	await vscode.commands.executeCommand('undo');
	// 	const cellOutputsCleardRet = await cellOutputClear;
	// 	assert.deepStrictEqual(cellOutputsCleardRet, {
	// 		document: vscode.window.activeNotebookEditor!.document,
	// 		cells: [vscode.window.activeNotebookEditor!.document.cells[0]]
	// 	});
	// 	assert.strictEqual(cellOutputsAddedRet.cells[0].outputs.length, 0);

	// 	await saveFileAndCloseAll(resource);
	// });

	// });

	// suite('notebook working copy', () => {
	// test('notebook revert on close', async function () {
	// 	const resource = await createRandomFile('', undefined, '.vsctestnb');
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 	await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
	// 	assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

	// 	await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
	// 	await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

	// 	// close active editor from command will revert the file
	// 	await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 	assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
	// 	assert.strictEqual(vscode.window.activeNotebookEditor?.selection !== undefined, true);
	// 	assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells[0], vscode.window.activeNotebookEditor?.selection);
	// 	assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), 'test');

	// 	await vscode.commands.executeCommand('workbench.action.files.save');
	// 	await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	// });

	// test('notebook revert', async function () {
	// 	const resource = await createRandomFile('', undefined, '.vsctestnb');
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 	await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
	// 	assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

	// 	await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
	// 	await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });
	// 	await vscode.commands.executeCommand('workbench.action.files.revert');

	// 	assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
	// 	assert.strictEqual(vscode.window.activeNotebookEditor?.selection !== undefined, true);
	// 	assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells[0], vscode.window.activeNotebookEditor?.selection);
	// 	assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells.length, 1);
	// 	assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), 'test');

	// 	await vscode.commands.executeCommand('workbench.action.files.saveAll');
	// 	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	// });

	test('multiple tabs: dirty + clean', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(vscode.window.activeNotebookEditor!.selection!.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		const secondResource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

		// make sure that the previous dirty editor is still restored in the extension host and no data loss
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
		assert.strictEqual(vscode.window.activeNotebookEditor?.selection !== undefined, true);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells[1], vscode.window.activeNotebookEditor?.selection);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells.length, 3);
		assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), 'var abc = 0;');

		await saveFileAndCloseAll(resource);
	});

	test('multiple tabs: two dirty tabs and switching', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(vscode.window.activeNotebookEditor!.selection!.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		const secondResource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');

		// switch to the first editor
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
		assert.strictEqual(vscode.window.activeNotebookEditor?.selection !== undefined, true);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells[1], vscode.window.activeNotebookEditor?.selection);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells.length, 3);
		assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), 'var abc = 0;');

		// switch to the second editor
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
		assert.strictEqual(vscode.window.activeNotebookEditor?.selection !== undefined, true);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells[1], vscode.window.activeNotebookEditor?.selection);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cells.length, 2);
		assert.strictEqual(vscode.window.activeNotebookEditor?.selection?.document.getText(), '');

		await saveAllFilesAndCloseAll(secondResource);
		// await vscode.commands.executeCommand('workbench.action.files.saveAll');
		// await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('multiple tabs: different editors with same document', async function () {
		assertInitalState();

		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		const firstNotebookEditor = vscode.window.activeNotebookEditor;
		assert.strictEqual(firstNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(firstNotebookEditor!.selection?.document.getText(), 'test');
		assert.strictEqual(firstNotebookEditor!.selection?.language, 'typescript');

		await splitEditor();
		const secondNotebookEditor = vscode.window.activeNotebookEditor;
		assert.strictEqual(secondNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(secondNotebookEditor!.selection?.document.getText(), 'test');
		assert.strictEqual(secondNotebookEditor!.selection?.language, 'typescript');

		assert.notEqual(firstNotebookEditor, secondNotebookEditor);
		assert.strictEqual(firstNotebookEditor?.document, secondNotebookEditor?.document, 'split notebook editors share the same document');
		// assert.notEqual(firstNotebookEditor?.asWebviewUri(vscode.Uri.file('./hello.png')), secondNotebookEditor?.asWebviewUri(vscode.Uri.file('./hello.png')));

		await saveAllFilesAndCloseAll(resource);

		// await vscode.commands.executeCommand('workbench.action.files.saveAll');
		// await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});
	// });

	// suite('metadata', () => {
	test('custom metadata should be supported', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.metadata.custom!['testMetadata'] as boolean, false);
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.metadata.custom!['testCellMetadata'] as number, 123);
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		await saveFileAndCloseAll(resource);
	});


	// TODO@rebornix skip as it crashes the process all the time
	test.skip('custom metadata should be supported 2', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.metadata.custom!['testMetadata'] as boolean, false);
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.metadata.custom!['testCellMetadata'] as number, 123);
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		// TODO see #101462
		// await vscode.commands.executeCommand('notebook.cell.copyDown');
		// const activeCell = vscode.window.activeNotebookEditor!.selection;
		// assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		// assert.strictEqual(activeCell?.metadata.custom!['testCellMetadata'] as number, 123);

		await saveFileAndCloseAll(resource);
	});
	// });

	// suite('regression', () => {
	// test('microsoft/vscode-github-issue-notebooks#26. Insert template cell in the new empty document', async function () {
	// 	assertInitalState();
	// 	await vscode.commands.executeCommand('workbench.action.files.newUntitledFile', { "viewType": "notebookCoreTest" });
	// 	assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
	// 	assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), '');
	// 	assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');
	// 	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	// });

	test('#106657. Opening a notebook from markers view is broken ', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const document = vscode.window.activeNotebookEditor?.document!;
		const [cell] = document.cells;

		await saveAllFilesAndCloseAll(document.uri);
		assert.strictEqual(vscode.window.activeNotebookEditor, undefined);

		// opening a cell-uri opens a notebook editor
		await vscode.commands.executeCommand('vscode.open', cell.uri, vscode.ViewColumn.Active);

		assert.strictEqual(!!vscode.window.activeNotebookEditor, true);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.uri.toString(), resource.toString());
	});

	test.skip('Cannot open notebook from cell-uri with vscode.open-command', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const document = vscode.window.activeNotebookEditor?.document!;
		const [cell] = document.cells;

		await saveAllFilesAndCloseAll(document.uri);
		assert.strictEqual(vscode.window.activeNotebookEditor, undefined);

		// BUG is that the editor opener (https://github.com/microsoft/vscode/blob/8e7877bdc442f1e83a7fec51920d82b696139129/src/vs/editor/browser/services/openerService.ts#L69)
		// removes the fragment if it matches something numeric. For notebooks that's not wanted...
		await vscode.commands.executeCommand('vscode.open', cell.uri);

		assert.strictEqual(vscode.window.activeNotebookEditor!.document.uri.toString(), resource.toString());
	});

	test('#97830, #97764. Support switch to other editor types', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(vscode.window.activeNotebookEditor!.selection!.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.document.getText(), 'var abc = 0;');

		// no kernel -> no default language
		assert.strictEqual(vscode.window.activeNotebookEditor!.kernel, undefined);
		assert.strictEqual(vscode.window.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('vscode.openWith', resource, 'default');
		assert.strictEqual(vscode.window.activeTextEditor?.document.uri.path, resource.path);

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	// open text editor, pin, and then open a notebook
	test('#96105 - dirty editors', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'default');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(resource, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		// now it's dirty, open the resource with notebook editor should open a new one
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.notEqual(vscode.window.activeNotebookEditor, undefined, 'notebook first');
		// assert.notEqual(vscode.window.activeTextEditor, undefined);

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('#102411 - untitled notebook creation failed', async function () {
		assertInitalState();
		await vscode.commands.executeCommand('workbench.action.files.newUntitledFile', { viewType: 'notebookCoreTest' });
		assert.notEqual(vscode.window.activeNotebookEditor, undefined, 'untitled notebook editor is not undefined');

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('#102423 - copy/paste shares the same text buffer', async function () {
		assertInitalState();
		const resource = await createRandomFile('', undefined, '.vsctestnb');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		let activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(activeCell?.document.getText(), 'test');

		await vscode.commands.executeCommand('notebook.cell.copyDown');
		await vscode.commands.executeCommand('notebook.cell.edit');
		activeCell = vscode.window.activeNotebookEditor!.selection;
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.strictEqual(activeCell?.document.getText(), 'test');

		const edit = new vscode.WorkspaceEdit();
		edit.insert(vscode.window.activeNotebookEditor!.selection!.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		assert.strictEqual(vscode.window.activeNotebookEditor!.document.cells.length, 2);
		assert.notEqual(vscode.window.activeNotebookEditor!.document.cells[0].document.getText(), vscode.window.activeNotebookEditor!.document.cells[1].document.getText());

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});
	// });

	// suite('webview', () => {
	// for web, `asWebUri` gets `https`?
	// test('asWebviewUri', async function () {
	// 	if (vscode.env.uiKind === vscode.UIKind.Web) {
	// 		return;
	// 	}

	// 	const resource = await createRandomFile('', undefined, '.vsctestnb');
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 	assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
	// 	const uri = vscode.window.activeNotebookEditor!.asWebviewUri(vscode.Uri.file('./hello.png'));
	// 	assert.strictEqual(uri.scheme, 'vscode-webview-resource');
	// 	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	// });


	// 404 on web
	// test('custom renderer message', async function () {
	// 	if (vscode.env.uiKind === vscode.UIKind.Web) {
	// 		return;
	// 	}

	// 	const resource = vscode.Uri.file(join(vscode.workspace.rootPath || '', './customRenderer.vsctestnb'));
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

	// 	const editor = vscode.window.activeNotebookEditor;
	// 	const promise = new Promise(resolve => {
	// 		const messageEmitter = editor?.onDidReceiveMessage(e => {
	// 			if (e.type === 'custom_renderer_initialize') {
	// 				resolve();
	// 				messageEmitter?.dispose();
	// 			}
	// 		});
	// 	});

	// 	await vscode.commands.executeCommand('notebook.cell.execute');
	// 	await promise;
	// 	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	// });
});
