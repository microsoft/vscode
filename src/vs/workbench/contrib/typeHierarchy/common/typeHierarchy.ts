/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from '../../../../editor/common/core/range.js';
import { SymbolKind, ProviderResult, SymbolTag } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { LanguageFeatureRegistry } from '../../../../editor/common/languageFeatureRegistry.js';
import { URI } from '../../../../base/common/uri.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { IDisposable, RefCountedDisposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { assertType } from '../../../../base/common/types.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';

export const enum TypeHierarchyDirection {
	Subtypes = 'subtypes',
	Supertypes = 'supertypes'
}

export interface TypeHierarchyItem {
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

export interface TypeHierarchySession {
	roots: TypeHierarchyItem[];
	dispose(): void;
}

export interface TypeHierarchyProvider {
	prepareTypeHierarchy(document: ITextModel, position: IPosition, token: CancellationToken): ProviderResult<TypeHierarchySession>;
	provideSupertypes(item: TypeHierarchyItem, token: CancellationToken): ProviderResult<TypeHierarchyItem[]>;
	provideSubtypes(item: TypeHierarchyItem, token: CancellationToken): ProviderResult<TypeHierarchyItem[]>;
}

export const TypeHierarchyProviderRegistry = new LanguageFeatureRegistry<TypeHierarchyProvider>();



export class TypeHierarchyModel {

	static async create(model: ITextModel, position: IPosition, token: CancellationToken): Promise<TypeHierarchyModel | undefined> {
		const [provider] = TypeHierarchyProviderRegistry.ordered(model);
		if (!provider) {
			return undefined;
		}
		const session = await provider.prepareTypeHierarchy(model, position, token);
		if (!session) {
			return undefined;
		}
		return new TypeHierarchyModel(session.roots.reduce((p, c) => p + c._sessionId, ''), provider, session.roots, new RefCountedDisposable(session));
	}

	readonly root: TypeHierarchyItem;

	private constructor(
		readonly id: string,
		readonly provider: TypeHierarchyProvider,
		readonly roots: TypeHierarchyItem[],
		readonly ref: RefCountedDisposable,
	) {
		this.root = roots[0];
	}

	dispose(): void {
		this.ref.release();
	}

	fork(item: TypeHierarchyItem): TypeHierarchyModel {
		const that = this;
		return new class extends TypeHierarchyModel {
			constructor() {
				super(that.id, that.provider, [item], that.ref.acquire());
			}
		};
	}

	async provideSupertypes(item: TypeHierarchyItem, token: CancellationToken): Promise<TypeHierarchyItem[]> {
		try {
			const result = await this.provider.provideSupertypes(item, token);
			if (isNonEmptyArray(result)) {
				return result;
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		return [];
	}

	async provideSubtypes(item: TypeHierarchyItem, token: CancellationToken): Promise<TypeHierarchyItem[]> {
		try {
			const result = await this.provider.provideSubtypes(item, token);
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

const _models = new Map<string, TypeHierarchyModel>();

CommandsRegistry.registerCommand('_executePrepareTypeHierarchy', async (accessor, ...args) => {
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
		const model = await TypeHierarchyModel.create(textModel, position, CancellationToken.None);
		if (!model) {
			return [];
		}

		_models.forEach((value, key, map) => {
			if (map.size > 10) {
				value.dispose();
				_models.delete(key);
			}
		});

		for (const root of model.roots) {
			_models.set(root._sessionId, model);
		}

		return model.roots;

	} finally {
		textModelReference?.dispose();
	}
});

function isTypeHierarchyItemDto(obj: any): obj is TypeHierarchyItem {
	const item = obj as TypeHierarchyItem;
	return typeof obj === 'object'
		&& typeof item.name === 'string'
		&& typeof item.kind === 'number'
		&& URI.isUri(item.uri)
		&& Range.isIRange(item.range)
		&& Range.isIRange(item.selectionRange);
}

CommandsRegistry.registerCommand('_executeProvideSupertypes', async (_accessor, ...args) => {
	const [item] = args;
	assertType(isTypeHierarchyItemDto(item));

	// find model
	const model = _models.get(item._sessionId);
	if (!model) {
		return [];
	}

	return model.provideSupertypes(item, CancellationToken.None);
});

CommandsRegistry.registerCommand('_executeProvideSubtypes', async (_accessor, ...args) => {
	const [item] = args;
	assertType(isTypeHierarchyItemDto(item));

	// find model
	const model = _models.get(item._sessionId);
	if (!model) {
		return [];
	}

	return model.provideSubtypes(item, CancellationToken.None);
});
