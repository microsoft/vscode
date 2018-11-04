/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';



class TypeScriptDocumentHighlightProvider implements vscode.DocumentHighlightProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideDocumentHighlights(
		resource: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentHighlight[]> {
		const file = this.client.toPath(resource.uri);
		if (!file) {
			return [];
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(file, position);
		const response = await this.client.execute('occurrences', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		return response.body
			.filter(x => !x.isInString)
			.map(documentHighlightFromOccurance);
	}
}

function documentHighlightFromOccurance(occurrence: Proto.OccurrencesResponseItem): vscode.DocumentHighlight {
	return new vscode.DocumentHighlight(
		typeConverters.Range.fromTextSpan(occurrence),
		occurrence.isWriteAccess ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read);
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return vscode.languages.registerDocumentHighlightProvider(selector,
		new TypeScriptDocumentHighlightProvider(client));
}