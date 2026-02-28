/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../common/model.js';
import { DocumentSemanticTokensProvider, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend, DocumentRangeSemanticTokensProvider } from '../../../common/languages.js';
import { IModelService } from '../../../common/services/model.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { assertType } from '../../../../base/common/types.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { encodeSemanticTokensDto } from '../../../common/services/semanticTokensDto.js';
import { Range } from '../../../common/core/range.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';

export function isSemanticTokens(v: SemanticTokens | SemanticTokensEdits): v is SemanticTokens {
	return v && !!((<SemanticTokens>v).data);
}

export function isSemanticTokensEdits(v: SemanticTokens | SemanticTokensEdits): v is SemanticTokensEdits {
	return v && Array.isArray((<SemanticTokensEdits>v).edits);
}

export class DocumentSemanticTokensResult {
	constructor(
		public readonly provider: DocumentSemanticTokensProvider,
		public readonly tokens: SemanticTokens | SemanticTokensEdits | null,
		public readonly error: unknown
	) { }
}

export function hasDocumentSemanticTokensProvider(registry: LanguageFeatureRegistry<DocumentSemanticTokensProvider>, model: ITextModel): boolean {
	return registry.has(model);
}

function getDocumentSemanticTokensProviders(registry: LanguageFeatureRegistry<DocumentSemanticTokensProvider>, model: ITextModel): DocumentSemanticTokensProvider[] {
	const groups = registry.orderedGroups(model);
	return (groups.length > 0 ? groups[0] : []);
}

export async function getDocumentSemanticTokens(registry: LanguageFeatureRegistry<DocumentSemanticTokensProvider>, model: ITextModel, lastProvider: DocumentSemanticTokensProvider | null, lastResultId: string | null, token: CancellationToken): Promise<DocumentSemanticTokensResult | null> {
	const providers = getDocumentSemanticTokensProviders(registry, model);

	// Get tokens from all providers at the same time.
	const results = await Promise.all(providers.map(async (provider) => {
		let result: SemanticTokens | SemanticTokensEdits | null | undefined;
		let error: unknown = null;
		try {
			result = await provider.provideDocumentSemanticTokens(model, (provider === lastProvider ? lastResultId : null), token);
		} catch (err) {
			error = err;
			result = null;
		}

		if (!result || (!isSemanticTokens(result) && !isSemanticTokensEdits(result))) {
			result = null;
		}

		return new DocumentSemanticTokensResult(provider, result, error);
	}));

	// Try to return the first result with actual tokens or
	// the first result which threw an error (!!)
	for (const result of results) {
		if (result.error) {
			throw result.error;
		}
		if (result.tokens) {
			return result;
		}
	}

	// Return the first result, even if it doesn't have tokens
	if (results.length > 0) {
		return results[0];
	}

	return null;
}

function _getDocumentSemanticTokensProviderHighestGroup(registry: LanguageFeatureRegistry<DocumentSemanticTokensProvider>, model: ITextModel): DocumentSemanticTokensProvider[] | null {
	const result = registry.orderedGroups(model);
	return (result.length > 0 ? result[0] : null);
}

class DocumentRangeSemanticTokensResult {
	constructor(
		public readonly provider: DocumentRangeSemanticTokensProvider,
		public readonly tokens: SemanticTokens | null,
	) { }
}

export function hasDocumentRangeSemanticTokensProvider(providers: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>, model: ITextModel): boolean {
	return providers.has(model);
}

function getDocumentRangeSemanticTokensProviders(providers: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>, model: ITextModel): DocumentRangeSemanticTokensProvider[] {
	const groups = providers.orderedGroups(model);
	return (groups.length > 0 ? groups[0] : []);
}

