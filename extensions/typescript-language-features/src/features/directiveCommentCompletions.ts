/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { VersionDependentRegistration } from '../utils/dependentRegistration';

const localize = nls.loadMessageBundle();

interface Directive {
	readonly value: string;
	readonly description: string;
}

const directives: Directive[] = [
	{
		value: '@ts-check',
		description: localize(
			'ts-check',
			"Enables semantic checking in a JavaScript file. Must be at the top of a file.")
	}, {
		value: '@ts-nocheck',
		description: localize(
			'ts-nocheck',
			"Disables semantic checking in a JavaScript file. Must be at the top of a file.")
	}, {
		value: '@ts-ignore',
		description: localize(
			'ts-ignore',
			"Suppresses @ts-check errors on the next line of a file.")
	}
];

class DirectiveCommentCompletionProvider implements vscode.CompletionItemProvider {
	public static readonly minVersion = API.v230;

	constructor(
		private readonly client: ITypeScriptServiceClient,
	) { }

	public provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): vscode.CompletionItem[] {
		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return [];
		}

		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character);
		const match = prefix.match(/^\s*\/\/+\s?(@[a-zA-Z\-]*)?$/);
		if (match) {
			return directives.map(directive => {
				const item = new vscode.CompletionItem(directive.value, vscode.CompletionItemKind.Snippet);
				item.detail = directive.description;
				item.range = new vscode.Range(position.line, Math.max(0, position.character - (match[1] ? match[1].length : 0)), position.line, position.character);
				return item;
			});
		}
		return [];
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return new VersionDependentRegistration(client, DirectiveCommentCompletionProvider.minVersion, () => {
		return vscode.languages.registerCompletionItemProvider(selector,
			new DirectiveCommentCompletionProvider(client),
			'@');
	});
}
