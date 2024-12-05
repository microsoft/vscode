/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../base/common/strings.js';
import { Constants } from '../../../base/common/uint.js';
import { CursorColumns } from '../core/cursorColumns.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { AtomicTabMoveOperations, Direction } from './cursorAtomicMoveOperations.js';
import { CursorConfiguration, ICursorSimpleModel, SelectionStartKind, SingleCursorState } from '../cursorCommon.js';
import { PositionAffinity } from '../model.js';

export class CursorPosition {
	_cursorPositionBrand: void = undefined;

	public readonly lineNumber: number;
	public readonly column: number;
	public readonly leftoverVisibleColumns: number;

	constructor(lineNumber: number, column: number, leftoverVisibleColumns: number) {
		this.lineNumber = lineNumber;
		this.column = column;
		this.leftoverVisibleColumns = leftoverVisibleColumns;
	}
}

export class MoveOperations {
	public static leftPosition(model: ICursorSimpleModel, position: Position): Position {
		if (position.column > model.getLineMinColumn(position.lineNumber)) {
			return position.delta(undefined, -strings.prevCharLength(model.getLineContent(position.lineNumber), position.column - 1));
		} else if (position.lineNumber > 1) {
			const newLineNumber = position.lineNumber - 1;
			return new Position(newLineNumber, model.getLineMaxColumn(newLineNumber));
		} else {
			return position;
		}
	}

