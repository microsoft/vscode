/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { smokeTestActivate } from './notebookSmokeTestMain';

export function activate(context: vscode.ExtensionContext): any {
	smokeTestActivate(context);

	context.subscriptions.push(vscode.notebook.registerNotebookContentProvider('notebookCoreTest', {
		openNotebook: async (_resource: vscode.Uri) => {
			if (/.*empty\-.*\.vsctestnb$/.test(_resource.path)) {
				return {
					languages: ['typescript'],
					metadata: {},
					cells: []
				};
			}

			const dto: vscode.NotebookData = {
				languages: ['typescript'],
				metadata: {
					custom: { testMetadata: false }
				},
				cells: [
					{
						source: 'test',
						language: 'typescript',
						cellKind: vscode.CellKind.Code,
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
		executeAllCells: async (_document: vscode.NotebookDocument) => {
			const edit = new vscode.WorkspaceEdit();
			edit.replaceNotebookCellOutput(_document.uri, 0, [{
				outputKind: vscode.CellOutputKind.Rich,
				data: {
					'text/plain': ['my output']
				}
			}]);
			return vscode.workspace.applyEdit(edit);
		},
		cancelAllCellsExecution: async (_document: vscode.NotebookDocument) => { },
		executeCell: async (document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) => {
			if (!cell) {
				cell = document.cells[0];
			}

			if (document.uri.path.endsWith('customRenderer.vsctestnb')) {
				const edit = new vscode.WorkspaceEdit();
				edit.replaceNotebookCellOutput(document.uri, cell.index, [{
					outputKind: vscode.CellOutputKind.Rich,
					data: {
						'text/custom': 'test'
					}
				}]);

				return vscode.workspace.applyEdit(edit);
			}

			const edit = new vscode.WorkspaceEdit();
			// const previousOutputs = cell.outputs;
			edit.replaceNotebookCellOutput(document.uri, cell.index, [{
				outputKind: vscode.CellOutputKind.Rich,
				data: {
					'text/plain': ['my output']
				}
			}]);

			return vscode.workspace.applyEdit(edit);
		},
		cancelCellExecution: async (_document: vscode.NotebookDocument, _cell: vscode.NotebookCell) => { }
	};

	const kernel2: vscode.NotebookKernel = {
		id: 'secondaryKernel',
		label: 'Notebook Secondary Test Kernel',
		isPreferred: false,
		executeAllCells: async (_document: vscode.NotebookDocument) => {
			const edit = new vscode.WorkspaceEdit();
			edit.replaceNotebookCellOutput(_document.uri, 0, [{
				outputKind: vscode.CellOutputKind.Rich,
				data: {
					'text/plain': ['my second output']
				}
			}]);
			return vscode.workspace.applyEdit(edit);
		},
		cancelAllCellsExecution: async (_document: vscode.NotebookDocument) => { },
		executeCell: async (document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) => {
			if (!cell) {
				cell = document.cells[0];
			}

			const edit = new vscode.WorkspaceEdit();

			if (document.uri.path.endsWith('customRenderer.vsctestnb')) {
				edit.replaceNotebookCellOutput(document.uri, cell.index, [{
					outputKind: vscode.CellOutputKind.Rich,
					data: {
						'text/custom': 'test 2'
					}
				}]);
			} else {
				edit.replaceNotebookCellOutput(document.uri, cell.index, [{
					outputKind: vscode.CellOutputKind.Rich,
					data: {
						'text/plain': ['my second output']
					}
				}]);
			}

			return vscode.workspace.applyEdit(edit);
		},
		cancelCellExecution: async (_document: vscode.NotebookDocument, _cell: vscode.NotebookCell) => { }
	};

	context.subscriptions.push(vscode.notebook.registerNotebookKernelProvider({ filenamePattern: '*.vsctestnb' }, {
		provideKernels: async () => {
			return [kernel, kernel2];
		}
	}));
}
