/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

class CopyPasteEditProvider implements vscode.DocumentPasteEditProvider {

	async provideDocumentPasteEdits(
		_document: vscode.TextDocument,
		_ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		_token: vscode.CancellationToken
	): Promise<vscode.DocumentPasteEdit | undefined> {

		const activeNotebook = vscode.window.activeNotebookEditor?.notebook;
		const currentSelection = vscode.window.activeNotebookEditor?.selection;
		const currentCell = activeNotebook?.getCells(currentSelection);
		if (currentCell?.length !== 1) { // somehow user selected multiple cells? not sure how this works. later problem
			return undefined; // FIXME: this may not be the correct behavior, tbd
		}
		const initialAttachments = currentCell[0].metadata?.custom?.attachments;

		// get data from paste
		const dataItem = dataTransfer.get('image/png');
		if (!dataItem) {
			return undefined;
		}
		let pasteFilename = dataItem.asFile()?.name;
		const fileDataAsUint8 = await dataItem.asFile()?.data();
		if (!fileDataAsUint8) {
			return undefined;
		}
		const b64string = encodeBase64(fileDataAsUint8);

		// create updated metadata
		let attachmentFilename: keyof typeof initialAttachments;
		for (attachmentFilename in initialAttachments) {
			if (attachmentFilename === pasteFilename) { // screenshot example, all come in as 'image.png'
				const objEntries = Object.entries(initialAttachments[attachmentFilename]);
				if (objEntries.length) { // check that mime:b64 are present
					const [, attachmentb64] = objEntries[0];
					if (attachmentb64 !== b64string) {
						// append a "-#" here. same name, diff data. this matches jupyter behavior
						const split = pasteFilename.split('.');
						pasteFilename = split[0].concat('-2.') + split[1]; //TODO: add numbering that actually updates...
					}
				}
			}
		}

		if (!pasteFilename) {
			return undefined;
		}
		const updatedMetadata = {
			'custom': {
				'attachments': {
					[pasteFilename]: { 'image/png': b64string }
				}
			}
		};
		for (attachmentFilename in initialAttachments) {
			updatedMetadata.custom.attachments[attachmentFilename] = initialAttachments[attachmentFilename];
		}
		let newCell;
		if (updatedMetadata) {
			newCell = vscode.NotebookEdit.updateCellMetadata(currentCell[0].index, updatedMetadata);
		}
		const edit = new vscode.WorkspaceEdit();
		if (activeNotebook?.uri && newCell) {
			edit.set(activeNotebook.uri, [newCell]);
		}
		vscode.workspace.applyEdit(edit);

		// Build a snippet to insert
		const snippet = new vscode.SnippetString();
		snippet.appendText(`![${pasteFilename}](attachment:${pasteFilename})`);
		return { insertText: snippet };
	}
}

export function imagePasteSetup(context: vscode.ExtensionContext) {
	const selector: vscode.DocumentSelector = { notebookType: 'jupyter-notebook' }; // this is correct provider
	context.subscriptions.push(vscode.languages.registerDocumentPasteEditProvider(selector, new CopyPasteEditProvider(), {
		pasteMimeTypes: ['image/png'],
	}));

}

function encodeBase64(buffer: Uint8Array, padded = true, urlSafe = false) {
	const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	const base64UrlSafeAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

	const dictionary = urlSafe ? base64UrlSafeAlphabet : base64Alphabet;
	let output = '';

	const remainder = buffer.byteLength % 3;

	let i = 0;
	for (; i < buffer.byteLength - remainder; i += 3) {
		const a = buffer[i + 0];
		const b = buffer[i + 1];
		const c = buffer[i + 2];

		output += dictionary[a >>> 2];
		output += dictionary[(a << 4 | b >>> 4) & 0b111111];
		output += dictionary[(b << 2 | c >>> 6) & 0b111111];
		output += dictionary[c & 0b111111];
	}

	if (remainder === 1) {
		const a = buffer[i + 0];
		output += dictionary[a >>> 2];
		output += dictionary[(a << 4) & 0b111111];
		if (padded) { output += '=='; }
	} else if (remainder === 2) {
		const a = buffer[i + 0];
		const b = buffer[i + 1];
		output += dictionary[a >>> 2];
		output += dictionary[(a << 4 | b >>> 4) & 0b111111];
		output += dictionary[(b << 2) & 0b111111];
		if (padded) { output += '='; }
	}

	return output;
}
