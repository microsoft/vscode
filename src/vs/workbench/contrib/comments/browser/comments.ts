/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IView } from 'vs/workbench/common/views';
import { FilterOptions } from 'vs/workbench/contrib/comments/browser/commentsFilterOptions';
import { CommentsFilters } from 'vs/workbench/contrib/comments/browser/commentsViewActions';
import { CommentNode } from 'vs/workbench/contrib/comments/common/commentModel';

export const CommentsViewFilterFocusContextKey = new RawContextKey<boolean>('commentsFilterFocus', false);
export const CommentsViewSmallLayoutContextKey = new RawContextKey<boolean>(`commentsView.smallLayout`, false);

export interface ICommentsView extends IView {

	readonly onDidFocusFilter: Event<void>;
	readonly onDidClearFilterText: Event<void>;
	readonly filters: CommentsFilters;
	readonly onDidChangeFilterStats: Event<{ total: number; filtered: number }>;
	focusFilter(): void;
	clearFilterText(): void;
	getFilterStats(): { total: number; filtered: number };

	collapseAll(): void;
}

export interface ICommentsWidget {
	// // get contextKeyService(): IContextKeyService;

	// get onContextMenu(): Event<ITreeContextMenuEvent<MarkerElement | null>> | Event<ITableContextMenuEvent<MarkerTableItem>>;
	// get onDidChangeFocus(): Event<ITreeEvent<MarkerElement | null>> | Event<ITableEvent<MarkerTableItem>>;
	// get onDidChangeSelection(): Event<ITreeEvent<MarkerElement | null>> | Event<ITableEvent<MarkerTableItem>>;
	// get onDidOpen(): Event<IOpenEvent<MarkerElement | MarkerTableItem | undefined>>;

	// collapseMarkers(): void;
	// dispose(): void;
	// domFocus(): void;
	filterMarkers(commentNodes: CommentNode[], filterOptions: FilterOptions): void;
	// getFocus(): (MarkerElement | MarkerTableItem | null)[];
	// getHTMLElement(): HTMLElement;
	// getRelativeTop(location: MarkerElement | MarkerTableItem | null): number | null;
	// getSelection(): (MarkerElement | MarkerTableItem | null)[];
	// getVisibleItemCount(): number;
	// layout(height: number, width: number): void;
	// reset(resourceMarkers: ResourceMarkers[]): void;
	// revealMarkers(activeResource: ResourceMarkers | null, focus: boolean, lastSelectedRelativeTop: number): void;
	// setAriaLabel(label: string): void;
	// setMarkerSelection(selection?: Marker[], focus?: Marker[]): void;
	// toggleVisibility(hide: boolean): void;
	// update(resourceMarkers: ResourceMarkers[]): void;
	// updateMarker(marker: Marker): void;
}
