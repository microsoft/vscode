/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { SymbolKind, ProviderResult } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { URI } from 'vs/base/common/uri';

export const enum CallHierarchyDirection {
	CallsFrom = 1,
	CallsTo = 2
}

export interface CallHierarchyItem {
	kind: SymbolKind;
	name: string;
	detail?: string;
	uri: URI;
	range: IRange;
	selectionRange: IRange;
}

export interface CallHierarchyEdge {
	from: CallHierarchyItem;
	to: CallHierarchyItem;
}

export interface CallHierarchyProvider {
	provideCallHierarchyItem(document: ITextModel, postion: IPosition | IRange, direction: CallHierarchyDirection, token: CancellationToken): ProviderResult<CallHierarchyEdge[]>;
}

export const CallHierarchyProviderRegistry = new LanguageFeatureRegistry<CallHierarchyProvider>();