	private static leftPositionAtomicSoftTabs(model: ICursorSimpleModel, position: Position, tabSize: number): Position {
		if (position.column <= model.getLineIndentColumn(position.lineNumber)) {
			const minColumn = model.getLineMinColumn(position.lineNumber);
			const lineContent = model.getLineContent(position.lineNumber);
			const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, Direction.Left);
			if (newPosition !== -1 && newPosition + 1 >= minColumn) {
				return new Position(position.lineNumber, newPosition + 1);
			}
		}
		return this.leftPosition(model, position);
	}

	private static left(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): CursorPosition {
		const pos = config.stickyTabStops
			? MoveOperations.leftPositionAtomicSoftTabs(model, position, config.tabSize)
			: MoveOperations.leftPosition(model, position);
		return new CursorPosition(pos.lineNumber, pos.column, 0);
	}

	/**
	 * @param noOfColumns Must be either `1`
	 * or `Math.round(viewModel.getLineContent(viewLineNumber).length / 2)` (for half lines).
	*/
	public static moveLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, noOfColumns: number): SingleCursorState {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If the user has a selection and does not want to extend it,
			// put the cursor at the beginning of the selection.
			lineNumber = cursor.selection.startLineNumber;
			column = cursor.selection.startColumn;
		} else {
			// This has no effect if noOfColumns === 1.
			// It is ok to do so in the half-line scenario.
			const pos = cursor.position.delta(undefined, -(noOfColumns - 1));
			// We clip the position before normalization, as normalization is not defined
			// for possibly negative columns.
			const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model), PositionAffinity.Left);
			const p = MoveOperations.left(config, model, normalizedPos);

			lineNumber = p.lineNumber;
			column = p.column;
		}

		return cursor.move(inSelectionMode, lineNumber, column, 0);
	}

	/**
	 * Adjusts the column so that it is within min/max of the line.
	*/
	private static clipPositionColumn(position: Position, model: ICursorSimpleModel): Position {
		return new Position(
			position.lineNumber,
			MoveOperations.clipRange(position.column, model.getLineMinColumn(position.lineNumber),
				model.getLineMaxColumn(position.lineNumber))
		);
	}

	private static clipRange(value: number, min: number, max: number): number {
		if (value < min) {
			return min;
		}
		if (value > max) {
			return max;
		}
		return value;
	}

	public static rightPosition(model: ICursorSimpleModel, lineNumber: number, column: number): Position {
		if (column < model.getLineMaxColumn(lineNumber)) {
			column = column + strings.nextCharLength(model.getLineContent(lineNumber), column - 1);
		} else if (lineNumber < model.getLineCount()) {
			lineNumber = lineNumber + 1;
			column = model.getLineMinColumn(lineNumber);
		}
		return new Position(lineNumber, column);
	}

	public static rightPositionAtomicSoftTabs(model: ICursorSimpleModel, lineNumber: number, column: number, tabSize: number, indentSize: number): Position {
		if (column < model.getLineIndentColumn(lineNumber)) {
			const lineContent = model.getLineContent(lineNumber);
			const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, column - 1, tabSize, Direction.Right);
			if (newPosition !== -1) {
				return new Position(lineNumber, newPosition + 1);
			}
		}
		return this.rightPosition(model, lineNumber, column);
	}

	public static right(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): CursorPosition {
		const pos = config.stickyTabStops
			? MoveOperations.rightPositionAtomicSoftTabs(model, position.lineNumber, position.column, config.tabSize, config.indentSize)
			: MoveOperations.rightPosition(model, position.lineNumber, position.column);
		return new CursorPosition(pos.lineNumber, pos.column, 0);
	}

	public static moveRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, noOfColumns: number): SingleCursorState {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move right without selection cancels selection and puts cursor at the end of the selection
			lineNumber = cursor.selection.endLineNumber;
			column = cursor.selection.endColumn;
		} else {
			const pos = cursor.position.delta(undefined, noOfColumns - 1);
			const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model), PositionAffinity.Right);
			const r = MoveOperations.right(config, model, normalizedPos);
			lineNumber = r.lineNumber;
			column = r.column;
		}

		return cursor.move(inSelectionMode, lineNumber, column, 0);
	}

	public static vertical(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, newLineNumber: number, allowMoveOnEdgeLine: boolean, normalizationAffinity?: PositionAffinity): CursorPosition {
		const currentVisibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize) + leftoverVisibleColumns;
		const lineCount = model.getLineCount();
		const wasOnFirstPosition = (lineNumber === 1 && column === 1);
		const wasOnLastPosition = (lineNumber === lineCount && column === model.getLineMaxColumn(lineNumber));
		const wasAtEdgePosition = (newLineNumber < lineNumber ? wasOnFirstPosition : wasOnLastPosition);

		lineNumber = newLineNumber;
		if (lineNumber < 1) {
			lineNumber = 1;
			if (allowMoveOnEdgeLine) {
				column = model.getLineMinColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
			}
		} else if (lineNumber > lineCount) {
			lineNumber = lineCount;
			if (allowMoveOnEdgeLine) {
				column = model.getLineMaxColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
			}
		} else {
			column = config.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
		}

		if (wasAtEdgePosition) {
			leftoverVisibleColumns = 0;
		} else {
			leftoverVisibleColumns = currentVisibleColumn - CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);
		}

		if (normalizationAffinity !== undefined) {
			const position = new Position(lineNumber, column);
			const newPosition = model.normalizePosition(position, normalizationAffinity);
			leftoverVisibleColumns = leftoverVisibleColumns + (column - newPosition.column);
			lineNumber = newPosition.lineNumber;
			column = newPosition.column;
		}
		return new CursorPosition(lineNumber, column, leftoverVisibleColumns);
	}

	public static down(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnLastLine: boolean): CursorPosition {
		return this.vertical(config, model, lineNumber, column, leftoverVisibleColumns, lineNumber + count, allowMoveOnLastLine, PositionAffinity.RightOfInjectedText);
	}

	public static moveDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, linesCount: number): SingleCursorState {
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

		let i = 0;
		let r: CursorPosition;
		do {
			r = MoveOperations.down(config, model, lineNumber + i, column, cursor.leftoverVisibleColumns, linesCount, true);
			const np = model.normalizePosition(new Position(r.lineNumber, r.column), PositionAffinity.None);
			if (np.lineNumber > lineNumber) {
				break;
			}
		} while (i++ < 10 && lineNumber + i < model.getLineCount());

		return cursor.move(inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns);
	}

	public static translateDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleCursorState {
		const selection = cursor.selection;

		const selectionStart = MoveOperations.down(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, 1, false);
		const position = MoveOperations.down(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, 1, false);

		return new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			SelectionStartKind.Simple,
			selectionStart.leftoverVisibleColumns,
			new Position(position.lineNumber, position.column),
			position.leftoverVisibleColumns
		);
	}

	public static up(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnFirstLine: boolean): CursorPosition {
		return this.vertical(config, model, lineNumber, column, leftoverVisibleColumns, lineNumber - count, allowMoveOnFirstLine, PositionAffinity.LeftOfInjectedText);
	}

	public static moveUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, linesCount: number): SingleCursorState {
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

		const r = MoveOperations.up(config, model, lineNumber, column, cursor.leftoverVisibleColumns, linesCount, true);

		return cursor.move(inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns);
	}

	public static translateUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleCursorState {

		const selection = cursor.selection;

		const selectionStart = MoveOperations.up(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, 1, false);
		const position = MoveOperations.up(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, 1, false);

		return new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			SelectionStartKind.Simple,
			selectionStart.leftoverVisibleColumns,
			new Position(position.lineNumber, position.column),
			position.leftoverVisibleColumns
		);
	}

	private static _isBlankLine(model: ICursorSimpleModel, lineNumber: number): boolean {
		if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
			// empty or contains only whitespace
			return true;
		}
		return false;
	}

	public static moveToPrevBlankLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		let lineNumber = cursor.position.lineNumber;

		// If our current line is blank, move to the previous non-blank line
		while (lineNumber > 1 && this._isBlankLine(model, lineNumber)) {
			lineNumber--;
		}

		// Find the previous blank line
		while (lineNumber > 1 && !this._isBlankLine(model, lineNumber)) {
			lineNumber--;
		}

		return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), 0);
	}

	public static moveToNextBlankLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		const lineCount = model.getLineCount();
		let lineNumber = cursor.position.lineNumber;

		// If our current line is blank, move to the next non-blank line
		while (lineNumber < lineCount && this._isBlankLine(model, lineNumber)) {
			lineNumber++;
		}

		// Find the next blank line
		while (lineNumber < lineCount && !this._isBlankLine(model, lineNumber)) {
			lineNumber++;
		}

		return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), 0);
	}

	public static moveToBeginningOfLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		const lineNumber = cursor.position.lineNumber;
		const minColumn = model.getLineMinColumn(lineNumber);
		const firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || minColumn;

		let column: number;

		const relevantColumnNumber = cursor.position.column;
		if (relevantColumnNumber === firstNonBlankColumn) {
			column = minColumn;
		} else {
			column = firstNonBlankColumn;
		}

		return cursor.move(inSelectionMode, lineNumber, column, 0);
	}

	public static moveToEndOfLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, sticky: boolean): SingleCursorState {
		const lineNumber = cursor.position.lineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		return cursor.move(inSelectionMode, lineNumber, maxColumn, sticky ? Constants.MAX_SAFE_SMALL_INTEGER - maxColumn : 0);
	}

	public static moveToBeginningOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		return cursor.move(inSelectionMode, 1, 1, 0);
	}

	public static moveToEndOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		const lastLineNumber = model.getLineCount();
		const lastColumn = model.getLineMaxColumn(lastLineNumber);

		return cursor.move(inSelectionMode, lastLineNumber, lastColumn, 0);
	}
}
