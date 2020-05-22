/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { join } from 'path';

export function once<T>(event: vscode.Event<T>): vscode.Event<T> {
	return (listener: any, thisArgs = null, disposables?: any) => {
		// we need this, in case the event fires during the listener call
		let didFire = false;
		let result: vscode.Disposable;
		result = event(e => {
			if (didFire) {
				return;
			} else if (result) {
				result.dispose();
			} else {
				didFire = true;
			}

			return listener.call(thisArgs, e);
		}, null, disposables);

		if (didFire) {
			result.dispose();
		}

		return result;
	};
}

async function getEventOncePromise<T>(event: vscode.Event<T>): Promise<T> {
	return new Promise<T>((resolve, _reject) => {
		once(event)((result: T) => resolve(result));
	});
}

suite('API tests', () => {
	test('document open/close event', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		const firstDocumentOpen = getEventOncePromise(vscode.notebook.onDidOpenNotebookDocument);
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await firstDocumentOpen;

		const firstDocumentClose = getEventOncePromise(vscode.notebook.onDidCloseNotebookDocument);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await firstDocumentClose;
	});

	test('shared document in notebook editors', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		let counter = 0;
		const disposables: vscode.Disposable[] = [];
		disposables.push(vscode.notebook.onDidOpenNotebookDocument(() => {
			counter++;
		}));
		disposables.push(vscode.notebook.onDidCloseNotebookDocument(() => {
			counter--;
		}));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(counter, 1);

		await vscode.commands.executeCommand('workbench.action.splitEditor');
		assert.equal(counter, 1);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		assert.equal(counter, 0);

		disposables.forEach(d => d.dispose());
	});

	test('editor open/close event', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		const firstEditorOpen = getEventOncePromise(vscode.notebook.onDidChangeVisibleNotebookEditors);
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await firstEditorOpen;

		const firstEditorClose = getEventOncePromise(vscode.notebook.onDidChangeVisibleNotebookEditors);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await firstEditorClose;
	});

	test('editor open/close event', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		let count = 0;
		const disposables: vscode.Disposable[] = [];
		disposables.push(vscode.notebook.onDidChangeVisibleNotebookEditors(() => {
			count = vscode.notebook.visibleNotebookEditors.length;
		}));

		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(count, 1);

		await vscode.commands.executeCommand('workbench.action.splitEditor');
		assert.equal(count, 2);

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		assert.equal(count, 0);
	});

	test('editor editing event', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const cellsChangeEvent = getEventOncePromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		const cellChangeEventRet = await cellsChangeEvent;
		assert.equal(cellChangeEventRet.document, vscode.notebook.activeNotebookEditor?.document);
		assert.equal(cellChangeEventRet.changes.length, 1);
		assert.deepEqual(cellChangeEventRet.changes[0], {
			start: 1,
			deletedCount: 0,
			items: [
				vscode.notebook.activeNotebookEditor!.document.cells[1]
			]
		});

		const moveCellEvent = getEventOncePromise<vscode.NotebookCellsChangeEvent>(vscode.notebook.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.moveUp');
		const moveCellEventRet = await moveCellEvent;
		assert.deepEqual(moveCellEventRet, {
			document: vscode.notebook.activeNotebookEditor!.document,
			changes: [
				{
					start: 1,
					deletedCount: 1,
					items: []
				},
				{
					start: 0,
					deletedCount: 0,
					items: [vscode.notebook.activeNotebookEditor?.document.cells[0]]
				}
			]
		});

		const cellOutputChange = getEventOncePromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.execute');
		const cellOutputsAddedRet = await cellOutputChange;
		assert.deepEqual(cellOutputsAddedRet, {
			document: vscode.notebook.activeNotebookEditor!.document,
			cells: [vscode.notebook.activeNotebookEditor!.document.cells[0]]
		});
		assert.equal(cellOutputsAddedRet.cells[0].outputs.length, 1);

		const cellOutputClear = getEventOncePromise<vscode.NotebookCellOutputsChangeEvent>(vscode.notebook.onDidChangeCellOutputs);
		await vscode.commands.executeCommand('notebook.cell.clearOutputs');
		const cellOutputsCleardRet = await cellOutputClear;
		assert.deepEqual(cellOutputsCleardRet, {
			document: vscode.notebook.activeNotebookEditor!.document,
			cells: [vscode.notebook.activeNotebookEditor!.document.cells[0]]
		});
		assert.equal(cellOutputsAddedRet.cells[0].outputs.length, 0);

		// const cellChangeLanguage = getEventOncePromise<vscode.NotebookCellLanguageChangeEvent>(vscode.notebook.onDidChangeCellLanguage);
		// await vscode.commands.executeCommand('notebook.cell.changeToMarkdown');
		// const cellChangeLanguageRet = await cellChangeLanguage;
		// assert.deepEqual(cellChangeLanguageRet, {
		// 	document: vscode.notebook.activeNotebookEditor!.document,
		// 	cells: vscode.notebook.activeNotebookEditor!.document.cells[0],
		// 	language: 'markdown'
		// });

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('editor move cell event', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('notebook.focusTop');

		const activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);
		const moveChange = getEventOncePromise(vscode.notebook.onDidChangeNotebookCells);
		await vscode.commands.executeCommand('notebook.cell.moveDown');
		const ret = await moveChange;
		assert.deepEqual(ret, {
			document: vscode.notebook.activeNotebookEditor?.document,
			changes: [
				{
					start: 0,
					deletedCount: 1,
					items: []
				},
				{
					start: 1,
					deletedCount: 0,
					items: [activeCell]
				}
			]
		});
	});

	test('notebook editor active/visible', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		const firstEditor = vscode.notebook.activeNotebookEditor;
		assert.equal(firstEditor?.active, true);
		assert.equal(firstEditor?.visible, true);

		await vscode.commands.executeCommand('workbench.action.splitEditor');
		const secondEditor = vscode.notebook.activeNotebookEditor;
		assert.equal(secondEditor?.active, true);
		assert.equal(secondEditor?.visible, true);
		assert.equal(firstEditor?.active, false);

		assert.equal(vscode.notebook.visibleNotebookEditors.length, 2);

		await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
		assert.equal(firstEditor?.visible, true);
		assert.equal(firstEditor?.active, false);
		assert.equal(secondEditor?.visible, false);
		assert.equal(secondEditor?.active, false);
		assert.equal(vscode.notebook.visibleNotebookEditors.length, 1);

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		assert.equal(secondEditor?.active, true);
		assert.equal(secondEditor?.visible, true);
		assert.equal(vscode.notebook.visibleNotebookEditors.length, 2);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('notebook active editor change', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		const firstEditorOpen = getEventOncePromise(vscode.notebook.onDidChangeActiveNotebookEditor);
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await firstEditorOpen;

		const firstEditorDeactivate = getEventOncePromise(vscode.notebook.onDidChangeActiveNotebookEditor);
		await vscode.commands.executeCommand('workbench.action.splitEditor');
		await firstEditorDeactivate;

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});
});

