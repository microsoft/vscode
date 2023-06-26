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
		const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.pasteUrlAsFormattedLink.enabled', true);
		if (!enabled) {
			return;
		}

		// Check if dataTransfer contains a URL
		const item = dataTransfer.get('text/plain');
		try {
			new URL(await item?.value);
		} catch (error) {
			return;
		}

		const label = vscode.l10n.t('Insert Markdown Link');
		const uriEdit = new vscode.DocumentPasteEdit('', this._id, label);
		const urlList = await item?.asString();
		if (!urlList) {
			return undefined;
		}
		const pasteEdit = await getMarkdownLink(document, ranges, urlList, token);
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
