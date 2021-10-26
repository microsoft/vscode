/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentSemanticTokensProviderRegistry, DocumentSemanticTokensProvider, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend, DocumentRangeSemanticTokensProviderRegistry, DocumentRangeSemanticTokensProvider } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { assertType } from 'vs/base/common/types';
import { VSBuffer } from 'vs/base/common/buffer';
import { encodeSemanticTokensDto } from 'vs/editor/common/services/semanticTokensDto';
import { Range } from 'vs/editor/common/core/range';

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
	) { }
}

export function hasDocumentSemanticTokensProvider(model: ITextModel): boolean {
	return DocumentSemanticTokensProviderRegistry.has(model);
}

function getDocumentSemanticTokensProviders(model: ITextModel): DocumentSemanticTokensProvider[] {
	const groups = DocumentSemanticTokensProviderRegistry.orderedGroups(model);
	return (groups.length > 0 ? groups[0] : []);
}

export async function getDocumentSemanticTokens(model: ITextModel, lastProvider: DocumentSemanticTokensProvider | null, lastResultId: string | null, token: CancellationToken): Promise<DocumentSemanticTokensResult | null> {
	const providers = getDocumentSemanticTokensProviders(model);

	// Get tokens from all providers at the same time.
	const results = await Promise.all(providers.map(async (provider) => {
		let result: SemanticTokens | SemanticTokensEdits | null | undefined;
		try {
			result = await provider.provideDocumentSemanticTokens(model, (provider === lastProvider ? lastResultId : null), token);
		} catch (err) {
			onUnexpectedExternalError(err);
			result = null;
		}

		if (!result || (!isSemanticTokens(result) && !isSemanticTokensEdits(result))) {
			result = null;
		}

		return new DocumentSemanticTokensResult(provider, result);
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

function _getDocumentSemanticTokensProviderHighestGroup(model: ITextModel): DocumentSemanticTokensProvider[] | null {
	const result = DocumentSemanticTokensProviderRegistry.orderedGroups(model);
	return (result.length > 0 ? result[0] : null);
}

class DocumentRangeSemanticTokensResult {
	constructor(
		public readonly provider: DocumentRangeSemanticTokensProvider,
		public readonly tokens: SemanticTokens | null,
	) { }
}

export function hasDocumentRangeSemanticTokensProvider(model: ITextModel): boolean {
	return DocumentRangeSemanticTokensProviderRegistry.has(model);
}

function getDocumentRangeSemanticTokensProviders(model: ITextModel): DocumentRangeSemanticTokensProvider[] {
	const groups = DocumentRangeSemanticTokensProviderRegistry.orderedGroups(model);
	return (groups.length > 0 ? groups[0] : []);
}

export async function getDocumentRangeSemanticTokens(model: ITextModel, range: Range, token: CancellationToken): Promise<DocumentRangeSemanticTokensResult | null> {
	const providers = getDocumentRangeSemanticTokensProviders(model);

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

	const providers = _getDocumentSemanticTokensProviderHighestGroup(model);
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

	if (!hasDocumentSemanticTokensProvider(model)) {
		// there is no provider => fall back to a document range semantic tokens provider
		return accessor.get(ICommandService).executeCommand('_provideDocumentRangeSemanticTokens', uri, model.getFullModelRange());
	}

	const r = await getDocumentSemanticTokens(model, null, null, CancellationToken.None);
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

	const providers = getDocumentRangeSemanticTokensProviders(model);
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

	const result = await getDocumentRangeSemanticTokens(model, Range.lift(range), CancellationToken.None);
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

	const result = await getDocumentRangeSemanticTokens(model, Range.lift(range), CancellationToken.None);
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
