/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';


export default class TypeScriptDefinitionProviderBase {
	constructor(
		protected readonly client: ITypeScriptServiceClient
	) { }

	protected async getSymbolLocations(
		definitionType: 'definition' | 'implementation' | 'typeDefinition',
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Location[] | undefined> {
		const filepath = this.client.toPath(document.uri);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);

		const response = await this.client.execute(definitionType, args, token);
		if (response.type !== 'response') {
			return undefined;
		}

		const locations: Proto.FileSpan[] = (response && response.body) || [];
		return locations.map(location =>
			typeConverters.Location.fromTextSpan(this.client.toResource(location.file), location));
	}
}