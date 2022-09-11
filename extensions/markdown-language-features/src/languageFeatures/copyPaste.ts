/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
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
			const file = dataTransfer.get(imageMime)?.asFile();
			if (file) {
				const edit = await this.makeCreateImagePasteEdit(document, file, token);
				if (token.isCancellationRequested) {
					return;
				}

				if (edit) {
					return edit;
				}
			}
		}

		const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
		return snippet ? new vscode.DocumentPasteEdit(snippet) : undefined;
	}

	private async makeCreateImagePasteEdit(document: vscode.TextDocument, file: vscode.DataTransferFile, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		if (file.uri) {
			// If file is already in workspace, we don't want to create a copy of it
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
			if (workspaceFolder) {
				const snippet = createUriListSnippet(document, [file.uri]);
				return snippet ? new vscode.DocumentPasteEdit(snippet) : undefined;
			}
		}

		const uri = await this.getNewFileName(document, file);
		if (token.isCancellationRequested) {
			return;
		}

		const snippet = createUriListSnippet(document, [uri]);
		if (!snippet) {
			return;
		}

		// Note that there is currently no way to undo the file creation :/
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.createFile(uri, { contents: await file.data() });

		const pasteEdit = new vscode.DocumentPasteEdit(snippet);
		pasteEdit.additionalEdit = workspaceEdit;
		return pasteEdit;
	}

	private async getNewFileName(document: vscode.TextDocument, file: vscode.DataTransferFile): Promise<vscode.Uri> {
		const root = Utils.dirname(document.uri);

		const ext = path.extname(file.name);
		const baseName = path.basename(file.name, ext);
		for (let i = 0; ; ++i) {
			const name = i === 0 ? baseName : `${baseName}-${i}`;
			const uri = vscode.Uri.joinPath(root, `${name}.${ext}`);
			try {
				await vscode.workspace.fs.stat(uri);
			} catch {
				// Does not exist
				return uri;
			}
		}
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