suite('notebook workflow', () => {
	test('notebook open', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.notEqual(vscode.notebook.activeNotebookEditor!.selection, undefined);
		assert.equal(activeCell!.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('notebook cell actions', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		// ---- insert cell below and focus ---- //
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		// ---- insert cell above and focus ---- //
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		let activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.notEqual(vscode.notebook.activeNotebookEditor!.selection, undefined);
		assert.equal(activeCell!.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);

		// ---- focus bottom ---- //
		await vscode.commands.executeCommand('notebook.focusBottom');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 2);

		// ---- focus top and then copy down ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);

		await vscode.commands.executeCommand('notebook.cell.copyDown');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.equal(activeCell?.source, 'test');

		await vscode.commands.executeCommand('notebook.cell.delete');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.equal(activeCell?.source, '');

		// ---- focus top and then copy up ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		await vscode.commands.executeCommand('notebook.cell.copyUp');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 4);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[0].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[1].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[2].source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[3].source, '');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);


		// ---- move up and down ---- //

		await vscode.commands.executeCommand('notebook.cell.moveDown');
		await vscode.commands.executeCommand('notebook.cell.moveDown');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;

		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 2);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[0].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[1].source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[2].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[3].source, '');

		// ---- ---- //

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('move cells will not recreate cells in ExtHost', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('notebook.focusTop');

		const activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);
		await vscode.commands.executeCommand('notebook.cell.moveDown');
		await vscode.commands.executeCommand('notebook.cell.moveDown');

		const newActiveCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.deepEqual(activeCell, newActiveCell);
		await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');

		// TODO@rebornix, there are still some events order issue.
		// assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(newActiveCell!), 2);
	});

	// test.only('document metadata is respected', async function () {
	// 	const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

	// 	assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
	// 	const editor = vscode.notebook.activeNotebookEditor!;

	// 	assert.equal(editor.document.cells.length, 1);
	// 	editor.document.metadata.editable = false;
	// 	await editor.edit(builder => builder.delete(0));
	// 	assert.equal(editor.document.cells.length, 1, 'should not delete cell'); // Not editable, no effect
	// 	await editor.edit(builder => builder.insert(0, 'test', 'python', vscode.CellKind.Code, [], undefined));
	// 	assert.equal(editor.document.cells.length, 1, 'should not insert cell'); // Not editable, no effect

	// 	editor.document.metadata.editable = true;
	// 	await editor.edit(builder => builder.delete(0));
	// 	assert.equal(editor.document.cells.length, 0, 'should delete cell'); // Editable, it worked
	// 	await editor.edit(builder => builder.insert(0, 'test', 'python', vscode.CellKind.Code, [], undefined));
	// 	assert.equal(editor.document.cells.length, 1, 'should insert cell'); // Editable, it worked

	// 	// await vscode.commands.executeCommand('workbench.action.files.save');
	// 	await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	// });

	test('cell runnable metadata is respected', async () => {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.notebook.activeNotebookEditor!;

		await vscode.commands.executeCommand('notebook.focusTop');
		const cell = editor.document.cells[0];
		assert.equal(cell.outputs.length, 0);
		cell.metadata.runnable = false;
		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.equal(cell.outputs.length, 0, 'should not execute'); // not runnable, didn't work

		cell.metadata.runnable = true;
		await vscode.commands.executeCommand('notebook.cell.execute');
		assert.equal(cell.outputs.length, 1, 'should execute'); // runnable, it worked

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('document runnable metadata is respected', async () => {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = vscode.notebook.activeNotebookEditor!;

		const cell = editor.document.cells[0];
		assert.equal(cell.outputs.length, 0);
		editor.document.metadata.runnable = false;
		await vscode.commands.executeCommand('notebook.execute');
		assert.equal(cell.outputs.length, 0, 'should not execute'); // not runnable, didn't work

		editor.document.metadata.runnable = true;
		await vscode.commands.executeCommand('notebook.execute');
		assert.equal(cell.outputs.length, 1, 'should execute'); // runnable, it worked

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});
});

