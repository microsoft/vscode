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
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './first.ipynb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookTest');

		await waitFor(500);
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		await vscode.commands.executeCommand('workbench.notebook.code.insertCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		await vscode.commands.executeCommand('workbench.notebook.code.insertCellAbove');
		const activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.notEqual(vscode.notebook.activeNotebookEditor!.selection, undefined);
		assert.equal(activeCell!.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);

		await vscode.commands.executeCommand('workbench.action.files.save');
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('notebook cell actions', async function () {
		const resource = vscode.Uri.parse(join(vscode.workspace.rootPath || '', './second.ipynb'));
		await vscode.commands.executeCommand('vscode.openWith', resource, 'notebookTest');

		await waitFor(500);
		assert.equal(vscode.notebook.activeNotebookEditor !== undefined, true, 'notebook first');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.language, 'typescript');

		// ---- insert cell below and focus ---- //
		await vscode.commands.executeCommand('workbench.notebook.code.insertCellBelow');
		assert.equal(vscode.notebook.activeNotebookEditor!.selection?.source, '');

		// ---- insert cell above and focus ---- //
		await vscode.commands.executeCommand('workbench.notebook.code.insertCellAbove');
		let activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.notEqual(vscode.notebook.activeNotebookEditor!.selection, undefined);
		assert.equal(activeCell!.source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 3);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);

		// ---- focus bottom ---- //
		await vscode.commands.executeCommand('workbench.action.notebook.focusBottom');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 2);

		// ---- focus top and then copy down ---- //
		await vscode.commands.executeCommand('workbench.action.notebook.focusTop');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);

		await vscode.commands.executeCommand('workbench.notebook.cell.copyDown');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.equal(activeCell?.source, 'test');

		await vscode.commands.executeCommand('workbench.notebook.cell.delete');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 1);
		assert.equal(activeCell?.source, '');

		// ---- focus top and then copy up ---- //
		await vscode.commands.executeCommand('workbench.action.notebook.focusTop');
		await vscode.commands.executeCommand('workbench.notebook.cell.copyUp');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.length, 4);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[0].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[1].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[2].source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[3].source, '');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 0);


		// ---- move up and down ---- //

		await vscode.commands.executeCommand('workbench.notebook.cell.moveDown');
		await vscode.commands.executeCommand('workbench.notebook.cell.moveDown');
		activeCell = vscode.notebook.activeNotebookEditor!.selection;

		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells.indexOf(activeCell!), 2);
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[0].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[1].source, '');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[2].source, 'test');
		assert.equal(vscode.notebook.activeNotebookEditor!.document.cells[3].source, '');

		// ---- ---- //

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});
});
