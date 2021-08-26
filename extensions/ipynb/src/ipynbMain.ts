/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NotebookSerializer } from './notebookSerializer';

export function activate(context: vscode.ExtensionContext) {
	const serializer = new NotebookSerializer(context);
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
		setKernelSpec: async (resource: vscode.Uri, kernelspec: unknown): Promise<boolean> => {
			const document = vscode.workspace.notebookDocuments.find(doc => doc.uri.toString() === resource.toString());
			if (!document) {
				return false;
			}

			const edit = new vscode.WorkspaceEdit();
			edit.replaceNotebookMetadata(resource, {
				...document.metadata,
				custom: {
					...(document.metadata.custom ?? {}),
					metadata: {
						...(document.metadata.custom?.metadata ?? {}),
						kernelspec: kernelspec
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
