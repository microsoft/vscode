/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { tagsMarkdownPreview } from '../utils/previewer';
import * as typeConverters from '../utils/typeConverters';


class TypeScriptHoverProvider implements vscode.HoverProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Hover | undefined> {
		const filepath = this.client.toOpenedFilePath(document);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		const response = await this.client.interuptGetErr(() => this.client.execute('quickinfo', args, token));
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		return new vscode.Hover(
			TypeScriptHoverProvider.getContents(response.body),
			typeConverters.Range.fromTextSpan(response.body));
	}

	private static getContents(
		data: Proto.QuickInfoResponseBody
	) {
		const parts = [];

		if (data.displayString) {
			parts.push({ language: 'typescript', value: data.displayString });
		}

		const tags = tagsMarkdownPreview(data.tags);
		parts.push(data.documentation + (tags ? '\n\n' + tags : ''));
		return parts;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient
): vscode.Disposable {
	return vscode.languages.registerHoverProvider(selector,
		new TypeScriptHoverProvider(client));
}