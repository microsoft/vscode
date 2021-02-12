/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { smokeTestActivate } from './notebookSmokeTestMain';

export function activate(context: vscode.ExtensionContext): any {
	smokeTestActivate(context);

	context.subscriptions.push(vscode.notebook.registerNotebookContentProvider('notebookCoreTest', {
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

	context.subscriptions.push(vscode.notebook.registerNotebookKernelProvider({ filenamePattern: '*.vsctestnb' }, {
		provideKernels: async () => {
			return [kernel, kernel2];
		}
	}));
}
