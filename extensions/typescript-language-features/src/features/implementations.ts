/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import DefinitionProviderBase from './definitionProviderBase';

class TypeScriptImplementationProvider extends DefinitionProviderBase implements vscode.ImplementationProvider {
	public static readonly minVersion = API.v220;

	public provideImplementation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition | undefined> {
		return this.getSymbolLocations('implementation', document, position, token);
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return new VersionDependentRegistration(client, TypeScriptImplementationProvider.minVersion, () => {
		return vscode.languages.registerImplementationProvider(selector,
			new TypeScriptImplementationProvider(client));
	});
}