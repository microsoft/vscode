/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { smokeTestActivate } from './notebookSmokeTestMain';

export function activate(context: vscode.ExtensionContext): any {
	smokeTestActivate(context);

	context.subscriptions.push(vscode.notebook.registerNotebookContentProvider('notebookCoreTest', {
		onDidChangeNotebook: new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>().event,
		openNotebook: async (_resource: vscode.Uri) => {
			if (_resource.path.endsWith('empty.vsctestnb')) {
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
		saveNotebook: async (_document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) => {
			return;
		},
		saveNotebookAs: async (_targetResource: vscode.Uri, _document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) => {
			return;
		}
	}));

	context.subscriptions.push(vscode.notebook.registerNotebookKernel('notebookKernelTest', ['*.vsctestnb'], {
		label: 'Notebook Test Kernel',
		executeAllCells: async (_document: vscode.NotebookDocument, _token: vscode.CancellationToken) => {
			let cell = _document.cells[0];

			cell.outputs = [{
				outputKind: vscode.CellOutputKind.Rich,
				data: {
					'text/plain': ['my output']
				}
			}];
			return;
		},
		executeCell: async (_document: vscode.NotebookDocument, _cell: vscode.NotebookCell | undefined, _token: vscode.CancellationToken) => {
			if (!_cell) {
				_cell = _document.cells[0];
			}

			if (_document.uri.path.endsWith('customRenderer.vsctestnb')) {
				_cell.outputs = [{
					outputKind: vscode.CellOutputKind.Rich,
					data: {
						'text/custom': 'test'
					}
				}];

				return;
			}

			_cell.outputs = [{
				outputKind: vscode.CellOutputKind.Rich,
				data: {
					'text/plain': ['my output']
				}
			}];

			return;
		}
	}));

	const preloadUri = vscode.Uri.file(path.resolve(__dirname, '../src/customRenderer.js'));
	context.subscriptions.push(vscode.notebook.registerNotebookOutputRenderer('notebookCoreTestRenderer', {
		type: 'display_data',
		subTypes: [
			'text/custom'
		]
	}, {
		preloads: [preloadUri],
		render(_document: vscode.NotebookDocument, _output: vscode.CellDisplayOutput, _mimeType: string): string {
			return '<div>test</div>';
		}
	}));
}
