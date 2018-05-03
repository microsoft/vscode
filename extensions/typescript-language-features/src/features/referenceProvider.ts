/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ReferenceProvider, Location, TextDocument, Position, CancellationToken } from 'vscode';

import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

export default class TypeScriptReferenceSupport implements ReferenceProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient) { }

	public async provideReferences(
		document: TextDocument,
		position: Position,
		options: { includeDeclaration: boolean },
		token: CancellationToken
	): Promise<Location[]> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return [];
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		try {
			const msg = await this.client.execute('references', args, token);
			if (!msg.body) {
				return [];
			}
			const result: Location[] = [];
			const has203Features = this.client.apiVersion.has203Features();
			for (const ref of msg.body.refs) {
				if (!options.includeDeclaration && has203Features && ref.isDefinition) {
					continue;
				}
				const url = this.client.asUrl(ref.file);
				const location = typeConverters.Location.fromTextSpan(url, ref);
				result.push(location);
			}
			return result;
		} catch {
			return [];
		}
	}
}