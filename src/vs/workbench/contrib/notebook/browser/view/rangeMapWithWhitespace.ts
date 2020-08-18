/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { consolidate, groupIntersect, IItem, IRangedGroup, RangeMap, shift } from 'vs/base/browser/ui/list/rangeMap';

export class ListWhitespace {

	constructor(
		public afterIndex: number,
		public height: number,
		// height of all whitespaces before this whitespace (inclusive)
		public prefixSum: number
	) { }
}

function concat(...groups: IRangedGroup[][]): IRangedGroup[] {
	return consolidate(groups.reduce((r, g) => r.concat(g), []));
}

// [ { start: 0, len: 2, size: 2 }, { start: 2, len: 1, size: 3 }, {} ]
export class RangeMapWithWhitespace extends RangeMap {

	private rangeGroups: IRangedGroup[] = [];
	private whitespaces: ListWhitespace[] = [];
	private _mapSize = 0;

	constructor() {
		super();
	}

	splice(index: number, deleteCount: number, items: IItem[] = []): void {
		const diff = items.length - deleteCount;
		const before = groupIntersect({ start: 0, end: index }, this.rangeGroups);
		const after = groupIntersect({ start: index + deleteCount, end: Number.POSITIVE_INFINITY }, this.rangeGroups)
			.map<IRangedGroup>(g => ({ range: shift(g.range, diff), size: g.size }));

		const middle = items.map<IRangedGroup>((item, i) => ({
			range: { start: index + i, end: index + i + 1 },
			size: item.size
		}));

		this.rangeGroups = concat(before, middle, after);
		this._mapSize = this.rangeGroups.reduce((t, g) => t + (g.size * (g.range.end - g.range.start)), 0);

		const deleteRange = deleteCount > 0 ? [index, index + deleteCount - 1] : [];
		const indexDelta = items.length - deleteCount;
		let prefixSumDelta = 0;
		const pendingRemovalWhitespace: number[] = [];
		for (let i = 0; i < this.whitespaces.length; i++) {
			const whitespace = this.whitespaces[i];

			if (whitespace.afterIndex < index) {
				continue;
			} else if (deleteRange.length > 0 && whitespace.afterIndex >= deleteRange[0] && whitespace.afterIndex <= deleteRange[1]) {
				// should be deleted
				pendingRemovalWhitespace.push(i);
				prefixSumDelta += whitespace.height;
			} else {
				whitespace.afterIndex += indexDelta;
				whitespace.prefixSum -= prefixSumDelta;
			}
		}

		pendingRemovalWhitespace.reverse().forEach(index => {
			this.whitespaces.splice(index, 1);
		});
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
		const insertIndex = RangeMapWithWhitespace.findInsertionIndex(this.whitespaces, afterIndex);
		const prefixSum = insertIndex > 0 ? this.whitespaces[insertIndex - 1].prefixSum + height : height;
		const insertedItem = new ListWhitespace(afterIndex, height, prefixSum);
		this.whitespaces.splice(insertIndex, 0, insertedItem);

		for (let i = insertIndex + 1; i < this.whitespaces.length; i++) {
			this.whitespaces[i].prefixSum += height;
		}
	}

	// todo, allow multiple whitespaces after one index
	updateWhitespace(afterIndex: number, newHeight: number) {
		let delta = 0;
		let findWhitespace = false;
		for (let i = 0; i < this.whitespaces.length; i++) {
			if (this.whitespaces[i].afterIndex === afterIndex) {
				delta = newHeight - this.whitespaces[i].height;
				this.whitespaces[i].height = newHeight;
				this.whitespaces[i].prefixSum += delta;
				findWhitespace = true;
			} else if (this.whitespaces[i].afterIndex > afterIndex) {
				if (!findWhitespace) {
					this.insertWhitespace(afterIndex, newHeight);
					return;
				}
				this.whitespaces[i].prefixSum += delta;
			}
		}

		if (!findWhitespace) {
			this.insertWhitespace(afterIndex, newHeight);
		}
	}

	/**
	 * Returns the number of items in the range map.
	 */
	get count(): number {
		const len = this.rangeGroups.length;

		if (!len) {
			return 0;
		}

		return this.rangeGroups[len - 1].range.end;
	}

	/**
	 * Returns the sum of the sizes of all items in the range map.
	 */
	get size(): number {
		return this._mapSize
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

		for (let group of this.rangeGroups) {
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

		for (let group of this.rangeGroups) {
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
