/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IPosition } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';
import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';

export class CursorMoveConfiguration {
	_cursorMoveConfigurationBrand: void;

	public readonly tabSize: number;

	constructor(
		tabSize: number
	) {
		this.tabSize = tabSize;
	}
}

export interface ICursorMoveHelperModel {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
}

export class CursorMoveResult {
	_cursorMoveResultBrand: void;

	public readonly lineNumber: number;
	public readonly column: number;
	public readonly leftoverVisibleColumns: number;

	constructor(lineNumber: number, column: number, leftoverVisibleColumns: number) {
		this.lineNumber = lineNumber;
		this.column = column;
		this.leftoverVisibleColumns = leftoverVisibleColumns;
	}
}

/**
 * Common operations that work and make sense both on the model and on the view model.
 */
export class CursorMove {

	private static _isLowSurrogate(model: ICursorMoveHelperModel, lineNumber: number, charOffset: number): boolean {
		let lineContent = model.getLineContent(lineNumber);
		if (charOffset < 0 || charOffset >= lineContent.length) {
			return false;
		}
		return strings.isLowSurrogate(lineContent.charCodeAt(charOffset));
	}

	private static _isHighSurrogate(model: ICursorMoveHelperModel, lineNumber: number, charOffset: number): boolean {
		let lineContent = model.getLineContent(lineNumber);
		if (charOffset < 0 || charOffset >= lineContent.length) {
			return false;
		}
		return strings.isHighSurrogate(lineContent.charCodeAt(charOffset));
	}

	private static _isInsideSurrogatePair(model: ICursorMoveHelperModel, lineNumber: number, column: number): boolean {
		return this._isHighSurrogate(model, lineNumber, column - 2);
	}

	public static left(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, lineNumber: number, column: number): CursorMoveResult {

		if (column > model.getLineMinColumn(lineNumber)) {
			if (this._isLowSurrogate(model, lineNumber, column - 2)) {
				// character before column is a low surrogate
				column = column - 2;
			} else {
				column = column - 1;
			}
		} else if (lineNumber > 1) {
			lineNumber = lineNumber - 1;
			column = model.getLineMaxColumn(lineNumber);
		}

		return new CursorMoveResult(lineNumber, column, 0);
	}

	public static right(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, lineNumber: number, column: number): CursorMoveResult {

		if (column < model.getLineMaxColumn(lineNumber)) {
			if (this._isHighSurrogate(model, lineNumber, column - 1)) {
				// character after column is a high surrogate
				column = column + 2;
			} else {
				column = column + 1;
			}
		} else if (lineNumber < model.getLineCount()) {
			lineNumber = lineNumber + 1;
			column = model.getLineMinColumn(lineNumber);
		}

		return new CursorMoveResult(lineNumber, column, 0);
	}

	public static up(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnFirstLine: boolean): CursorMoveResult {
		const currentVisibleColumn = this.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize) + leftoverVisibleColumns;

		lineNumber = lineNumber - count;
		if (lineNumber < 1) {
			lineNumber = 1;
			if (allowMoveOnFirstLine) {
				column = model.getLineMinColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
				if (this._isInsideSurrogatePair(model, lineNumber, column)) {
					column = column - 1;
				}
			}
		} else {
			column = this.columnFromVisibleColumn(config, model, lineNumber, currentVisibleColumn);
			if (this._isInsideSurrogatePair(model, lineNumber, column)) {
				column = column - 1;
			}
		}

