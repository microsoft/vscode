/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createEditAddingLinksForUriList, getPasteUrlAsFormattedLinkSetting, PasteUrlAsFormattedLink, validateLink } from './shared';
class PasteLinkEditProvider implements vscode.DocumentPasteEditProvider {

	readonly id = 'insertMarkdownLink';
	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const pasteUrlSetting = await getPasteUrlAsFormattedLinkSetting(document);
		if (pasteUrlSetting === PasteUrlAsFormattedLink.Never) {
			return;
		}

		const item = dataTransfer.get('text/plain');
		const urlList = await item?.asString();

		if (urlList === undefined) {
			return;
		}

		if (!validateLink(urlList).isValid) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', this.id, '');
		if (!urlList) {
			return undefined;
		}

		const pasteEdit = await createEditAddingLinksForUriList(document, ranges, validateLink(urlList).cleanedUrlList, true, pasteUrlSetting === PasteUrlAsFormattedLink.Smart, token);
		if (!pasteEdit) {
			return;
		}

		uriEdit.label = pasteEdit.label;
		uriEdit.additionalEdit = pasteEdit.additionalEdits;
		uriEdit.priority = this._getPriority(pasteEdit.markdownLink);
		return uriEdit;
	}

	private _getPriority(pasteAsMarkdownLink: boolean): number {
		if (!pasteAsMarkdownLink) {
			// Deprioritize in favor of default paste
			return -10;
		}
		return 0;
	}
}

export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [
			'text/plain',
		]
	});
}
