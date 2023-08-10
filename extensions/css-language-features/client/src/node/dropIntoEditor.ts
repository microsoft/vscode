/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Mimes, extractUriList } from './shared';

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

		if (token.isCancellationRequested) {
			return;
		}

		return this._getUriListDropEdit(document, dataTransfer, position, token);
	}

	private async _getUriListDropEdit(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
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

		const pasteAsFunction = checkDrop(document, position);

		return {
			id: this.id,
			priority: this._getPriority(pasteAsFunction),
			label: snippet.label,
			insertText: snippet.snippet.value
		};
	}

	private _getPriority(pasteAsFunction: boolean): number {
		if (!pasteAsFunction) {
			// Deprioritize in favor of default drop provider
			return -10;
		}
		return 0;
	}
}

// CHANGE to compare position to 'match' position
function checkDrop(document: vscode.TextDocument, position: vscode.Position): boolean {
	const regex = /\(".*"\)/g;
	const matches = [...document.getText().matchAll(regex)];
	for (const match of matches) {
		if (match.index !== undefined) {
			const useDefaultPaste = position.character > match.index && position.character < match.index + match[0].length;
			if (useDefaultPaste) {
				return false;
			}
		}
	}

	return true;
}

export function registerDropIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentDropEditProvider(selector, new DropIntoEditorProvider(), {
		dropMimeTypes: [
			'text/uri-list',
			...Mimes,
		]
	});
}
