/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { markdownDocumentation } from '../utils/previewer';
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

		const response = await this.client.interruptGetErr(() => this.client.execute('quickinfo', args, token));
		const definition = await this.client.interruptGetErr(() => this.client.execute('definition', args, token));
		if (response.type !== 'response' || !response.body || definition.type !== 'response' || !definition.body) {
			return undefined;
		}

		return new vscode.Hover(
			TypeScriptHoverProvider.getContents(response.body, definition.body),
			typeConverters.Range.fromTextSpan(response.body));
	}

	private static getContents(
		data: Proto.QuickInfoResponseBody,
		definition: Proto.DefinitionResponse['body']
	) {
		const parts = [];

		if (data.displayString) {
			parts.push({ language: 'typescript', value: data.displayString });
		}
		parts.push(markdownDocumentation(data.documentation, data.tags, definition));
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
