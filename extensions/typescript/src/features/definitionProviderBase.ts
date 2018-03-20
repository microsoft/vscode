/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Position, CancellationToken, Location } from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

export default class TypeScriptDefinitionProviderBase {
	constructor(
		private client: ITypeScriptServiceClient
	) { }

	protected async getSymbolLocations(
		definitionType: 'definition' | 'implementation' | 'typeDefinition',
		document: TextDocument,
		position: Position,
		token: CancellationToken | boolean
	): Promise<Location[] | undefined> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.vsPositionToTsFileLocation(filepath, position);
		try {
			const response = await this.client.execute(definitionType, args, token);
			const locations: Proto.FileSpan[] = (response && response.body) || [];
			if (!locations || locations.length === 0) {
				return [];
			}
			return locations.map(location => {
				const resource = this.client.asUrl(location.file);
				return resource
					? new Location(resource, typeConverters.Range.fromTextSpan(location))
					: undefined;
			}).filter(x => x) as Location[];
		} catch {
			return [];
		}
	}
}