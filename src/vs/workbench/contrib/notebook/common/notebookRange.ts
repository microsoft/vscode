/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * [start, end]
 */
export interface ICellRange {
	/**
	 * zero based index
	 */
	start: number;

	/**
	 * zero based index
	 */
	end: number;
}


export function isICellRange(candidate: any): candidate is ICellRange {
	if (!candidate || typeof candidate !== 'object') {
		return false;
	}
	return typeof (<ICellRange>candidate).start === 'number'
		&& typeof (<ICellRange>candidate).end === 'number';
}

export function cellIndexesToRanges(indexes: number[]) {
	indexes.sort((a, b) => a - b);
	const first = indexes.shift();

	if (first === undefined) {
		return [];
	}

	return indexes.reduce(function (ranges, num) {
		if (num <= ranges[0][1]) {
			ranges[0][1] = num + 1;
		} else {
			ranges.unshift([num, num + 1]);
		}
		return ranges;
	}, [[first, first + 1]]).reverse().map(val => ({ start: val[0], end: val[1] }));
}

export function cellRangesToIndexes(ranges: ICellRange[]) {
	const indexes = ranges.reduce((a, b) => {
		for (let i = b.start; i < b.end; i++) {
			a.push(i);
		}

		return a;
	}, [] as number[]);

	return indexes;
}

export function reduceCellRanges(ranges: ICellRange[]): ICellRange[] {
	const sorted = ranges.sort((a, b) => a.start - b.start);
	const first = sorted[0];

	if (!first) {
		return [];
	}

	const reduced = sorted.reduce((prev: ICellRange[], curr) => {
		const last = prev[prev.length - 1];
		if (last.end >= curr.start) {
			last.end = Math.max(last.end, curr.end);
		} else {
			prev.push(curr);
		}
		return prev;
	}, [first] as ICellRange[]);

	if (reduced.length > 1) {
		// remove the (0, 0) range
		return reduced.filter(range => !(range.start === range.end && range.start === 0));
	}

	return reduced;
}

export function cellRangesEqual(a: ICellRange[], b: ICellRange[]) {
	a = reduceCellRanges(a);
	b = reduceCellRanges(b);
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		if (a[i].start !== b[i].start || a[i].end !== b[i].end) {
			return false;
		}
	}

	return true;
}

/**
 * todo@rebornix test and sort
 * @param range
 * @param other
 * @returns
 */

export function cellRangeContains(range: ICellRange, other: ICellRange): boolean {
	return other.start >= range.start && other.end <= range.end;
}
