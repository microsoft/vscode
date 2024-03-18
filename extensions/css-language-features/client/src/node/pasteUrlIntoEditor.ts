/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { extractUriList, useDefaultPaste, validateLink } from './shared';

class PasteLinkEditProvider implements vscode.DocumentPasteEditProvider {

	readonly id = 'insertMarkdownLink';
	async provideDocumentPasteEdits(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('css', document).get('format.formatPastedFiles', true);
		if (!enabled) {
			return;
		}

		if (token.isCancellationRequested) {
			return;
		}

		if (useDefaultPaste(document, ranges[0])) {
			return;
		}

		const edit = await this._getUriListPasteEdit(document, ranges, dataTransfer, token);
		return edit ? { id: this.id, insertText: edit.insertText, label: edit.label, priority: edit.priority } : undefined;
	}
	private async _getUriListPasteEdit(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		if (!ranges) {
			return undefined;
		}
		if (!ranges) {
			return undefined;
		}

		const item = dataTransfer.get('text/plain');
		const urlTextList = await item?.asString();

		if (urlTextList === undefined) {
			return;
		}

		if (!validateLink(urlTextList).isValid) {
			return;
		}
		console.log('uriList', urlTextList);
		const snippet = await extractUriList(document, urlTextList);
		console.log('snippet', snippet?.snippet.value);

		if (!snippet) {
			return undefined;
		}

		return {
			id: this.id,
			label: snippet.label,
			insertText: snippet.snippet.value
		};
	}
}


export function registerPasteLinkIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [
			'text/plain',
		]
	});
}



