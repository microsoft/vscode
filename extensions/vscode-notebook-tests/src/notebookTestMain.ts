/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): any {
	context.subscriptions.push(vscode.notebook.registerNotebookProvider('notebookCoreTest', {
		resolveNotebook: async (editor: vscode.NotebookEditor) => {
			await editor.edit(eb => {
				eb.insert(0, 'test', 'typescript', vscode.CellKind.Code, [], {});
			});
			return;
		},
		executeCell: async (_document: vscode.NotebookDocument, _cell: vscode.NotebookCell | undefined, _token: vscode.CancellationToken) => {
			if (!_cell) {
				_cell = _document.cells[0];
			}

			_cell.outputs = [{
				outputKind: vscode.CellOutputKind.Rich,
				data: {
					'text/plain': ['my output']
				}
			}];
			return;
		},
		save: async (_document: vscode.NotebookDocument) => {
			return true;
		}
	}));
}
