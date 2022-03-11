/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { asPromise, assertNoRpc, closeAllEditors, createRandomFile, disposeAll, revertAllDirty, saveAllEditors } from '../utils';

async function createRandomNotebookFile() {
	return createRandomFile('', undefined, '.vsctestnb');
}

async function openRandomNotebookDocument() {
	const uri = await createRandomNotebookFile();
	return vscode.workspace.openNotebookDocument(uri);
}

async function saveAllFilesAndCloseAll() {
	await saveAllEditors();
	await closeAllEditors();
}

async function withEvent<T>(event: vscode.Event<T>, callback: (e: Promise<T>) => Promise<void>) {
	const e = asPromise<T>(event);
	await callback(e);
}


class Kernel {

	readonly controller: vscode.NotebookController;

	readonly associatedNotebooks = new Set<string>();

	constructor(id: string, label: string) {
		this.controller = vscode.notebooks.createNotebookController(id, 'notebookCoreTest', label);
		this.controller.executeHandler = this._execute.bind(this);
		this.controller.supportsExecutionOrder = true;
		this.controller.supportedLanguages = ['typescript', 'javascript'];
		this.controller.onDidChangeSelectedNotebooks(e => {
			if (e.selected) {
				this.associatedNotebooks.add(e.notebook.uri.toString());
			} else {
				this.associatedNotebooks.delete(e.notebook.uri.toString());
			}
		});
	}

	protected async _execute(cells: vscode.NotebookCell[]): Promise<void> {
		for (const cell of cells) {
			await this._runCell(cell);
		}
	}

	protected async _runCell(cell: vscode.NotebookCell) {
		// create a single output with exec order 1 and output is plain/text
		// of either the cell itself or (iff empty) the cell's document's uri
		const task = this.controller.createNotebookCellExecution(cell);
		task.start();
		task.executionOrder = 1;
		await task.replaceOutput([new vscode.NotebookCellOutput([
			vscode.NotebookCellOutputItem.text(cell.document.getText() || cell.document.uri.toString(), 'text/plain')
		])]);
		task.end(true);
	}
}


function getFocusedCell(editor?: vscode.NotebookEditor) {
	return editor ? editor.document.cellAt(editor.selections[0].start) : undefined;
}

async function assertKernel(kernel: Kernel, notebook: vscode.NotebookDocument): Promise<void> {
	const success = await vscode.commands.executeCommand('notebook.selectKernel', {
		extension: 'vscode.vscode-api-tests',
		id: kernel.controller.id
	});
	assert.ok(success, `expected selected kernel to be ${kernel.controller.id}`);
	assert.ok(kernel.associatedNotebooks.has(notebook.uri.toString()));
}

