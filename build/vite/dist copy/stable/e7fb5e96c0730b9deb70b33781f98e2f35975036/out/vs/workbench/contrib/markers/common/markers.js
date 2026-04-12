/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export var MarkersViewMode;
(function (MarkersViewMode) {
    MarkersViewMode["Table"] = "table";
    MarkersViewMode["Tree"] = "tree";
})(MarkersViewMode || (MarkersViewMode = {}));
export var Markers;
(function (Markers) {
    Markers.MARKERS_CONTAINER_ID = 'workbench.panel.markers';
    Markers.MARKERS_VIEW_ID = 'workbench.panel.markers.view';
    Markers.MARKERS_VIEW_STORAGE_ID = 'workbench.panel.markers';
    Markers.MARKER_COPY_ACTION_ID = 'problems.action.copy';
    Markers.MARKER_COPY_MESSAGE_ACTION_ID = 'problems.action.copyMessage';
    Markers.RELATED_INFORMATION_COPY_MESSAGE_ACTION_ID = 'problems.action.copyRelatedInformationMessage';
    Markers.FOCUS_PROBLEMS_FROM_FILTER = 'problems.action.focusProblemsFromFilter';
    Markers.MARKERS_VIEW_FOCUS_FILTER = 'problems.action.focusFilter';
    Markers.MARKERS_VIEW_CLEAR_FILTER_TEXT = 'problems.action.clearFilterText';
    Markers.MARKERS_VIEW_SHOW_MULTILINE_MESSAGE = 'problems.action.showMultilineMessage';
    Markers.MARKERS_VIEW_SHOW_SINGLELINE_MESSAGE = 'problems.action.showSinglelineMessage';
    Markers.MARKER_OPEN_ACTION_ID = 'problems.action.open';
    Markers.MARKER_OPEN_SIDE_ACTION_ID = 'problems.action.openToSide';
    Markers.MARKER_SHOW_PANEL_ID = 'workbench.action.showErrorsWarnings';
    Markers.MARKER_SHOW_QUICK_FIX = 'problems.action.showQuickFixes';
    Markers.TOGGLE_MARKERS_VIEW_ACTION_ID = 'workbench.actions.view.toggleProblems';
})(Markers || (Markers = {}));
export var MarkersContextKeys;
(function (MarkersContextKeys) {
    MarkersContextKeys.MarkersViewModeContextKey = new RawContextKey('problemsViewMode', "tree" /* MarkersViewMode.Tree */);
    MarkersContextKeys.MarkersTreeVisibilityContextKey = new RawContextKey('problemsVisibility', false);
    MarkersContextKeys.MarkerFocusContextKey = new RawContextKey('problemFocus', false);
    MarkersContextKeys.MarkerViewFilterFocusContextKey = new RawContextKey('problemsFilterFocus', false);
    MarkersContextKeys.RelatedInformationFocusContextKey = new RawContextKey('relatedInformationFocus', false);
    MarkersContextKeys.ShowErrorsFilterContextKey = new RawContextKey('problems.filter.errors', true);
    MarkersContextKeys.ShowWarningsFilterContextKey = new RawContextKey('problems.filter.warnings', true);
    MarkersContextKeys.ShowInfoFilterContextKey = new RawContextKey('problems.filter.info', true);
    MarkersContextKeys.ShowActiveFileFilterContextKey = new RawContextKey('problems.filter.activeFile', false);
    MarkersContextKeys.ShowExcludedFilesFilterContextKey = new RawContextKey('problems.filter.excludedFiles', true);
})(MarkersContextKeys || (MarkersContextKeys = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvY29tbW9uL21hcmtlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE1BQU0sQ0FBTixJQUFrQixlQUdqQjtBQUhELFdBQWtCLGVBQWU7SUFDaEMsa0NBQWUsQ0FBQTtJQUNmLGdDQUFhLENBQUE7QUFDZCxDQUFDLEVBSGlCLGVBQWUsS0FBZixlQUFlLFFBR2hDO0FBRUQsTUFBTSxLQUFXLE9BQU8sQ0FpQnZCO0FBakJELFdBQWlCLE9BQU87SUFDViw0QkFBb0IsR0FBRyx5QkFBeUIsQ0FBQztJQUNqRCx1QkFBZSxHQUFHLDhCQUE4QixDQUFDO0lBQ2pELCtCQUF1QixHQUFHLHlCQUF5QixDQUFDO0lBQ3BELDZCQUFxQixHQUFHLHNCQUFzQixDQUFDO0lBQy9DLHFDQUE2QixHQUFHLDZCQUE2QixDQUFDO0lBQzlELGtEQUEwQyxHQUFHLCtDQUErQyxDQUFDO0lBQzdGLGtDQUEwQixHQUFHLHlDQUF5QyxDQUFDO0lBQ3ZFLGlDQUF5QixHQUFHLDZCQUE2QixDQUFDO0lBQzFELHNDQUE4QixHQUFHLGlDQUFpQyxDQUFDO0lBQ25FLDJDQUFtQyxHQUFHLHNDQUFzQyxDQUFDO0lBQzdFLDRDQUFvQyxHQUFHLHVDQUF1QyxDQUFDO0lBQy9FLDZCQUFxQixHQUFHLHNCQUFzQixDQUFDO0lBQy9DLGtDQUEwQixHQUFHLDRCQUE0QixDQUFDO0lBQzFELDRCQUFvQixHQUFHLHFDQUFxQyxDQUFDO0lBQzdELDZCQUFxQixHQUFHLGdDQUFnQyxDQUFDO0lBQ3pELHFDQUE2QixHQUFHLHVDQUF1QyxDQUFDO0FBQ3RGLENBQUMsRUFqQmdCLE9BQU8sS0FBUCxPQUFPLFFBaUJ2QjtBQUVELE1BQU0sS0FBVyxrQkFBa0IsQ0FXbEM7QUFYRCxXQUFpQixrQkFBa0I7SUFDckIsNENBQXlCLEdBQUcsSUFBSSxhQUFhLENBQWtCLGtCQUFrQixvQ0FBdUIsQ0FBQztJQUN6RyxrREFBK0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSxvQkFBb0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMxRix3Q0FBcUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDMUUsa0RBQStCLEdBQUcsSUFBSSxhQUFhLENBQVUscUJBQXFCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDM0Ysb0RBQWlDLEdBQUcsSUFBSSxhQUFhLENBQVUseUJBQXlCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDakcsNkNBQTBCLEdBQUcsSUFBSSxhQUFhLENBQVUsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDeEYsK0NBQTRCLEdBQUcsSUFBSSxhQUFhLENBQVUsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDNUYsMkNBQXdCLEdBQUcsSUFBSSxhQUFhLENBQVUsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDcEYsaURBQThCLEdBQUcsSUFBSSxhQUFhLENBQVUsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDakcsb0RBQWlDLEdBQUcsSUFBSSxhQUFhLENBQVUsK0JBQStCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEgsQ0FBQyxFQVhnQixrQkFBa0IsS0FBbEIsa0JBQWtCLFFBV2xDIn0=