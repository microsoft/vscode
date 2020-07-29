/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from 'vs/base/common/range';

export interface IItem {
	size: number;
}

export interface IRangedGroup {
	range: IRange;
	size: number;
}

/**
 * Returns the intersection between a ranged group and a range.
 * Returns `[]` if the intersection is empty.
 */
export function groupIntersect(range: IRange, groups: IRangedGroup[]): IRangedGroup[] {
	const result: IRangedGroup[] = [];

	for (let r of groups) {
		if (range.start >= r.range.end) {
			continue;
		}

		if (range.end < r.range.start) {
			break;
		}

		const intersection = Range.intersect(range, r.range);

		if (Range.isEmpty(intersection)) {
			continue;
		}

		result.push({
			range: intersection,
			size: r.size
		});
	}

	return result;
}

/**
 * Shifts a range by that `much`.
 */
export function shift({ start, end }: IRange, much: number): IRange {
	return { start: start + much, end: end + much };
}

/**
 * Consolidates a collection of ranged groups.
 *
 * Consolidation is the process of merging consecutive ranged groups
 * that share the same `size`.
 */
export function consolidate(groups: IRangedGroup[]): IRangedGroup[] {
	const result: IRangedGroup[] = [];
	let previousGroup: IRangedGroup | null = null;

	for (let group of groups) {
		const start = group.range.start;
		const end = group.range.end;
		const size = group.size;

		if (previousGroup && size === previousGroup.size) {
			previousGroup.range.end = end;
			continue;
		}

		previousGroup = { range: { start, end }, size };
		result.push(previousGroup);
	}

	return result;
}

/**
 * Concatenates several collections of ranged groups into a single
 * collection.
 */
function concat(...groups: IRangedGroup[][]): IRangedGroup[] {
	return consolidate(groups.reduce((r, g) => r.concat(g), []));
}

export class ListWhitespace {

	constructor(
		readonly afterIndex: number,
		public height: number,
		public prefixSum: number
	) { }
}

export class RangeMap {

	private groups: IRangedGroup[] = [];
	private whitespaces: ListWhitespace[] = [];
	private _size = 0;

	splice(index: number, deleteCount: number, items: IItem[] = []): void {
		const diff = items.length - deleteCount;
		const before = groupIntersect({ start: 0, end: index }, this.groups);
		const after = groupIntersect({ start: index + deleteCount, end: Number.POSITIVE_INFINITY }, this.groups)
			.map<IRangedGroup>(g => ({ range: shift(g.range, diff), size: g.size }));

		const middle = items.map<IRangedGroup>((item, i) => ({
			range: { start: index + i, end: index + i + 1 },
			size: item.size
		}));

		this.groups = concat(before, middle, after);
		this._size = this.groups.reduce((t, g) => t + (g.size * (g.range.end - g.range.start)), 0);
	}

	public static findInsertionIndex(arr: ListWhitespace[], afterIndex: number): number {
		let low = 0;
		let high = arr.length;

		while (low < high) {
			const mid = ((low + high) >>> 1);

			if (afterIndex === arr[mid].afterIndex) {
				low = mid;
				break;
			} else if (afterIndex < arr[mid].afterIndex) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}

		return low;
	}

	insertWhitespace(afterIndex: number, height: number) {
		// TODO
		// 2. delay prefix sum update
		const insertIndex = RangeMap.findInsertionIndex(this.whitespaces, afterIndex);
		const prefixSum = insertIndex > 0 ? this.whitespaces[insertIndex - 1].prefixSum + height : height;
		const insertedItem = new ListWhitespace(afterIndex, height, prefixSum);
		this.whitespaces.splice(insertIndex, 0, insertedItem);
	}

	// todo, allow multiple whitespaces after one index
	updateWhitespace(afterIndex: number, newHeight: number) {
		let delta = 0;
		for (let i = 0; i < this.whitespaces.length; i++) {
			if (this.whitespaces[i].afterIndex === afterIndex) {
				delta = newHeight - this.whitespaces[i].height;
				this.whitespaces[i].height = newHeight;
				this.whitespaces[i].prefixSum += delta;
			} else if (this.whitespaces[i].afterIndex > afterIndex) {
				this.whitespaces[i].prefixSum += delta;
			}
		}
	}

	/**
	 * Returns the number of items in the range map.
	 */
	get count(): number {
		const len = this.groups.length;

		if (!len) {
			return 0;
		}

		return this.groups[len - 1].range.end;
	}

	/**
	 * Returns the sum of the sizes of all items in the range map.
	 */
	get size(): number {
		return this._size
			+ (this.whitespaces.length ? this.whitespaces[this.whitespaces.length - 1]?.prefixSum : 0);
	}

	private _getWhitespaceAccumulatedHeightBeforeIndex(index: number): number {
		const lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeIndex(index);

		if (lastWhitespaceBeforeLineNumber === -1) {
			return 0;
		}

		return this.whitespaces[lastWhitespaceBeforeLineNumber].prefixSum;
	}

	private _findLastWhitespaceBeforeIndex(index: number): number {
		const arr = this.whitespaces;
		let low = 0;
		let high = arr.length - 1;

		while (low <= high) {
			const delta = (high - low) | 0;
			const halfDelta = (delta / 2) | 0;
			const mid = (low + halfDelta) | 0;

			if (arr[mid].afterIndex < index) {
				if (mid + 1 >= arr.length || arr[mid + 1].afterIndex >= index) {
					return mid;
				} else {
					low = (mid + 1) | 0;
				}
			} else {
				high = (mid - 1) | 0;
			}
		}

		return -1;
	}

	/**
	 * Returns the index of the item at the given position.
	 */
	indexAt(position: number): number {
		if (position < 0) {
			return -1;
		}

		let index = 0;
		let size = 0;

		for (let group of this.groups) {
			const count = group.range.end - group.range.start;
			const newSize = size + (count * group.size);

			if (position < newSize + this._getWhitespaceAccumulatedHeightBeforeIndex(group.range.end + 1)) {
				// try to find the right index
				let currSize = size;
				// position > currSize + all whitespaces before current range
				for (let j = group.range.start; j < group.range.end; j++) {
					currSize = currSize + group.size;

					if (position >= currSize + this._getWhitespaceAccumulatedHeightBeforeIndex(j + 1)) {
						continue;
					} else {
						return j;
					}
				}

				return index + Math.floor((position - size) / group.size);
			}

			index += count;
			size = newSize;
		}

		return index;
	}

	/**
	 * Returns the index of the item right after the item at the
	 * index of the given position.
	 */
	indexAfter(position: number): number {
		return Math.min(this.indexAt(position) + 1, this.count);
	}

	/**
	 * Returns the start position of the item at the given index.
	 */
	positionAt(index: number): number {
		if (index < 0) {
			return -1;
		}

		let position = 0;
		let count = 0;

		for (let group of this.groups) {
			const groupCount = group.range.end - group.range.start;
			const newCount = count + groupCount;

			if (index < newCount) {
				return position + ((index - count) * group.size) + this._getWhitespaceAccumulatedHeightBeforeIndex(index);
			}

			position += groupCount * group.size;
			count = newCount;
		}

		return -1;
	}
}
