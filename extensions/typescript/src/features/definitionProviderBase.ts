/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Position, CancellationToken, Location } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { tsTextSpanToVsRange, vsPositionToTsFileLocation } from '../utils/convert';

export default class TypeScriptDefinitionProviderBase {
	constructor(
		private client: ITypescriptServiceClient) { }

	protected getSymbolLocations(
		definitionType: 'definition' | 'implementation' | 'typeDefinition',
		document: TextDocument,
		position: Position,
		token: CancellationToken | boolean
	): Promise<Location[] | null> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return Promise.resolve(null);
		}
		const args = vsPositionToTsFileLocation(filepath, position);
		return this.client.execute(definitionType, args, token).then(response => {
			const locations: Proto.FileSpan[] = (response && response.body) || [];
			if (!locations || locations.length === 0) {
				return [];
			}
			return locations.map(location => {
				const resource = this.client.asUrl(location.file);
				if (resource === null) {
					return null;
				} else {
					return new Location(resource, tsTextSpanToVsRange(location));
				}
			}).filter(x => x !== null) as Location[];
		}, () => {
			return [];
		});
	}
}