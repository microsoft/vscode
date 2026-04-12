/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { NOTEBOOK_EDITOR_ID, NOTEBOOK_DIFF_EDITOR_ID } from '../common/notebookCommon.js';
import { isCompositeNotebookEditorInput } from '../common/notebookEditorInput.js';
import { cellRangesToIndexes, reduceCellRanges } from '../common/notebookRange.js';
//#region Shared commands
export const EXPAND_CELL_INPUT_COMMAND_ID = 'notebook.cell.expandCellInput';
export const EXECUTE_CELL_COMMAND_ID = 'notebook.cell.execute';
export const DETECT_CELL_LANGUAGE = 'notebook.cell.detectLanguage';
export const CHANGE_CELL_LANGUAGE = 'notebook.cell.changeLanguage';
export const QUIT_EDIT_CELL_COMMAND_ID = 'notebook.cell.quitEdit';
export const EXPAND_CELL_OUTPUT_COMMAND_ID = 'notebook.cell.expandCellOutput';
//#endregion
//#region Notebook extensions
// Hardcoding viewType/extension ID for now. TODO these should be replaced once we can
// look them up in the marketplace dynamically.
export const IPYNB_VIEW_TYPE = 'jupyter-notebook';
export const JUPYTER_EXTENSION_ID = 'ms-toolsai.jupyter';
/** @deprecated use the notebookKernel<Type> "keyword" instead */
export const KERNEL_EXTENSIONS = new Map([
    [IPYNB_VIEW_TYPE, JUPYTER_EXTENSION_ID],
]);
// @TODO lramos15, place this in a similar spot to our normal recommendations.
export const KERNEL_RECOMMENDATIONS = new Map();
KERNEL_RECOMMENDATIONS.set(IPYNB_VIEW_TYPE, new Map());
KERNEL_RECOMMENDATIONS.get(IPYNB_VIEW_TYPE)?.set('python', {
    extensionIds: [
        'ms-python.python',
        JUPYTER_EXTENSION_ID
    ],
    displayName: 'Python + Jupyter',
});
//#endregion
//#region  Output related types
// !! IMPORTANT !! ----------------------------------------------------------------------------------
// NOTE that you MUST update vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts#L1986
// whenever changing the values of this const enum. The webviewPreloads-files manually inlines these values
// because it cannot have dependencies.
// !! IMPORTANT !! ----------------------------------------------------------------------------------
export var RenderOutputType;
(function (RenderOutputType) {
    RenderOutputType[RenderOutputType["Html"] = 0] = "Html";
    RenderOutputType[RenderOutputType["Extension"] = 1] = "Extension";
})(RenderOutputType || (RenderOutputType = {}));
export var ScrollToRevealBehavior;
(function (ScrollToRevealBehavior) {
    ScrollToRevealBehavior[ScrollToRevealBehavior["fullCell"] = 0] = "fullCell";
    ScrollToRevealBehavior[ScrollToRevealBehavior["firstLine"] = 1] = "firstLine";
})(ScrollToRevealBehavior || (ScrollToRevealBehavior = {}));
//#endregion
export var CellLayoutState;
(function (CellLayoutState) {
    CellLayoutState[CellLayoutState["Uninitialized"] = 0] = "Uninitialized";
    CellLayoutState[CellLayoutState["Estimated"] = 1] = "Estimated";
    CellLayoutState[CellLayoutState["FromCache"] = 2] = "FromCache";
    CellLayoutState[CellLayoutState["Measured"] = 3] = "Measured";
})(CellLayoutState || (CellLayoutState = {}));
export var CellLayoutContext;
(function (CellLayoutContext) {
    CellLayoutContext[CellLayoutContext["Fold"] = 0] = "Fold";
})(CellLayoutContext || (CellLayoutContext = {}));
/**
 * Vertical Lane in the overview ruler of the notebook editor.
 */
