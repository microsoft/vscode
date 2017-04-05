/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { HoverProvider, Hover, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptHoverProvider implements HoverProvider {

	public constructor(
		private client: ITypescriptServiceClient) { }

	public provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined | null> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return Promise.resolve(null);
		}
		const args: Proto.FileLocationRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1
		};
		return this.client.execute('quickinfo', args, token).then((response): Hover | undefined => {
			if (response && response.body) {
				const data = response.body;
				return new Hover(
					[{ language: 'typescript', value: data.displayString }, data.documentation],
					new Range(data.start.line - 1, data.start.offset - 1, data.end.line - 1, data.end.offset - 1));
			}
			return undefined;
		}, (err) => {
			this.client.error(`'quickinfo' request failed with error.`, err);
			return null;
		});
	}
}