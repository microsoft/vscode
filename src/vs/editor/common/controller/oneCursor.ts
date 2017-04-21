/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SingleCursorState, CursorContext } from 'vs/editor/common/controller/cursorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection, ISelection } from 'vs/editor/common/core/selection';

export interface ICursor {
	readonly modelState: SingleCursorState;
	readonly viewState: SingleCursorState;
}

export class OneCursor implements ICursor {

	public modelState: SingleCursorState;
	public viewState: SingleCursorState;

	private _selStartMarker: string;
	private _selEndMarker: string;

	constructor(context: CursorContext) {
		this._setState(
			context,
			new SingleCursorState(new Range(1, 1, 1, 1), 0, new Position(1, 1), 0),
			new SingleCursorState(new Range(1, 1, 1, 1), 0, new Position(1, 1), 0),
			false
		);
	}

	public dispose(context: CursorContext): void {
		context.model._removeMarker(this._selStartMarker);
		context.model._removeMarker(this._selEndMarker);
	}

	public readSelectionFromMarkers(context: CursorContext): Selection {
		const start = context.model._getMarker(this._selStartMarker);
		const end = context.model._getMarker(this._selEndMarker);

		if (this.modelState.selection.getDirection() === SelectionDirection.LTR) {
			return new Selection(start.lineNumber, start.column, end.lineNumber, end.column);
		}

		return new Selection(end.lineNumber, end.column, start.lineNumber, start.column);
	}

	public ensureValidState(context: CursorContext): void {
		this._setState(context, this.modelState, this.viewState, false);
	}

	public setSelection(context: CursorContext, selection: ISelection): void {
		const selectionStartLineNumber = selection.selectionStartLineNumber;
		const selectionStartColumn = selection.selectionStartColumn;
		const positionLineNumber = selection.positionLineNumber;
		const positionColumn = selection.positionColumn;
		const modelState = new SingleCursorState(
			new Range(selectionStartLineNumber, selectionStartColumn, selectionStartLineNumber, selectionStartColumn), 0,
			new Position(positionLineNumber, positionColumn), 0
		);
		this._setState(
			context,
			modelState,
			null,
			false
		);
	}

	public setState(context: CursorContext, modelState: SingleCursorState, viewState: SingleCursorState, ensureInEditableRange: boolean): void {
		this._setState(context, modelState, viewState, ensureInEditableRange);
	}

	private _ensureInEditableRange(context: CursorContext, position: Position): Position {
		const editableRange = context.model.getEditableRange();

		if (position.lineNumber < editableRange.startLineNumber || (position.lineNumber === editableRange.startLineNumber && position.column < editableRange.startColumn)) {
			return new Position(editableRange.startLineNumber, editableRange.startColumn);
		} else if (position.lineNumber > editableRange.endLineNumber || (position.lineNumber === editableRange.endLineNumber && position.column > editableRange.endColumn)) {
			return new Position(editableRange.endLineNumber, editableRange.endColumn);
		}
		return position;
	}

	private _validatePosition(context: CursorContext, _position: Position, ensureInEditableRange: boolean): Position {
		const position = context.model.validatePosition(_position);
		return (ensureInEditableRange ? this._ensureInEditableRange(context, position) : position);
	}

	private _setState(context: CursorContext, modelState: SingleCursorState, viewState: SingleCursorState, ensureInEditableRange: boolean): void {
		if (!modelState) {
			// We only have the view state => compute the model state
			const selectionStart = context.model.validateRange(
				context.convertViewRangeToModelRange(viewState.selectionStart)
			);

			const position = this._validatePosition(
				context,
				context.convertViewPositionToModelPosition(viewState.position.lineNumber, viewState.position.column),
				ensureInEditableRange
			);

			modelState = new SingleCursorState(selectionStart, viewState.selectionStartLeftoverVisibleColumns, position, viewState.leftoverVisibleColumns);
		} else {
			// Validate new model state
			const selectionStart = context.model.validateRange(modelState.selectionStart);
			const selectionStartLeftoverVisibleColumns = modelState.selectionStart.equalsRange(selectionStart) ? modelState.selectionStartLeftoverVisibleColumns : 0;

			const position = this._validatePosition(
				context,
				modelState.position,
				ensureInEditableRange
			);
			const leftoverVisibleColumns = modelState.position.equals(position) ? modelState.leftoverVisibleColumns : 0;

			modelState = new SingleCursorState(selectionStart, selectionStartLeftoverVisibleColumns, position, leftoverVisibleColumns);
		}

		if (!viewState) {
			// We only have the model state => compute the view state
			const viewSelectionStart1 = context.convertModelPositionToViewPosition(new Position(modelState.selectionStart.startLineNumber, modelState.selectionStart.startColumn));
			const viewSelectionStart2 = context.convertModelPositionToViewPosition(new Position(modelState.selectionStart.endLineNumber, modelState.selectionStart.endColumn));
			const viewSelectionStart = new Range(viewSelectionStart1.lineNumber, viewSelectionStart1.column, viewSelectionStart2.lineNumber, viewSelectionStart2.column);
			const viewPosition = context.convertModelPositionToViewPosition(modelState.position);
			viewState = new SingleCursorState(viewSelectionStart, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns);
		} else {
			// Validate new view state
			const viewSelectionStart = context.validateViewRange(viewState.selectionStart, modelState.selectionStart);
			const viewPosition = context.validateViewPosition(viewState.position, modelState.position);
			viewState = new SingleCursorState(viewSelectionStart, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns);
		}

		if (this.modelState && this.viewState && this.modelState.equals(modelState) && this.viewState.equals(viewState)) {
			// No-op, early return
			return;
		}

		this.modelState = modelState;
		this.viewState = viewState;

		this._selStartMarker = this._ensureMarker(context, this._selStartMarker, this.modelState.selection.startLineNumber, this.modelState.selection.startColumn, true);
		this._selEndMarker = this._ensureMarker(context, this._selEndMarker, this.modelState.selection.endLineNumber, this.modelState.selection.endColumn, false);
	}

	private _ensureMarker(context: CursorContext, markerId: string, lineNumber: number, column: number, stickToPreviousCharacter: boolean): string {
		if (!markerId) {
			return context.model._addMarker(0, lineNumber, column, stickToPreviousCharacter);
		} else {
			context.model._changeMarker(markerId, lineNumber, column);
			context.model._changeMarkerStickiness(markerId, stickToPreviousCharacter);
			return markerId;
		}
	}
}
