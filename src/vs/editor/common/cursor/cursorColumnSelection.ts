/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CursorConfiguration, ICursorSimpleModel, SingleCursorState, IColumnSelectData, SelectionStartKind } from 'vs/editor/common/cursorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class ColumnSelection {

	public static columnSelect(config: CursorConfiguration, model: ICursorSimpleModel, fromLineNumber: number, fromVisibleColumn: number, toLineNumber: number, toVisibleColumn: number): IColumnSelectResult {
		const lineCount = Math.abs(toLineNumber - fromLineNumber) + 1;
		const reversed = (fromLineNumber > toLineNumber);
		const isRTL = (fromVisibleColumn > toVisibleColumn);
		const isLTR = (fromVisibleColumn < toVisibleColumn);

		const result: SingleCursorState[] = [];

		// console.log(`fromVisibleColumn: ${fromVisibleColumn}, toVisibleColumn: ${toVisibleColumn}`);

		for (let i = 0; i < lineCount; i++) {
			const lineNumber = fromLineNumber + (reversed ? -i : i);

			const startColumn = config.columnFromVisibleColumn(model, lineNumber, fromVisibleColumn);
			const endColumn = config.columnFromVisibleColumn(model, lineNumber, toVisibleColumn);
			const visibleStartColumn = config.visibleColumnFromColumn(model, new Position(lineNumber, startColumn));
			const visibleEndColumn = config.visibleColumnFromColumn(model, new Position(lineNumber, endColumn));

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

			result.push(new SingleCursorState(
				new Range(lineNumber, startColumn, lineNumber, startColumn), SelectionStartKind.Simple, 0,
				new Position(lineNumber, endColumn), 0
			));
		}

		if (result.length === 0) {
			// We are after all the lines, so add cursor at the end of each line
			for (let i = 0; i < lineCount; i++) {
				const lineNumber = fromLineNumber + (reversed ? -i : i);
				const maxColumn = model.getLineMaxColumn(lineNumber);

				result.push(new SingleCursorState(
					new Range(lineNumber, maxColumn, lineNumber, maxColumn), SelectionStartKind.Simple, 0,
					new Position(lineNumber, maxColumn), 0
				));
			}
		}

		return {
			viewStates: result,
			reversed: reversed,
			fromLineNumber: fromLineNumber,
			fromVisualColumn: fromVisibleColumn,
			toLineNumber: toLineNumber,
			toVisualColumn: toVisibleColumn
		};
	}

	public static columnSelectLeft(config: CursorConfiguration, model: ICursorSimpleModel, prevColumnSelectData: IColumnSelectData): IColumnSelectResult {
		let toViewVisualColumn = prevColumnSelectData.toViewVisualColumn;
		if (toViewVisualColumn > 0) {
			toViewVisualColumn--;
		}

		return ColumnSelection.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, prevColumnSelectData.toViewLineNumber, toViewVisualColumn);
	}

	public static columnSelectRight(config: CursorConfiguration, model: ICursorSimpleModel, prevColumnSelectData: IColumnSelectData): IColumnSelectResult {
		let maxVisualViewColumn = 0;
		const minViewLineNumber = Math.min(prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.toViewLineNumber);
		const maxViewLineNumber = Math.max(prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.toViewLineNumber);
		for (let lineNumber = minViewLineNumber; lineNumber <= maxViewLineNumber; lineNumber++) {
			const lineMaxViewColumn = model.getLineMaxColumn(lineNumber);
			const lineMaxVisualViewColumn = config.visibleColumnFromColumn(model, new Position(lineNumber, lineMaxViewColumn));
			maxVisualViewColumn = Math.max(maxVisualViewColumn, lineMaxVisualViewColumn);
		}

		let toViewVisualColumn = prevColumnSelectData.toViewVisualColumn;
		if (toViewVisualColumn < maxVisualViewColumn) {
			toViewVisualColumn++;
		}

		return this.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, prevColumnSelectData.toViewLineNumber, toViewVisualColumn);
	}

	public static columnSelectUp(config: CursorConfiguration, model: ICursorSimpleModel, prevColumnSelectData: IColumnSelectData, isPaged: boolean): IColumnSelectResult {
		const linesCount = isPaged ? config.pageSize : 1;
		const toViewLineNumber = Math.max(1, prevColumnSelectData.toViewLineNumber - linesCount);
		return this.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
	}

	public static columnSelectDown(config: CursorConfiguration, model: ICursorSimpleModel, prevColumnSelectData: IColumnSelectData, isPaged: boolean): IColumnSelectResult {
		const linesCount = isPaged ? config.pageSize : 1;
		const toViewLineNumber = Math.min(model.getLineCount(), prevColumnSelectData.toViewLineNumber + linesCount);
		return this.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
	}
}

export interface IColumnSelectResult {
	viewStates: SingleCursorState[];
	reversed: boolean;
	fromLineNumber: number;
	fromVisualColumn: number;
	toLineNumber: number;
	toVisualColumn: number;
}