export var NotebookOverviewRulerLane;
(function (NotebookOverviewRulerLane) {
    NotebookOverviewRulerLane[NotebookOverviewRulerLane["Left"] = 1] = "Left";
    NotebookOverviewRulerLane[NotebookOverviewRulerLane["Center"] = 2] = "Center";
    NotebookOverviewRulerLane[NotebookOverviewRulerLane["Right"] = 4] = "Right";
    NotebookOverviewRulerLane[NotebookOverviewRulerLane["Full"] = 7] = "Full";
})(NotebookOverviewRulerLane || (NotebookOverviewRulerLane = {}));
export function isNotebookCellDecoration(obj) {
    return !!obj && typeof obj.handle === 'number';
}
export function isNotebookViewZoneDecoration(obj) {
    return !!obj && typeof obj.viewZoneId === 'string';
}
export var CellRevealType;
(function (CellRevealType) {
    CellRevealType[CellRevealType["Default"] = 1] = "Default";
    CellRevealType[CellRevealType["Top"] = 2] = "Top";
    CellRevealType[CellRevealType["Center"] = 3] = "Center";
    CellRevealType[CellRevealType["CenterIfOutsideViewport"] = 4] = "CenterIfOutsideViewport";
    CellRevealType[CellRevealType["NearTopIfOutsideViewport"] = 5] = "NearTopIfOutsideViewport";
    CellRevealType[CellRevealType["FirstLineIfOutsideViewport"] = 6] = "FirstLineIfOutsideViewport";
})(CellRevealType || (CellRevealType = {}));
export var CellRevealRangeType;
(function (CellRevealRangeType) {
    CellRevealRangeType[CellRevealRangeType["Default"] = 1] = "Default";
    CellRevealRangeType[CellRevealRangeType["Center"] = 2] = "Center";
    CellRevealRangeType[CellRevealRangeType["CenterIfOutsideViewport"] = 3] = "CenterIfOutsideViewport";
})(CellRevealRangeType || (CellRevealRangeType = {}));
export var CellEditState;
(function (CellEditState) {
    /**
     * Default state.
     * For markup cells, this is the renderer version of the markup.
     * For code cell, the browser focus should be on the container instead of the editor
     */
    CellEditState[CellEditState["Preview"] = 0] = "Preview";
    /**
     * Editing mode. Source for markup or code is rendered in editors and the state will be persistent.
     */
    CellEditState[CellEditState["Editing"] = 1] = "Editing";
})(CellEditState || (CellEditState = {}));
export var CellFocusMode;
(function (CellFocusMode) {
    CellFocusMode[CellFocusMode["Container"] = 0] = "Container";
    CellFocusMode[CellFocusMode["Editor"] = 1] = "Editor";
    CellFocusMode[CellFocusMode["Output"] = 2] = "Output";
    CellFocusMode[CellFocusMode["ChatInput"] = 3] = "ChatInput";
})(CellFocusMode || (CellFocusMode = {}));
export var CursorAtBoundary;
(function (CursorAtBoundary) {
    CursorAtBoundary[CursorAtBoundary["None"] = 0] = "None";
    CursorAtBoundary[CursorAtBoundary["Top"] = 1] = "Top";
    CursorAtBoundary[CursorAtBoundary["Bottom"] = 2] = "Bottom";
    CursorAtBoundary[CursorAtBoundary["Both"] = 3] = "Both";
})(CursorAtBoundary || (CursorAtBoundary = {}));
export var CursorAtLineBoundary;
(function (CursorAtLineBoundary) {
    CursorAtLineBoundary[CursorAtLineBoundary["None"] = 0] = "None";
    CursorAtLineBoundary[CursorAtLineBoundary["Start"] = 1] = "Start";
    CursorAtLineBoundary[CursorAtLineBoundary["End"] = 2] = "End";
    CursorAtLineBoundary[CursorAtLineBoundary["Both"] = 3] = "Both";
})(CursorAtLineBoundary || (CursorAtLineBoundary = {}));
export function getNotebookEditorFromEditorPane(editorPane) {
    if (!editorPane) {
        return;
    }
    if (editorPane.getId() === NOTEBOOK_EDITOR_ID) {
        return editorPane.getControl();
    }
    if (editorPane.getId() === NOTEBOOK_DIFF_EDITOR_ID) {
        return editorPane.getControl().inlineNotebookEditor;
    }
    const input = editorPane.input;
    const isCompositeNotebook = input && isCompositeNotebookEditorInput(input);
    if (isCompositeNotebook) {
        return editorPane.getControl()?.notebookEditor;
    }
    return undefined;
}
/**
 * ranges: model selections
 * this will convert model selections to view indexes first, and then include the hidden ranges in the list view
 */
export function expandCellRangesWithHiddenCells(editor, ranges) {
    // assuming ranges are sorted and no overlap
    const indexes = cellRangesToIndexes(ranges);
    const modelRanges = [];
    indexes.forEach(index => {
        const viewCell = editor.cellAt(index);
        if (!viewCell) {
            return;
        }
        const viewIndex = editor.getViewIndexByModelIndex(index);
        if (viewIndex < 0) {
            return;
        }
        const nextViewIndex = viewIndex + 1;
        const range = editor.getCellRangeFromViewRange(viewIndex, nextViewIndex);
        if (range) {
            modelRanges.push(range);
        }
    });
    return reduceCellRanges(modelRanges);
}
export function cellRangeToViewCells(editor, ranges) {
    const cells = [];
    reduceCellRanges(ranges).forEach(range => {
        cells.push(...editor.getCellsInRange(range));
    });
    return cells;
}
//#region Cell Folding
export var CellFoldingState;
(function (CellFoldingState) {
    CellFoldingState[CellFoldingState["None"] = 0] = "None";
    CellFoldingState[CellFoldingState["Expanded"] = 1] = "Expanded";
    CellFoldingState[CellFoldingState["Collapsed"] = 2] = "Collapsed";
})(CellFoldingState || (CellFoldingState = {}));
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tCcm93c2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFxQmhHLE9BQU8sRUFBd0ssa0JBQWtCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNoUSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUdsRixPQUFPLEVBQUUsbUJBQW1CLEVBQWMsZ0JBQWdCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQVEvRix5QkFBeUI7QUFDekIsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsK0JBQStCLENBQUM7QUFDNUUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsdUJBQXVCLENBQUM7QUFDL0QsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsOEJBQThCLENBQUM7QUFDbkUsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsOEJBQThCLENBQUM7QUFDbkUsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsd0JBQXdCLENBQUM7QUFDbEUsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsZ0NBQWdDLENBQUM7QUFHOUUsWUFBWTtBQUVaLDZCQUE2QjtBQUU3QixzRkFBc0Y7QUFDdEYsK0NBQStDO0FBQy9DLE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQztBQUNsRCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQztBQUN6RCxpRUFBaUU7QUFDakUsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQWlCO0lBQ3hELENBQUMsZUFBZSxFQUFFLG9CQUFvQixDQUFDO0NBQ3ZDLENBQUMsQ0FBQztBQUNI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