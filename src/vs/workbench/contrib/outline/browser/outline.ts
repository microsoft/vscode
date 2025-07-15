/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import type { IView } from '../../../common/views.js';

export const enum OutlineSortOrder {
	ByPosition,
	ByName,
	ByKind
}

export interface IOutlineViewState {
	followCursor: boolean;
	filterOnType: boolean;
	sortBy: OutlineSortOrder;
}

export namespace IOutlinePane {
	export const Id = 'outline';
}

export interface IOutlinePane extends IView {
	outlineViewState: IOutlineViewState;
	collapseAll(): void;
	expandAll(): void;
}

// --- context keys

export const ctxFollowsCursor = new RawContextKey<boolean>('outlineFollowsCursor', false);
export const ctxFilterOnType = new RawContextKey<boolean>('outlineFiltersOnType', false);
export const ctxSortMode = new RawContextKey<OutlineSortOrder>('outlineSortMode', OutlineSortOrder.ByPosition);
export const ctxAllCollapsed = new RawContextKey<boolean>('outlineAllCollapsed', false);
export const ctxFocused = new RawContextKey<boolean>('outlineFocused', true);
