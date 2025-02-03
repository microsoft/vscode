/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { asPromise, disposeAll } from '../utils';
import { Kernel, saveAllFilesAndCloseAll } from './notebook.api.test';

export type INativeInteractiveWindow = { notebookUri: vscode.Uri; inputUri: vscode.Uri; notebookEditor: vscode.NotebookEditor };

async function createInteractiveWindow(kernel: Kernel) {
	const { notebookEditor, inputUri } = (await vscode.commands.executeCommand(
		'interactive.open',
		// Keep focus on the owning file if there is one
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
		undefined,
		`vscode.vscode-api-tests/${kernel.controller.id}`,
		undefined
	)) as unknown as INativeInteractiveWindow;
	assert.ok(notebookEditor, 'Interactive Window was not created successfully');

	return { notebookEditor, inputUri };
}

async function addCell(code: string, notebook: vscode.NotebookDocument) {
	const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, code, 'typescript');
	const edit = vscode.NotebookEdit.insertCells(notebook.cellCount, [cell]);
	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.set(notebook.uri, [edit]);
	const event = asPromise(vscode.workspace.onDidChangeNotebookDocument);
	await vscode.workspace.applyEdit(workspaceEdit);
	await event;
	return notebook.cellAt(notebook.cellCount - 1);
}

async function addCellAndRun(code: string, notebook: vscode.NotebookDocument) {
	const initialCellCount = notebook.cellCount;
	const cell = await addCell(code, notebook);

	const event = asPromise(vscode.workspace.onDidChangeNotebookDocument);
	await vscode.commands.executeCommand('notebook.cell.execute', { start: initialCellCount, end: initialCellCount + 1 }, notebook.uri);
	try {
		await event;
	} catch (e) {
		const result = notebook.cellAt(notebook.cellCount - 1);
		assert.fail(`Notebook change event was not triggered after executing newly added cell. Initial Cell count: ${initialCellCount}. Current cell count: ${notebook.cellCount}. execution summary: ${JSON.stringify(result.executionSummary)}`);
	}
	assert.strictEqual(cell.outputs.length, 1, `Executed cell has no output. Initial Cell count: ${initialCellCount}. Current cell count: ${notebook.cellCount}. execution summary: ${JSON.stringify(cell.executionSummary)}`);
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

	test('Can open an interactive window and execute from input box', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		const { notebookEditor, inputUri } = await createInteractiveWindow(defaultKernel);

		const inputBox = vscode.window.visibleTextEditors.find(
			(e) => e.document.uri.path === inputUri.path
		);
		await inputBox!.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), 'print foo');
		});
		await vscode.commands.executeCommand('interactive.execute', notebookEditor.notebook.uri);

		assert.strictEqual(notebookEditor.notebook.cellCount, 1);
		assert.strictEqual(notebookEditor.notebook.cellAt(0).kind, vscode.NotebookCellKind.Code);
	});

	test('Interactive window scrolls after execute', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		const { notebookEditor } = await createInteractiveWindow(defaultKernel);

		// Run and add a bunch of cells
		for (let i = 0; i < 10; i++) {
			await addCellAndRun(`print ${i}`, notebookEditor.notebook);
		}

		// Verify visible range has the last cell
		if (!lastCellIsVisible(notebookEditor)) {
			// scroll happens async, so give it some time to scroll
			await new Promise<void>((resolve) => setTimeout(() => {
				assert.ok(lastCellIsVisible(notebookEditor), `Last cell is not visible`);
				resolve();
			}, 1000));
		}
	});

	test('Interactive window has the correct kernel', async () => {
		assert.ok(vscode.workspace.workspaceFolders);
		await createInteractiveWindow(defaultKernel);

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

		// Create a new interactive window with a different kernel
		const { notebookEditor } = await createInteractiveWindow(secondKernel);
		assert.ok(notebookEditor);

		// Verify the kernel is the secondary one
		await addCellAndRun(`print`, notebookEditor.notebook);

		assert.strictEqual(secondKernel.associatedNotebooks.has(notebookEditor.notebook.uri.toString()), true, `Secondary kernel was not set as the kernel for the interactive window`);

	});
});

function lastCellIsVisible(notebookEditor: vscode.NotebookEditor) {
	if (!notebookEditor.visibleRanges.length) {
		return false;
	}
	const lastVisibleCell = notebookEditor.visibleRanges[notebookEditor.visibleRanges.length - 1].end;
	return notebookEditor.notebook.cellCount === lastVisibleCell;
}
