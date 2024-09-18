/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import { UriList } from '../utils/uriList';

const mimes = Object.freeze({
	uriList: 'text/uri-list',
});


class MyDocumentDropEditProvider implements vscode.DocumentDropEditProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient,
	) { }

	async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentDropEdit | undefined> {
		const text = dataTransfer.get(mimes.uriList)?.value;
		if (!text) {
			return;
		}

		const uriList = UriList.from(text);
		if (!uriList.entries.length) {
			return;
		}

		const response = await this.client.execute('getDropOrPasteEdit', {}, token);
		if (!response || response.type !== 'response' || !response.body) {

		}
		const edit = new vscode.DocumentDropEdit(uriList.entries[0].str);

		return edit;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
): vscode.Disposable {
	return vscode.languages.registerDocumentDropEditProvider(selector, new MyDocumentDropEditProvider(client));
}
