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

			const selectionStartMaxColumn = context.viewModel.getLineMaxColumn(viewState.selection.selectionStartLineNumber);
			const selectionStartLeftoverVisibleColumns = Math.max(0, viewState.selection.selectionStartColumn - selectionStartMaxColumn);

			const positionMaxColumn = context.viewModel.getLineMaxColumn(viewState.position.lineNumber);
			const leftoverVisibleColumns = Math.max(0, viewState.position.column - positionMaxColumn);

			modelState = new SingleCursorState(
				selectionStart, viewState.selectionStartKind, selectionStartLeftoverVisibleColumns,
				position, leftoverVisibleColumns, null,
			);
		} else {
			// Validate new model state
			const selectionStart = context.model.validateRange(modelState.selectionStart);
			let selectionStartLeftoverVisibleColumns = modelState.selectionStartLeftoverVisibleColumns;
			if (
				selectionStart.startLineNumber === modelState.selectionStart.startLineNumber
				&& selectionStart.startColumn < modelState.selectionStart.startColumn
			) {
				selectionStartLeftoverVisibleColumns += modelState.selectionStart.startColumn - selectionStart.startColumn;
			}

			const position = context.model.validatePosition(modelState.position);
			let leftoverVisibleColumns = modelState.leftoverVisibleColumns;
			if (
				position.lineNumber === modelState.position.lineNumber
				&& position.column < modelState.position.column
			) {
				leftoverVisibleColumns += modelState.position.column - position.column;
			}

			modelState = new SingleCursorState(
				selectionStart, modelState.selectionStartKind, selectionStartLeftoverVisibleColumns,
				position, leftoverVisibleColumns, modelState.columnHint,
			);
		}

		if (!viewState) {
			// We only have the model state => compute the view state
			const viewSelectionStart1 =
				context.coordinatesConverter
					.convertModelPositionToViewPosition(new Position(modelState.selectionStart.startLineNumber, modelState.selectionStart.startColumn))
					.delta(0, modelState.selectionStartLeftoverVisibleColumns);
			const viewSelectionStart2 =
				context.coordinatesConverter
					.convertModelPositionToViewPosition(new Position(modelState.selectionStart.endLineNumber, modelState.selectionStart.endColumn))
					.delta(0, modelState.selectionStartLeftoverVisibleColumns);
			const viewSelectionStart =
				new Range(viewSelectionStart1.lineNumber, viewSelectionStart1.column, viewSelectionStart2.lineNumber, viewSelectionStart2.column);
			const viewPosition =
				context.coordinatesConverter
					.convertModelPositionToViewPosition(modelState.position)
					.delta(0, modelState.leftoverVisibleColumns);
			viewState = new SingleCursorState(
				viewSelectionStart, modelState.selectionStartKind, 0,
				viewPosition, 0, null,
			);
		} else {
			// Validate new view state
			const viewSelectionStartStart = context.coordinatesConverter.validateViewPosition(
				viewState.selectionStart.getStartPosition(),
				new Position(
					modelState.selectionStart.startLineNumber,
					modelState.selectionStart.startColumn + modelState.selectionStartLeftoverVisibleColumns
				),
			);
			const viewSelectionStartEnd = context.coordinatesConverter.validateViewPosition(
				viewState.selectionStart.getEndPosition(),
				new Position(
					modelState.selectionStart.endLineNumber,
					modelState.selectionStart.endColumn + modelState.selectionStartLeftoverVisibleColumns
				),
			);
			const viewSelectionStart = new Range(
				viewSelectionStartStart.lineNumber, viewSelectionStartStart.column,
				viewSelectionStartEnd.lineNumber, viewSelectionStartEnd.column
			);
			const viewPosition = context.coordinatesConverter.validateViewPosition(
				viewState.position,
				new Position(
					modelState.position.lineNumber,
					modelState.position.column + modelState.leftoverVisibleColumns
				),
			);
			viewState = new SingleCursorState(
				viewSelectionStart, modelState.selectionStartKind, 0,
				viewPosition, 0, viewState.columnHint,
			);
		}

		this.modelState = modelState;
		this.viewState = viewState;

		this._updateTrackedRange(context);
	}
}
