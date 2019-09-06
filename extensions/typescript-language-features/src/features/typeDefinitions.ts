/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import DefinitionProviderBase from './definitionProviderBase';

export default class TypeScriptTypeDefinitionProvider extends DefinitionProviderBase implements vscode.TypeDefinitionProvider {
	public static readonly minVersion = API.v213;

	public provideTypeDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition | undefined> {
		return this.getSymbolLocations('typeDefinition', document, position, token);
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return new VersionDependentRegistration(client, TypeScriptTypeDefinitionProvider.minVersion, () => {
		return vscode.languages.registerTypeDefinitionProvider(selector,
			new TypeScriptTypeDefinitionProvider(client));
	});
}