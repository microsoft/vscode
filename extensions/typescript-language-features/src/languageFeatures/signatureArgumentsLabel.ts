/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import { Position } from '../utils/typeConverters';

class TypeScriptSginatureArgumentsLabelProvider implements vscode.SignatureArgumentsLabelProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideSignatureArgumentsLabels(model: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SignautreArgumentsLabel[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		try {
			const response = await this.client.execute('provideSignatureArgumentsLabel', { file: filepath }, token);
			if (response.type !== 'response' || !response.success || !response.body) {
				return [];
			}

			const labels = response.body.map(label => {
				return new vscode.SignautreArgumentsLabel(label.name, Position.fromLocation(label.position));
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
		return vscode.languages.registerSignatureArgumentsLabelProvider(selector.semantic,
			new TypeScriptSginatureArgumentsLabelProvider(client));
	});
}