		leftoverVisibleColumns = currentVisibleColumn - this.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);

		return new CursorMoveResult(lineNumber, column, leftoverVisibleColumns);
	}

	public static down(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnLastLine: boolean): CursorMoveResult {
		const currentVisibleColumn = this.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize) + leftoverVisibleColumns;

		lineNumber = lineNumber + count;
		var lineCount = model.getLineCount();
		if (lineNumber > lineCount) {
			lineNumber = lineCount;
			if (allowMoveOnLastLine) {
				column = model.getLineMaxColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
				if (this._isInsideSurrogatePair(model, lineNumber, column)) {
					column = column - 1;
				}
			}
		} else {
			column = this.columnFromVisibleColumn(config, model, lineNumber, currentVisibleColumn);
			if (this._isInsideSurrogatePair(model, lineNumber, column)) {
				column = column - 1;
			}
		}

		leftoverVisibleColumns = currentVisibleColumn - this.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);

		return new CursorMoveResult(lineNumber, column, leftoverVisibleColumns);
	}

	public static visibleColumnFromColumn(lineContent: string, column: number, tabSize: number): number {
		let endOffset = lineContent.length;
		if (endOffset > column - 1) {
			endOffset = column - 1;
		}

		let result = 0;
		for (let i = 0; i < endOffset; i++) {
			let charCode = lineContent.charCodeAt(i);
			if (charCode === CharCode.Tab) {
				result = this.nextTabStop(result, tabSize);
			} else {
				result = result + 1;
			}
		}
		return result;
	}

	private static _columnFromVisibleColumn(lineContent: string, visibleColumn: number, tabSize: number): number {
		if (visibleColumn <= 0) {
			return 1;
		}

		const lineLength = lineContent.length;

		let beforeVisibleColumn = 0;
		for (let i = 0; i < lineLength; i++) {
			let charCode = lineContent.charCodeAt(i);

			let afterVisibleColumn: number;
			if (charCode === CharCode.Tab) {
				afterVisibleColumn = this.nextTabStop(beforeVisibleColumn, tabSize);
			} else {
				afterVisibleColumn = beforeVisibleColumn + 1;
			}

			if (afterVisibleColumn >= visibleColumn) {
				let prevDelta = visibleColumn - beforeVisibleColumn;
				let afterDelta = afterVisibleColumn - visibleColumn;
				if (afterDelta < prevDelta) {
					return i + 2;
				} else {
					return i + 1;
				}
			}

			beforeVisibleColumn = afterVisibleColumn;
		}

		// walked the entire string
		return lineLength + 1;
	}

	public static columnFromVisibleColumn(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, lineNumber: number, visibleColumn: number): number {
		let result = this._columnFromVisibleColumn(model.getLineContent(lineNumber), visibleColumn, config.tabSize);

		let minColumn = model.getLineMinColumn(lineNumber);
		if (result < minColumn) {
			return minColumn;
		}

		let maxColumn = model.getLineMaxColumn(lineNumber);
		if (result > maxColumn) {
			return maxColumn;
		}

		return result;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static nextTabStop(visibleColumn: number, tabSize: number): number {
		return visibleColumn + tabSize - visibleColumn % tabSize;
	}
}


export interface IViewColumnSelectResult {
	viewSelections: Selection[];
	reversed: boolean;
}
export interface IColumnSelectResult extends IViewColumnSelectResult {
	selections: Selection[];
	toLineNumber: number;
	toVisualColumn: number;
}


export class CursorMoveHelper {

	private readonly _tabSize: number;
	private readonly _config: CursorMoveConfiguration;

	constructor(tabSize: number) {
		this._tabSize = tabSize;
		this._config = new CursorMoveConfiguration(this._tabSize);
	}

	public getLeftOfPosition(model: ICursorMoveHelperModel, lineNumber: number, column: number): IPosition {
		return CursorMove.left(this._config, model, lineNumber, column);
	}

	public getRightOfPosition(model: ICursorMoveHelperModel, lineNumber: number, column: number): IPosition {
		return CursorMove.right(this._config, model, lineNumber, column);
	}

	public getPositionUp(model: ICursorMoveHelperModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnFirstLine: boolean): CursorMoveResult {
		return CursorMove.up(this._config, model, lineNumber, column, leftoverVisibleColumns, count, allowMoveOnFirstLine);
	}

	public getPositionDown(model: ICursorMoveHelperModel, lineNumber: number, column: number, leftoverVisibleColumns: number, count: number, allowMoveOnLastLine: boolean): CursorMoveResult {
		return CursorMove.down(this._config, model, lineNumber, column, leftoverVisibleColumns, count, allowMoveOnLastLine);
	}

