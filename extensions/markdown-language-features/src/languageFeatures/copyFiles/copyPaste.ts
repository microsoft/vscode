/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNewFileName } from './copyFiles';
import { createUriListSnippet, tryGetUriListSnippet } from './dropIntoEditor';

const supportedImageMimes = new Set([
	'image/png',
	'image/jpg',
]);

class PasteEditProvider implements vscode.DocumentPasteEditProvider {

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		_ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('markdown', document).get('experimental.editor.pasteLinks.enabled', true);
		if (!enabled) {
			return;
		}

		for (const imageMime of supportedImageMimes) {
			const item = dataTransfer.get(imageMime);
			const file = item?.asFile();
			if (item && file) {
				const edit = await this._makeCreateImagePasteEdit(document, file, token);
				if (token.isCancellationRequested) {
					return;
				}

				if (edit) {
					return edit;
				}
			}
		}

		const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
		return snippet ? new vscode.DocumentPasteEdit(snippet.snippet, snippet.label) : undefined;
	}

	private async _makeCreateImagePasteEdit(document: vscode.TextDocument, file: vscode.DataTransferFile, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		if (file.uri) {
			// If file is already in workspace, we don't want to create a copy of it
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
			if (workspaceFolder) {
				const snippet = createUriListSnippet(document, [file.uri]);
				return snippet ? new vscode.DocumentPasteEdit(snippet.snippet, snippet.label) : undefined;
			}
		}

		const uri = await getNewFileName(document, file);
		if (token.isCancellationRequested) {
			return;
		}

		const snippet = createUriListSnippet(document, [uri]);
		if (!snippet) {
			return;
		}

		// Note that there is currently no way to undo the file creation :/
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.createFile(uri, { contents: file });

		const pasteEdit = new vscode.DocumentPasteEdit(snippet.snippet, snippet.label);
		pasteEdit.additionalEdit = workspaceEdit;
		return pasteEdit;
	}
}

export function registerPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteEditProvider(), {
		pasteMimeTypes: [
			'text/uri-list',
			...supportedImageMimes,
		]
	});
}
