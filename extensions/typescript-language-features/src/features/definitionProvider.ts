/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionProvider, TextDocument, Position, CancellationToken, Definition } from 'vscode';

import DefinitionProviderBase from './definitionProviderBase';

export default class TypeScriptDefinitionProvider extends DefinitionProviderBase implements DefinitionProvider {
	public provideDefinition(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition | undefined> {
		return this.getSymbolLocations('definition', document, position, token);
	}
}