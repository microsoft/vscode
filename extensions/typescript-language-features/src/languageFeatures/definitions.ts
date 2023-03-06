/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import { DocumentSelector } from '../utils/documentSelector';
import * as typeConverters from '../utils/typeConverters';
import DefinitionProviderBase from './definitionProviderBase';

export default class TypeScriptDefinitionProvider extends DefinitionProviderBase implements vscode.DefinitionProvider {

	public async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.DefinitionLink[] | vscode.Definition | undefined> {
		const filepath = this.client.toOpenTsFilePath(document);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		const response = await this.client.execute('definitionAndBoundSpan', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const span = response.body.textSpan ? typeConverters.Range.fromTextSpan(response.body.textSpan) : undefined;
		return response.body.definitions
			.map((location): vscode.DefinitionLink => {
				const target = typeConverters.Location.fromTextSpan(this.client.toResource(location.file), location);
				if (location.contextStart && location.contextEnd) {
					return {
						originSelectionRange: span,
						targetRange: typeConverters.Range.fromLocations(location.contextStart, location.contextEnd),
						targetUri: target.uri,
						targetSelectionRange: target.range,
					};
				}
				return {
					originSelectionRange: span,
					targetRange: target.range,
					targetUri: target.uri
				};
			});
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.EnhancedSyntax, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerDefinitionProvider(selector.syntax,
			new TypeScriptDefinitionProvider(client));
	});
}
