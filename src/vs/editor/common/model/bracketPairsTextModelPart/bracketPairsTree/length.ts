/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLines } from '../../../../../base/common/strings.js';
import { Position } from '../../../core/position.js';
import { Range } from '../../../core/range.js';
import { TextLength } from '../../../core/textLength.js';

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

export function lengthToObj(length: Length): TextLength {
	const l = length as any as number;
	const lineCount = Math.floor(l / factor);
	const columnCount = l - lineCount * factor;
	return new TextLength(lineCount, columnCount);
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

export function lengthOfRange(range: Range): TextLength {
	if (range.startLineNumber === range.endLineNumber) {
		return new TextLength(0, range.endColumn - range.startColumn);
	} else {
		return new TextLength(range.endLineNumber - range.startLineNumber, range.endColumn - 1);
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

export function lengthOfStringObj(str: string): TextLength {
	const lines = splitLines(str);
	return new TextLength(lines.length - 1, lines[lines.length - 1].length);
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