suite('notebook dirty state', () => {
	test('notebook open', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.notEqual(vscode.notebook.activeNotebookEditor!.selection, undefined);
		assert.equal(activeCell!.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);


		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });
		await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection !== undefined, true);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells[1], vscode.notebook.activeNotebookEditor?.selection);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, 'var abc = 0;');

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});
});

suite('notebook undo redo', () => {
	test('notebook open', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		const activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.notEqual(vscode.notebook.activeNotebookEditor!.selection, undefined);
		assert.equal(activeCell!.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);


		// modify the second cell, delete it
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });
		await vscode.commands.executeCommand('notebook.cell.delete');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 2);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(vscode.notebook.activeNotebookEditor!.selection!), 1);


		// undo should bring back the deleted cell, and revert to previous content and selection
		await vscode.commands.executeCommand('notebook.undo');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(vscode.notebook.activeNotebookEditor!.selection!), 1);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, 'var abc = 0;');

		// redo
		// await vscode.commands.executeCommand('notebook.redo');
		// assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 2);
		// assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(vscode.notebook.activeNotebookEditor!.selection!), 1);
		// assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, 'test');

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});
});

suite('notebook working copy', () => {
	test('notebook revert on close', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		// close active editor from command will revert the file
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection !== undefined, true);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells[0], vscode.notebook.activeNotebookEditor?.selection);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, 'test');

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('notebook revert', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });
		await vscode.commands.executeCommand('workbench.action.files.revert');

		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection !== undefined, true);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells[0], vscode.notebook.activeNotebookEditor?.selection);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells.length, 1);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, 'test');

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('multiple tabs: dirty + clean', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		const secondResource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './second.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

		// make sure that the previous dirty editor is still restored in the extension host and no data loss
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection !== undefined, true);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells[1], vscode.notebook.activeNotebookEditor?.selection);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, 'var abc = 0;');

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('multiple tabs: two dirty tabs and switching', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		const secondResource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './second.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		// switch to the first editor
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection !== undefined, true);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells[1], vscode.notebook.activeNotebookEditor?.selection);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, 'var abc = 0;');

		// switch to the second editor
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection !== undefined, true);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells[1], vscode.notebook.activeNotebookEditor?.selection);
		assert.deepEqual(vscode.notebook.activeNotebookEditor?.document.cells.length, 2);
		assert.equal(vscode.notebook.activeNotebookEditor?.selection?.source, '');

		await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('multiple tabs: different editors with same document', async function () {

		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		const firstNotebookEditor = vscode.notebook.activeNotebookEditor;
		assert.equal(firstNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(firstNotebookEditor!.selection?.source, 'test');
		assert.equal(firstNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('workbench.action.splitEditor');
		const secondNotebookEditor = vscode.notebook.activeNotebookEditor;
		assert.equal(secondNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(secondNotebookEditor!.selection?.source, 'test');
		assert.equal(secondNotebookEditor!.selection?.language, 'typescript');

		assert.notEqual(firstNotebookEditor, secondNotebookEditor);
		assert.equal(firstNotebookEditor?.document, secondNotebookEditor?.document, 'split notebook editors share the same document');
		assert.notEqual(firstNotebookEditor?.asWebviewUri(vscode.Uri.parse('./hello.png')), secondNotebookEditor?.asWebviewUri(vscode.Uri.parse('./hello.png')));

		await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});
});

suite('metadata', () => {
	test('custom metadata should be supported', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.metadata.custom!['testMetadata'] as boolean, false);
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.metadata.custom!['testCellMetadata'] as number, 123);
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');
	});

	// TODO copy cell should not copy metadata

	test('custom metadata should be supported', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.metadata.custom!['testMetadata'] as boolean, false);
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.metadata.custom!['testCellMetadata'] as number, 123);
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('notebook.cell.copyDown');
		const activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.equal(activeCell?.metadata.custom, undefined);
	});
});

