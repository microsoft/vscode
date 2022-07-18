/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkersFilters } from 'vs/workbench/contrib/markers/browser/markersViewActions';
import { Event } from 'vs/base/common/event';
import { IView } from 'vs/workbench/common/views';
import { MarkerElement, ResourceMarkers } from 'vs/workbench/contrib/markers/browser/markersModel';
import { MarkersViewMode } from 'vs/workbench/contrib/markers/common/markers';

export interface IMarkersView extends IView {

	readonly onDidFocusFilter: Event<void>;
	readonly onDidClearFilterText: Event<void>;
	readonly filters: MarkersFilters;
	readonly onDidChangeFilterStats: Event<{ total: number; filtered: number }>;
	focusFilter(): void;
	clearFilterText(): void;
	getFilterStats(): { total: number; filtered: number };

	getFocusElement(): MarkerElement | undefined;
	getFocusedSelectedElements(): MarkerElement[] | null;
	getAllResourceMarkers(): ResourceMarkers[];

	collapseAll(): void;
	setMultiline(multiline: boolean): void;
	setViewMode(viewMode: MarkersViewMode): void;
}
