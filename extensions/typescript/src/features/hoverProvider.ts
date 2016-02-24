/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { HoverProvider, Hover, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptHoverProvider implements HoverProvider {

	private client: ITypescriptServiceClient;

	public constructor(client: ITypescriptServiceClient) {
		this.client = client;
	}

	public provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover> {
		let args: Proto.FileLocationRequestArgs = {
			file: this.client.asAbsolutePath(document.uri),
			line: position.line + 1,
			offset: position.character + 1
		};
		if (!args.file) {
			return Promise.resolve<Hover>(null);
		}
		return this.client.execute('quickinfo', args, token).then((response): Hover => {
			let data = response.body;
			if (data) {
				return new Hover(
					[data.documentation, { language: 'typescript', value: data.displayString }],
					new Range(data.start.line - 1, data.start.offset - 1, data.end.line - 1, data.end.offset - 1));
			}
		}, (err) => {
			return null;
		});
	}
}