suite('regression', () => {
	test('microsoft/vscode-github-issue-notebooks#26. Insert template cell in the new empty document', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './empty.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');
		await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('#97830, #97764. Support switch to other editor types', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './empty.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, 'var abc = 0;');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('vscode.openWith', resource, 'default');
		assert.equal(vscode.window.activeTextEditor?.document.uri.path, resource.path);

		await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	// open text editor, pin, and then open a notebook
	test('#96105 - dirty editors', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './empty.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'default');
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		// now it's dirty, open the resource with notebook editor should open a new one
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.notEqual(vscode.notebook.activeNotebookEditor, undefined, 'notebook first');
		assert.notEqual(vscode.window.activeTextEditor, undefined);

		// await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

});

suite('webview', () => {
	test('asWebviewUri', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		const uri = vscode.notebook.activeNotebookEditor!.asWebviewUri(vscode.Uri.parse('./hello.png'));
		assert.equal(uri.scheme, 'vscode-webview-resource');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('custom renderer message', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './customRenderer.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		const editor = vscode.notebook.activeNotebookEditor;
		const promise = new Promise(resolve => {
			const messageEmitter = editor?.onDidReceiveMessage(e => {
				if (e.type === 'custom_renderer_initialize') {
					resolve();
					messageEmitter?.dispose();
				}
			});
		});

		await vscode.commands.executeCommand('notebook.cell.execute');
		await promise;
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});
});
