/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import DefinitionProviderBase from './definitionProviderBase';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

class TypeScriptImplementationProvider extends DefinitionProviderBase implements vscode.ImplementationProvider {
	public provideImplementation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition | undefined> {
		return this.getSymbolLocations('implementation', document, position, token);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerImplementationProvider(selector.semantic,
			new TypeScriptImplementationProvider(client));
	});
}
