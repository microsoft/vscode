/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { SingleCursorState, CursorColumns, CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';

export interface IColumnSelectResult {
	viewSelections: Selection[];
	reversed: boolean;
	toLineNumber: number;
	toVisualColumn: number;
}

export class ColumnSelection {

	private static _columnSelect(config: CursorConfiguration, model: ICursorSimpleModel, fromLineNumber: number, fromVisibleColumn: number, toLineNumber: number, toVisibleColumn: number): IColumnSelectResult {
		let lineCount = Math.abs(toLineNumber - fromLineNumber) + 1;
		let reversed = (fromLineNumber > toLineNumber);
		let isRTL = (fromVisibleColumn > toVisibleColumn);
		let isLTR = (fromVisibleColumn < toVisibleColumn);

		let result: Selection[] = [];

		// console.log(`fromVisibleColumn: ${fromVisibleColumn}, toVisibleColumn: ${toVisibleColumn}`);

		for (let i = 0; i < lineCount; i++) {
			let lineNumber = fromLineNumber + (reversed ? -i : i);

			let startColumn = CursorColumns.columnFromVisibleColumn2(config, model, lineNumber, fromVisibleColumn);
			let endColumn = CursorColumns.columnFromVisibleColumn2(config, model, lineNumber, toVisibleColumn);
			let visibleStartColumn = CursorColumns.visibleColumnFromColumn2(config, model, new Position(lineNumber, startColumn));
			let visibleEndColumn = CursorColumns.visibleColumnFromColumn2(config, model, new Position(lineNumber, endColumn));

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
			reversed: reversed,
			toLineNumber: toLineNumber,
			toVisualColumn: toVisibleColumn
		};
	}

	public static columnSelect(config: CursorConfiguration, model: ICursorSimpleModel, fromViewSelection: Selection, toViewLineNumber: number, toViewVisualColumn: number): IColumnSelectResult {
		const fromViewPosition = new Position(fromViewSelection.selectionStartLineNumber, fromViewSelection.selectionStartColumn);
		const fromViewVisibleColumn = CursorColumns.visibleColumnFromColumn2(config, model, fromViewPosition);
		return ColumnSelection._columnSelect(config, model, fromViewPosition.lineNumber, fromViewVisibleColumn, toViewLineNumber, toViewVisualColumn);
	}

	public static columnSelectLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, toViewLineNumber: number, toViewVisualColumn: number): IColumnSelectResult {
		if (toViewVisualColumn > 1) {
			toViewVisualColumn--;
		}

		return this.columnSelect(config, model, cursor.selection, toViewLineNumber, toViewVisualColumn);
	}

	public static columnSelectRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, toViewLineNumber: number, toViewVisualColumn: number): IColumnSelectResult {
		let maxVisualViewColumn = 0;
		let minViewLineNumber = Math.min(cursor.position.lineNumber, toViewLineNumber);
		let maxViewLineNumber = Math.max(cursor.position.lineNumber, toViewLineNumber);
		for (let lineNumber = minViewLineNumber; lineNumber <= maxViewLineNumber; lineNumber++) {
			let lineMaxViewColumn = model.getLineMaxColumn(lineNumber);
			let lineMaxVisualViewColumn = CursorColumns.visibleColumnFromColumn2(config, model, new Position(lineNumber, lineMaxViewColumn));
			maxVisualViewColumn = Math.max(maxVisualViewColumn, lineMaxVisualViewColumn);
		}

		if (toViewVisualColumn < maxVisualViewColumn) {
			toViewVisualColumn++;
		}

		return this.columnSelect(config, model, cursor.selection, toViewLineNumber, toViewVisualColumn);
	}

	public static columnSelectUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, isPaged: boolean, toViewLineNumber: number, toViewVisualColumn: number): IColumnSelectResult {
		let linesCount = isPaged ? config.pageSize : 1;

		toViewLineNumber -= linesCount;
		if (toViewLineNumber < 1) {
			toViewLineNumber = 1;
		}

		return this.columnSelect(config, model, cursor.selection, toViewLineNumber, toViewVisualColumn);
	}

	public static columnSelectDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, isPaged: boolean, toViewLineNumber: number, toViewVisualColumn: number): IColumnSelectResult {
		let linesCount = isPaged ? config.pageSize : 1;

		toViewLineNumber += linesCount;
		if (toViewLineNumber > model.getLineCount()) {
			toViewLineNumber = model.getLineCount();
		}

		return this.columnSelect(config, model, cursor.selection, toViewLineNumber, toViewVisualColumn);
	}
}
