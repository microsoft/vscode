/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { tryGetUriListSnippet } from './dropIntoEditor';

export function registerPasteProvider(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new class implements vscode.DocumentPasteEditProvider {

		async provideDocumentPasteEdits(
			document: vscode.TextDocument,
			_ranges: readonly vscode.Range[],
			dataTransfer: vscode.DataTransfer,
			token: vscode.CancellationToken,
		): Promise<vscode.DocumentPasteEdit | undefined> {
			const enabled = vscode.workspace.getConfiguration('markdown', document).get('experimental.editor.pasteLinks.enabled', false);
			if (!enabled) {
				return;
			}

			const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
			return snippet ? new vscode.DocumentPasteEdit(snippet) : undefined;
		}
	}, {
		pasteMimeTypes: ['text/uri-list']
	});
}
