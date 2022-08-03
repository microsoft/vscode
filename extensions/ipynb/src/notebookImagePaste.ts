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

		// get b64 data from paste
		// TODO: dataTransfer.get() limits to one image pasted
		const dataItem = dataTransfer.get('image/png');
		if (!dataItem) {
			return undefined;
		}
		const fileDataAsUint8 = await dataItem.asFile()?.data();
		if (!fileDataAsUint8) {
			return undefined;
		}
		const b64string = encodeBase64(fileDataAsUint8);

		// get filename data from paste
		let pasteFilename = dataItem.asFile()?.name;
		if (!pasteFilename) {
			return undefined;
		}
		const separatorIndex = pasteFilename?.lastIndexOf('.');
		const filename = pasteFilename?.slice(0, separatorIndex);
		const filetype = pasteFilename?.slice(separatorIndex);
		if (!filename || !filetype) {
			return undefined;
		}

		// get notebook cell data
		let currentCell;
		for (const notebook of vscode.workspace.notebookDocuments) {
			if (notebook.uri.path === _document.uri.path) {
				for (const cell of notebook.getCells()) {
					if (cell.document === _document) {
						currentCell = cell;
						break;
					}
				}

			}
		}
		if (!currentCell) {
			return undefined;
		}
		const initialAttachments = currentCell.metadata?.custom?.attachments;
		const initialize = !initialAttachments ? true : false;

		// create updated metadata for cell (prep for WorkspaceEdit)
		if (!initialize) {
			let appendValue = 2;
			while (true) {
				if (pasteFilename in initialAttachments) {
					const objEntries = Object.entries(initialAttachments[pasteFilename]);
					if (objEntries.length) { // check that mime:b64 are present
						const [, attachmentb64] = objEntries[0];
						if (attachmentb64 !== b64string) {	// append a "-#" here. same name, diff data. this matches jupyter behavior
							pasteFilename = filename.concat(`-${appendValue++}`) + filetype;
							continue;
						}
					}
				}
				break;
			}
		}
		if (!pasteFilename) {
			return undefined;
		}
		const updatedMetadata = { 'custom': { 'attachments': { [pasteFilename]: { 'image/png': b64string } } } };
		if (!initialize) {
			for (const entry of Object.keys(initialAttachments)) {
				updatedMetadata.custom.attachments[entry] = initialAttachments[entry];
			}
		}

		// create WorkspaceEdit and apply to active notebook
		const newCellMetadata = vscode.NotebookEdit.updateCellMetadata(currentCell.index, updatedMetadata);
		const edit = new vscode.WorkspaceEdit();
		if (newCellMetadata) {
			edit.set(vscode.Uri.file(_document.uri.path), [newCellMetadata]);
		}

		// create a snippet for paste
		const snippet = new vscode.SnippetString();
		snippet.appendChoice([`![insert-alt-text-here](attachment:${pasteFilename})`, `![${pasteFilename}](attachment:${pasteFilename})`]);

		return { insertText: snippet, additionalEdit: edit };
	}
}

export function imagePasteSetup(context: vscode.ExtensionContext) {
	const selector: vscode.DocumentSelector = { notebookType: 'jupyter-notebook', language: 'markdown' }; // this is correct provider
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
