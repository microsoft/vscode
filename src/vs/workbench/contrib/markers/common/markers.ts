/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum MarkersViewMode {
	Table = 'table',
	Tree = 'tree'
}

export namespace Markers {
	export const MARKERS_CONTAINER_ID = 'workbench.panel.markers';
	export const MARKERS_VIEW_ID = 'workbench.panel.markers.view';
	export const MARKERS_VIEW_STORAGE_ID = 'workbench.panel.markers';
	export const MARKER_COPY_ACTION_ID = 'problems.action.copy';
	export const MARKER_COPY_MESSAGE_ACTION_ID = 'problems.action.copyMessage';
	export const RELATED_INFORMATION_COPY_MESSAGE_ACTION_ID = 'problems.action.copyRelatedInformationMessage';
	export const FOCUS_PROBLEMS_FROM_FILTER = 'problems.action.focusProblemsFromFilter';
	export const MARKERS_VIEW_FOCUS_FILTER = 'problems.action.focusFilter';
	export const MARKERS_VIEW_CLEAR_FILTER_TEXT = 'problems.action.clearFilterText';
	export const MARKERS_VIEW_SHOW_MULTILINE_MESSAGE = 'problems.action.showMultilineMessage';
	export const MARKERS_VIEW_SHOW_SINGLELINE_MESSAGE = 'problems.action.showSinglelineMessage';
	export const MARKER_OPEN_ACTION_ID = 'problems.action.open';
	export const MARKER_OPEN_SIDE_ACTION_ID = 'problems.action.openToSide';
	export const MARKER_SHOW_PANEL_ID = 'workbench.action.showErrorsWarnings';
	export const MARKER_SHOW_QUICK_FIX = 'problems.action.showQuickFixes';
	export const TOGGLE_MARKERS_VIEW_ACTION_ID = 'workbench.actions.view.toggleProblems';
}
