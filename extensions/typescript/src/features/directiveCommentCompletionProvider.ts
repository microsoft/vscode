/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position, CompletionItemProvider, CompletionItemKind, TextDocument, CancellationToken, CompletionItem, ProviderResult, Range } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

interface Directive {
	value: string;
	description: string;
}

const directives: Directive[] = [
	{
		value: '@ts-check',
		description: localize(
			'ts-check',
			'Enables semantic checking in a JavaScript file. Must be at the top of a file.')
	}, {
		value: '@ts-nocheck',
		description: localize(
			'ts-nocheck',
			'Disables semantic checking in a JavaScript file. Must be at the top of a file.')
	}, {
		value: '@ts-ignore',
		description: localize(
			'ts-ignore',
			'Suppresses @ts-check errors on the next line of a file.')
	}
];

export default class DirectiveCommentCompletionProvider implements CompletionItemProvider {
	constructor(
		private client: ITypescriptServiceClient,
	) { }

	public provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken): ProviderResult<CompletionItem[]> {
		if (!this.client.apiVersion.has230Features()) {
			return [];
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character);
		const match = prefix.match(/^\s*\/\/+\s?(@[a-zA-Z\-]*)?$/);
		if (match) {
			return directives.map(directive => {
				const item = new CompletionItem(directive.value, CompletionItemKind.Snippet);
				item.detail = directive.description;
				item.range = new Range(position.line, Math.max(0, position.character - (match[1] ? match[1].length : 0)), position.line, position.character);
				return item;
			});
		}
		return [];
	}

	public resolveCompletionItem(item: CompletionItem, _token: CancellationToken) {
		return item;
	}
}