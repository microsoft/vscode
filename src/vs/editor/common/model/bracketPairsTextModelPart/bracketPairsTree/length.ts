/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLines } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

/**
 * Represents a non-negative length in terms of line and column count.
 * Prefer using {@link Length} for performance reasons.
*/
export class LengthObj {
	public static zero = new LengthObj(0, 0);

	public static lengthDiffNonNegative(start: LengthObj, end: LengthObj): LengthObj {
		if (end.isLessThan(start)) {
			return LengthObj.zero;
		}
		if (start.lineCount === end.lineCount) {
			return new LengthObj(0, end.columnCount - start.columnCount);
		} else {
			return new LengthObj(end.lineCount - start.lineCount, end.columnCount);
		}
	}

	constructor(
		public readonly lineCount: number,
		public readonly columnCount: number
	) { }

	public isZero() {
		return this.lineCount === 0 && this.columnCount === 0;
	}

	public toLength(): Length {
		return toLength(this.lineCount, this.columnCount);
	}

	public isLessThan(other: LengthObj): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount < other.lineCount;
		}
		return this.columnCount < other.columnCount;
	}

	public isGreaterThan(other: LengthObj): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount > other.lineCount;
		}
		return this.columnCount > other.columnCount;
	}

	public equals(other: LengthObj): boolean {
		return this.lineCount === other.lineCount && this.columnCount === other.columnCount;
	}

	public compare(other: LengthObj): number {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount - other.lineCount;
		}
		return this.columnCount - other.columnCount;
	}

	public add(other: LengthObj): LengthObj {
		if (other.lineCount === 0) {
			return new LengthObj(this.lineCount, this.columnCount + other.columnCount);
		} else {
			return new LengthObj(this.lineCount + other.lineCount, other.columnCount);
		}
	}

	toString() {
		return `${this.lineCount},${this.columnCount}`;
	}
}

/**
 * The end must be greater than or equal to the start.
*/
export function lengthDiff(startLineCount: number, startColumnCount: number, endLineCount: number, endColumnCount: number): Length {
	return (startLineCount !== endLineCount)
		? toLength(endLineCount - startLineCount, endColumnCount)
		: toLength(0, endColumnCount - startColumnCount);
}

/**
 * Represents a non-negative length in terms of line and column count.
 * Does not allocate.
*/
export type Length = { _brand: 'Length' };

export const lengthZero = 0 as any as Length;

export function lengthIsZero(length: Length): boolean {
	return length as any as number === 0;
}

/*
 * We have 52 bits available in a JS number.
 * We use the upper 26 bits to store the line and the lower 26 bits to store the column.
 */
///*
const factor = 2 ** 26;
/*/
const factor = 1000000;
// */

export function toLength(lineCount: number, columnCount: number): Length {
	// llllllllllllllllllllllllllcccccccccccccccccccccccccc (52 bits)
	//       line count (26 bits)    column count (26 bits)

	// If there is no overflow (all values/sums below 2^26 = 67108864),
	// we have `toLength(lns1, cols1) + toLength(lns2, cols2) = toLength(lns1 + lns2, cols1 + cols2)`.

	return (lineCount * factor + columnCount) as any as Length;
}

export function lengthToObj(length: Length): LengthObj {
	const l = length as any as number;
	const lineCount = Math.floor(l / factor);
	const columnCount = l - lineCount * factor;
	return new LengthObj(lineCount, columnCount);
}

export function lengthGetLineCount(length: Length): number {
	return Math.floor(length as any as number / factor);
}

/**
 * Returns the amount of columns of the given length, assuming that it does not span any line.
*/
export function lengthGetColumnCountIfZeroLineCount(length: Length): number {
	return length as any as number;
}


// [10 lines, 5 cols] + [ 0 lines, 3 cols] = [10 lines, 8 cols]
// [10 lines, 5 cols] + [20 lines, 3 cols] = [30 lines, 3 cols]
export function lengthAdd(length1: Length, length2: Length): Length;
export function lengthAdd(l1: any, l2: any): Length {
	let r = l1 + l2;
	if (l2 >= factor) { r = r - (l1 % factor); }
	return r;
}

export function sumLengths<T>(items: readonly T[], lengthFn: (item: T) => Length): Length {
	return items.reduce((a, b) => lengthAdd(a, lengthFn(b)), lengthZero);
}

export function lengthEquals(length1: Length, length2: Length): boolean {
	return length1 === length2;
}

/**
 * Returns a non negative length `result` such that `lengthAdd(length1, result) = length2`, or zero if such length does not exist.
 */
export function lengthDiffNonNegative(length1: Length, length2: Length): Length {
	const l1 = length1 as any as number;
	const l2 = length2 as any as number;

	const diff = l2 - l1;
	if (diff <= 0) {
		// line-count of length1 is higher than line-count of length2
		// or they are equal and column-count of length1 is higher than column-count of length2
		return lengthZero;
	}

	const lineCount1 = Math.floor(l1 / factor);
	const lineCount2 = Math.floor(l2 / factor);

	const colCount2 = l2 - lineCount2 * factor;

	if (lineCount1 === lineCount2) {
		const colCount1 = l1 - lineCount1 * factor;
		return toLength(0, colCount2 - colCount1);
	} else {
		return toLength(lineCount2 - lineCount1, colCount2);
	}
}

export function lengthLessThan(length1: Length, length2: Length): boolean {
	// First, compare line counts, then column counts.
	return (length1 as any as number) < (length2 as any as number);
}

export function lengthLessThanEqual(length1: Length, length2: Length): boolean {
	return (length1 as any as number) <= (length2 as any as number);
}

export function lengthGreaterThanEqual(length1: Length, length2: Length): boolean {
	return (length1 as any as number) >= (length2 as any as number);
}

export function lengthToPosition(length: Length): Position {
	const l = length as any as number;
	const lineCount = Math.floor(l / factor);
	const colCount = l - lineCount * factor;
	return new Position(lineCount + 1, colCount + 1);
}

export function positionToLength(position: Position): Length {
	return toLength(position.lineNumber - 1, position.column - 1);
}

export function lengthsToRange(lengthStart: Length, lengthEnd: Length): Range {
	const l = lengthStart as any as number;
	const lineCount = Math.floor(l / factor);
	const colCount = l - lineCount * factor;

	const l2 = lengthEnd as any as number;
	const lineCount2 = Math.floor(l2 / factor);
	const colCount2 = l2 - lineCount2 * factor;

	return new Range(lineCount + 1, colCount + 1, lineCount2 + 1, colCount2 + 1);
}

export function lengthOfRange(range: Range): LengthObj {
	if (range.startLineNumber === range.endLineNumber) {
		return new LengthObj(0, range.endColumn - range.startColumn);
	} else {
		return new LengthObj(range.endLineNumber - range.startLineNumber, range.endColumn - 1);
	}
}

export function lengthCompare(length1: Length, length2: Length): number {
	const l1 = length1 as any as number;
	const l2 = length2 as any as number;
	return l1 - l2;
}

export function lengthOfString(str: string): Length {
	const lines = splitLines(str);
	return toLength(lines.length - 1, lines[lines.length - 1].length);
}

export function lengthOfStringObj(str: string): LengthObj {
	const lines = splitLines(str);
	return new LengthObj(lines.length - 1, lines[lines.length - 1].length);
}

/**
 * Computes a numeric hash of the given length.
*/
export function lengthHash(length: Length): number {
	return length as any;
}

export function lengthMax(length1: Length, length2: Length): Length {
	return length1 > length2 ? length1 : length2;
}
