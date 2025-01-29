/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { activate as keepNotebookModelStoreInSync } from './notebookModelStoreSync';
import { notebookImagePasteSetup } from './notebookImagePaste';
import { AttachmentCleaner } from './notebookAttachmentCleaner';
import { serializeNotebookToString } from './serializers';

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

type OptionsWithCellContentMetadata = vscode.NotebookDocumentContentOptions & { cellContentMetadata: { attachments: boolean } };


export function activate(context: vscode.ExtensionContext, serializer: vscode.NotebookSerializer) {
	keepNotebookModelStoreInSync(context);
	const notebookSerializerOptions: OptionsWithCellContentMetadata = {
		transientOutputs: false,
		transientDocumentMetadata: {
			cells: true,
			indentAmount: true
		},
		transientCellMetadata: {
			breakpointMargin: true,
			id: false,
			metadata: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	};
	context.subscriptions.push(vscode.workspace.registerNotebookSerializer('jupyter-notebook', serializer, notebookSerializerOptions));

	const interactiveSerializeOptions: OptionsWithCellContentMetadata = {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			id: false,
			metadata: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	};
	context.subscriptions.push(vscode.workspace.registerNotebookSerializer('interactive', serializer, interactiveSerializeOptions));

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
			cells: [],
			metadata: {},
			nbformat: 4,
			nbformat_minor: 2
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

	return {
		get dropCustomMetadata() {
			return true;
		},
		exportNotebook: (notebook: vscode.NotebookData): Promise<string> => {
			return Promise.resolve(serializeNotebookToString(notebook));
		},
		setNotebookMetadata: async (resource: vscode.Uri, metadata: Partial<NotebookMetadata>): Promise<boolean> => {
			const document = vscode.workspace.notebookDocuments.find(doc => doc.uri.toString() === resource.toString());
			if (!document) {
				return false;
			}

			const edit = new vscode.WorkspaceEdit();
			edit.set(resource, [vscode.NotebookEdit.updateNotebookMetadata({
				...document.metadata,
				metadata: {
					...(document.metadata.metadata ?? {}),
					...metadata
				} satisfies NotebookMetadata,
			})]);
			return vscode.workspace.applyEdit(edit);
		},
	};
}

export function deactivate() { }
