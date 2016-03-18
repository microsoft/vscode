/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IInternalIndentationOptions, IPosition, IEditorSelection} from 'vs/editor/common/editorCommon';
import {Selection} from 'vs/editor/common/core/selection';

export interface IMoveResult {
	lineNumber:number;
	column:number;
	leftoverVisibleColumns: number;
}

export interface IViewColumnSelectResult {
	viewSelections: IEditorSelection[];
	reversed: boolean;
}
export interface IColumnSelectResult extends IViewColumnSelectResult {
	selections: IEditorSelection[];
	toLineNumber: number;
	toVisualColumn: number;
}

export interface ICursorMoveHelperModel {
	getLineCount(): number;
	getLineFirstNonWhitespaceColumn(lineNumber:number): number;
	getLineMinColumn(lineNumber:number): number;
	getLineMaxColumn(lineNumber:number): number;
	getLineLastNonWhitespaceColumn(lineNumber:number): number;
	getLineContent(lineNumber:number): string;
}

export interface IConfiguration {
	getIndentationOptions(): IInternalIndentationOptions;
}

function isHighSurrogate(model, lineNumber, column) {
	var code = model.getLineContent(lineNumber).charCodeAt(column - 1);
	return 0xD800 <= code && code <= 0xDBFF;
}

function isLowSurrogate(model, lineNumber, column) {
	var code = model.getLineContent(lineNumber).charCodeAt(column - 1);
	return 0xDC00 <= code && code <= 0xDFFF;
}

export class CursorMoveHelper {

	private configuration: IConfiguration;

	constructor(configuration:IConfiguration) {
		this.configuration = configuration;
	}

	public getLeftOfPosition(model:ICursorMoveHelperModel, lineNumber:number, column:number): IPosition {

		if (column > model.getLineMinColumn(lineNumber)) {
			column = column - (isLowSurrogate(model, lineNumber, column - 1) ? 2 : 1);
		} else if (lineNumber > 1) {
			lineNumber = lineNumber - 1;
			column = model.getLineMaxColumn(lineNumber);
		}

		return {
			lineNumber: lineNumber,
			column: column
		};
	}

	public getRightOfPosition(model:ICursorMoveHelperModel, lineNumber:number, column:number): IPosition {

		if (column < model.getLineMaxColumn(lineNumber)) {
			column = column + (isHighSurrogate(model, lineNumber, column) ? 2 : 1);
		} else if (lineNumber < model.getLineCount()) {
			lineNumber = lineNumber + 1;
			column = model.getLineMinColumn(lineNumber);
		}

		return {
			lineNumber: lineNumber,
			column: column
		};
	}

	public getPositionUp(model:ICursorMoveHelperModel, lineNumber:number, column:number, leftoverVisibleColumns:number, count:number, allowMoveOnFirstLine:boolean): IMoveResult {
		var currentVisibleColumn = this.visibleColumnFromColumn(model, lineNumber, column) + leftoverVisibleColumns;

		lineNumber = lineNumber - count;
		if (lineNumber < 1) {
			lineNumber = 1;
			if (allowMoveOnFirstLine) {
				column = model.getLineMinColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
			}
		} else {
			column = this.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
		}
		leftoverVisibleColumns = currentVisibleColumn - this.visibleColumnFromColumn(model, lineNumber, column);


		return {
			lineNumber: lineNumber,
			column: column,
			leftoverVisibleColumns: leftoverVisibleColumns
		};
	}

	public getPositionDown(model:ICursorMoveHelperModel, lineNumber:number, column:number, leftoverVisibleColumns:number, count:number, allowMoveOnLastLine:boolean): IMoveResult {
		var currentVisibleColumn = this.visibleColumnFromColumn(model, lineNumber, column) + leftoverVisibleColumns;

		lineNumber = lineNumber + count;
		var lineCount = model.getLineCount();
		if (lineNumber > lineCount) {
			lineNumber = lineCount;
			if (allowMoveOnLastLine) {
				column = model.getLineMaxColumn(lineNumber);
			} else {
				column = Math.min(model.getLineMaxColumn(lineNumber), column);
			}
		} else {
			column = this.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
		}
		leftoverVisibleColumns = currentVisibleColumn - this.visibleColumnFromColumn(model, lineNumber, column);

		return {
			lineNumber: lineNumber,
			column: column,
			leftoverVisibleColumns: leftoverVisibleColumns
		};
	}

