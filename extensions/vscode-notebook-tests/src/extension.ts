/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

function wait(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

export function activate(context: vscode.ExtensionContext): any {
	context.subscriptions.push(vscode.commands.registerCommand('vscode-notebook-tests.createNewNotebook', async () => {
		const workspacePath = vscode.workspace.workspaceFolders![0].uri.fsPath;
		const notebookPath = path.join(workspacePath, 'test.smoke-nb');
		child_process.execSync('echo \'\' > ' + notebookPath);
		await wait(500);
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(notebookPath));
	}));

	context.subscriptions.push(vscode.workspace.registerNotebookContentProvider('notebookSmokeTest', {
		openNotebook: async (_resource: vscode.Uri) => {
			const dto: vscode.NotebookData = {
				metadata: {},
				cells: [
					{
						value: 'code()',
						languageId: 'typescript',
						kind: vscode.NotebookCellKind.Code,
						outputs: [],
						metadata: { custom: { testCellMetadata: 123 } }
					},
					{
						value: 'Markdown Cell',
						languageId: 'markdown',
						kind: vscode.NotebookCellKind.Markup,
						outputs: [],
						metadata: { custom: { testCellMetadata: 123 } }
					}
				]
			};

			return dto;
		}
	}));

	const controller = vscode.notebooks.createNotebookController(
		'notebookSmokeTest',
		'notebookSmokeTest',
		'notebookSmokeTest'
	);

	controller.executeHandler = (cells) => {
		for (const cell of cells) {
			const task = controller.createNotebookCellExecution(cell);
			task.start();
			task.replaceOutput([new vscode.NotebookCellOutput([
				vscode.NotebookCellOutputItem.text('test output', 'text/html')
			])]);
			task.end(true);
		}
	};

	context.subscriptions.push(controller);

	context.subscriptions.push(vscode.commands.registerCommand('vscode-notebook-tests.debugAction', async (cell: vscode.NotebookCell) => {
		if (cell) {
			const edit = new vscode.WorkspaceEdit();
			const fullRange = new vscode.Range(0, 0, cell.document.lineCount - 1, cell.document.lineAt(cell.document.lineCount - 1).range.end.character);
			edit.replace(cell.document.uri, fullRange, 'test');
			await vscode.workspace.applyEdit(edit);
		} else {
			throw new Error('Cell not set correctly');
		}
	}));
}
