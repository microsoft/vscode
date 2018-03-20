/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentHighlightProvider, DocumentHighlight, DocumentHighlightKind, TextDocument, Position, Range, CancellationToken } from 'vscode';

import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

const stringDelimiters = ['"', '\'', '`'];

export default class TypeScriptDocumentHighlightProvider implements DocumentHighlightProvider {
	public constructor(
		private client: ITypeScriptServiceClient
	) { }

	public async provideDocumentHighlights(
		resource: TextDocument,
		position: Position,
		token: CancellationToken
	): Promise<DocumentHighlight[]> {
		const filepath = this.client.normalizePath(resource.uri);
		if (!filepath) {
			return [];
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		try {
			const response = await this.client.execute('occurrences', args, token);
			const data = response.body;
			if (data && data.length) {
				// Workaround for https://github.com/Microsoft/TypeScript/issues/12780
				// Don't highlight string occurrences
				const firstOccurrence = data[0];
				if (this.client.apiVersion.has213Features() && firstOccurrence.start.offset > 1) {
					// Check to see if contents around first occurrence are string delimiters
					const contents = resource.getText(new Range(firstOccurrence.start.line - 1, firstOccurrence.start.offset - 1 - 1, firstOccurrence.end.line - 1, firstOccurrence.end.offset - 1 + 1));
					if (contents && contents.length > 2 && stringDelimiters.indexOf(contents[0]) >= 0 && contents[0] === contents[contents.length - 1]) {
						return [];
					}
				}
				return data.map(item =>
					new DocumentHighlight(
						typeConverters.Range.fromTextSpan(item),
						item.isWriteAccess ? DocumentHighlightKind.Write : DocumentHighlightKind.Read));
			}
			return [];
		} catch {
			return [];
		}
	}
}