/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NotebookSerializer } from './notebookSerializer';
import { ensureAllNewCellsHaveCellIds } from './cellIdService';
import { notebookImagePasteSetup } from './notebookImagePaste';
import { AttachmentCleaner } from './notebookAttachmentCleaner';

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
	orig_nbformat?: number;
	[propName: string]: unknown;
};

export function activate(context: vscode.ExtensionContext) {
	const serializer = new NotebookSerializer(context);
	ensureAllNewCellsHaveCellIds(context);
	context.subscriptions.push(vscode.workspace.registerNotebookSerializer('jupyter-notebook', serializer, {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			custom: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	} as vscode.NotebookDocumentContentOptions));

	context.subscriptions.push(vscode.workspace.registerNotebookSerializer('interactive', serializer, {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			custom: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	} as vscode.NotebookDocumentContentOptions));

	vscode.languages.registerCodeLensProvider({ pattern: '**/*.ipynb' }, {
		provideCodeLenses: (document) => {
			if (
				document.uri.scheme === 'vscode-notebook-cell' ||
				document.uri.scheme === 'vscode-notebook-cell-metadata' ||
				document.uri.scheme === 'vscode-notebook-cell-output'
			) {
				return [];
			}
			const codelens = new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: 'Open in Notebook Editor', command: 'ipynb.openIpynbInNotebookEditor', arguments: [document.uri] });
			return [codelens];
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand('ipynb.newUntitledIpynb', async () => {
		const language = 'python';
		const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', language);
		const data = new vscode.NotebookData([cell]);
		data.metadata = {
			custom: {
				cells: [],
				metadata: {},
				nbformat: 4,
				nbformat_minor: 2
			}
		};
		const doc = await vscode.workspace.openNotebookDocument('jupyter-notebook', data);
		await vscode.window.showNotebookDocument(doc);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ipynb.openIpynbInNotebookEditor', async (uri: vscode.Uri) => {
		if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		}
		const document = await vscode.workspace.openNotebookDocument(uri);
		await vscode.window.showNotebookDocument(document);
	}));

	context.subscriptions.push(notebookImagePasteSetup());

	const enabled = vscode.workspace.getConfiguration('ipynb').get('pasteImagesAsAttachments.enabled', false);
	if (enabled) {
		const cleaner = new AttachmentCleaner();
		context.subscriptions.push(cleaner);
	}

	// Update new file contribution
	vscode.extensions.onDidChange(() => {
		vscode.commands.executeCommand('setContext', 'jupyterEnabled', vscode.extensions.getExtension('ms-toolsai.jupyter'));
	});
	vscode.commands.executeCommand('setContext', 'jupyterEnabled', vscode.extensions.getExtension('ms-toolsai.jupyter'));


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
			edit.set(resource, [vscode.NotebookEdit.updateNotebookMetadata({
				...document.metadata,
				custom: {
					...(document.metadata.custom ?? {}),
					metadata: <NotebookMetadata>{
						...(document.metadata.custom?.metadata ?? {}),
						...metadata
					},
				}
			})]);
			return vscode.workspace.applyEdit(edit);
		},
	};
}

function exportNotebook(notebook: vscode.NotebookData, serializer: NotebookSerializer): string {
	return serializer.serializeNotebookToString(notebook);
}

export function deactivate() { }
