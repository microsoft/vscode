/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ensureAllNewCellsHaveCellIds } from './cellIdService';
import { NotebookSerializer } from './notebookSerializer';

// From {nbformat.INotebookMetadata} in @jupyterlab/coreutils
type NotebookMetadata = {
	kernelspec?: {
		name: string;
		display_name: string;
		[propName: string]: unknown;
	};
	language_info?: {
		name: string;
		codemirror_mode?: string | {};
		file_extension?: string;
		mimetype?: string;
		pygments_lexer?: string;
		[propName: string]: unknown;
	};
	orig_nbformat: number;
	[propName: string]: unknown;
};

export function activate(context: vscode.ExtensionContext) {
	const serializer = new NotebookSerializer(context);
	ensureAllNewCellsHaveCellIds(context);
	context.subscriptions.push(vscode.workspace.registerNotebookSerializer('jupyter-notebook', serializer, {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			inputCollapsed: true,
			outputCollapsed: true,
			custom: false
		}
	}));

	return {
		exportNotebook: (notebook: vscode.NotebookData): string => {
			return exportNotebook(notebook, serializer);
		},
		setNotebookMetadata: async (resource: vscode.Uri, metadata: Partial<NotebookMetadata>): Promise<boolean> => {
			const document = vscode.workspace.notebookDocuments.find(doc => doc.uri.toString() === resource.toString());
			if (!document) {
				return false;
			}

			const edit = new vscode.WorkspaceEdit();
			edit.replaceNotebookMetadata(resource, {
				...document.metadata,
				custom: {
					...(document.metadata.custom ?? {}),
					metadata: <NotebookMetadata>{
						...(document.metadata.custom?.metadata ?? {}),
						...metadata
					},
				}
			});
			return vscode.workspace.applyEdit(edit);
		},
	};
}

function exportNotebook(notebook: vscode.NotebookData, serializer: NotebookSerializer): string {
	return serializer.serializeNotebookToString(notebook);
}

export function deactivate() { }
