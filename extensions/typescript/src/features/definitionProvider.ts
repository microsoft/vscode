/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionProvider, TextDocument, Position, CancellationToken, Definition, DefinitionContext } from 'vscode';

import DefinitionProviderBase from './definitionProviderBase';
import { vsPositionToTsFileLocation, tsTextSpanToVsRange } from '../utils/convert';

export default class TypeScriptDefinitionProvider extends DefinitionProviderBase implements DefinitionProvider {
	public provideDefinition(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition | undefined> {
		return this.getSymbolLocations('definition', document, position, token);
	}

	async resolveDefinitionContext(
		document: TextDocument,
		position: Position,
		token: CancellationToken
	): Promise<DefinitionContext | undefined> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return undefined;
		}

		const args = vsPositionToTsFileLocation(filepath, position);
		try {
			const response = await this.client.execute('definitionAndBoundSpan', args, token);
			if (response && response.body && response.body.textSpan) {
				return {
					definingSymbolRange: tsTextSpanToVsRange(response.body.textSpan)
				};
			}
		} catch {
			// noop
		}

		return undefined;
	}
}