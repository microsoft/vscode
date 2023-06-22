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
		_ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const markdown_link_enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.pasteAsTextLink.enabled', true);
		if (!markdown_link_enabled) {
			return;
		}

		// Check if dataTransfer contains a URL
		const mimeType = 'text/plain';
		const item = dataTransfer.get(mimeType);
		try {
			new URL(item?.value!.toString());
		} catch (error) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', this._id, '');
		const pasteEdit = await getMarkdownLink(document, _ranges, dataTransfer, uriEdit, token);
		if (pasteEdit) {
			return pasteEdit;
		}

		uriEdit.priority = this._getPriority(dataTransfer);
		return uriEdit;

	}

	private _getPriority(dataTransfer: vscode.DataTransfer): number {
		if (dataTransfer.get('text/plain')) {
			// Deprioritize in favor of normal text content
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
