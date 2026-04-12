/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CursorState, SingleCursorState } from '../cursorCommon.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
/**
 * Represents a single cursor.
*/
export class Cursor {
    constructor(context) {
        this._selTrackedRange = null;
        this._trackSelection = true;
        this._setState(context, new SingleCursorState(new Range(1, 1, 1, 1), 0 /* SelectionStartKind.Simple */, 0, new Position(1, 1), 0), new SingleCursorState(new Range(1, 1, 1, 1), 0 /* SelectionStartKind.Simple */, 0, new Position(1, 1), 0));
    }
    dispose(context) {
        this._removeTrackedRange(context);
    }
    startTrackingSelection(context) {
        this._trackSelection = true;
        this._updateTrackedRange(context);
    }
    stopTrackingSelection(context) {
        this._trackSelection = false;
        this._removeTrackedRange(context);
    }
    _updateTrackedRange(context) {
        if (!this._trackSelection) {
            // don't track the selection
            return;
        }
        this._selTrackedRange = context.model._setTrackedRange(this._selTrackedRange, this.modelState.selection, 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */);
    }
    _removeTrackedRange(context) {
        this._selTrackedRange = context.model._setTrackedRange(this._selTrackedRange, null, 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */);
    }
    asCursorState() {
        return new CursorState(this.modelState, this.viewState);
    }
    readSelectionFromMarkers(context) {
        const range = context.model._getTrackedRange(this._selTrackedRange);
        if (this.modelState.selection.isEmpty() && !range.isEmpty()) {
            // Avoid selecting text when recovering from markers
            return Selection.fromRange(range.collapseToEnd(), this.modelState.selection.getDirection());
        }
        return Selection.fromRange(range, this.modelState.selection.getDirection());
    }
    ensureValidState(context) {
        this._setState(context, this.modelState, this.viewState);
    }
    setState(context, modelState, viewState) {
        this._setState(context, modelState, viewState);
    }
    static _validatePositionWithCache(viewModel, position, cacheInput, cacheOutput) {
        if (position.equals(cacheInput)) {
            return cacheOutput;
        }
        return viewModel.normalizePosition(position, 2 /* PositionAffinity.None */);
    }
    static _validateViewState(viewModel, viewState) {
        const position = viewState.position;
        const sStartPosition = viewState.selectionStart.getStartPosition();
        const sEndPosition = viewState.selectionStart.getEndPosition();
        const validPosition = viewModel.normalizePosition(position, 2 /* PositionAffinity.None */);
        const validSStartPosition = this._validatePositionWithCache(viewModel, sStartPosition, position, validPosition);
        const validSEndPosition = this._validatePositionWithCache(viewModel, sEndPosition, sStartPosition, validSStartPosition);
        if (position.equals(validPosition) && sStartPosition.equals(validSStartPosition) && sEndPosition.equals(validSEndPosition)) {
            // fast path: the state is valid
            return viewState;
        }
        return new SingleCursorState(Range.fromPositions(validSStartPosition, validSEndPosition), viewState.selectionStartKind, viewState.selectionStartLeftoverVisibleColumns + sStartPosition.column - validSStartPosition.column, validPosition, viewState.leftoverVisibleColumns + position.column - validPosition.column);
    }
    _setState(context, modelState, viewState) {
        if (viewState) {
            viewState = Cursor._validateViewState(context.viewModel, viewState);
        }
        if (!modelState) {
            if (!viewState) {
                return;
            }
            // We only have the view state => compute the model state
            const selectionStart = context.model.validateRange(context.coordinatesConverter.convertViewRangeToModelRange(viewState.selectionStart));
            const position = context.model.validatePosition(context.coordinatesConverter.convertViewPositionToModelPosition(viewState.position));
            modelState = new SingleCursorState(selectionStart, viewState.selectionStartKind, viewState.selectionStartLeftoverVisibleColumns, position, viewState.leftoverVisibleColumns);
        }
        else {
            // Validate new model state
            const selectionStart = context.model.validateRange(modelState.selectionStart);
            const selectionStartLeftoverVisibleColumns = modelState.selectionStart.equalsRange(selectionStart) ? modelState.selectionStartLeftoverVisibleColumns : 0;
            const position = context.model.validatePosition(modelState.position);
            const leftoverVisibleColumns = modelState.position.equals(position) ? modelState.leftoverVisibleColumns : 0;
            modelState = new SingleCursorState(selectionStart, modelState.selectionStartKind, selectionStartLeftoverVisibleColumns, position, leftoverVisibleColumns);
        }
        if (!viewState) {
            // We only have the model state => compute the view state
            const viewSelectionStart1 = context.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelState.selectionStart.startLineNumber, modelState.selectionStart.startColumn));
            const viewSelectionStart2 = context.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelState.selectionStart.endLineNumber, modelState.selectionStart.endColumn));
            const viewSelectionStart = new Range(viewSelectionStart1.lineNumber, viewSelectionStart1.column, viewSelectionStart2.lineNumber, viewSelectionStart2.column);
            const viewPosition = context.coordinatesConverter.convertModelPositionToViewPosition(modelState.position);
            viewState = new SingleCursorState(viewSelectionStart, modelState.selectionStartKind, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns);
        }
        else {
            // Validate new view state
            const viewSelectionStart = context.coordinatesConverter.validateViewRange(viewState.selectionStart, modelState.selectionStart);
            const viewPosition = context.coordinatesConverter.validateViewPosition(viewState.position, modelState.position);
            viewState = new SingleCursorState(viewSelectionStart, modelState.selectionStartKind, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns);
        }
        this.modelState = modelState;
        this.viewState = viewState;
        this._updateTrackedRange(context);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25lQ3Vyc29yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jdXJzb3Ivb25lQ3Vyc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQTBDLGlCQUFpQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFNUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN6QyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFHakQ7O0VBRUU7QUFDRixNQUFNLE9BQU8sTUFBTTtJQVFsQixZQUFZLE9BQXNCO1FBQ2pDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDN0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFFNUIsSUFBSSxDQUFDLFNBQVMsQ0FDYixPQUFPLEVBQ1AsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMscUNBQTZCLENBQUMsRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ2pHLElBQUksaUJBQWlCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHFDQUE2QixDQUFDLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUNqRyxDQUFDO0lBQ0gsQ0FBQztJQUVNLE9BQU8sQ0FBQyxPQUFzQjtRQUNwQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkMsQ0FB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