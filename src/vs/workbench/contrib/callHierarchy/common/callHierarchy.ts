/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { SymbolKind, ProviderResult, Location } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { URI } from 'vs/base/common/uri';

export const enum CallHierarchyDirection {
	CallsFrom = 1,
	CallsTo = 2
}

export interface CallHierarchyItem {
	_id: number;
	kind: SymbolKind;
	name: string;
	detail?: string;
	uri: URI;
	range: IRange;
	selectionRange: IRange;
}

export interface CallHierarchyProvider {

	provideCallHierarchyItem(
		document: ITextModel,
		position: IPosition,
		token: CancellationToken
	): ProviderResult<CallHierarchyItem>;

	resolveCallHierarchyItem(
		item: CallHierarchyItem,
		direction: CallHierarchyDirection,
		token: CancellationToken
	): ProviderResult<[CallHierarchyItem, Location[]][]>;
}

export const CallHierarchyProviderRegistry = new LanguageFeatureRegistry<CallHierarchyProvider>();