	public columnSelect(model:ICursorMoveHelperModel, fromLineNumber:number, fromVisibleColumn:number, toLineNumber:number, toVisibleColumn:number): IViewColumnSelectResult {
		let lineCount = Math.abs(toLineNumber - fromLineNumber) + 1;
		let reversed = (fromLineNumber > toLineNumber);
		let isRTL = (fromVisibleColumn > toVisibleColumn);
		let isLTR = (fromVisibleColumn < toVisibleColumn);

		let result: IEditorSelection[] = [];

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

	public getColumnAtBeginningOfLine(model:ICursorMoveHelperModel, lineNumber:number, column:number): number {
		var firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || 1;
		var minColumn = model.getLineMinColumn(lineNumber);

		if (column !== minColumn && column <= firstNonBlankColumn) {
			column = minColumn;
		} else {
			column = firstNonBlankColumn;
		}

		return column;
	}

	public getColumnAtEndOfLine(model:ICursorMoveHelperModel, lineNumber:number, column:number): number {
		var maxColumn = model.getLineMaxColumn(lineNumber);
		var lastNonBlankColumn = model.getLineLastNonWhitespaceColumn(lineNumber) || maxColumn;

		if (column !== maxColumn && column >= lastNonBlankColumn) {
			column = maxColumn;
		} else {
			column = lastNonBlankColumn;
		}

		return column;
	}

	public visibleColumnFromColumn(model:ICursorMoveHelperModel, lineNumber:number, column:number): number {
		return CursorMoveHelper.visibleColumnFromColumn(model, lineNumber, column, this.configuration.getIndentationOptions().tabSize);
	}

	public static visibleColumnFromColumn(model:ICursorMoveHelperModel, lineNumber:number, column:number, tabSize:number): number {
		return CursorMoveHelper.visibleColumnFromColumn2(model.getLineContent(lineNumber), column, tabSize);
	}

	public static visibleColumnFromColumn2(line:string, column:number, tabSize:number): number {
		var result = 0;
		for (var i = 0; i < column - 1; i++) {
			result = (line.charAt(i) === '\t') ? CursorMoveHelper.nextTabColumn(result, tabSize) : result + 1;
		}
		return result;
	}

	public columnFromVisibleColumn(model:ICursorMoveHelperModel, lineNumber:number, visibleColumn:number): number {
		var line = model.getLineContent(lineNumber);

		var lastVisibleColumn = -1;
		var thisVisibleColumn = 0;

		for (var i = 0; i < line.length && thisVisibleColumn <= visibleColumn; i++) {
			lastVisibleColumn = thisVisibleColumn;
			thisVisibleColumn = (line.charAt(i) === '\t') ? CursorMoveHelper.nextTabColumn(thisVisibleColumn, this.configuration.getIndentationOptions().tabSize) : thisVisibleColumn + 1;
		}

		// Choose the closest
		thisVisibleColumn = Math.abs(visibleColumn - thisVisibleColumn);
		lastVisibleColumn = Math.abs(visibleColumn - lastVisibleColumn);

		var result: number;
		if (thisVisibleColumn < lastVisibleColumn) {
			result = i + 1;
		} else {
			result = i;
		}

		var minColumn = model.getLineMinColumn(lineNumber);
		if (result < minColumn) {
			result = minColumn;
		}
		return result;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static nextTabColumn(column:number, tabSize:number): number {
		return column + tabSize - column % tabSize;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static prevTabColumn(column:number, tabSize:number): number {
		return column - 1 - ( column - 1 ) % tabSize;
	}
}