	public columnSelect(model: ICursorMoveHelperModel, fromLineNumber: number, fromVisibleColumn: number, toLineNumber: number, toVisibleColumn: number): IViewColumnSelectResult {
		let lineCount = Math.abs(toLineNumber - fromLineNumber) + 1;
		let reversed = (fromLineNumber > toLineNumber);
		let isRTL = (fromVisibleColumn > toVisibleColumn);
		let isLTR = (fromVisibleColumn < toVisibleColumn);

		let result: Selection[] = [];

		// console.log(`fromVisibleColumn: ${fromVisibleColumn}, toVisibleColumn: ${toVisibleColumn}`);

		for (let i = 0; i < lineCount; i++) {
			let lineNumber = fromLineNumber + (reversed ? -i : i);

			let startColumn = this.columnFromVisibleColumn(model, lineNumber, fromVisibleColumn);
			let endColumn = this.columnFromVisibleColumn(model, lineNumber, toVisibleColumn);
			let visibleStartColumn = this.visibleColumnFromColumn(model, lineNumber, startColumn);
			let visibleEndColumn = this.visibleColumnFromColumn(model, lineNumber, endColumn);

			// console.log(`lineNumber: ${lineNumber}: visibleStartColumn: ${visibleStartColumn}, visibleEndColumn: ${visibleEndColumn}`);

			if (isLTR) {
				if (visibleStartColumn > toVisibleColumn) {
					continue;
				}
				if (visibleEndColumn < fromVisibleColumn) {
					continue;
				}
			}

			if (isRTL) {
				if (visibleEndColumn > fromVisibleColumn) {
					continue;
				}
				if (visibleStartColumn < toVisibleColumn) {
					continue;
				}
			}

			result.push(new Selection(lineNumber, startColumn, lineNumber, endColumn));
		}

		return {
			viewSelections: result,
			reversed: reversed
		};
	}

	public getColumnAtBeginningOfLine(model: ICursorMoveHelperModel, lineNumber: number, column: number): number {
		var firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || 1;
		var minColumn = model.getLineMinColumn(lineNumber);

		if (column !== minColumn && column <= firstNonBlankColumn) {
			column = minColumn;
		} else {
			column = firstNonBlankColumn;
		}

		return column;
	}

	public getColumnAtEndOfLine(model: ICursorMoveHelperModel, lineNumber: number, column: number): number {
		var maxColumn = model.getLineMaxColumn(lineNumber);
		var lastNonBlankColumn = model.getLineLastNonWhitespaceColumn(lineNumber) || maxColumn;

		if (column !== maxColumn && column >= lastNonBlankColumn) {
			column = maxColumn;
		} else {
			column = lastNonBlankColumn;
		}

		return column;
	}

	public visibleColumnFromColumn(model: ICursorMoveHelperModel, lineNumber: number, column: number): number {
		return CursorMoveHelper.visibleColumnFromColumn(model, lineNumber, column, this._tabSize);
	}

	public static visibleColumnFromColumn(model: ICursorMoveHelperModel, lineNumber: number, column: number, tabSize: number): number {
		return CursorMoveHelper.visibleColumnFromColumn2(model.getLineContent(lineNumber), column, tabSize);
	}

	public static visibleColumnFromColumn2(line: string, column: number, tabSize: number): number {
		return CursorMove.visibleColumnFromColumn(line, column, tabSize);
	}

	public columnFromVisibleColumn(model: ICursorMoveHelperModel, lineNumber: number, visibleColumn: number): number {
		return CursorMove.columnFromVisibleColumn(this._config, model, lineNumber, visibleColumn);
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static nextTabColumn(column: number, tabSize: number): number {
		return CursorMove.nextTabStop(column, tabSize);
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static prevTabColumn(column: number, tabSize: number): number {
		return column - 1 - (column - 1) % tabSize;
	}
}