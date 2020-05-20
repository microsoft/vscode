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

export function smokeTestActivate(context: vscode.ExtensionContext): any {
	context.subscriptions.push(vscode.commands.registerCommand('vscode-notebook-tests.createNewNotebook', async () => {
		const workspacePath = vscode.workspace.workspaceFolders![0].uri.fsPath;
		const notebookPath = path.join(workspacePath, 'test.smoke-nb');
		child_process.execSync('echo \'\' > ' + notebookPath);
		await wait(500);
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(notebookPath));
	}));

	context.subscriptions.push(vscode.notebook.registerNotebookContentProvider('notebookSmokeTest', {
		onDidChangeNotebook: new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>().event,
		openNotebook: async (_resource: vscode.Uri) => {
			const dto: vscode.NotebookData = {
				languages: ['typescript'],
				metadata: {},
				cells: [
					{
						source: 'code()',
						language: 'typescript',
						cellKind: vscode.CellKind.Code,
						outputs: [],
						metadata: {
							custom: { testCellMetadata: 123 }
						}
					},
					{
						source: 'Markdown Cell',
						language: 'markdown',
						cellKind: vscode.CellKind.Markdown,
						outputs: [],
						metadata: {
							custom: { testCellMetadata: 123 }
						}
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
		}
	}));

	context.subscriptions.push(vscode.notebook.registerNotebookKernel('notebookSmokeTest', ['*.vsctestnb'], {
		label: 'notebookSmokeTest',
		executeAllCells: async (_document: vscode.NotebookDocument) => {
			for (let i = 0; i < _document.cells.length; i++) {
				_document.cells[i].outputs = [{
					outputKind: vscode.CellOutputKind.Rich,
					data: {
						'text/html': ['test output']
					}
				}];
			}
		},
		executeCell: async (_document: vscode.NotebookDocument, _cell: vscode.NotebookCell | undefined, _token: vscode.CancellationToken) => {
			if (!_cell) {
				_cell = _document.cells[0];
			}

			_cell.outputs = [{
				outputKind: vscode.CellOutputKind.Rich,
				data: {
					'text/html': ['test output']
				}
			}];
			return;
		},
	}));
}
