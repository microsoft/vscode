/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position, CompletionItemProvider, CompletionItemKind, TextDocument, CancellationToken, CompletionItem, ProviderResult, Range } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';

const directives = ['@ts-check', '@ts-nocheck', '@ts-ignore'];

export class DirectiveCommentCompletionProvider implements CompletionItemProvider {
	constructor(
		private client: ITypescriptServiceClient,
	) { }

	public provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken): ProviderResult<CompletionItem[]> {
		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character);
		const match = prefix.match(/^\s*\/\/+\s?(@[a-zA-Z\-]*)?$/);
		if (match) {
			return directives.map(x => {
				const item = new CompletionItem(x, CompletionItemKind.Snippet);
				item.range = new Range(position.line, Math.max(0, position.character - match[1].length), position.line, position.character);
				return item;
			});
		}
		return [];
	}

	public resolveCompletionItem(item: CompletionItem, _token: CancellationToken) {
		return item;
	}
}