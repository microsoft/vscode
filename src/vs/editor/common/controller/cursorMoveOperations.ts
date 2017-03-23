/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SingleCursorState, CursorColumns, CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';
import { CursorChangeReason } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class CursorPosition {
	_cursorPositionBrand: void;

	public readonly lineNumber: number;
	public readonly column: number;
	public readonly leftoverVisibleColumns: number;

	constructor(lineNumber: number, column: number, leftoverVisibleColumns: number) {
		this.lineNumber = lineNumber;
		this.column = column;
		this.leftoverVisibleColumns = leftoverVisibleColumns;
	}
}

export class SingleMoveOperationResult {
	_singleMoveOperationBrand: void;

	public static fromMove(initialState: SingleCursorState, inSelectionMode: boolean, lineNumber: number, column: number, leftoverVisibleColumns: number, ensureInEditableRange: boolean, reason: CursorChangeReason): SingleMoveOperationResult {
		return new SingleMoveOperationResult(
			initialState.move(inSelectionMode, new Position(lineNumber, column), leftoverVisibleColumns),
			ensureInEditableRange,
			reason
		);
	}

	readonly state: SingleCursorState;
	readonly ensureInEditableRange: boolean;
	readonly reason: CursorChangeReason;

	constructor(
		state: SingleCursorState,
		ensureInEditableRange: boolean,
		reason: CursorChangeReason
	) {
		this.state = state;
		this.ensureInEditableRange = ensureInEditableRange;
		this.reason = reason;
	}
}

export class MoveOperations {

	public static left(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number): CursorPosition {

		if (column > model.getLineMinColumn(lineNumber)) {
			if (CursorColumns.isLowSurrogate(model, lineNumber, column - 2)) {
				// character before column is a low surrogate
				column = column - 2;
			} else {
				column = column - 1;
			}
		} else if (lineNumber > 1) {
			lineNumber = lineNumber - 1;
			column = model.getLineMaxColumn(lineNumber);
		}

		return new CursorPosition(lineNumber, column, 0);
	}

