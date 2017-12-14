/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionProvider, TextDocument, Position, CancellationToken, Location, DefinitionAndSpan } from 'vscode';
import * as Proto from '../protocol';

import DefinitionProviderBase from './definitionProviderBase';
import { ITypeScriptServiceClient } from '../typescriptService';
import { vsPositionToTsFileLocation, tsFileSpanToVsLocation, tsTextSpanToVsRange } from '../utils/convert';

export default class TypeScriptDefinitionProvider extends DefinitionProviderBase implements DefinitionProvider {
	constructor(
		client: ITypeScriptServiceClient
	) {
		super(client);
	}

	public async provideDefinition(
		document: TextDocument,
		position: Position,
		token: CancellationToken | boolean
	): Promise<DefinitionAndSpan | Location[] | undefined> {
		if (this.client.apiVersion.has270Features()) {
			const filepath = this.client.normalizePath(document.uri);
			if (!filepath) {
				return undefined;
			}

			const args = vsPositionToTsFileLocation(filepath, position);
			try {
				const response = await this.client.execute('definitionAndBoundSpan', args, token);
				const locations: Proto.FileSpan[] = (response && response.body && response.body.definitions) || [];
				if (!locations) {
					return [];
				}
				const span = new Location(document.uri, tsTextSpanToVsRange(response.body.textSpan));

				if (!span) {
					return [];
				}

				return new DefinitionAndSpan(span,
					locations
						.map(location => tsFileSpanToVsLocation(this.client, location))
						.filter(x => x) as Location[]);
			} catch {
				return [];
			}
		}

		return this.getSymbolLocations('definition', document, position, token);
	}
}