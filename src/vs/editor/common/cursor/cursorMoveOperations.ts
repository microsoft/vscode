/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../base/common/strings.js';
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
	public readonly columnHint: number | null;

	constructor(lineNumber: number, column: number, columnHint: number | null) {
		this.lineNumber = lineNumber;
		this.column = column;
		this.columnHint = columnHint;
	}
}

export class MoveOperations {
	public static leftPosition(model: ICursorSimpleModel, position: Position, virtualSpace: boolean): Position {
		if (position.column > model.getLineMinColumn(position.lineNumber)) {
			return position.delta(undefined, -strings.prevCharLength(model.getLineContent(position.lineNumber), position.column - 1));
		} else if (!virtualSpace && position.lineNumber > 1) {
			const newLineNumber = position.lineNumber - 1;
			return new Position(newLineNumber, model.getLineMaxColumn(newLineNumber));
		} else {
			return position;
		}
	}

	private static leftPositionAtomicSoftTabs(model: ICursorSimpleModel, position: Position, tabSize: number, virtualSpace: boolean): Position {
		if (position.column <= model.getLineIndentColumn(position.lineNumber)) {
			const minColumn = model.getLineMinColumn(position.lineNumber);
			const lineContent = model.getLineContent(position.lineNumber);
			const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, Direction.Left);
			if (newPosition !== -1 && newPosition + 1 >= minColumn) {
				return new Position(position.lineNumber, newPosition + 1);
			}
		}
		return this.leftPosition(model, position, virtualSpace);
	}

	private static left(config: CursorConfiguration, model: ICursorSimpleModel, position: Position, virtualSpace: boolean | null = null): CursorPosition {
		if (virtualSpace === null) {
			virtualSpace = config.virtualSpace;
		}
		const pos = config.stickyTabStops
			? MoveOperations.leftPositionAtomicSoftTabs(model, position, config.tabSize, config.virtualSpace)
			: MoveOperations.leftPosition(model, position, config.virtualSpace);
		return new CursorPosition(pos.lineNumber, pos.column, null);
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
			const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model, config.virtualSpace), PositionAffinity.Left);
			const p = MoveOperations.left(config, model, normalizedPos);

			lineNumber = p.lineNumber;
			column = p.column;
		}

		return cursor.move(inSelectionMode, lineNumber, column, null);
	}

	/**
	 * Adjusts the column so that it is within min/max of the line.
	*/
	private static clipPositionColumn(position: Position, model: ICursorSimpleModel, virtualSpace: boolean): Position {
		return new Position(
			position.lineNumber,
			MoveOperations.clipRange(
				position.column,
				model.getLineMinColumn(position.lineNumber),
				(virtualSpace ? null : model.getLineMaxColumn(position.lineNumber))
			)
		);
	}

	private static clipRange(value: number, min: number, max: number | null): number {
		if (value < min) {
			return min;
		}
		if (max !== null && value > max) {
			return max;
		}
		return value;
	}

	public static rightPosition(model: ICursorSimpleModel, lineNumber: number, column: number, virtualSpace: boolean): Position {
		if (column < model.getLineMaxColumn(lineNumber)) {
			column = column + strings.nextCharLength(model.getLineContent(lineNumber), column - 1);
		} else {
			if (virtualSpace) {
				column = column + 1;
			} else if (lineNumber < model.getLineCount()) {
				lineNumber = lineNumber + 1;
				column = model.getLineMinColumn(lineNumber);
			}
		}
		return new Position(lineNumber, column);
	}

	public static rightPositionAtomicSoftTabs(model: ICursorSimpleModel, lineNumber: number, column: number, tabSize: number, indentSize: number, virtualSpace: boolean): Position {
		if (column < model.getLineIndentColumn(lineNumber)) {
			const lineContent = model.getLineContent(lineNumber);
			const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, column - 1, tabSize, Direction.Right);
			if (newPosition !== -1) {
				return new Position(lineNumber, newPosition + 1);
			}
		}
		return this.rightPosition(model, lineNumber, column, virtualSpace);
	}

	public static right(config: CursorConfiguration, model: ICursorSimpleModel, position: Position, virtualSpace: boolean | null = null): CursorPosition {
		if (virtualSpace === null) {
			virtualSpace = config.virtualSpace;
		}
		const pos = config.stickyTabStops
			? MoveOperations.rightPositionAtomicSoftTabs(model, position.lineNumber, position.column, config.tabSize, config.indentSize, virtualSpace)
			: MoveOperations.rightPosition(model, position.lineNumber, position.column, virtualSpace);
		return new CursorPosition(pos.lineNumber, pos.column, null);
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
			const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model, config.virtualSpace), PositionAffinity.Right);
			const r = MoveOperations.right(config, model, normalizedPos);
			lineNumber = r.lineNumber;
			column = r.column;
		}

		return cursor.move(inSelectionMode, lineNumber, column, null);
	}

	public static vertical(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, columnHint: number | null, newLineNumber: number, allowMoveOnEdgeLine: boolean, normalizationAffinity?: PositionAffinity): CursorPosition {
		let currentVisibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);
		if (columnHint !== null) {
			currentVisibleColumn = columnHint;
		} else {
			columnHint = currentVisibleColumn;
		}

		const lineCount = model.getLineCount();
		lineNumber = newLineNumber;
		if (!config.virtualSpace) {
			const wasOnFirstPosition = (lineNumber === 1 && column === 1);
			const wasOnLastPosition = (lineNumber === lineCount && column === model.getLineMaxColumn(lineNumber));
			const wasAtEdgePosition = (newLineNumber < lineNumber ? wasOnFirstPosition : wasOnLastPosition);

			if (wasAtEdgePosition) {
				columnHint = null;
			}

			if (lineNumber < 1) {
				lineNumber = 1;
				if (allowMoveOnEdgeLine) {
					const firstColumn = model.getLineMinColumn(lineNumber);
					if (column === firstColumn) {
						columnHint = null;
					}
					column = firstColumn;
				} else {
					column = Math.min(model.getLineMaxColumn(lineNumber), column);
				}
			} else if (lineNumber > lineCount) {
				lineNumber = lineCount;
				if (allowMoveOnEdgeLine) {
					const lastColumn = model.getLineMaxColumn(lineNumber);
					if (column === lastColumn) {
						columnHint = null;
					}
					column = lastColumn;
				} else {
					column = Math.min(model.getLineMaxColumn(lineNumber), column);
				}
			} else {
				column = config.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
			}
		} else {
			lineNumber = Math.min(Math.max(1, lineNumber), lineCount);
			column = config.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
		}

		if (normalizationAffinity !== undefined) {
			const position = new Position(lineNumber, column);
			const newPosition = model.normalizePosition(position, normalizationAffinity);
			lineNumber = newPosition.lineNumber;
			column = newPosition.column;
		}

		return new CursorPosition(lineNumber, column, columnHint);
	}

	public static down(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, columnHint: number | null, count: number, allowMoveOnLastLine: boolean): CursorPosition {
		return this.vertical(config, model, lineNumber, column, columnHint, lineNumber + count, allowMoveOnLastLine, PositionAffinity.RightOfInjectedText);
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
			r = MoveOperations.down(config, model, lineNumber + i, column, cursor.columnHint, linesCount, true);
			const np = model.normalizePosition(new Position(r.lineNumber, r.column), PositionAffinity.None);
			if (np.lineNumber > lineNumber) {
				break;
			}
		} while (i++ < 10 && lineNumber + i < model.getLineCount());

		return cursor.move(inSelectionMode, r.lineNumber, r.column, r.columnHint);
	}

	public static translateDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleCursorState {
		const selection = cursor.selection;

		const selectionStart = MoveOperations.down(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.columnHint, 1, false);
		const position = MoveOperations.down(config, model, selection.positionLineNumber, selection.positionColumn, cursor.columnHint, 1, false);

		return new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			SelectionStartKind.Simple,
			new Position(position.lineNumber, position.column),
			null
		);
	}

	public static up(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, columnHint: number | null, count: number, allowMoveOnFirstLine: boolean): CursorPosition {
		return this.vertical(config, model, lineNumber, column, columnHint, lineNumber - count, allowMoveOnFirstLine, PositionAffinity.LeftOfInjectedText);
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

		const r = MoveOperations.up(config, model, lineNumber, column, cursor.columnHint, linesCount, true);

		return cursor.move(inSelectionMode, r.lineNumber, r.column, r.columnHint);
	}

	public static translateUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleCursorState {

		const selection = cursor.selection;

		const selectionStart = MoveOperations.up(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.columnHint, 1, false);
		const position = MoveOperations.up(config, model, selection.positionLineNumber, selection.positionColumn, cursor.columnHint, 1, false);

		return new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			SelectionStartKind.Simple,
			new Position(position.lineNumber, position.column),
			null
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

		return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), null);
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

		return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), null);
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

		return cursor.move(inSelectionMode, lineNumber, column, null);
	}

	public static moveToEndOfLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, sticky: boolean): SingleCursorState {
		const lineNumber = cursor.position.lineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		return cursor.move(inSelectionMode, lineNumber, maxColumn, null);
	}

	public static moveToBeginningOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		return cursor.move(inSelectionMode, 1, 1, null);
	}

	public static moveToEndOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		const lastLineNumber = model.getLineCount();
		const lastColumn = model.getLineMaxColumn(lastLineNumber);

		return cursor.move(inSelectionMode, lastLineNumber, lastColumn, null);
	}
}
