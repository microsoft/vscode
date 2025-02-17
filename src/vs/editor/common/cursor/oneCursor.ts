/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CursorState, ICursorSimpleModel, SelectionStartKind, SingleCursorState } from '../cursorCommon.js';
import { CursorContext } from './cursorContext.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { PositionAffinity, TrackedRangeStickiness } from '../model.js';

/**
 * Represents a single cursor.
*/
export class Cursor {

	public modelState!: SingleCursorState;
	public viewState!: SingleCursorState;

	private _selTrackedRange: string | null;
	private _trackSelection: boolean;

	constructor(context: CursorContext) {
		this._selTrackedRange = null;
		this._trackSelection = true;

		this._setState(
			context,
			new SingleCursorState(new Range(1, 1, 1, 1), SelectionStartKind.Simple, 0, new Position(1, 1), 0, null),
			new SingleCursorState(new Range(1, 1, 1, 1), SelectionStartKind.Simple, 0, new Position(1, 1), 0, null),
		);
	}

	public dispose(context: CursorContext): void {
		this._removeTrackedRange(context);
	}

	public startTrackingSelection(context: CursorContext): void {
		this._trackSelection = true;
		this._updateTrackedRange(context);
	}

	public stopTrackingSelection(context: CursorContext): void {
		this._trackSelection = false;
		this._removeTrackedRange(context);
	}

	private _updateTrackedRange(context: CursorContext): void {
		if (!this._trackSelection) {
			// don't track the selection
			return;
		}
		this._selTrackedRange = context.model._setTrackedRange(this._selTrackedRange, this.modelState.selectionInVirtualSpace(), TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
	}

	private _removeTrackedRange(context: CursorContext): void {
		this._selTrackedRange = context.model._setTrackedRange(this._selTrackedRange, null, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
	}

	public asCursorState(): CursorState {
		return new CursorState(this.modelState, this.viewState);
	}

	public readSelectionFromMarkers(context: CursorContext): Selection {
		const range = context.model._getTrackedRange(this._selTrackedRange!)!;

		if (this.modelState.selection.isEmpty() && !range.isEmpty()) {
			// Avoid selecting text when recovering from markers
			return Selection.fromRange(range.collapseToEnd(), this.modelState.selection.getDirection());
		}

		return Selection.fromRange(range, this.modelState.selection.getDirection());
	}

	public ensureValidState(context: CursorContext): void {
		this._setState(context, this.modelState, this.viewState);
	}

	public setState(context: CursorContext, modelState: SingleCursorState | null, viewState: SingleCursorState | null): void {
		this._setState(context, modelState, viewState);
	}

	private static _validatePosition(viewModel: ICursorSimpleModel, position: Position): Position {
		const lineNumber = position.lineNumber;
		const column = position.column;
		const maxColumn = viewModel.getLineMaxColumn(lineNumber);
		if (column > maxColumn) {
			// If right normalization at the end of the line puts us on the next line,
			// we're on a wrapped line and not the last segment, so we cannot use virtual space
			const rightNormalized = viewModel.normalizePosition(new Position(lineNumber, maxColumn), PositionAffinity.Right);
			if (lineNumber !== rightNormalized.lineNumber) {
				return new Position(lineNumber, maxColumn);
			}
		}
		return viewModel.normalizePosition(position, PositionAffinity.None);
	}

	private static _validatePositionWithCache(viewModel: ICursorSimpleModel, position: Position, cacheInput: Position, cacheOutput: Position): Position {
		if (position.equals(cacheInput)) {
			return cacheOutput;
		}
		return this._validatePosition(viewModel, position);
	}

	private static _validateViewState(viewModel: ICursorSimpleModel, viewState: SingleCursorState): SingleCursorState {
		const position = viewState.position;
		const sStartPosition = viewState.selectionStart.getStartPosition();
		const sEndPosition = viewState.selectionStart.getEndPosition();

		const validPosition = this._validatePosition(viewModel, position);
		const validSStartPosition = this._validatePositionWithCache(viewModel, sStartPosition, position, validPosition);
		const validSEndPosition = this._validatePositionWithCache(viewModel, sEndPosition, sStartPosition, validSStartPosition);

		if (position.equals(validPosition) && sStartPosition.equals(validSStartPosition) && sEndPosition.equals(validSEndPosition)) {
			// fast path: the state is valid
			return viewState;
		}

		return new SingleCursorState(
			Range.fromPositions(validSStartPosition, validSEndPosition),
			viewState.selectionStartKind, 0,
			validPosition, 0, viewState.columnHint,
		);
	}

	private _setState(context: CursorContext, modelState: SingleCursorState | null, viewState: SingleCursorState | null): void {
		if (viewState) {
			viewState = Cursor._validateViewState(context.viewModel, viewState);
		}

		if (!modelState) {
			if (!viewState) {
				return;
			}
			// We only have the view state => compute the model state
			const selectionStart = context.model.validateRange(
				context.coordinatesConverter.convertViewRangeToModelRange(viewState.selectionStart)
			);

			const position = context.model.validatePosition(
				context.coordinatesConverter.convertViewPositionToModelPosition(viewState.position)
			);

			modelState = new SingleCursorState(selectionStart, viewState.selectionStartKind, viewState.selectionStartLeftoverVisibleColumns, position, viewState.leftoverVisibleColumns, null);
		} else {
			// Validate new model state
			const selectionStart = context.model.validateRange(modelState.selectionStart);
			const selectionStartLeftoverVisibleColumns = modelState.selectionStart.equalsRange(selectionStart) ? modelState.selectionStartLeftoverVisibleColumns : 0;

			const position = context.model.validatePosition(
				modelState.position
			);
			const leftoverVisibleColumns = modelState.position.equals(position) ? modelState.leftoverVisibleColumns : 0;

			modelState = new SingleCursorState(selectionStart, modelState.selectionStartKind, selectionStartLeftoverVisibleColumns, position, leftoverVisibleColumns, null);
		}

		if (!viewState) {
			// We only have the model state => compute the view state
			const viewSelectionStart1 = context.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelState.selectionStart.startLineNumber, modelState.selectionStart.startColumn));
			const viewSelectionStart2 = context.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelState.selectionStart.endLineNumber, modelState.selectionStart.endColumn));
			const viewSelectionStart = new Range(viewSelectionStart1.lineNumber, viewSelectionStart1.column, viewSelectionStart2.lineNumber, viewSelectionStart2.column);
			const viewPosition = context.coordinatesConverter.convertModelPositionToViewPosition(modelState.position);
			viewState = new SingleCursorState(viewSelectionStart, modelState.selectionStartKind, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns, null);
		} else {
			// Validate new view state
			const viewSelectionStart = context.coordinatesConverter.validateViewRange(viewState.selectionStart, modelState.selectionStart);
			const viewPosition = context.coordinatesConverter.validateViewPosition(viewState.position, modelState.position);
			viewState = new SingleCursorState(viewSelectionStart, modelState.selectionStartKind, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns, null);
		}

		this.modelState = modelState;
		this.viewState = viewState;

		this._updateTrackedRange(context);
	}
}
