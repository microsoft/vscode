/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../base/common/errors.js';
import { OffsetRange } from './offsetRange.js';
import { Range } from '../range.js';

/**
 * Represents a 1-based range of columns.
 * Use {@lik OffsetRange} to represent a 0-based range.
*/
export class ColumnRange {
	public static fromOffsetRange(offsetRange: OffsetRange): ColumnRange {
		return new ColumnRange(offsetRange.start + 1, offsetRange.endExclusive + 1);
	}

	constructor(
		/** 1-based */
		public readonly startColumn: number,
		public readonly endColumnExclusive: number
	) {
		if (startColumn > endColumnExclusive) {
			throw new BugIndicatingError(`startColumn ${startColumn} cannot be after endColumnExclusive ${endColumnExclusive}`);
		}
	}

	toRange(lineNumber: number): Range {
		return new Range(lineNumber, this.startColumn, lineNumber, this.endColumnExclusive);
	}

	equals(other: ColumnRange): boolean {
		return this.startColumn === other.startColumn
			&& this.endColumnExclusive === other.endColumnExclusive;
	}

	toZeroBasedOffsetRange(): OffsetRange {
		return new OffsetRange(this.startColumn - 1, this.endColumnExclusive - 1);
	}
}
