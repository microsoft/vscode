/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionProvider, TextDocument, Position, CancellationToken, Location, SymbolDefinition } from 'vscode';
import * as Proto from '../protocol';

import DefinitionProviderBase from './definitionProviderBase';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

export default class TypeScriptDefinitionProvider extends DefinitionProviderBase implements DefinitionProvider {
	constructor(
		client: ITypeScriptServiceClient
	) {
		super(client);
	}

	public async provideDefinition() {
		// Implemented by provideDefinition2
		return undefined;
	}

	public async provideDefinition2(
		document: TextDocument,
		position: Position,
		token: CancellationToken | boolean
	): Promise<SymbolDefinition | Location[] | undefined> {
		if (this.client.apiVersion.has270Features()) {
			const filepath = this.client.normalizePath(document.uri);
			if (!filepath) {
				return undefined;
			}

			const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
			try {
				const response = await this.client.execute('definitionAndBoundSpan', args, token);
				const locations: Proto.FileSpan[] = (response && response.body && response.body.definitions) || [];
				if (!locations) {
					return [];
				}

				const span = response.body.textSpan ? typeConverters.Location.fromTextSpan(document.uri, response.body.textSpan) : undefined;
				return {
					definingSpan: span,
					definitions: locations
						.map(location => typeConverters.Location.fromTextSpan(this.client.asUrl(location.file), location))
						.filter(x => x) as Location[]
				};
			} catch {
				return [];
			}
		}

		return this.getSymbolLocations('definition', document, position, token);
	}
}