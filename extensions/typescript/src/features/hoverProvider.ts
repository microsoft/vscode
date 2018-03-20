/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverProvider, Hover, TextDocument, Position, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { tagsMarkdownPreview } from '../utils/previewer';
import * as typeConverters from '../utils/typeConverters';

export default class TypeScriptHoverProvider implements HoverProvider {

	public constructor(
		private client: ITypeScriptServiceClient
	) { }

	public async provideHover(
		document: TextDocument,
		position: Position,
		token: CancellationToken
	): Promise<Hover | undefined> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return undefined;
		}
		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		try {
			const response = await this.client.execute('quickinfo', args, token);
			if (response && response.body) {
				const data = response.body;
				return new Hover(
					TypeScriptHoverProvider.getContents(data),
					typeConverters.Range.fromTextSpan(data));
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