/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten, coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { DefinitionLink, DefinitionProviderRegistry, ImplementationProviderRegistry, TypeDefinitionProviderRegistry, DeclarationProviderRegistry, ProviderResult } from 'vs/editor/common/modes';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';


function getDefinitions<T>(
	model: ITextModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	provide: (provider: T, model: ITextModel, position: Position) => ProviderResult<DefinitionLink | DefinitionLink[]>
): Promise<DefinitionLink[]> {
	const provider = registry.ordered(model);

	// get results
	const promises = provider.map((provider): Promise<DefinitionLink | DefinitionLink[] | null | undefined> => {
		return Promise.resolve(provide(provider, model, position)).then(undefined, err => {
			onUnexpectedExternalError(err);
			return null;
		});
	});
	return Promise.all(promises)
		.then(flatten)
		.then(coalesce);
}


export function getDefinitionsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<DefinitionLink[]> {
	return getDefinitions(model, position, DefinitionProviderRegistry, (provider, model, position) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getDeclarationsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<DefinitionLink[]> {
	return getDefinitions(model, position, DeclarationProviderRegistry, (provider, model, position) => {
		return provider.provideDeclaration(model, position, token);
	});
}

export function getImplementationsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<DefinitionLink[]> {
	return getDefinitions(model, position, ImplementationProviderRegistry, (provider, model, position) => {
		return provider.provideImplementation(model, position, token);
	});
}

export function getTypeDefinitionsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<DefinitionLink[]> {
	return getDefinitions(model, position, TypeDefinitionProviderRegistry, (provider, model, position) => {
		return provider.provideTypeDefinition(model, position, token);
	});
}

registerDefaultLanguageCommand('_executeDefinitionProvider', (model, position) => getDefinitionsAtPosition(model, position, CancellationToken.None));
registerDefaultLanguageCommand('_executeDeclarationProvider', (model, position) => getDeclarationsAtPosition(model, position, CancellationToken.None));
registerDefaultLanguageCommand('_executeImplementationProvider', (model, position) => getImplementationsAtPosition(model, position, CancellationToken.None));
registerDefaultLanguageCommand('_executeTypeDefinitionProvider', (model, position) => getTypeDefinitionsAtPosition(model, position, CancellationToken.None));
