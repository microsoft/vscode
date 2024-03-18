/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Mimes, extractUriList, useDefaultPaste } from './shared';

class PasteIntoEditorProvider implements vscode.DocumentPasteEditProvider {
	readonly id = 'relativePath';
	readonly pasteMimeTypes = ['text/uri-list'];

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
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

		const urlList = await dataTransfer.get('text/uri-list')?.asString();
		if (!urlList) {
			return undefined;
		}

		const snippet = await extractUriList(document, urlList);
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


export function registerPasteIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteIntoEditorProvider(), {
		pasteMimeTypes: [
			'text/uri-list',
			...Mimes,
		]
	});
}