const apiTestContentProvider: vscode.NotebookContentProvider = {
	openNotebook: async (resource: vscode.Uri): Promise<vscode.NotebookData> => {
		if (/.*empty\-.*\.vsctestnb$/.test(resource.path)) {
			return {
				metadata: {},
				cells: []
			};
		}

		const dto: vscode.NotebookData = {
			metadata: { custom: { testMetadata: false } },
			cells: [
				{
					value: 'test',
					languageId: 'typescript',
					kind: vscode.NotebookCellKind.Code,
					outputs: [],
					metadata: { custom: { testCellMetadata: 123 } },
					executionSummary: { timing: { startTime: 10, endTime: 20 } }
				},
				{
					value: 'test2',
					languageId: 'typescript',
					kind: vscode.NotebookCellKind.Code,
					outputs: [
						new vscode.NotebookCellOutput([
							vscode.NotebookCellOutputItem.text('Hello World', 'text/plain')
						],
							{
								testOutputMetadata: true,
								['text/plain']: { testOutputItemMetadata: true }
							})
					],
					executionSummary: { executionOrder: 5, success: true },
					metadata: { custom: { testCellMetadata: 456 } }
				}
			]
		};
		return dto;
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
};

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('Notebook API tests', function () {

	const testDisposables: vscode.Disposable[] = [];
	const suiteDisposables: vscode.Disposable[] = [];

	suiteTeardown(async function () {

		assertNoRpc();

		await revertAllDirty();
		await closeAllEditors();

		disposeAll(suiteDisposables);
		suiteDisposables.length = 0;
	});

	suiteSetup(function () {
		suiteDisposables.push(vscode.workspace.registerNotebookContentProvider('notebookCoreTest', apiTestContentProvider));
	});

	let defaultKernel: Kernel;

	setup(async function () {
		// there should be ONE default kernel in this suite
		defaultKernel = new Kernel('mainKernel', 'Notebook Default Kernel');
		testDisposables.push(defaultKernel.controller);
		await saveAllFilesAndCloseAll();
	});

	teardown(async function () {
		disposeAll(testDisposables);
		testDisposables.length = 0;
		await saveAllFilesAndCloseAll();
	});

	test.skip('correct cell selection on undo/redo of cell creation', async function () {
		const notebook = await openRandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('undo');
		const selectionUndo = [...vscode.window.activeNotebookEditor!.selections];
		await vscode.commands.executeCommand('redo');
		const selectionRedo = vscode.window.activeNotebookEditor!.selections;

		// On undo, the selected cell must be the upper cell, ie the first one
		assert.strictEqual(selectionUndo.length, 1);
		assert.strictEqual(selectionUndo[0].start, 0);
		assert.strictEqual(selectionUndo[0].end, 1);
		// On redo, the selected cell must be the new cell, ie the second one
		assert.strictEqual(selectionRedo.length, 1);
		assert.strictEqual(selectionRedo[0].start, 1);
		assert.strictEqual(selectionRedo[0].end, 2);
	});

	test('editor editing event', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebooks.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		const cellChangeEventRet = await cellsChangeEvent;
		assert.strictEqual(cellChangeEventRet.document, editor.document);
		assert.strictEqual(cellChangeEventRet.changes.length, 1);
		assert.deepStrictEqual(cellChangeEventRet.changes[0], {
			start: 1,
			deletedCount: 0,
			deletedItems: [],
			items: [
				editor.document.cellAt(1)
			]
		});

		const moveCellEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebooks.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.moveUp');
		await moveCellEvent;

		const cellOutputChange = asPromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.execute');
		const cellOutputsAddedRet = await cellOutputChange;
		assert.deepStrictEqual(cellOutputsAddedRet, {
			document: editor.document,
			cells: [editor.document.cellAt(0)]
		});
		assert.strictEqual(cellOutputsAddedRet.cells[0].outputs.length, 1);

		const cellOutputClear = asPromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.clearOutputs');
		const cellOutputsCleardRet = await cellOutputClear;
		assert.deepStrictEqual(cellOutputsCleardRet, {
			document: editor.document,
			cells: [editor.document.cellAt(0)]
		});
		assert.strictEqual(cellOutputsAddedRet.cells[0].outputs.length, 0);

		// const cellChangeLanguage = getEventOncePromise<vscode.NotebookCellLanguageChangeEvent>(vscode.notebooks.onDidChangeCellLanguage);
		// await vscode.commands.executeCommand('notebook.cell.changeToMarkdown');
		// const cellChangeLanguageRet = await cellChangeLanguage;
		// assert.deepStrictEqual(cellChangeLanguageRet, {
		// 	document: vscode.window.activeNotebookEditor!.document,
		// 	cells: vscode.window.activeNotebookEditor!.document.cellAt(0),
		// 	language: 'markdown'
		// });
	});

	test('edit API batch edits', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebooks.onDidChangeNotebookCells);
		const cellMetadataChangeEvent = asPromise<vscode.NotebookCellMetadataChangeEvent>(vscode.notebooks.onDidChangeCellMetadata);
		const version = editor.document.version;
		await editor.edit(editBuilder => {
			editBuilder.replaceCells(1, 0, [{ kind: vscode.NotebookCellKind.Code, languageId: 'javascript', value: 'test 2', outputs: [], metadata: undefined }]);
			editBuilder.replaceCellMetadata(0, { inputCollapsed: false });
		});

		await cellsChangeEvent;
		await cellMetadataChangeEvent;
		assert.strictEqual(version + 1, editor.document.version);
	});

	test('edit API batch edits undo/redo', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebooks.onDidChangeNotebookCells);
		const cellMetadataChangeEvent = asPromise<vscode.NotebookCellMetadataChangeEvent>(vscode.notebooks.onDidChangeCellMetadata);
		const version = editor.document.version;
		await editor.edit(editBuilder => {
			editBuilder.replaceCells(1, 0, [{ kind: vscode.NotebookCellKind.Code, languageId: 'javascript', value: 'test 2', outputs: [], metadata: undefined }]);
			editBuilder.replaceCellMetadata(0, { inputCollapsed: false });
		});

		await cellsChangeEvent;
		await cellMetadataChangeEvent;
		assert.strictEqual(editor.document.cellCount, 3);
		assert.strictEqual(editor.document.cellAt(0)?.metadata.inputCollapsed, false);
		assert.strictEqual(version + 1, editor.document.version);

		await vscode.commands.executeCommand('undo');
		assert.strictEqual(version + 2, editor.document.version);
		assert.strictEqual(editor.document.cellAt(0)?.metadata.inputCollapsed, undefined);
		assert.strictEqual(editor.document.cellCount, 2);
	});

	// #126371
	test.skip('#98841, initialzation should not emit cell change events.', async function () {
		let count = 0;

		testDisposables.push(vscode.notebooks.onDidChangeNotebookCells(() => {
			count++;
		}));

		const notebook = await openRandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		assert.strictEqual(count, 0);
	});

	test('notebook open', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);
		assert.strictEqual(vscode.window.activeNotebookEditor === editor, true, 'notebook first');
		assert.strictEqual(getFocusedCell(editor)?.document.getText(), 'test');
		assert.strictEqual(getFocusedCell(editor)?.document.languageId, 'typescript');

		const secondCell = editor.document.cellAt(1);
		assert.strictEqual(secondCell.outputs.length, 1);
		assert.deepStrictEqual(secondCell.outputs[0].metadata, { testOutputMetadata: true, ['text/plain']: { testOutputItemMetadata: true } });
		assert.strictEqual(secondCell.outputs[0].items.length, 1);
		assert.strictEqual(secondCell.outputs[0].items[0].mime, 'text/plain');
		assert.strictEqual(new TextDecoder().decode(secondCell.outputs[0].items[0].data), 'Hello World');
		assert.strictEqual(secondCell.executionSummary?.executionOrder, 5);
		assert.strictEqual(secondCell.executionSummary?.success, true);
	});

	test('notebook cell actions', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(vscode.window.activeNotebookEditor === editor, true, 'notebook first');
		assert.strictEqual(getFocusedCell(editor)?.document.getText(), 'test');
		assert.strictEqual(getFocusedCell(editor)?.document.languageId, 'typescript');

		// ---- insert cell below and focus ---- //
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(getFocusedCell(editor)?.document.getText(), '');

		// ---- insert cell above and focus ---- //
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		let activeCell = getFocusedCell(editor);
		assert.notStrictEqual(getFocusedCell(editor), undefined);
		assert.strictEqual(activeCell!.document.getText(), '');
		assert.strictEqual(editor.document.cellCount, 4);
		assert.strictEqual(editor.document.getCells().indexOf(activeCell!), 1);

		// ---- focus bottom ---- //
		await vscode.commands.executeCommand('notebook.focusBottom');
		activeCell = getFocusedCell(editor);
		assert.strictEqual(editor.document.getCells().indexOf(activeCell!), 3);

		// ---- focus top and then copy down ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		activeCell = getFocusedCell(editor);
		assert.strictEqual(editor.document.getCells().indexOf(activeCell!), 0);

		await vscode.commands.executeCommand('notebook.cell.copyDown');
		activeCell = getFocusedCell(editor);
		assert.strictEqual(editor.document.getCells().indexOf(activeCell!), 1);
		assert.strictEqual(activeCell?.document.getText(), 'test');

		{
			const focusedCell = getFocusedCell(editor);
			assert.strictEqual(focusedCell !== undefined, true);
			// delete focused cell
			const edit = new vscode.WorkspaceEdit();
			edit.replaceNotebookCells(focusedCell!.notebook.uri, new vscode.NotebookRange(focusedCell!.index, focusedCell!.index + 1), []);
			await vscode.workspace.applyEdit(edit);
		}

		activeCell = getFocusedCell(editor);
		assert.strictEqual(editor.document.getCells().indexOf(activeCell!), 1);
		assert.strictEqual(activeCell?.document.getText(), '');

		// ---- focus top and then copy up ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		await vscode.commands.executeCommand('notebook.cell.copyUp');
		assert.strictEqual(editor.document.cellCount, 5);
		assert.strictEqual(editor.document.cellAt(0).document.getText(), 'test');
		assert.strictEqual(editor.document.cellAt(1).document.getText(), 'test');
		assert.strictEqual(editor.document.cellAt(2).document.getText(), '');
		assert.strictEqual(editor.document.cellAt(3).document.getText(), '');
		activeCell = getFocusedCell(editor);
		assert.strictEqual(editor.document.getCells().indexOf(activeCell!), 0);


		// ---- move up and down ---- //

		await vscode.commands.executeCommand('notebook.cell.moveDown');
		assert.strictEqual(editor.document.getCells().indexOf(getFocusedCell(editor)!), 1,
			`first move down, active cell ${getFocusedCell(editor)!.document.uri.toString()}, ${getFocusedCell(editor)!.document.getText()}`);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('editor move command - event and move cells will not recreate cells in ExtHost (#98126)', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);

		const activeCell = getFocusedCell(editor);
		assert.strictEqual(activeCell?.index, 0);
		const moveChange = asPromise(vscode.notebooks.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.moveDown');
		assert.ok(await moveChange);

		const newActiveCell = getFocusedCell(editor);
		assert.strictEqual(newActiveCell?.index, 1);
		assert.deepStrictEqual(activeCell, newActiveCell);
	});

	// test('document runnable based on kernel count', async () => {
	// 	const resource = await createRandomNotebookFile();
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
	// 	assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
	// 	const editor = vscode.window.activeNotebookEditor!;

	// 	const cell = editor.document.cellAt(0);
	// 	assert.strictEqual(cell.outputs.length, 0);

	// 	currentKernelProvider.setHasKernels(false);
	// 	await vscode.commands.executeCommand('notebook.execute');
	// 	assert.strictEqual(cell.outputs.length, 0, 'should not execute'); // not runnable, didn't work

	// 	currentKernelProvider.setHasKernels(true);

	// 	await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs, async (event) => {
	// 		await vscode.commands.executeCommand('notebook.execute');
	// 		await event;
	// 		assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
	// 	});

	// 	await saveAllFilesAndCloseAll(undefined);
	// });


	// TODO@rebornix this is wrong, `await vscode.commands.executeCommand('notebook.execute');` doesn't wait until the workspace edit is applied
	test.skip('cell execute command takes arguments', async () => {
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cellAt(0);

		await vscode.commands.executeCommand('notebook.execute');
		assert.strictEqual(cell.outputs.length, 0, 'should not execute'); // not runnable, didn't work
	});

	test('cell execute command takes arguments 2', async () => {
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cellAt(0);

		await withEvent(vscode.notebooks.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		});

		await withEvent(vscode.notebooks.onDidChangeCellOutputs, async event => {
			await vscode.commands.executeCommand('notebook.cell.clearOutputs');
			await event;
			assert.strictEqual(cell.outputs.length, 0, 'should clear');
		});

		const secondResource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.cell.execute', { start: 0, end: 1 }, resource);
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(vscode.window.activeNotebookEditor?.document.uri.fsPath, secondResource.fsPath);
		});
	});

	// #126371
	test.skip('cell execute command takes arguments ICellRange[]', async () => {
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		vscode.commands.executeCommand('notebook.cell.execute', { ranges: [{ start: 0, end: 1 }, { start: 1, end: 2 }] });
		let firstCellExecuted = false;
		let secondCellExecuted = false;
		let resolve: () => void;
		const p = new Promise<void>(r => resolve = r);
		const listener = vscode.notebooks.onDidChangeCellOutputs(e => {
			e.cells.forEach(cell => {
				if (cell.index === 0) {
					firstCellExecuted = true;
				}

				if (cell.index === 1) {
					secondCellExecuted = true;
				}
			});

			if (firstCellExecuted && secondCellExecuted) {
				resolve();
			}
		});

		await p;
		listener.dispose();
		await saveAllFilesAndCloseAll();
	});

	test('document execute command takes arguments', async () => {
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cellAt(0);

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		});

		const clearChangeEvent = asPromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.clearOutputs');
		await clearChangeEvent;
		assert.strictEqual(cell.outputs.length, 0, 'should clear');

		const secondResource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute', resource);
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(vscode.window.activeNotebookEditor?.document.uri.fsPath, secondResource.fsPath);
		});
	});

	test('cell execute and select kernel', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);
		assert.strictEqual(vscode.window.activeNotebookEditor === editor, true, 'notebook first');

		const cell = editor.document.cellAt(0);

		const alternativeKernel = new class extends Kernel {
			constructor() {
				super('secondaryKernel', 'Notebook Secondary Test Kernel');
				this.controller.supportsExecutionOrder = false;
			}

			override async _runCell(cell: vscode.NotebookCell) {
				const task = this.controller.createNotebookCellExecution(cell);
				task.start();
				await task.replaceOutput([new vscode.NotebookCellOutput([
					vscode.NotebookCellOutputItem.text('my second output', 'text/plain')
				])]);
				task.end(true);
			}
		};
		testDisposables.push(alternativeKernel.controller);

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs, async (event) => {
			await assertKernel(defaultKernel, notebook);
			await vscode.commands.executeCommand('notebook.cell.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(cell.outputs[0].items.length, 1);
			assert.strictEqual(cell.outputs[0].items[0].mime, 'text/plain');
			assert.deepStrictEqual(new TextDecoder().decode(cell.outputs[0].items[0].data), cell.document.getText());
		});

		await withEvent<vscode.NotebookCellOutputsChangeEvent>(vscode.notebooks.onDidChangeCellOutputs, async (event) => {
			await assertKernel(alternativeKernel, notebook);
			await vscode.commands.executeCommand('notebook.cell.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(cell.outputs[0].items.length, 1);
			assert.strictEqual(cell.outputs[0].items[0].mime, 'text/plain');
			assert.deepStrictEqual(new TextDecoder().decode(cell.outputs[0].items[0].data), 'my second output');
		});
	});

	test.skip('onDidChangeCellExecutionState is fired', async () => { // TODO@rebornix https://github.com/microsoft/vscode/issues/139350
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cellAt(0);

		vscode.commands.executeCommand('notebook.cell.execute');
		let eventCount = 0;
		let resolve: () => void;
		const p = new Promise<void>(r => resolve = r);
		const listener = vscode.notebooks.onDidChangeNotebookCellExecutionState(e => {
			if (eventCount === 0) {
				assert.strictEqual(e.state, vscode.NotebookCellExecutionState.Pending, 'should be set to Pending');
			} else if (eventCount === 1) {
				assert.strictEqual(e.state, vscode.NotebookCellExecutionState.Executing, 'should be set to Executing');
				assert.strictEqual(cell.outputs.length, 0, 'no outputs yet: ' + JSON.stringify(cell.outputs[0]));
			} else if (eventCount === 2) {
				assert.strictEqual(e.state, vscode.NotebookCellExecutionState.Idle, 'should be set to Idle');
				assert.strictEqual(cell.outputs.length, 1, 'should have an output');
				resolve();
			}

			eventCount++;
		});

		await p;
		listener.dispose();
	});

	test('notebook cell document workspace edit', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);
		assert.strictEqual(vscode.window.activeNotebookEditor === editor, true, 'notebook first');
		assert.strictEqual(getFocusedCell(editor)?.document.getText(), 'test');
		assert.strictEqual(getFocusedCell(editor)?.document.languageId, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(getFocusedCell(editor)?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const activeCell = getFocusedCell(editor);
		assert.notStrictEqual(getFocusedCell(editor), undefined);
		assert.strictEqual(activeCell!.document.getText(), '');
		assert.strictEqual(editor.document.cellCount, 4);
		assert.strictEqual(editor.document.getCells().indexOf(activeCell!), 1);

		await withEvent(vscode.workspace.onDidChangeTextDocument, async event => {
			const edit = new vscode.WorkspaceEdit();
			edit.insert(activeCell!.document.uri, new vscode.Position(0, 0), 'var abc = 0;');
			await vscode.workspace.applyEdit(edit);
			await event;
			assert.strictEqual(vscode.window.activeNotebookEditor === editor, true);
			assert.deepStrictEqual(editor.document.cellAt(1), getFocusedCell(editor));
			assert.strictEqual(getFocusedCell(editor)?.document.getText(), 'var abc = 0;');
		});
	});

	test.skip('multiple tabs: dirty + clean', async function () { // TODO@rebornix https://github.com/microsoft/vscode/issues/140285
		const notebook = await openRandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor)?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(getFocusedCell(vscode.window.activeNotebookEditor)!.document.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		const secondNotebook = await openRandomNotebookDocument();
		await vscode.window.showNotebookDocument(secondNotebook);
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

		// make sure that the previous dirty editor is still restored in the extension host and no data loss
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cellAt(1), getFocusedCell(vscode.window.activeNotebookEditor));
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cellCount, 4);
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor)?.document.getText(), 'var abc = 0;');

	});

	test.skip('multiple tabs: two dirty tabs and switching', async function () {
		const notebook = await openRandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor)?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(getFocusedCell(vscode.window.activeNotebookEditor)!.document.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		const secondNotebook = await openRandomNotebookDocument();
		await vscode.window.showNotebookDocument(secondNotebook);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor)?.document.getText(), '');

		// switch to the first editor
		await vscode.window.showNotebookDocument(notebook);
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cellAt(1), getFocusedCell(vscode.window.activeNotebookEditor));
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cellCount, 4);
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor)?.document.getText(), 'var abc = 0;');

		// switch to the second editor
		await vscode.window.showNotebookDocument(secondNotebook);
		assert.strictEqual(vscode.window.activeNotebookEditor !== undefined, true);
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cellAt(1), getFocusedCell(vscode.window.activeNotebookEditor));
		assert.deepStrictEqual(vscode.window.activeNotebookEditor?.document.cellCount, 3);
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor)?.document.getText(), '');

	});

	test('multiple tabs: different editors with same document', async function () {

		const notebook = await openRandomNotebookDocument();
		const firstNotebookEditor = await vscode.window.showNotebookDocument(notebook, { viewColumn: vscode.ViewColumn.One });
		assert.ok(firstNotebookEditor === vscode.window.activeNotebookEditor);

		assert.strictEqual(firstNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor!)?.document.getText(), 'test');
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor!)?.document.languageId, 'typescript');

		const secondNotebookEditor = await vscode.window.showNotebookDocument(notebook, { viewColumn: vscode.ViewColumn.Beside });
		assert.strictEqual(secondNotebookEditor !== undefined, true, 'notebook first');
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor!)?.document.getText(), 'test');
		assert.strictEqual(getFocusedCell(vscode.window.activeNotebookEditor!)?.document.languageId, 'typescript');

		assert.notStrictEqual(firstNotebookEditor, secondNotebookEditor);
		assert.strictEqual(firstNotebookEditor?.document, secondNotebookEditor?.document, 'split notebook editors share the same document');

	});

	test.skip('#106657. Opening a notebook from markers view is broken ', async function () {

		const document = await openRandomNotebookDocument();
		const [cell] = document.getCells();

		assert.strictEqual(vscode.window.activeNotebookEditor, undefined);

		// opening a cell-uri opens a notebook editor
		await vscode.window.showTextDocument(cell.document, { viewColumn: vscode.ViewColumn.Active });
		// await vscode.commands.executeCommand('vscode.open', cell.document.uri, vscode.ViewColumn.Active);

		assert.strictEqual(!!vscode.window.activeNotebookEditor, true);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.uri.toString(), document.uri.toString());
	});

	test('Cannot open notebook from cell-uri with vscode.open-command', async function () {

		const document = await openRandomNotebookDocument();
		const [cell] = document.getCells();

		await saveAllFilesAndCloseAll();
		assert.strictEqual(vscode.window.activeNotebookEditor, undefined);

		// BUG is that the editor opener (https://github.com/microsoft/vscode/blob/8e7877bdc442f1e83a7fec51920d82b696139129/src/vs/editor/browser/services/openerService.ts#L69)
		// removes the fragment if it matches something numeric. For notebooks that's not wanted...
		await vscode.commands.executeCommand('vscode.open', cell.document.uri);

		assert.strictEqual(vscode.window.activeNotebookEditor!.document.uri.toString(), document.uri.toString());
	});

	test('#97830, #97764. Support switch to other editor types', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(getFocusedCell(editor)!.document.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		assert.strictEqual(getFocusedCell(editor)?.document.getText(), 'var abc = 0;');

		// no kernel -> no default language
		// assert.strictEqual(vscode.window.activeNotebookEditor!.kernel, undefined);
		assert.strictEqual(getFocusedCell(editor)?.document.languageId, 'typescript');

		await vscode.commands.executeCommand('vscode.openWith', notebook.uri, 'default');
		assert.strictEqual(vscode.window.activeTextEditor?.document.uri.path, notebook.uri.path);
	});

	// open text editor, pin, and then open a notebook
	test('#96105 - dirty editors', async function () {
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'default');
		const edit = new vscode.WorkspaceEdit();
		edit.insert(resource, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		// now it's dirty, open the resource with notebook editor should open a new one
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.notStrictEqual(vscode.window.activeNotebookEditor, undefined, 'notebook first');
		// assert.notStrictEqual(vscode.window.activeTextEditor, undefined);

	});

	test('#102411 - untitled notebook creation failed', async function () {
		await vscode.commands.executeCommand('workbench.action.files.newUntitledFile', { viewType: 'notebookCoreTest' });
		assert.notStrictEqual(vscode.window.activeNotebookEditor, undefined, 'untitled notebook editor is not undefined');

		await closeAllEditors();
	});

	test('#102423 - copy/paste shares the same text buffer', async function () {
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		let activeCell = getFocusedCell(vscode.window.activeNotebookEditor);
		assert.strictEqual(activeCell?.document.getText(), 'test');

		await vscode.commands.executeCommand('notebook.cell.copyDown');
		await vscode.commands.executeCommand('notebook.cell.edit');
		activeCell = getFocusedCell(vscode.window.activeNotebookEditor);
		assert.strictEqual(vscode.window.activeNotebookEditor!.document.getCells().indexOf(activeCell!), 1);
		assert.strictEqual(activeCell?.document.getText(), 'test');

		const edit = new vscode.WorkspaceEdit();
		edit.insert(getFocusedCell(vscode.window.activeNotebookEditor)!.document.uri, new vscode.Position(0, 0), 'var abc = 0;');
		await vscode.workspace.applyEdit(edit);

		assert.strictEqual(vscode.window.activeNotebookEditor!.document.getCells().length, 3);
		assert.notStrictEqual(vscode.window.activeNotebookEditor!.document.cellAt(0).document.getText(), vscode.window.activeNotebookEditor!.document.cellAt(1).document.getText());

		await closeAllEditors();
	});

	test('#115855 onDidSaveNotebookDocument', async function () {
		const resource = await createRandomNotebookFile();
		const notebook = await vscode.workspace.openNotebookDocument(resource);
		const editor = await vscode.window.showNotebookDocument(notebook);

		const cellsChangeEvent = asPromise<vscode.NotebookCellsChangeEvent>(vscode.notebooks.onDidChangeNotebookCells);
		await editor.edit(editBuilder => {
			editBuilder.replaceCells(1, 0, [{ kind: vscode.NotebookCellKind.Code, languageId: 'javascript', value: 'test 2', outputs: [], metadata: undefined }]);
		});

		const cellChangeEventRet = await cellsChangeEvent;
		assert.strictEqual(cellChangeEventRet.document === notebook, true);
		assert.strictEqual(cellChangeEventRet.document.isDirty, true);

		const saveEvent = asPromise(vscode.notebooks.onDidSaveNotebookDocument);

		await notebook.save();

		await saveEvent;
		assert.strictEqual(notebook.isDirty, false);
	});

	test('Output changes are applied once the promise resolves', async function () {

		let called = false;

		const verifyOutputSyncKernel = new class extends Kernel {

			constructor() {
				super('verifyOutputSyncKernel', '');
			}

			override async _execute(cells: vscode.NotebookCell[]) {
				const [cell] = cells;
				const task = this.controller.createNotebookCellExecution(cell);
				task.start();
				await task.replaceOutput([new vscode.NotebookCellOutput([
					vscode.NotebookCellOutputItem.text('Some output', 'text/plain')
				])]);
				assert.strictEqual(cell.notebook.cellAt(0).outputs.length, 1);
				assert.deepStrictEqual(new TextDecoder().decode(cell.notebook.cellAt(0).outputs[0].items[0].data), 'Some output');
				task.end(undefined);
				called = true;
			}
		};

		const notebook = await openRandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await assertKernel(verifyOutputSyncKernel, notebook);
		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(called, true);
		verifyOutputSyncKernel.controller.dispose();
	});

	test('executionSummary', async () => {
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		const editor = vscode.window.activeNotebookEditor!;
		const cell = editor.document.cellAt(0);

		assert.strictEqual(cell.executionSummary?.success, undefined);
		assert.strictEqual(cell.executionSummary?.executionOrder, undefined);
		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(cell.outputs.length, 1, 'should execute');
		assert.ok(cell.executionSummary);
		assert.strictEqual(cell.executionSummary!.success, true);
		assert.strictEqual(typeof cell.executionSummary!.executionOrder, 'number');
	});

	test('initialize executionSummary', async () => {

		const document = await openRandomNotebookDocument();
		const cell = document.cellAt(0);

		assert.strictEqual(cell.executionSummary?.success, undefined);
		assert.strictEqual(cell.executionSummary?.timing?.startTime, 10);
		assert.strictEqual(cell.executionSummary?.timing?.endTime, 20);

	});

	test('execution cancelled when delete while executing', async () => {
		const document = await openRandomNotebookDocument();
		const cell = document.cellAt(0);

		let executionWasCancelled = false;
		const cancelledKernel = new class extends Kernel {
			constructor() {
				super('cancelledKernel', '');
			}

			override async _execute(cells: vscode.NotebookCell[]) {
				const [cell] = cells;
				const exe = this.controller.createNotebookCellExecution(cell);
				exe.token.onCancellationRequested(() => executionWasCancelled = true);
			}
		};
		testDisposables.push(cancelledKernel.controller);

		await vscode.window.showNotebookDocument(document);
		await assertKernel(cancelledKernel, document);
		await vscode.commands.executeCommand('notebook.cell.execute');

		// Delete executing cell
		const edit = new vscode.WorkspaceEdit();
		edit.replaceNotebookCells(cell!.notebook.uri, new vscode.NotebookRange(cell!.index, cell!.index + 1), []);
		await vscode.workspace.applyEdit(edit);

		assert.strictEqual(executionWasCancelled, true);
	});
});

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('statusbar', () => {
	const emitter = new vscode.EventEmitter<vscode.NotebookCell>();
	const onDidCallProvide = emitter.event;
	const suiteDisposables: vscode.Disposable[] = [];
	suiteTeardown(async function () {
		assertNoRpc();

		await revertAllDirty();
		await closeAllEditors();

		disposeAll(suiteDisposables);
		suiteDisposables.length = 0;
	});

	suiteSetup(() => {
		suiteDisposables.push(vscode.notebooks.registerNotebookCellStatusBarItemProvider('notebookCoreTest', {
			async provideCellStatusBarItems(cell: vscode.NotebookCell, _token: vscode.CancellationToken): Promise<vscode.NotebookCellStatusBarItem[]> {
				emitter.fire(cell);
				return [];
			}
		}));

		suiteDisposables.push(vscode.workspace.registerNotebookContentProvider('notebookCoreTest', apiTestContentProvider));
	});

	test.skip('provideCellStatusBarItems called on metadata change', async function () { // TODO@rebornix https://github.com/microsoft/vscode/issues/139324
		const provideCalled = asPromise(onDidCallProvide);
		const resource = await createRandomNotebookFile();
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await provideCalled;

		const edit = new vscode.WorkspaceEdit();
		edit.replaceNotebookCellMetadata(resource, 0, { inputCollapsed: true });
		vscode.workspace.applyEdit(edit);
		await provideCalled;
	});
});

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('Notebook API tests (metadata)', function () {
	const testDisposables: vscode.Disposable[] = [];
	const suiteDisposables: vscode.Disposable[] = [];

	suiteTeardown(async function () {
		assertNoRpc();

		await revertAllDirty();
		await closeAllEditors();

		disposeAll(suiteDisposables);
		suiteDisposables.length = 0;
	});

	suiteSetup(function () {
		suiteDisposables.push(vscode.workspace.registerNotebookContentProvider('notebookCoreTest', apiTestContentProvider));
	});

	setup(async function () {
		await saveAllFilesAndCloseAll();
	});

	teardown(async function () {
		disposeAll(testDisposables);
		testDisposables.length = 0;
		await saveAllFilesAndCloseAll();
	});

	test('custom metadata should be supported', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await vscode.window.showNotebookDocument(notebook);

		assert.strictEqual(editor.document.metadata.custom?.testMetadata, false);
		assert.strictEqual(getFocusedCell(editor)?.metadata.custom?.testCellMetadata, 123);
		assert.strictEqual(getFocusedCell(editor)?.document.languageId, 'typescript');
	});
});
