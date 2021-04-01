/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { extUri } from 'vs/base/common/resources';
import { registerModelAndPositionCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { Location, LocationLink, DefinitionProviderRegistry, ImplementationProviderRegistry, TypeDefinitionProviderRegistry, DeclarationProviderRegistry, ProviderResult, ReferenceProviderRegistry } from 'vs/editor/common/modes';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';


function getLocationLinks<T>(
	model: ITextModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	provide: (provider: T, model: ITextModel, position: Position) => ProviderResult<LocationLink | LocationLink[]>
): Promise<LocationLink[]> {
	const provider = registry.ordered(model);

	// get results
	const promises = provider.map((provider): Promise<LocationLink | LocationLink[] | undefined> => {
		return Promise.resolve(provide(provider, model, position)).then(undefined, err => {
			onUnexpectedExternalError(err);
			return undefined;
		});
	});

	return Promise.all(promises).then(values => {
		const result: LocationLink[] = [];
		for (let value of values) {
			if (Array.isArray(value)) {
				result.push(...value);
			} else if (value) {
				result.push(value);
			}
		}

		return sortAndDeduplicate(result);
	});
}


export function getDefinitionsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, DefinitionProviderRegistry, (provider, model, position) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getDeclarationsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, DeclarationProviderRegistry, (provider, model, position) => {
		return provider.provideDeclaration(model, position, token);
	});
}

export function getImplementationsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, ImplementationProviderRegistry, (provider, model, position) => {
		return provider.provideImplementation(model, position, token);
	});
}

export function getTypeDefinitionsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, TypeDefinitionProviderRegistry, (provider, model, position) => {
		return provider.provideTypeDefinition(model, position, token);
	});
}

export function getReferencesAtPosition(model: ITextModel, position: Position, compact: boolean, token: CancellationToken): Promise<LocationLink[]> {
	return getLocationLinks(model, position, ReferenceProviderRegistry, async (provider, model, position) => {
		const result = await provider.provideReferences(model, position, { includeDeclaration: true }, token);
		if (!compact || !result || result.length !== 2) {
			return result;
		}
		const resultWithoutDeclaration = await provider.provideReferences(model, position, { includeDeclaration: false }, token);
		if (resultWithoutDeclaration && resultWithoutDeclaration.length === 1) {
			return resultWithoutDeclaration;
		}
		return result;
	});
}

export function sortAndDeduplicate(locations: Location[]): Location[] {
	const result: LocationLink[] = [];
	let last: LocationLink | undefined;
	for (const link of locations.sort(compareLocations)) {
		if (last === undefined || compareLocations(last, link) !== 0) {
			result.push(link);
			last = link;
		}
	}
	return result;
}

function compareLocations(a: Location, b: Location): number {
	return extUri.compare(a.uri, b.uri) || Range.compareRangesUsingStarts(a.range, b.range);
}

registerModelAndPositionCommand('_executeDefinitionProvider', (model, position) => getDefinitionsAtPosition(model, position, CancellationToken.None));
registerModelAndPositionCommand('_executeDeclarationProvider', (model, position) => getDeclarationsAtPosition(model, position, CancellationToken.None));
registerModelAndPositionCommand('_executeImplementationProvider', (model, position) => getImplementationsAtPosition(model, position, CancellationToken.None));
registerModelAndPositionCommand('_executeTypeDefinitionProvider', (model, position) => getTypeDefinitionsAtPosition(model, position, CancellationToken.None));
registerModelAndPositionCommand('_executeReferenceProvider', (model, position) => getReferencesAtPosition(model, position, false, CancellationToken.None));
