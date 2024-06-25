/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Mimes, extractUriList, useDefaultPaste } from './shared';

class DropIntoEditorProvider implements vscode.DocumentDropEditProvider {
	readonly id = 'relativePath';
	readonly dropMimeTypes = ['text/uri-list'];

	async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken):
		Promise<vscode.DocumentDropEdit | undefined> {

		const enabled = vscode.workspace.getConfiguration('css', document).get('format.formatDroppedFiles', true);
		if (!enabled) {
			return;
		}

		if (useDefaultPaste(document, position)) {
			return;
		}

		return this._getUriListDropEdit(document, dataTransfer, token);
	}

	private async _getUriListDropEdit(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
		if (token.isCancellationRequested) {
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

export function registerDropIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentDropEditProvider(selector, new DropIntoEditorProvider(), {
		dropMimeTypes: [
			'text/uri-list',
			...Mimes,
		]
	});
}
