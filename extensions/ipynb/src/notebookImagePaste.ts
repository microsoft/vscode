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

		const enabled = vscode.workspace.getConfiguration('ipynb', _document).get('experimental.pasteImages.enabled', false);
		if (!enabled) {
			return undefined;
		}

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

		// get filename data from paste
		const pasteFilename = dataItem.asFile()?.name;
		if (!pasteFilename) {
			return undefined;
		}
		const separatorIndex = pasteFilename?.lastIndexOf('.');
		const filename = pasteFilename?.slice(0, separatorIndex);
		const filetype = pasteFilename?.slice(separatorIndex);
		if (!filename || !filetype) {
			return undefined;
		}

		// get notebook cell
		let notebookUri;
		let currentCell;
		for (const notebook of vscode.workspace.notebookDocuments) {
			if (notebook.uri.path === _document.uri.path) {
				for (const cell of notebook.getCells()) {
					if (cell.document === _document) {
						currentCell = cell;
						notebookUri = notebook.uri;
						break;
					}
				}
			}
		}
		if (!currentCell || !notebookUri) {
			return undefined;
		}

		// create updated metadata for cell (prep for WorkspaceEdit)
		const b64string = encodeBase64(fileDataAsUint8);
		const startingAttachments = currentCell.metadata.custom?.attachments;
		const newMetadata = buildMetadata(b64string, currentCell, pasteFilename, filetype, startingAttachments);

		// build edits
		const nbEdit = vscode.NotebookEdit.updateCellMetadata(currentCell.index, newMetadata);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(notebookUri, [nbEdit]);

		// create a snippet for paste
		const pasteSnippet = new vscode.SnippetString();
		pasteSnippet.appendText('![');
		pasteSnippet.appendPlaceholder(`${pasteFilename}`);
		pasteSnippet.appendText(`](attachment:${pasteFilename})`);

		return { insertText: pasteSnippet, additionalEdit: workspaceEdit };
	}
}

/**
 *  Taken from https://github.com/microsoft/vscode/blob/743b016722db90df977feecde0a4b3b4f58c2a4c/src/vs/base/common/buffer.ts#L350-L387
 */
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

function buildMetadata(b64: string, cell: vscode.NotebookCell, filename: string, filetype: string, startingAttachments: any): { [key: string]: any } {
	const outputMetadata: { [key: string]: any } = cell.metadata;
	const customField = cell.metadata.custom;
	if (!customField) {
		return { 'custom': { 'attachments': { [filename]: { 'image/png': b64 } } } };
	}

	const attachmentField = cell.metadata.custom.attachments;
	if (!attachmentField) {
		outputMetadata['attachments'] = { [filename]: { 'image/png': b64 } };
	} else {
		for (let appendValue = 2; filename in startingAttachments; appendValue++) {
			const objEntries = Object.entries(startingAttachments[filename]);
			if (objEntries.length) { // check that mime:b64 are present
				const [, attachmentb64] = objEntries[0];
				if (attachmentb64 !== b64) {	// append a "-#" here. same name, diff data. this matches jupyter behavior
					filename = filename.concat(`-${appendValue}`) + filetype;
				}
			}
		}
		outputMetadata.custom.attachments[filename] = { 'image/png': b64 };
	}
	return outputMetadata;
}

export function imagePasteSetup() {
	const selector: vscode.DocumentSelector = { notebookType: 'jupyter-notebook', language: 'markdown' }; // this is correct provider
	return vscode.languages.registerDocumentPasteEditProvider(selector, new CopyPasteEditProvider(), {
		pasteMimeTypes: ['image/png'],
	});
}