export async function getDocumentRangeSemanticTokens(registry: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>, model: ITextModel, range: Range, token: CancellationToken): Promise<DocumentRangeSemanticTokensResult | null> {
	const providers = getDocumentRangeSemanticTokensProviders(registry, model);

	// Get tokens from all providers at the same time.
	const results = await Promise.all(providers.map(async (provider) => {
		let result: SemanticTokens | null | undefined;
		try {
			result = await provider.provideDocumentRangeSemanticTokens(model, range, token);
		} catch (err) {
			onUnexpectedExternalError(err);
			result = null;
		}

		if (!result || !isSemanticTokens(result)) {
			result = null;
		}

		return new DocumentRangeSemanticTokensResult(provider, result);
	}));

	// Try to return the first result with actual tokens
	for (const result of results) {
		if (result.tokens) {
			return result;
		}
	}

	// Return the first result, even if it doesn't have tokens
	if (results.length > 0) {
		return results[0];
	}

	return null;
}

CommandsRegistry.registerCommand('_provideDocumentSemanticTokensLegend', async (accessor, ...args): Promise<SemanticTokensLegend | undefined> => {
	const [uri] = args;
	assertType(uri instanceof URI);

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}
	const { documentSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);

	const providers = _getDocumentSemanticTokensProviderHighestGroup(documentSemanticTokensProvider, model);
	if (!providers) {
		// there is no provider => fall back to a document range semantic tokens provider
		return accessor.get(ICommandService).executeCommand('_provideDocumentRangeSemanticTokensLegend', uri);
	}

	return providers[0].getLegend();
});

CommandsRegistry.registerCommand('_provideDocumentSemanticTokens', async (accessor, ...args): Promise<VSBuffer | undefined> => {
	const [uri] = args;
	assertType(uri instanceof URI);

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}
	const { documentSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);
	if (!hasDocumentSemanticTokensProvider(documentSemanticTokensProvider, model)) {
		// there is no provider => fall back to a document range semantic tokens provider
		return accessor.get(ICommandService).executeCommand('_provideDocumentRangeSemanticTokens', uri, model.getFullModelRange());
	}

	const r = await getDocumentSemanticTokens(documentSemanticTokensProvider, model, null, null, CancellationToken.None);
	if (!r) {
		return undefined;
	}

	const { provider, tokens } = r;

	if (!tokens || !isSemanticTokens(tokens)) {
		return undefined;
	}

	const buff = encodeSemanticTokensDto({
		id: 0,
		type: 'full',
		data: tokens.data
	});
	if (tokens.resultId) {
		provider.releaseDocumentSemanticTokens(tokens.resultId);
	}
	return buff;
});

CommandsRegistry.registerCommand('_provideDocumentRangeSemanticTokensLegend', async (accessor, ...args): Promise<SemanticTokensLegend | undefined> => {
	const [uri, range] = args;
	assertType(uri instanceof URI);

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}
	const { documentRangeSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);
	const providers = getDocumentRangeSemanticTokensProviders(documentRangeSemanticTokensProvider, model);
	if (providers.length === 0) {
		// no providers
		return undefined;
	}

	if (providers.length === 1) {
		// straight forward case, just a single provider
		return providers[0].getLegend();
	}

	if (!range || !Range.isIRange(range)) {
		// if no range is provided, we cannot support multiple providers
		// as we cannot fall back to the one which would give results
		// => return the first legend for backwards compatibility and print a warning
		console.warn(`provideDocumentRangeSemanticTokensLegend might be out-of-sync with provideDocumentRangeSemanticTokens unless a range argument is passed in`);
		return providers[0].getLegend();
	}

	const result = await getDocumentRangeSemanticTokens(documentRangeSemanticTokensProvider, model, Range.lift(range), CancellationToken.None);
	if (!result) {
		return undefined;
	}

	return result.provider.getLegend();
});

CommandsRegistry.registerCommand('_provideDocumentRangeSemanticTokens', async (accessor, ...args): Promise<VSBuffer | undefined> => {
	const [uri, range] = args;
	assertType(uri instanceof URI);
	assertType(Range.isIRange(range));

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}
	const { documentRangeSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);

	const result = await getDocumentRangeSemanticTokens(documentRangeSemanticTokensProvider, model, Range.lift(range), CancellationToken.None);
	if (!result || !result.tokens) {
		// there is no provider or it didn't return tokens
		return undefined;
	}

	return encodeSemanticTokensDto({
		id: 0,
		type: 'full',
		data: result.tokens.data
	});
});
