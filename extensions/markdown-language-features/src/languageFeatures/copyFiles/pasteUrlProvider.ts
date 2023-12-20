/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Mime } from '../../util/mimes';
import { createEditAddingLinksForUriList, findValidUriInText, getPasteUrlAsFormattedLinkSetting, PasteUrlAsFormattedLink } from './shared';

class PasteUrlEditProvider implements vscode.DocumentPasteEditProvider {

	public static readonly id = 'insertMarkdownLink';

	public static readonly pasteMimeTypes = [
		Mime.textPlain,
	];

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

		const item = dataTransfer.get(Mime.textPlain);
		const urlList = await item?.asString();
		if (token.isCancellationRequested || !urlList) {
			return;
		}

		const uriText = findValidUriInText(urlList);
		if (!uriText) {
			return;
		}

		const pasteEdit = createEditAddingLinksForUriList(document, ranges, uriText, true, pasteUrlSetting === PasteUrlAsFormattedLink.Smart);
		if (!pasteEdit) {
			return;
		}

		const edit = new vscode.DocumentPasteEdit('', pasteEdit.label);
		edit.additionalEdit = pasteEdit.additionalEdits;
		edit.yieldTo = pasteEdit.markdownLink ? undefined : [{ mimeType: Mime.textPlain }];
		return edit;
	}
}

export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteUrlEditProvider(), PasteUrlEditProvider);
}
