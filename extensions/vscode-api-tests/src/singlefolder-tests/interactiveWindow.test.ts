/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../utils';
import { Kernel, saveAllFilesAndCloseAll } from './notebook.test';

export type INativeInteractiveWindow = { notebookUri: vscode.Uri; inputUri: vscode.Uri; notebookEditor: vscode.NotebookEditor };

async function createInteractiveWindow(kernel: Kernel) {
	const { notebookEditor } = (await vscode.commands.executeCommand(
		'interactive.open',
		// Keep focus on the owning file if there is one
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
		undefined,
		`vscode.vscode-api-tests/${kernel.controller.id}`,
		undefined
	)) as unknown as INativeInteractiveWindow;

	return notebookEditor;
}

async function addCell(code: string, notebook: vscode.NotebookDocument) {
	const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, code, 'typescript');
	const edit = vscode.NotebookEdit.insertCells(notebook.cellCount, [cell]);
	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.set(notebook.uri, [edit]);
	await vscode.workspace.applyEdit(workspaceEdit);
	return notebook.cellAt(notebook.cellCount - 1);
}

async function addCellAndRun(code: string, notebook: vscode.NotebookDocument, i: number) {
	const cell = await addCell(code, notebook);
	await vscode.commands.executeCommand('notebook.cell.execute', { start: i, end: i + 1 });
	assert.strictEqual(cell.outputs.length, 1, 'execute failed');
	return cell;
}


(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('Interactive Window', function () {

	const testDisposables: vscode.Disposable[] = [];
	let defaultKernel: Kernel;
	let secondKernel: Kernel;

	setup(async function () {
		defaultKernel = new Kernel('mainKernel', 'Notebook Default Kernel', 'interactive');
		secondKernel = new Kernel('secondKernel', 'Notebook Secondary Kernel', 'interactive');
		testDisposables.push(defaultKernel.controller);
		testDisposables.push(secondKernel.controller);
		await saveAllFilesAndCloseAll();
	});

	teardown(async function () {
		disposeAll(testDisposables);
		testDisposables.length = 0;
		await saveAllFilesAndCloseAll();
	});

	test('Can open an interactive window', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		const notebookEditor = await createInteractiveWindow(defaultKernel);
		assert.ok(notebookEditor);

		// Try adding a cell and running it.
		await addCell('print foo', notebookEditor.notebook);

		assert.strictEqual(notebookEditor.notebook.cellCount, 1);
		assert.strictEqual(notebookEditor.notebook.cellAt(0).kind, vscode.NotebookCellKind.Code);
	});

	test('Interactive window scrolls after execute', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		const notebookEditor = await createInteractiveWindow(defaultKernel);
		assert.ok(notebookEditor);

		// Run and add a bunch of cells
		for (let i = 0; i < 10; i++) {
			await addCellAndRun(`print ${i}`, notebookEditor.notebook, i);
		}

		// Verify visible range has the last cell
		assert.strictEqual(notebookEditor.visibleRanges[notebookEditor.visibleRanges.length - 1].end, notebookEditor.notebook.cellCount, `Last cell is not visible`);

	});

	test('Interactive window has the correct kernel', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		const notebookEditor = await createInteractiveWindow(defaultKernel);
		assert.ok(notebookEditor);

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

		// Create a new interactive window with a different kernel
		const notebookEditor2 = await createInteractiveWindow(secondKernel);
		assert.ok(notebookEditor2);

		// Verify the kernel is the secondary one
		await addCellAndRun(`print`, notebookEditor2.notebook, 0);

		assert.strictEqual(secondKernel.associatedNotebooks.has(notebookEditor2.notebook.uri.toString()), true, `Secondary kernel was not set as the kernel for the interactive window`);

	});
});
