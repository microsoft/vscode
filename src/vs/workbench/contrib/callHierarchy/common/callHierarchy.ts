/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { SymbolKind, ProviderResult, SymbolTag } from 'vs/editor/common/modes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { URI } from 'vs/base/common/uri';

export const enum CallHierarchyDirection {
	CallsFrom = 1,
	CallsTo = 2
}

export interface CallHierarchySymbol {
	kind: SymbolKind;
	tags: SymbolTag[];
	name: string;
	detail?: string;
	uri: URI;
	range: IRange;
	selectionRange: IRange;
}

export interface CallHierarchyItem {
	source: CallHierarchySymbol;
	targets: CallHierarchySymbol[];
}

export interface CallHierarchyProvider {

	provideCallHierarchyItems(
		uri: URI,
		position: IPosition,
		direction: CallHierarchyDirection,
		token: CancellationToken
	): ProviderResult<CallHierarchyItem[]>;
}

export const CallHierarchyProviderRegistry = new LanguageFeatureRegistry<CallHierarchyProvider>();

