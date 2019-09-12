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
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { onUnexpectedExternalError } from 'vs/base/common/errors';

export const enum CallHierarchyDirection {
	CallsTo = 1,
	CallsFrom = 2
}

export interface CallHierarchyItem {
	kind: SymbolKind;
	name: string;
	detail?: string;
	uri: URI;
	range: IRange;
	selectionRange: IRange;
}

export interface IncomingCall {
	source: CallHierarchyItem;
	sourceRanges: IRange[];
}

export interface OutgoingCall {
	sourceRanges: IRange[];
	target: CallHierarchyItem;
}

export interface CallHierarchyProvider {

	provideIncomingCalls(document: ITextModel, postion: IPosition, token: CancellationToken): ProviderResult<IncomingCall[]>;

	provideOutgoingCalls(document: ITextModel, postion: IPosition, token: CancellationToken): ProviderResult<OutgoingCall[]>;
}

export const CallHierarchyProviderRegistry = new LanguageFeatureRegistry<CallHierarchyProvider>();


export async function provideIncomingCalls(model: ITextModel, position: IPosition, token: CancellationToken): Promise<IncomingCall[]> {
	const [provider] = CallHierarchyProviderRegistry.ordered(model);
	if (!provider) {
		return [];
	}
	try {
		const result = await provider.provideIncomingCalls(model, position, token);
		if (isNonEmptyArray(result)) {
			return result;
		}
	} catch (e) {
		onUnexpectedExternalError(e);
	}
	return [];
}

export async function provideOutgoingCalls(model: ITextModel, position: IPosition, token: CancellationToken): Promise<OutgoingCall[]> {
	const [provider] = CallHierarchyProviderRegistry.ordered(model);
	if (!provider) {
		return [];
	}
	try {
		const result = await provider.provideOutgoingCalls(model, position, token);
		if (isNonEmptyArray(result)) {
			return result;
		}
	} catch (e) {
		onUnexpectedExternalError(e);
	}
	return [];
}

registerDefaultLanguageCommand('_executeCallHierarchyIncomingCalls', async (model, position) => provideIncomingCalls(model, position, CancellationToken.None));
registerDefaultLanguageCommand('_executeCallHierarchyOutgoingCalls', async (model, position) => provideOutgoingCalls(model, position, CancellationToken.None));
