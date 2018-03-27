/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentHighlightProvider, DocumentHighlight, DocumentHighlightKind, TextDocument, Position, CancellationToken } from 'vscode';

import * as Proto from '../protocol';

import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

export default class TypeScriptDocumentHighlightProvider implements DocumentHighlightProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideDocumentHighlights(
		resource: TextDocument,
		position: Position,
		token: CancellationToken
	): Promise<DocumentHighlight[]> {
		const file = this.client.normalizePath(resource.uri);
		if (!file) {
			return [];
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(file, position);
		try {
			const response = await this.client.execute('occurrences', args, token);
			if (response && response.body) {
				return response.body
					.filter(x => !x.isInString)
					.map(documentHighlightFromOccurance);
			}
		} catch {
			// noop
		}

		return [];
	}
}

function documentHighlightFromOccurance(occurrence: Proto.OccurrencesResponseItem): DocumentHighlight {
	return new DocumentHighlight(
		typeConverters.Range.fromTextSpan(occurrence),
		occurrence.isWriteAccess ? DocumentHighlightKind.Write : DocumentHighlightKind.Read);
}