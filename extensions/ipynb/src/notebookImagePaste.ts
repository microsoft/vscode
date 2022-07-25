/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
/**
 * Provider that maintains a count of the number of times it has copied text.
 */
class CopyPasteEditProvider implements vscode.DocumentPasteEditProvider {

	// private readonly countMimeTypes = 'application/vnd.code.copydemo-copy-count';
	// private count = 0;

	// prepareDocumentPaste?(
	// 	_document: vscode.TextDocument,
	// 	_ranges: readonly vscode.Range[],
	// 	dataTransfer: vscode.DataTransfer,
	// 	_token: vscode.CancellationToken
	// ): void | Thenable<void> {
	// dataTransfer.set(this.countMimeTypes, new vscode.DataTransferItem(this.count++));
	// 	// dataTransfer.set('text/plain', new vscode.DataTransferItem(this.count++));
	// }

	async provideDocumentPasteEdits(
		_document: vscode.TextDocument,
		_ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken
	): Promise<vscode.DocumentPasteEdit | undefined> {
		console.log('paste code');

		// const countDataTransferItem = dataTransfer.get(this.countMimeTypes);
		// if (!countDataTransferItem) {
		// 	return undefined;
		// }

		// const textDataTransferItem = dataTransfer.get('text') ?? dataTransfer.get('text/plain');
		// if (!textDataTransferItem) {
		// 	return undefined;
		// }

		// const count = await countDataTransferItem.asString();
		// const text = await textDataTransferItem.asString();

		// Build a snippet to insert
		// const snippet = new vscode.SnippetString();
		// snippet.appendText(text);

		// return { insertText: snippet };

		const snippet = new vscode.SnippetString();
		snippet.appendText('woah');
		return { insertText: snippet };
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('notebookImagePaste');
	// Enable our provider in plaintext files
	const selector: vscode.DocumentSelector = { language: 'plaintext' };
	// const selector: vscode.DocumentSelector = { notebook: 'ipynb' };

	// Register our provider
	context.subscriptions.push(vscode.languages.registerDocumentPasteEditProvider(selector, new CopyPasteEditProvider(), {
		pasteMimeTypes: ['text/plain'],
	}));
}
