/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import { VersionDependentRegistration } from '../utils/versionDependentRegistration';
import DefinitionProviderBase from './definitionProviderBase';
import API from '../utils/api';

export default class TypeScriptTypeDefinitionProvider extends DefinitionProviderBase implements vscode.TypeDefinitionProvider {
	public provideTypeDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken | boolean): Promise<vscode.Definition | undefined> {
		return this.getSymbolLocations('typeDefinition', document, position, token);
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return new VersionDependentRegistration(client, {
		isSupportedVersion(api: API) {
			return api.has213Features();
		},
		register() {
			return vscode.languages.registerTypeDefinitionProvider(selector,
				new TypeScriptTypeDefinitionProvider(client));
		}
	});
}