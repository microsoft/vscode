/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { DocumentHighlightProvider, DocumentHighlight, DocumentHighlightKind, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';


export default class TypeScriptDocumentHighlightProvider implements DocumentHighlightProvider {
	public constructor(
		private client: ITypescriptServiceClient) { }

	public provideDocumentHighlights(resource: TextDocument, position: Position, token: CancellationToken): Promise<DocumentHighlight[]> {
		const filepath = this.client.normalizePath(resource.uri);
		if (!filepath) {
			return Promise.resolve<DocumentHighlight[]>([]);
		}
		const args: Proto.FileLocationRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1
		};
		return this.client.execute('occurrences', args, token).then((response): DocumentHighlight[] => {
			let data = response.body;
			if (data && data.length) {
				// Workaround for https://github.com/Microsoft/TypeScript/issues/12780
				// Don't highlight string occurrences
				const firstOccurrence = data[0];
				if (this.client.apiVersion.has213Features() && firstOccurrence.start.offset > 1) {
					// Check to see if contents around first occurrence are string delimiters
					const contents = resource.getText(new Range(firstOccurrence.start.line - 1, firstOccurrence.start.offset - 1 - 1, firstOccurrence.end.line - 1, firstOccurrence.end.offset - 1 + 1));
					const stringDelimiters = ['"', '\'', '`'];
					if (contents && contents.length > 2 && stringDelimiters.indexOf(contents[0]) >= 0 && contents[0] === contents[contents.length - 1]) {
						return [];
					}
				}
				return data.map((item) => {
					return new DocumentHighlight(new Range(item.start.line - 1, item.start.offset - 1, item.end.line - 1, item.end.offset - 1),
						item.isWriteAccess ? DocumentHighlightKind.Write : DocumentHighlightKind.Read);
				});
			}
			return [];
		}, (err) => {
			this.client.error(`'occurrences' request failed with error.`, err);
			return [];
		});
	}
}