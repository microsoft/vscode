/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from 'vs/editor/common/core/range';
import { SymbolKind, ProviderResult } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { URI } from 'vs/base/common/uri';
import { IPosition } from 'vs/editor/common/core/position';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { onUnexpectedExternalError } from 'vs/base/common/errors';

export const enum CallHierarchyDirection {
	CallsTo = 1,
	CallsFrom = 2
}

export interface CallHierarchyItem {
	id: string;
	kind: SymbolKind;
	name: string;
	detail?: string;
	uri: URI;
	range: IRange;
	selectionRange: IRange;
}

export interface IncomingCall {
	from: CallHierarchyItem;
	fromRanges: IRange[];
}

export interface OutgoingCall {
	fromRanges: IRange[];
	to: CallHierarchyItem;
}

export interface CallHierarchySession {
	root: CallHierarchyItem;
	dispose(): void;
}

export interface CallHierarchyProvider {

	prepareCallHierarchy(document: ITextModel, position: IPosition, token: CancellationToken): ProviderResult<CallHierarchySession>;

	provideIncomingCalls(item: CallHierarchyItem, token: CancellationToken): ProviderResult<IncomingCall[]>;

	provideOutgoingCalls(item: CallHierarchyItem, token: CancellationToken): ProviderResult<OutgoingCall[]>;
}

export const CallHierarchyProviderRegistry = new LanguageFeatureRegistry<CallHierarchyProvider>();


export class CallHierarchyModel {

	static async create(model: ITextModel, position: IPosition, token: CancellationToken): Promise<CallHierarchyModel | undefined> {
		const [provider] = CallHierarchyProviderRegistry.ordered(model);
		if (!provider) {
			return undefined;
		}
		const session = await provider.prepareCallHierarchy(model, position, token);
		if (!session) {
			return undefined;
		}
		return new CallHierarchyModel(provider, session);
	}

	private constructor(
		readonly provider: CallHierarchyProvider,
		readonly session: CallHierarchySession,
		readonly root = session.root
	) { }

	dispose(): void {
		this.session.dispose();
	}

	async resolveIncomingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<IncomingCall[]> {
		try {
			const result = await this.provider.provideIncomingCalls(item, token);
			if (isNonEmptyArray(result)) {
				return result;
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		return [];
	}

	async resolveOutgoingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<OutgoingCall[]> {
		try {
			const result = await this.provider.provideOutgoingCalls(item, token);
			if (isNonEmptyArray(result)) {
				return result;
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		return [];
	}
}

