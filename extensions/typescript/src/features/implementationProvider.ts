/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ImplementationProvider, TextDocument, Position, CancellationToken, Definition } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';
import DefinitionProviderBase from './definitionProviderBase';

export default class TypeScriptImplementationProvider extends DefinitionProviderBase implements ImplementationProvider {

	constructor(client: ITypescriptServiceClient) {
		super(client);
	}

	public provideImplementation(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition | null> {
		return this.getSymbolLocations('implementation', document, position, token);
	}
}