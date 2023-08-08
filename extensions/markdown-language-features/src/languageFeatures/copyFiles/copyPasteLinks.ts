/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createEditAddingLinksForUriList, getPasteUrlAsFormattedLinkSetting, PasteUrlAsFormattedLink, validateLink } from './shared';

const textPlainMime = 'text/plain';

class PasteLinkEditProvider implements vscode.DocumentPasteEditProvider {

	readonly id = 'insertMarkdownLink';

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const pasteUrlSetting = getPasteUrlAsFormattedLinkSetting(document);
		if (pasteUrlSetting === PasteUrlAsFormattedLink.Never) {
			return;
		}

		const item = dataTransfer.get(textPlainMime);
		const urlList = await item?.asString();
		if (token.isCancellationRequested || !urlList || !validateLink(urlList).isValid) {
			return;
		}

		const pasteEdit = await createEditAddingLinksForUriList(document, ranges, validateLink(urlList).cleanedUrlList, true, pasteUrlSetting === PasteUrlAsFormattedLink.Smart, token);
		if (!pasteEdit) {
			return;
		}

		const edit = new vscode.DocumentPasteEdit('', this.id, pasteEdit.label);
		edit.additionalEdit = pasteEdit.additionalEdits;
		edit.yieldTo = pasteEdit.markdownLink ? undefined : [{ mimeType: textPlainMime }];
		return edit;
	}
}

export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [textPlainMime]
	});
}
