/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getMarkdownLink } from './shared';

class PasteLinkEditProvider implements vscode.DocumentPasteEditProvider {

	private readonly _id = 'insertMarkdownLink';
	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const markdown_link_enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.pasteUrlAsFormattedLink.enabled', true);
		if (!markdown_link_enabled) {
			return;
		}

		// Check if dataTransfer contains a URL
		const item = dataTransfer.get('text/plain');

		try {
			new URL(await item?.value);
		} catch (error) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', this._id, 'Insert Markdown Link');
		const pasteEdit = await getMarkdownLink(document, ranges, dataTransfer, token);
		if (!pasteEdit) {
			return;
		}

		uriEdit.additionalEdit = pasteEdit.additionalEdits;
		return uriEdit;
	}
}

export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [
			'text/plain',
		]
	});
}
