/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverProvider, Hover, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { tagsMarkdownPreview } from "./previewer";

export default class TypeScriptHoverProvider implements HoverProvider {

	public constructor(
		private client: ITypescriptServiceClient) { }

	public async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return undefined;
		}
		const args: Proto.FileLocationRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1
		};

		try {
			const response = await this.client.execute('quickinfo', args, token);
			if (response && response.body) {
				const data = response.body;
				return new Hover(
					TypeScriptHoverProvider.getContents(data),
					new Range(data.start.line - 1, data.start.offset - 1, data.end.line - 1, data.end.offset - 1));
			}
		} catch (e) {
			// noop
		}
		return undefined;
	}

	private static getContents(data: Proto.QuickInfoResponseBody) {
		const tags = tagsMarkdownPreview(data.tags);
		return [
			{ language: 'typescript', value: data.displayString },
			data.documentation + (tags ? '\n\n' + tags : '')
		];
	}
}