/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getMarkdownLink, externalUriSchemes } from './shared';
class PasteLinkEditProvider implements vscode.DocumentPasteEditProvider {

	readonly id = 'insertMarkdownLink';
	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('markdown', document).get<'always' | 'smart' | 'never'>('editor.pasteUrlAsFormattedLink.enabled', 'smart');
		if (enabled === 'never') {
			return;
		}

		const item = dataTransfer.get('text/plain');
		const isUrl = checkURL(item);
		if (!isUrl) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', this.id, '');
		const urlList = await item?.asString();
		if (!urlList) {
			return undefined;
		}
		const pasteEdit = await getMarkdownLink(document, ranges, urlList, token);
		if (!pasteEdit) {
			return;
		}

		uriEdit.label = pasteEdit.label;
		uriEdit.additionalEdit = pasteEdit.additionalEdits;
		return uriEdit;
	}
}

function checkURL(item: vscode.DataTransferItem | undefined) {
	try {
		const url = new URL(item?.value);
		return externalUriSchemes.includes(url.protocol.slice(0, -1));
	} catch (error) {
		return false;
	}
}


export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [
			'text/plain',
		]
	});
}
