/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export default {
	MARKERS_PANEL_ID: 'workbench.panel.markers',
	MARKER_COPY_ACTION_ID: 'problems.action.copy',
	MARKER_COPY_MESSAGE_ACTION_ID: 'problems.action.copyMessage',
	RELATED_INFORMATION_COPY_MESSAGE_ACTION_ID: 'problems.action.copyRelatedInformationMessage',
	FOCUS_PROBLEMS_FROM_FILTER: 'problems.action.focusProblemsFromFilter',
	MARKERS_PANEL_FOCUS_FILTER: 'problems.action.focusFilter',
	MARKERS_PANEL_SHOW_MULTILINE_MESSAGE: 'problems.action.showMultilineMessage',
	MARKERS_PANEL_SHOW_SINGLELINE_MESSAGE: 'problems.action.showSinglelineMessage',
	MARKER_OPEN_SIDE_ACTION_ID: 'problems.action.openToSide',
	MARKER_SHOW_PANEL_ID: 'workbench.action.showErrorsWarnings',

	MarkerPanelFocusContextKey: new RawContextKey<boolean>('problemsViewFocus', false),
	MarkerFocusContextKey: new RawContextKey<boolean>('problemFocus', false),
	MarkerPanelFilterFocusContextKey: new RawContextKey<boolean>('problemsFilterFocus', false),
	RelatedInformationFocusContextKey: new RawContextKey<boolean>('relatedInformationFocus', false)
};
