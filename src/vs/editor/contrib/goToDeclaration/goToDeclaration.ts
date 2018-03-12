/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITextModel } from 'vs/editor/common/model';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import { DefinitionProviderRegistry, ImplementationProviderRegistry, TypeDefinitionProviderRegistry, Location, DefinitionProvider, ImplementationProvider, TypeDefinitionProvider } from 'vs/editor/common/modes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';
import { flatten } from 'vs/base/common/arrays';

export interface DefintionsResult<T> {
	firstProvider: T | undefined;
	definitions: Location[];
}

function getDefinitions<T>(
	model: ITextModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	provide: (provider: T, model: ITextModel, position: Position, token: CancellationToken) => Location | Location[] | Thenable<Location | Location[]>
): TPromise<DefintionsResult<T>> {
	const provider = registry.ordered(model);
	let firstProvider: T;

	// get results
	const promises = provider.map((provider, idx) => {
		return asWinJsPromise((token) => {
			return provide(provider, model, position, token);
		})
			.then<Location | Location[]>(undefined, err => {
				onUnexpectedExternalError(err);
				return null;
			}).then(locations => {
				if (!firstProvider) {
					if ((Array.isArray(locations) && locations.length) || locations) {
						firstProvider = provider;
					}
				}
				return locations;
			});
	});
	return TPromise.join(promises)
		.then(flatten)
		.then(locations => locations.filter(x => !!x))
		.then(locations => ({
			definitions: locations,
			firstProvider
		}));
}

export function getDefinitionsAtPosition(model: ITextModel, position: Position): TPromise<DefintionsResult<DefinitionProvider>> {
	return getDefinitions(model, position, DefinitionProviderRegistry, (provider, model, position, token) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getImplementationsAtPosition(model: ITextModel, position: Position): TPromise<DefintionsResult<ImplementationProvider>> {
	return getDefinitions(model, position, ImplementationProviderRegistry, (provider, model, position, token) => {
		return provider.provideImplementation(model, position, token);
	});
}

export function getTypeDefinitionsAtPosition(model: ITextModel, position: Position): TPromise<DefintionsResult<TypeDefinitionProvider>> {
	return getDefinitions(model, position, TypeDefinitionProviderRegistry, (provider, model, position, token) => {
		return provider.provideTypeDefinition(model, position, token);
	});
}

registerDefaultLanguageCommand('_executeDefinitionProvider', (model: ITextModel, position: Position) =>
	getDefinitionsAtPosition(model, position).then(result => result.definitions));

registerDefaultLanguageCommand('_executeImplementationProvider', (model: ITextModel, position: Position) =>
	getImplementationsAtPosition(model, position).then(result => result.definitions));

registerDefaultLanguageCommand('_executeTypeDefinitionProvider', (model: ITextModel, position: Position) =>
	getTypeDefinitionsAtPosition(model, position).then(result => result.definitions));
