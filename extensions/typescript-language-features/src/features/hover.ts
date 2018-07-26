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
		const filepath = this.client.toPath(document.uri);
		if (!filepath) {
			return undefined;
		}
		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		try {
			const { body } = await this.client.execute('quickinfo', args, token);
			if (body) {
				return new vscode.Hover(
					TypeScriptHoverProvider.getContents(body),
					typeConverters.Range.fromTextSpan(body));
			}
		} catch (e) {
			// noop
		}
		return undefined;
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