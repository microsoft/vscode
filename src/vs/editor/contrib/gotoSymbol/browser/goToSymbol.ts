/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { matchesSomeScheme, Schemas } from '../../../../base/common/network.js';
import { registerModelAndPositionCommand } from '../../../browser/editorExtensions.js';
import { Position } from '../../../common/core/position.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { DeclarationProvider, DefinitionProvider, ImplementationProvider, LocationLink, ProviderResult, ReferenceProvider, TypeDefinitionProvider } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ReferencesModel } from './referencesModel.js';

function shouldIncludeLocationLink(sourceModel: ITextModel, loc: LocationLink): boolean {
	// Always allow the location if the request comes from a document with the same scheme.
	if (loc.uri.scheme === sourceModel.uri.scheme) {
		return true;
	}

	// Otherwise filter out locations from internal schemes
	if (matchesSomeScheme(loc.uri, Schemas.walkThroughSnippet, Schemas.vscodeChatCodeBlock, Schemas.vscodeChatCodeCompareBlock)) {
		return false;
	}

	return true;
}

async function getLocationLinks<T>(
	model: ITextModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	recursive: boolean,
	provide: (provider: T, model: ITextModel, position: Position) => ProviderResult<LocationLink | LocationLink[]>
): Promise<LocationLink[]> {
	const provider = registry.ordered(model, recursive);

	// get results
	const promises = provider.map((provider): Promise<LocationLink | LocationLink[] | undefined> => {
		return Promise.resolve(provide(provider, model, position)).then(undefined, err => {
			onUnexpectedExternalError(err);
			return undefined;
		});
	});

	const values = await Promise.all(promises);
	return coalesce(values.flat()).filter(loc => shouldIncludeLocationLink(model, loc));
}

export function getDefinitionsAtPosition(registry: LanguageFeatureRegistry<DefinitionProvider>, model: ITextModel, position: Position, recursive: boolean, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, registry, recursive, (provider, model, position) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getDeclarationsAtPosition(registry: LanguageFeatureRegistry<DeclarationProvider>, model: ITextModel, position: Position, recursive: boolean, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, registry, recursive, (provider, model, position) => {
		return provider.provideDeclaration(model, position, token);
	});
}

export function getImplementationsAtPosition(registry: LanguageFeatureRegistry<ImplementationProvider>, model: ITextModel, position: Position, recursive: boolean, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, registry, recursive, (provider, model, position) => {
		return provider.provideImplementation(model, position, token);
	});
}

export function getTypeDefinitionsAtPosition(registry: LanguageFeatureRegistry<TypeDefinitionProvider>, model: ITextModel, position: Position, recursive: boolean, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, registry, recursive, (provider, model, position) => {
		return provider.provideTypeDefinition(model, position, token);
	});
}

export function getReferencesAtPosition(registry: LanguageFeatureRegistry<ReferenceProvider>, model: ITextModel, position: Position, compact: boolean, recursive: boolean, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, registry, recursive, async (provider, model, position) => {
		const result = (await provider.provideReferences(model, position, { includeDeclaration: true }, token))?.filter(ref => shouldIncludeLocationLink(model, ref));
		if (!compact || !result || result.length !== 2) {
			return result;
		}
		const resultWithoutDeclaration = (await provider.provideReferences(model, position, { includeDeclaration: false }, token))?.filter(ref => shouldIncludeLocationLink(model, ref));
		if (resultWithoutDeclaration && resultWithoutDeclaration.length === 1) {
			return resultWithoutDeclaration;
		}
		return result;
	});
}

// -- API commands ----

async function _sortedAndDeduped(callback: () => Promise<LocationLink[]>): Promise<LocationLink[]> {
	const rawLinks = await callback();
	const model = new ReferencesModel(rawLinks, '');
	const modelLinks = model.references.map(ref => ref.link);
	model.dispose();
	return modelLinks;
}

registerModelAndPositionCommand('_executeDefinitionProvider', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, position, false, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeDefinitionProvider_recursive', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, position, true, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeTypeDefinitionProvider', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, position, false, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeTypeDefinitionProvider_recursive', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, position, true, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeDeclarationProvider', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, position, false, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});
registerModelAndPositionCommand('_executeDeclarationProvider_recursive', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, position, true, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeReferenceProvider', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, false, false, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeReferenceProvider_recursive', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, false, true, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeImplementationProvider', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, position, false, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});

registerModelAndPositionCommand('_executeImplementationProvider_recursive', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const promise = getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, position, true, CancellationToken.None);
	return _sortedAndDeduped(() => promise);
});
