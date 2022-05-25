/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { MarkersViewMode } from 'vs/workbench/contrib/markers/common/markers';

export namespace MarkersContextKeys {
	export const MarkersViewModeContextKey = new RawContextKey<MarkersViewMode>('problemsViewMode', MarkersViewMode.Tree);
	export const MarkersViewSmallLayoutContextKey = new RawContextKey<boolean>(`problemsView.smallLayout`, false);
	export const MarkersTreeVisibilityContextKey = new RawContextKey<boolean>('problemsVisibility', false);
	export const MarkerFocusContextKey = new RawContextKey<boolean>('problemFocus', false);
	export const MarkerViewFilterFocusContextKey = new RawContextKey<boolean>('problemsFilterFocus', false);
	export const RelatedInformationFocusContextKey = new RawContextKey<boolean>('relatedInformationFocus', false);
}
