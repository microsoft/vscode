/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { externalUriSchemes, createEditAddingLinksForUriList } from './shared';
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
		const urlList = await item?.asString();

		if (urlList === undefined) {
			return;
		}

		if (!validateLink(urlList)) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', this.id, '');
		if (!urlList) {
			return undefined;
		}
		const pasteEdit = await createEditAddingLinksForUriList(document, ranges, urlList, token, true);
		if (!pasteEdit) {
			return;
		}

		uriEdit.label = pasteEdit.label;
		uriEdit.additionalEdit = pasteEdit.additionalEdits;
		return uriEdit;
	}
}

export function validateLink(urlList: string): boolean {
	const url = urlList?.split(/\s+/);
	if (url.length > 1 || !externalUriSchemes.includes(vscode.Uri.parse(url[0]).scheme)) {
		return false;
	}
	return true;
}

export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [
			'text/plain',
		]
	});
}
