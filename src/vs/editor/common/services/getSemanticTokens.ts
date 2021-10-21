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
import { Emitter, Event } from 'vs/base/common/event';

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
	const providerGroup = _getDocumentSemanticTokensProviderHighestGroup(model);
	if (!providerGroup) {
		return null;
	}
	const compositeProvider = new CompositeDocumentSemanticTokensProvider(model, providerGroup);
	return {
		provider: compositeProvider,
		request: Promise.resolve(compositeProvider.provideDocumentSemanticTokens(model, lastResultId, token))
	};
}

class CompositeDocumentSemanticTokensProvider implements DocumentSemanticTokensProvider {
	private didChangeEmitter = new Emitter<void>();
	constructor(model: ITextModel, private readonly providerGroup: DocumentSemanticTokensProvider[]) {
		// Lifetime of this provider is tied to the text model
		model.onWillDispose(() => this.didChangeEmitter.dispose());

		// Mirror did change events
		providerGroup.forEach(p => {
			if (p.onDidChange) {
				p.onDidChange(() => this.didChangeEmitter.fire(), this, undefined);
			}
		});
	}
	public async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null | undefined> {
		// Get tokens from the group all at the same time. Return the first
		// that actually returned tokens
		const list = await Promise.all(this.providerGroup.map(async provider => {
			try {
				return await provider.provideDocumentSemanticTokens(model, lastResultId, token);
			} catch (err) {
				onUnexpectedExternalError(err);
			}
			return undefined;
		}));

		return list.find(l => l);
	}
	public get onDidChange(): Event<void> {
		return this.didChangeEmitter.event;
	}
	getLegend(): SemanticTokensLegend {
		return this.providerGroup[0].getLegend();
	}
	releaseDocumentSemanticTokens(resultId: string | undefined): void {
		this.providerGroup.forEach(p => p.releaseDocumentSemanticTokens(resultId));
	}
}

class CompositeDocumentRangeSemanticTokensProvider implements DocumentRangeSemanticTokensProvider {
	constructor(private readonly providerGroup: DocumentRangeSemanticTokensProvider[]) { }
	public async provideDocumentRangeSemanticTokens(model: ITextModel, range: Range, token: CancellationToken): Promise<SemanticTokens | null | undefined> {
		// Get tokens from the group all at the same time. Return the first
		// that actually returned tokens
		const list = await Promise.all(this.providerGroup.map(async provider => {
			try {
				return await provider.provideDocumentRangeSemanticTokens(model, range, token);
			} catch (err) {
				onUnexpectedExternalError(err);
			}
			return undefined;
		}));

		return list.find(l => l);
	}
	getLegend(): SemanticTokensLegend {
		return this.providerGroup[0].getLegend();
	}
}

function _getDocumentSemanticTokensProviderHighestGroup(model: ITextModel): DocumentSemanticTokensProvider[] | null {
	const result = DocumentSemanticTokensProviderRegistry.orderedGroups(model);
	return (result.length > 0 ? result[0] : null);
}

export function getDocumentRangeSemanticTokensProviderHighestGroup(model: ITextModel): DocumentRangeSemanticTokensProvider[] | null {
	const result = DocumentRangeSemanticTokensProviderRegistry.orderedGroups(model);
	return (result.length > 0 ? result[0] : null);
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

	const providers = getDocumentRangeSemanticTokensProviderHighestGroup(model);
	if (!providers) {
		return undefined;
	}

	return providers[0].getLegend();
});

CommandsRegistry.registerCommand('_provideDocumentRangeSemanticTokens', async (accessor, ...args): Promise<VSBuffer | undefined> => {
	const [uri, range] = args;
	assertType(uri instanceof URI);
	assertType(Range.isIRange(range));

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}

	const providers = getDocumentRangeSemanticTokensProviderHighestGroup(model);
	if (!providers) {
		// there is no provider
		return undefined;
	}

	let result: SemanticTokens | null | undefined;
	const composite = new CompositeDocumentRangeSemanticTokensProvider(providers);
	try {
		result = await composite.provideDocumentRangeSemanticTokens(model, Range.lift(range), CancellationToken.None);
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
