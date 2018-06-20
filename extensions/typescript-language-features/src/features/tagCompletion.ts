/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import * as typeConverters from '../utils/typeConverters';

class TypeScriptTagCompletion implements vscode.CompletionItemProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		_context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[] | undefined> {
		const filepath = this.client.toPath(document.uri);
		if (!filepath) {
			return undefined;
		}

		const args: Proto.JsxClosingTagRequestArgs = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		let body: Proto.TextInsertion | undefined = undefined;
		try {
			const response = await this.client.execute('jsxClosingTag', args, token);
			body = response && response.body;
			if (!body) {
				return undefined;
			}
		} catch {
			return undefined;
		}

		return [this.getCompletion(body)];
	}

	private getCompletion(body: Proto.TextInsertion) {
		const completion = new vscode.CompletionItem(body.newText);
		completion.insertText = this.getTagSnippet(body);
		return completion;
	}

	private getTagSnippet(closingTag: Proto.TextInsertion): vscode.SnippetString {
		const snippet = new vscode.SnippetString();
		snippet.appendPlaceholder('', 0);
		snippet.appendText(closingTag.newText);
		return snippet;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return new VersionDependentRegistration(client, API.v300, () =>
		vscode.languages.registerCompletionItemProvider(selector,
			new TypeScriptTagCompletion(client),
			'>'));
}
