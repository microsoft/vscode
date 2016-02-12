/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { DocumentHighlightProvider, DocumentHighlight, DocumentHighlightKind, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';


export default class TypeScriptDocumentHighlightProvider implements DocumentHighlightProvider {

	private client: ITypescriptServiceClient;

	public constructor(client: ITypescriptServiceClient) {
		this.client = client;
	}

	public provideDocumentHighlights(resource: TextDocument, position: Position, token: CancellationToken): Promise<DocumentHighlight[]> {
		let args: Proto.FileLocationRequestArgs = {
			file: this.client.asAbsolutePath(resource.uri),
			line: position.line + 1,
			offset: position.character + 1
		};
		if (!args.file) {
			return Promise.resolve<DocumentHighlight[]>([]);
		}
		return this.client.execute('occurrences', args, token).then((response): DocumentHighlight[] => {
			let data = response.body;
			if (data) {
				return data.map((item) => {
					return new DocumentHighlight(new Range(item.start.line - 1, item.start.offset - 1, item.end.line - 1, item.end.offset - 1),
						item.isWriteAccess ? DocumentHighlightKind.Write : DocumentHighlightKind.Read);
				});
			}
		}, (err) => {
			return [];
		});
	}
}