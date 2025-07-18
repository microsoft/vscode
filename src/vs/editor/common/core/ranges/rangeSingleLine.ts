/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColumnRange } from './columnRange.js';
import { Range } from '../range.js';

/**
 * Represents a column range in a single line.
*/
export class RangeSingleLine {
	public static fromRange(range: Range): RangeSingleLine | undefined {
		if (range.endLineNumber !== range.startLineNumber) {
			return undefined;
		}
		return new RangeSingleLine(range.startLineNumber, new ColumnRange(range.startColumn, range.endColumn));
	}

	constructor(
		/** 1-based */
		public readonly lineNumber: number,
		public readonly columnRange: ColumnRange,
	) { }

	toRange(): Range {
		return new Range(this.lineNumber, this.columnRange.startColumn, this.lineNumber, this.columnRange.endColumnExclusive);
	}
}
