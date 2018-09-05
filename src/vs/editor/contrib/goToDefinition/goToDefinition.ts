/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten, coalesce } from 'vs/base/common/arrays';
import { asWinJsPromise, asThenable } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { DefinitionLink, DefinitionProviderRegistry, ImplementationProviderRegistry, TypeDefinitionProviderRegistry } from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

function getDefinitions<T>(
	model: ITextModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	provide: (provider: T, model: ITextModel, position: Position, token: CancellationToken) => DefinitionLink | DefinitionLink[] | Thenable<DefinitionLink | DefinitionLink[]>
): TPromise<DefinitionLink[]> {
	const provider = registry.ordered(model);

	// get results
	const promises = provider.map((provider): TPromise<DefinitionLink | DefinitionLink[]> => {
		return asWinJsPromise((token) => {
			return provide(provider, model, position, token);
		}).then(undefined, err => {
			onUnexpectedExternalError(err);
			return null;
		});
	});
	return TPromise.join(promises)
		.then(flatten)
		.then(references => coalesce(references));
}

function getDefinitions2<T>(
	model: ITextModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	provide: (provider: T, model: ITextModel, position: Position) => DefinitionLink | DefinitionLink[] | Thenable<DefinitionLink | DefinitionLink[]>
): Thenable<DefinitionLink[]> {
	const provider = registry.ordered(model);

	// get results
	const promises = provider.map((provider): Thenable<DefinitionLink | DefinitionLink[]> => {
		return asThenable(() => {
			return provide(provider, model, position);
		}).then(undefined, err => {
			onUnexpectedExternalError(err);
			return null;
		});
	});
	return TPromise.join(promises)
		.then(flatten)
		.then(references => coalesce(references));
}


export function getDefinitionsAtPosition(model: ITextModel, position: Position): TPromise<DefinitionLink[]> {
	return getDefinitions(model, position, DefinitionProviderRegistry, (provider, model, position, token) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getDefinitionsAtPosition2(model: ITextModel, position: Position, token: CancellationToken): Thenable<DefinitionLink[]> {
	return getDefinitions2(model, position, DefinitionProviderRegistry, (provider, model, position) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getImplementationsAtPosition(model: ITextModel, position: Position): TPromise<DefinitionLink[]> {
	return getDefinitions(model, position, ImplementationProviderRegistry, (provider, model, position, token) => {
		return provider.provideImplementation(model, position, token);
	});
}

export function getTypeDefinitionsAtPosition(model: ITextModel, position: Position): TPromise<DefinitionLink[]> {
	return getDefinitions(model, position, TypeDefinitionProviderRegistry, (provider, model, position, token) => {
		return provider.provideTypeDefinition(model, position, token);
	});
}

registerDefaultLanguageCommand('_executeDefinitionProvider', getDefinitionsAtPosition);
registerDefaultLanguageCommand('_executeImplementationProvider', getImplementationsAtPosition);
registerDefaultLanguageCommand('_executeTypeDefinitionProvider', getTypeDefinitionsAtPosition);
