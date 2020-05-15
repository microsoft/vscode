/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { join } from 'path';

function waitFor(ms: number): Promise<void> {
	let resolveFunc: () => void;

	const promise = new Promise<void>(resolve => {
		resolveFunc = resolve;
	});
	setTimeout(() => {
		resolveFunc!();
	}, ms);

	return promise;
}

suite('notebook workflow', () => {
	test('notebook open', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await waitFor(500);
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

		await waitFor(500);
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

	// test.only('document metadata is respected', async function () {
	// 	const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
	// 	await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

	// 	await waitFor(500);

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

		await waitFor(500);

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

		await waitFor(500);

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

		await waitFor(500);
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

		await waitFor(500);
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

		await waitFor(500);
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

		await waitFor(500);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		// close active editor from command will revert the file
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await waitFor(500);
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

		await waitFor(500);
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

		await waitFor(500);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		const secondResource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './second.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		await waitFor(500);
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

		await waitFor(500);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('notebook.cell.insertCodeCellAbove');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		const secondResource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './second.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', secondResource, 'notebookCoreTest');
		await waitFor(500);
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
});

suite('metadata', () => {
	test('custom metadata should be supported', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await waitFor(500);
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.metadata.custom!['testMetadata'] as boolean, false);
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.metadata.custom!['testCellMetadata'] as number, 123);
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');
	});

	// TODO copy cell should not copy metadata
});

suite('regression', () => {
	test('microsoft/vscode-github-issue-notebooks#26. Insert template cell in the new empty document', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './empty.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await waitFor(500);
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');
		await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('#97830, #97764. Support switch to other editor types', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './empty.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await waitFor(500);
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

		await waitFor(500);
		await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow');
		await vscode.commands.executeCommand('default:type', { text: 'var abc = 0;' });

		// now it's dirty, open the resource with notebook editor should open a new one
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');
		await waitFor(500);

		assert.notEqual(vscode.notebook.activeNotebookEditor, undefined, 'notebook first');
		assert.notEqual(vscode.window.activeTextEditor, undefined);

		// await vscode.commands.executeCommand('workbench.action.files.saveAll');
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

});

suite('webview resource uri', () => {
	test('asWebviewUri', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.vsctestnb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookCoreTest');

		await waitFor(500);
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		const uri = vscode.notebook.activeNotebookEditor!.asWebviewUri(vscode.Uri.parse('./hello.png'));
		assert.equal(uri.scheme, 'vscode-webview-resource');
	});
});
