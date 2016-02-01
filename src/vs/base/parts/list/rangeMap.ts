/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IRange {
	count: number;
	size: number;
}

enum SpliceState {
	Searching
}

export class RangeMap {

	private _map: IRange[] = [];
	private _count: number = 0;
	private _length: number = 0;

	splice(index: number, deleteCount: number, ...ranges: IRange[]): void {
		let count = 0, newCount = 0, firstRangeIndex = 0;
		let firstRange: IRange = null;

		for (const range of this._map) {
			newCount = count + range.count;

			if (index < newCount) {
				firstRange = range;
				break;
			}

			count = newCount;
			firstRangeIndex++;
		}

		let indexInFirstRange = index - count;
		let range = firstRange;

		while (range && deleteCount > 0) {
			newCount = count + range.count;

			let indexInRange = Math.max(index - count, 0);
			let rangeDeleteCount = Math.min(range.count - indexInRange, deleteCount);

			range.count -= rangeDeleteCount;
			deleteCount -= rangeDeleteCount;
			this._count -= rangeDeleteCount;
			this._length -= rangeDeleteCount * range.size;

			count = newCount;
		}

		// split the first range if neccessary
		if (!firstRange) {
			this._map = ranges.slice(0);
		} else if (firstRange.count > indexInFirstRange) {
			const leftovers = firstRange.count - indexInFirstRange;

			this._map = [
				...this._map.slice(0, firstRangeIndex),
				{ count: indexInFirstRange, size: firstRange.size },
				...ranges,
				{ count: leftovers, size: firstRange.size },
				...this._map.slice(firstRangeIndex + 1)
			];

			firstRangeIndex += 1;
		} else {
			this._map = [
				...this._map.slice(0, firstRangeIndex + 1),
				...ranges,
				...this._map.slice(firstRangeIndex + 1)
			];
		}

		for (const range of ranges) {
			this._count += range.count;
			this._length += range.size * range.count;
		}
	}

	get count(): number {
		return this._count;
	}

	get length(): number {
		return this._length;
	}

	indexAt(position: number): number {
		let index = 0;
		let size = 0;

		for (const range of this._map) {
			const newSize = size + (range.count * range.size);

			if (position < newSize) {
				return index + Math.floor((position - size) / range.size);
			}

			index += range.size;
			size = newSize;
		}

		return -1;
	}

	positionAt(index: number): number {
		let position = 0;
		let count = 0;

		for (const range of this._map) {
			const newCount = count + range.count;

			if (index < newCount) {
				return position + ((index - count) * range.size);
			}

			position += range.count * range.size;
			count = newCount;
		}

		return -1;
	}

	dispose() {
		this._map = null;
		this._count = null;
		this._length = null;
	}
}