	public static moveLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, noOfColumns: number): SingleMoveOperationResult {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move left without selection cancels selection and puts cursor at the beginning of the selection
			lineNumber = cursor.selection.startLineNumber;
			column = cursor.selection.startColumn;
		} else {
			let r = MoveOperations.left(config, model, cursor.position.lineNumber, cursor.position.column - (noOfColumns - 1));
			lineNumber = r.lineNumber;
			column = r.column;
		}

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, lineNumber, column, 0, true, CursorChangeReason.Explicit);
	}

	public static right(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number): CursorPosition {

		if (column < model.getLineMaxColumn(lineNumber)) {
			if (CursorColumns.isHighSurrogate(model, lineNumber, column - 1)) {
				// character after column is a high surrogate
				column = column + 2;
			} else {
				column = column + 1;
			}
		} else if (lineNumber < model.getLineCount()) {
			lineNumber = lineNumber + 1;
			column = model.getLineMinColumn(lineNumber);
		}

		return new CursorPosition(lineNumber, column, 0);
	}

	public static moveRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, noOfColumns: number): SingleMoveOperationResult {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move right without selection cancels selection and puts cursor at the end of the selection
			lineNumber = cursor.selection.endLineNumber;
			column = cursor.selection.endColumn;
		} else {
			let r = MoveOperations.right(config, model, cursor.position.lineNumber, cursor.position.column + (noOfColumns - 1));
			lineNumber = r.lineNumber;
			column = r.column;
		}

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, lineNumber, column, 0, true, CursorChangeReason.Explicit);
	}

	public static down(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnLastLine: boolean): CursorPosition {
		const currentVisibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize) + leftoverVisibleColumns;

		lineNumber = lineNumber + count;
		var lineCount = model.getLineCount();
		if (lineNumber > lineCount) {
			lineNumber = lineCount;
			if (allowMoveOnLastLine) {
				column = model.getLineMaxColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
				if (CursorColumns.isInsideSurrogatePair(model, lineNumber, column)) {
					column = column - 1;
				}
			}
		} else {
			column = CursorColumns.columnFromVisibleColumn2(config, model, lineNumber, currentVisibleColumn);
			if (CursorColumns.isInsideSurrogatePair(model, lineNumber, column)) {
				column = column - 1;
			}
		}

		leftoverVisibleColumns = currentVisibleColumn - CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);

		return new CursorPosition(lineNumber, column, leftoverVisibleColumns);
	}

	public static moveDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, linesCount: number): SingleMoveOperationResult {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move down acts relative to the end of selection
			lineNumber = cursor.selection.endLineNumber;
			column = cursor.selection.endColumn;
		} else {
			lineNumber = cursor.position.lineNumber;
			column = cursor.position.column;
		}

		let r = MoveOperations.down(config, model, lineNumber, column, cursor.leftoverVisibleColumns, linesCount, true);

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns, true, CursorChangeReason.Explicit);
	}

	public static translateDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleMoveOperationResult {
		let selection = cursor.selection;

		let selectionStart = MoveOperations.down(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, 1, false);
		let position = MoveOperations.down(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, 1, false);

		let tmp = new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			selectionStart.leftoverVisibleColumns,
			new Position(position.lineNumber, position.column),
			position.leftoverVisibleColumns
		);

		return new SingleMoveOperationResult(tmp, true, CursorChangeReason.Explicit);
	}

	public static up(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnFirstLine: boolean): CursorPosition {
		const currentVisibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize) + leftoverVisibleColumns;

		lineNumber = lineNumber - count;
		if (lineNumber < 1) {
			lineNumber = 1;
			if (allowMoveOnFirstLine) {
				column = model.getLineMinColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
				if (CursorColumns.isInsideSurrogatePair(model, lineNumber, column)) {
					column = column - 1;
				}
			}
		} else {
			column = CursorColumns.columnFromVisibleColumn2(config, model, lineNumber, currentVisibleColumn);
			if (CursorColumns.isInsideSurrogatePair(model, lineNumber, column)) {
				column = column - 1;
			}
		}

		leftoverVisibleColumns = currentVisibleColumn - CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);

		return new CursorPosition(lineNumber, column, leftoverVisibleColumns);
	}

	public static moveUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, linesCount: number): SingleMoveOperationResult {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move up acts relative to the beginning of selection
			lineNumber = cursor.selection.startLineNumber;
			column = cursor.selection.startColumn;
		} else {
			lineNumber = cursor.position.lineNumber;
			column = cursor.position.column;
		}

		let r = MoveOperations.up(config, model, lineNumber, column, cursor.leftoverVisibleColumns, linesCount, true);

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns, true, CursorChangeReason.Explicit);
	}

	public static translateUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleMoveOperationResult {

		let selection = cursor.selection;

		let selectionStart = MoveOperations.up(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, 1, false);
		let position = MoveOperations.up(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, 1, false);

		let tmp = new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			selectionStart.leftoverVisibleColumns,
			new Position(position.lineNumber, position.column),
			position.leftoverVisibleColumns
		);

		return new SingleMoveOperationResult(tmp, true, CursorChangeReason.Explicit);
	}

	public static moveToBeginningOfLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleMoveOperationResult {
		let lineNumber = cursor.position.lineNumber;
		let minColumn = model.getLineMinColumn(lineNumber);
		let firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || minColumn;

		let column: number;

		let relevantColumnNumber = cursor.position.column;
		if (relevantColumnNumber === firstNonBlankColumn) {
			column = minColumn;
		} else {
			column = firstNonBlankColumn;
		}

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, lineNumber, column, 0, true, CursorChangeReason.Explicit);
	}

	public static moveToEndOfLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleMoveOperationResult {
		let lineNumber = cursor.position.lineNumber;
		let maxColumn = model.getLineMaxColumn(lineNumber);
		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, lineNumber, maxColumn, 0, true, CursorChangeReason.Explicit);
	}

	public static moveToBeginningOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleMoveOperationResult {
		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, 1, 1, 0, true, CursorChangeReason.Explicit);
	}

	public static moveToEndOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleMoveOperationResult {
		let lastLineNumber = model.getLineCount();
		let lastColumn = model.getLineMaxColumn(lastLineNumber);

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, lastLineNumber, lastColumn, 0, true, CursorChangeReason.Explicit);
	}
}
