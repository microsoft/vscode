/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';

export class CursorMoveHelper {

	public static getColumnAtBeginningOfLine(model: ICursorSimpleModel, lineNumber: number, column: number): number {
		var firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || 1;
		var minColumn = model.getLineMinColumn(lineNumber);

		if (column !== minColumn && column <= firstNonBlankColumn) {
			column = minColumn;
		} else {
			column = firstNonBlankColumn;
		}

		return column;
	}

	public static getColumnAtEndOfLine(model: ICursorSimpleModel, lineNumber: number, column: number): number {
		var maxColumn = model.getLineMaxColumn(lineNumber);
		var lastNonBlankColumn = model.getLineLastNonWhitespaceColumn(lineNumber) || maxColumn;

		if (column !== maxColumn && column >= lastNonBlankColumn) {
			column = maxColumn;
		} else {
			column = lastNonBlankColumn;
		}

		return column;
	}

}
