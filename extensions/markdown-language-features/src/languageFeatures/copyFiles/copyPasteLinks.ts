/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { externalUriSchemes, createEditAddingLinksForUriList, getPasteUrlAsFormattedLinkSetting, PasteUrlAsFormattedLink } from './shared';
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
		return uriEdit;
	}
}

export function validateLink(urlList: string): { isValid: boolean; cleanedUrlList: string } {
	const cleanedUrlList = urlList?.trim();
	let isValid = false;
	let new_uri = undefined;
	try {
		new_uri = vscode.Uri.parse(cleanedUrlList);
	} catch (error) {
		return { isValid: false, cleanedUrlList };
	}
	if (new_uri) {
		isValid = !cleanedUrlList.includes('\n') && externalUriSchemes.includes(new_uri.scheme);
	}
	return { isValid, cleanedUrlList };
}

export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [
			'text/plain',
		]
	});
}
