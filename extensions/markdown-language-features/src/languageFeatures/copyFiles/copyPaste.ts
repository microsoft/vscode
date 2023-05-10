/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { coalesce } from '../../util/arrays';
import { Schemes } from '../../util/schemes';
import { NewFilePathGenerator } from './copyFiles';
import { createUriListSnippet, tryGetUriListSnippet } from './dropIntoEditor';

const supportedImageMimes = new Set([
	'image/bmp',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp',
]);

class PasteEditProvider implements vscode.DocumentPasteEditProvider {

	private readonly _id = 'insertLink';

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

		const edit = await this._makeCreateImagePasteEdit(document, dataTransfer, token);
		if (edit) {
			return edit;
		}

		const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
		return snippet ? new vscode.DocumentPasteEdit(snippet.snippet, this._id, snippet.label) : undefined;
	}

	private async _makeCreateImagePasteEdit(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		if (document.uri.scheme === Schemes.untitled) {
			return;
		}

		interface FileEntry {
			readonly uri: vscode.Uri;
			readonly newFileContents?: vscode.DataTransferFile;
		}

		const pathGenerator = new NewFilePathGenerator();
		const fileEntries = coalesce(await Promise.all(Array.from(dataTransfer, async ([mime, item]): Promise<FileEntry | undefined> => {
			if (!supportedImageMimes.has(mime)) {
				return;
			}

			const file = item?.asFile();
			if (!file) {
				return;
			}

			if (file.uri) {
				// If the file is already in a workspace, we don't want to create a copy of it
				const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
				if (workspaceFolder) {
					return { uri: file.uri };
				}
			}

			const uri = await pathGenerator.getNewFilePath(document, file, token);
			return uri ? { uri, newFileContents: file } : undefined;
		})));
		if (!fileEntries.length) {
			return;
		}

		const workspaceEdit = new vscode.WorkspaceEdit();
		for (const entry of fileEntries) {
			if (entry.newFileContents) {
				workspaceEdit.createFile(entry.uri, { contents: entry.newFileContents });
			}
		}

		const snippet = createUriListSnippet(document, fileEntries.map(entry => entry.uri));
		if (!snippet) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit(snippet.snippet, '', snippet.label);
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
