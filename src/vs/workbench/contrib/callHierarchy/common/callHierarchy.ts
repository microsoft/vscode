/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CallHierarchyProvider, CallHierarchyItem, CallHierarchyIncomingCall, CallHierarchyOutgoingCall, SymbolKind, SymbolTag } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { URI } from 'vs/base/common/uri';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { IDisposable, RefCountedDisposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { assertType } from 'vs/base/common/types';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Range, IRange } from 'vs/editor/common/core/range';

export const enum CallHierarchyDirection {
	CallsTo = 'incomingCalls',
	CallsFrom = 'outgoingCalls'
}

// XXX is this even vaguely right?
interface CallHierarchyItemDto {
	_sessionId: string;
	_itemId: string;
	kind: SymbolKind;
	name: string;
	detail?: string;
	uri: URI;
	range: IRange;
	selectionRange: IRange;
	tags?: SymbolTag[];
}


export class CallHierarchyModel {

	static async create(callHierarchyProviderRegistry: LanguageFeatureRegistry<CallHierarchyProvider>, model: ITextModel, position: IPosition, token: CancellationToken): Promise<CallHierarchyModel | undefined> {
		const [provider] = callHierarchyProviderRegistry.ordered(model);
		if (!provider) {
			return undefined;
		}
		const session = await provider.prepareCallHierarchy(model, position, token);
		if (!session) {
			return undefined;
		}
		return new CallHierarchyModel(session.roots.reduce((p, c) => p + c._sessionId, ''), provider, session.roots, new RefCountedDisposable(session));
	}

	readonly root: CallHierarchyItem;

	private constructor(
		readonly id: string,
		readonly provider: CallHierarchyProvider,
		readonly roots: CallHierarchyItem[],
		readonly ref: RefCountedDisposable,
	) {
		this.root = roots[0];
	}

	dispose(): void {
		this.ref.release();
	}

	fork(item: CallHierarchyItem): CallHierarchyModel {
		const that = this;
		return new class extends CallHierarchyModel {
			constructor() {
				super(that.id, that.provider, [item], that.ref.acquire());
			}
		};
	}

	async resolveIncomingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyIncomingCall[]> {
		try {
			const result = await this.provider.provideCallHierarchyIncomingCalls(item, token);
			if (isNonEmptyArray(result)) {
				return result;
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		return [];
	}

	async resolveOutgoingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyOutgoingCall[]> {
		try {
			const result = await this.provider.provideCallHierarchyOutgoingCalls(item, token);
			if (isNonEmptyArray(result)) {
				return result;
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		return [];
	}
}

// --- API command support

const _models = new Map<string, CallHierarchyModel>();

CommandsRegistry.registerCommand('_executePrepareCallHierarchy', async (accessor, ...args) => {
	const [resource, position] = args;
	assertType(URI.isUri(resource));
	assertType(Position.isIPosition(position));

	const modelService = accessor.get(IModelService);
	let textModel = modelService.getModel(resource);
	let textModelReference: IDisposable | undefined;
	if (!textModel) {
		const textModelService = accessor.get(ITextModelService);
		const result = await textModelService.createModelReference(resource);
		textModel = result.object.textEditorModel;
		textModelReference = result;
	}

	try {
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const model = await CallHierarchyModel.create(languageFeaturesService.callHierarchyProvider, textModel, position, CancellationToken.None);
		if (!model) {
			return [];
		}
		//
		_models.set(model.id, model);
		_models.forEach((value, key, map) => {
			if (map.size > 10) {
				value.dispose();
				_models.delete(key);
			}
		});
		return [model.root];

	} finally {
		textModelReference?.dispose();
	}
});

function isCallHierarchyItemDto(obj: any): obj is CallHierarchyItemDto {
	const item = obj as CallHierarchyItemDto;
	return typeof obj === 'object'
		&& typeof item.name === 'string'
		&& typeof item.kind === 'number'
		&& URI.isUri(item.uri)
		&& Range.isIRange(item.range)
		&& Range.isIRange(item.selectionRange);
}

CommandsRegistry.registerCommand('_executeProvideIncomingCalls', async (_accessor, ...args) => {
	const [item] = args;
	assertType(isCallHierarchyItemDto(item));

	// find model
	const model = _models.get(item._sessionId);
	if (!model) {
		return undefined;
	}

	return model.resolveIncomingCalls(item, CancellationToken.None);
});

CommandsRegistry.registerCommand('_executeProvideOutgoingCalls', async (_accessor, ...args) => {
	const [item] = args;
	assertType(isCallHierarchyItemDto(item));

	// find model
	const model = _models.get(item._sessionId);
	if (!model) {
		return undefined;
	}

	return model.resolveOutgoingCalls(item, CancellationToken.None);
});
