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

export interface IDocumentSemanticTokensResult {
	provider: DocumentSemanticTokensProvider;
	request: Promise<SemanticTokens | SemanticTokensEdits | null | undefined>;
}

export function getDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): IDocumentSemanticTokensResult | null {
	const provider = _getDocumentSemanticTokensProvider(model);
	if (!provider) {
		return null;
	}
	return {
		provider: provider,
		request: Promise.resolve(provider.provideDocumentSemanticTokens(model, lastResultId, token))
	};
}

function _getDocumentSemanticTokensProvider(model: ITextModel): DocumentSemanticTokensProvider | null {
	const result = DocumentSemanticTokensProviderRegistry.ordered(model);
	return (result.length > 0 ? result[0] : null);
}

export function getDocumentRangeSemanticTokensProvider(model: ITextModel): DocumentRangeSemanticTokensProvider | null {
	const result = DocumentRangeSemanticTokensProviderRegistry.ordered(model);
	return (result.length > 0 ? result[0] : null);
}

CommandsRegistry.registerCommand('_provideDocumentSemanticTokensLegend', async (accessor, ...args): Promise<SemanticTokensLegend | undefined> => {
	const [uri] = args;
	assertType(uri instanceof URI);

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}

	const provider = _getDocumentSemanticTokensProvider(model);
	if (!provider) {
		// there is no provider => fall back to a document range semantic tokens provider
		return accessor.get(ICommandService).executeCommand('_provideDocumentRangeSemanticTokensLegend', uri);
	}

	return provider.getLegend();
});

CommandsRegistry.registerCommand('_provideDocumentSemanticTokens', async (accessor, ...args): Promise<VSBuffer | undefined> => {
	const [uri] = args;
	assertType(uri instanceof URI);

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}

	const r = getDocumentSemanticTokens(model, null, CancellationToken.None);
	if (!r) {
		// there is no provider => fall back to a document range semantic tokens provider
		return accessor.get(ICommandService).executeCommand('_provideDocumentRangeSemanticTokens', uri, model.getFullModelRange());
	}

	const { provider, request } = r;

	let result: SemanticTokens | SemanticTokensEdits | null | undefined;
	try {
		result = await request;
	} catch (err) {
		onUnexpectedExternalError(err);
		return undefined;
	}

	if (!result || !isSemanticTokens(result)) {
		return undefined;
	}

	const buff = encodeSemanticTokensDto({
		id: 0,
		type: 'full',
		data: result.data
	});
	if (result.resultId) {
		provider.releaseDocumentSemanticTokens(result.resultId);
	}
	return buff;
});

CommandsRegistry.registerCommand('_provideDocumentRangeSemanticTokensLegend', async (accessor, ...args): Promise<SemanticTokensLegend | undefined> => {
	const [uri] = args;
	assertType(uri instanceof URI);

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}

	const provider = getDocumentRangeSemanticTokensProvider(model);
	if (!provider) {
		return undefined;
	}

	return provider.getLegend();
});

CommandsRegistry.registerCommand('_provideDocumentRangeSemanticTokens', async (accessor, ...args): Promise<VSBuffer | undefined> => {
	const [uri, range] = args;
	assertType(uri instanceof URI);
	assertType(Range.isIRange(range));

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}

	const provider = getDocumentRangeSemanticTokensProvider(model);
	if (!provider) {
		// there is no provider
		return undefined;
	}

	let result: SemanticTokens | null | undefined;
	try {
		result = await provider.provideDocumentRangeSemanticTokens(model, Range.lift(range), CancellationToken.None);
	} catch (err) {
		onUnexpectedExternalError(err);
		return undefined;
	}

	if (!result || !isSemanticTokens(result)) {
		return undefined;
	}

	return encodeSemanticTokensDto({
		id: 0,
		type: 'full',
		data: result.data
	});
});
