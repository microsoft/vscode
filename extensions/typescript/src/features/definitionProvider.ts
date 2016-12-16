/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { DefinitionProvider, TextDocument, Position, Range, CancellationToken, Definition, Location } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptDefinitionProvider implements DefinitionProvider {

	private definitionType: 'definition' | 'implementation';
	private client: ITypescriptServiceClient;

	public tokens: string[] = [];

	constructor(definitionType: 'definition' | 'implementation', client: ITypescriptServiceClient) {
		this.definitionType = definitionType;
		this.client = client;
	}

	public provideDefinition(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition | null> {
		const filepath = this.client.asAbsolutePath(document.uri);
		if (!filepath) {
			return Promise.resolve(null);
		}
		let args: Proto.FileLocationRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1
		};
		if (!args.file) {
			return Promise.resolve(null);
		}
		return this.client.execute(this.definitionType, args, token).then(response => {
			let locations: Proto.FileSpan[] = (response && response.body) || [];
			if (!locations || locations.length === 0) {
				return [] as Definition;
			}
			return locations.map(location => {
				let resource = this.client.asUrl(location.file);
				if (resource === null) {
					return null;
				} else {
					return new Location(resource, new Range(location.start.line - 1, location.start.offset - 1, location.end.line - 1, location.end.offset - 1));
				}
			}).filter(x => x !== null) as Location[];
		}, (error) => {
			this.client.error(`'${this.definitionType}' request failed with error.`, error);
			return [] as Definition;
		});
	}
}