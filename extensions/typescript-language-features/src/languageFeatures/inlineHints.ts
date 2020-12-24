/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import { Position } from '../utils/typeConverters';

class TypeScriptInlineHintsProvider implements vscode.InlineHintsProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideInlineHints(model: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlineHint[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;

		try {
			const response = await this.client.execute('provideInlineHints', { file: filepath, start, length }, token);
			if (response.type !== 'response' || !response.success || !response.body) {
				return [];
			}

			const labels = response.body.map(label => {
				return new vscode.InlineHint(label.text, Position.fromLocation(label.position));
			});
			return labels;
		} catch (e) {
			return [];
		}
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerInlineHintsProvider(selector.semantic,
			new TypeScriptInlineHintsProvider(client));
	});
}
