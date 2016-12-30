/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IEditorWhitespace } from 'vs/editor/common/editorCommon';

/**
 * Represent whitespaces in between lines and provide fast CRUD management methods.
 * The whitespaces are sorted ascending by `afterLineNumber`.
 */
export class WhitespaceComputer {

	/**
	 * heights[i] is the height in pixels for whitespace at index i
	 */
	private heights: number[];

	/**
	 * afterLineNumbers[i] is the line number whitespace at index i is after
	 */
	private afterLineNumbers: number[];

	/**
	 * ordinals[i] is the orinal of the whitespace at index i
	 */
	private ordinals: number[];

	/**
	 * prefixSum[i] = SUM(heights[j]), 1 <= j <= i
	 */
	private prefixSum: number[];

	/**
	 * prefixSum[i], 1 <= i <= prefixSumValidIndex can be trusted
	 */
	private prefixSumValidIndex: number;

	/**
	 * ids[i] is the whitespace id of whitespace at index i
	 */
	private ids: number[];

	/**
	 * index at which a whitespace is positioned (inside heights, afterLineNumbers, prefixSum members)
	 */
	private whitespaceId2Index: {
		[id: string]: number;
	};

	/**
	 * last whitespace id issued
	 */
	private lastWhitespaceId: number;

	constructor() {
		this.heights = [];
		this.ids = [];
		this.afterLineNumbers = [];
		this.ordinals = [];
		this.prefixSum = [];
		this.prefixSumValidIndex = -1;
		this.whitespaceId2Index = {};
		this.lastWhitespaceId = 0;
	}

	/**
	 * Find the insertion index for a new value inside a sorted array of values.
	 * If the value is already present in the sorted array, the insertion index will be after the already existing value.
	 */
	public static findInsertionIndex(sortedArray: number[], value: number, ordinals: number[], valueOrdinal: number): number {
		var low = 0,
			high = sortedArray.length,
			mid: number;

		while (low < high) {
			mid = ((low + high) >>> 1);

			if (value === sortedArray[mid]) {
				if (valueOrdinal < ordinals[mid]) {
					high = mid;
				} else {
					low = mid + 1;
				}
			} else if (value < sortedArray[mid]) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}

		return low;
	}

	/**
	 * Insert a new whitespace of a certain height after a line number.
	 * The whitespace has a "sticky" characteristic.
	 * Irrespective of edits above or below `afterLineNumber`, the whitespace will follow the initial line.
	 *
	 * @param afterLineNumber The conceptual position of this whitespace. The whitespace will follow this line as best as possible even when deleting/inserting lines above/below.
	 * @param heightInPx The height of the whitespace, in pixels.
	 * @return An id that can be used later to mutate or delete the whitespace
	 */
	public insertWhitespace(afterLineNumber: number, ordinal: number, heightInPx: number): number {
		afterLineNumber = afterLineNumber | 0;
		ordinal = ordinal | 0;
		heightInPx = heightInPx | 0;

		var id = (++this.lastWhitespaceId);
		var insertionIndex = WhitespaceComputer.findInsertionIndex(this.afterLineNumbers, afterLineNumber, this.ordinals, ordinal);
		this.insertWhitespaceAtIndex(id, insertionIndex, afterLineNumber, ordinal, heightInPx);
		return id;
	}

	private insertWhitespaceAtIndex(id: number, insertIndex: number, afterLineNumber: number, ordinal: number, heightInPx: number): void {
		id = id | 0;
		insertIndex = insertIndex | 0;
		afterLineNumber = afterLineNumber | 0;
		ordinal = ordinal | 0;
		heightInPx = heightInPx | 0;

		this.heights.splice(insertIndex, 0, heightInPx);
		this.ids.splice(insertIndex, 0, id);
		this.afterLineNumbers.splice(insertIndex, 0, afterLineNumber);
		this.ordinals.splice(insertIndex, 0, ordinal);
		this.prefixSum.splice(insertIndex, 0, 0);

		let keys = Object.keys(this.whitespaceId2Index);
		for (let i = 0, len = keys.length; i < len; i++) {
			let sid = keys[i];
			let oldIndex = this.whitespaceId2Index[sid];
			if (oldIndex >= insertIndex) {
				this.whitespaceId2Index[sid] = oldIndex + 1;
			}
		}

		this.whitespaceId2Index[id.toString()] = insertIndex;
		this.prefixSumValidIndex = Math.min(this.prefixSumValidIndex, insertIndex - 1);
	}

	public changeWhitespace(id: number, newAfterLineNumber: number, newHeight: number): boolean {
		id = id | 0;
		newAfterLineNumber = newAfterLineNumber | 0;
		newHeight = newHeight | 0;

		let hasChanges = false;
		hasChanges = this.changeWhitespaceHeight(id, newHeight) || hasChanges;
		hasChanges = this.changeWhitespaceAfterLineNumber(id, newAfterLineNumber) || hasChanges;
		return hasChanges;
	}

	/**
	 * Change the height of an existing whitespace
	 *
	 * @param id The whitespace to change
	 * @param newHeightInPx The new height of the whitespace, in pixels
	 * @return Returns true if the whitespace is found and if the new height is different than the old height
	 */
	public changeWhitespaceHeight(id: number, newHeightInPx: number): boolean {
		id = id | 0;
		newHeightInPx = newHeightInPx | 0;

		var sid = id.toString();
		if (this.whitespaceId2Index.hasOwnProperty(sid)) {
			var index = this.whitespaceId2Index[sid];
			if (this.heights[index] !== newHeightInPx) {
				this.heights[index] = newHeightInPx;
				this.prefixSumValidIndex = Math.min(this.prefixSumValidIndex, index - 1);
				return true;
			}
		}
		return false;
	}

	/**
	 * Change the line number after which an existing whitespace flows.
	 *
	 * @param id The whitespace to change
	 * @param newAfterLineNumber The new line number the whitespace will follow
	 * @return Returns true if the whitespace is found and if the new line number is different than the old line number
	 */
	public changeWhitespaceAfterLineNumber(id: number, newAfterLineNumber: number): boolean {
		id = id | 0;
		newAfterLineNumber = newAfterLineNumber | 0;

		var sid = id.toString();
		if (this.whitespaceId2Index.hasOwnProperty(sid)) {
			var index = this.whitespaceId2Index[sid];
			if (this.afterLineNumbers[index] !== newAfterLineNumber) {
				// `afterLineNumber` changed for this whitespace

				// Record old ordinal
				var ordinal = this.ordinals[index];

				// Record old height
				var heightInPx = this.heights[index];

				// Since changing `afterLineNumber` can trigger a reordering, we're gonna remove this whitespace
				this.removeWhitespace(id);

				// And add it again
				var insertionIndex = WhitespaceComputer.findInsertionIndex(this.afterLineNumbers, newAfterLineNumber, this.ordinals, ordinal);
				this.insertWhitespaceAtIndex(id, insertionIndex, newAfterLineNumber, ordinal, heightInPx);

				return true;
			}
		}
		return false;
	}

	/**
	 * Remove an existing whitespace.
	 *
	 * @param id The whitespace to remove
	 * @return Returns true if the whitespace is found and it is removed.
	 */
	public removeWhitespace(id: number): boolean {
		id = id | 0;

		var sid = id.toString();

		if (this.whitespaceId2Index.hasOwnProperty(sid)) {
			var index = this.whitespaceId2Index[sid];
			delete this.whitespaceId2Index[sid];
			this.removeWhitespaceAtIndex(index);
			return true;
		}

		return false;
	}

	private removeWhitespaceAtIndex(removeIndex: number): void {
		removeIndex = removeIndex | 0;

		this.heights.splice(removeIndex, 1);
		this.ids.splice(removeIndex, 1);
		this.afterLineNumbers.splice(removeIndex, 1);
		this.ordinals.splice(removeIndex, 1);
		this.prefixSum.splice(removeIndex, 1);
		this.prefixSumValidIndex = Math.min(this.prefixSumValidIndex, removeIndex - 1);

		let keys = Object.keys(this.whitespaceId2Index);
		for (let i = 0, len = keys.length; i < len; i++) {
			let sid = keys[i];
			let oldIndex = this.whitespaceId2Index[sid];
			if (oldIndex >= removeIndex) {
				this.whitespaceId2Index[sid] = oldIndex - 1;
			}
		}
	}

	/**
	 * Notify the computer that lines have been deleted (a continuous zone of lines).
	 * This gives it a chance to update `afterLineNumber` for whitespaces, giving the "sticky" characteristic.
	 *
	 * @param fromLineNumber The line number at which the deletion started, inclusive
	 * @param toLineNumber The line number at which the deletion ended, inclusive
	 */
	public onModelLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		fromLineNumber = fromLineNumber | 0;
		toLineNumber = toLineNumber | 0;

		var afterLineNumber: number,
			i: number,
			len: number;

		for (i = 0, len = this.afterLineNumbers.length; i < len; i++) {
			afterLineNumber = this.afterLineNumbers[i];

			if (fromLineNumber <= afterLineNumber && afterLineNumber <= toLineNumber) {
				// The line this whitespace was after has been deleted
				//  => move whitespace to before first deleted line
				this.afterLineNumbers[i] = fromLineNumber - 1;
			} else if (afterLineNumber > toLineNumber) {
				// The line this whitespace was after has been moved up
				//  => move whitespace up
				this.afterLineNumbers[i] -= (toLineNumber - fromLineNumber + 1);
			}
		}
	}

	/**
	 * Notify the computer that lines have been inserted (a continuous zone of lines).
	 * This gives it a chance to update `afterLineNumber` for whitespaces, giving the "sticky" characteristic.
	 *
	 * @param fromLineNumber The line number at which the insertion started, inclusive
	 * @param toLineNumber The line number at which the insertion ended, inclusive.
	 */
	public onModelLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		fromLineNumber = fromLineNumber | 0;
		toLineNumber = toLineNumber | 0;

		var afterLineNumber: number,
			i: number,
			len: number;

		for (i = 0, len = this.afterLineNumbers.length; i < len; i++) {
			afterLineNumber = this.afterLineNumbers[i];

			if (fromLineNumber <= afterLineNumber) {
				this.afterLineNumbers[i] += (toLineNumber - fromLineNumber + 1);
			}
		}
	}

	/**
	 * Get the sum of all the whitespaces.
	 */
	public getTotalHeight(): number {
		if (this.heights.length === 0) {
			return 0;
		}
		return this.getAccumulatedHeight(this.heights.length - 1);
	}

	/**
	 * Return the sum of the heights of the whitespaces at [0..index].
	 * This includes the whitespace at `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return The sum of the heights of all whitespaces before the one at `index`, including the one at `index`.
	 */
	public getAccumulatedHeight(index: number): number {
		index = index | 0;

		var startIndex = Math.max(0, this.prefixSumValidIndex + 1);
		if (startIndex === 0) {
			this.prefixSum[0] = this.heights[0];
			startIndex++;
		}

		for (var i = startIndex; i <= index; i++) {
			this.prefixSum[i] = this.prefixSum[i - 1] + this.heights[i];
		}
		this.prefixSumValidIndex = Math.max(this.prefixSumValidIndex, index);
		return this.prefixSum[index];
	}

	/**
	 * Find all whitespaces with `afterLineNumber` < `lineNumber` and return the sum of their heights.
	 *
	 * @param lineNumber The line number whitespaces should be before.
	 * @return The sum of the heights of the whitespaces before `lineNumber`.
	 */
	public getAccumulatedHeightBeforeLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		var lastWhitespaceBeforeLineNumber = this.findLastWhitespaceBeforeLineNumber(lineNumber);

		if (lastWhitespaceBeforeLineNumber === -1) {
			return 0;
		}

		return this.getAccumulatedHeight(lastWhitespaceBeforeLineNumber);
	}

	private findLastWhitespaceBeforeLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		// Find the whitespace before line number
		let afterLineNumbers = this.afterLineNumbers;
		let low = 0;
		let high = afterLineNumbers.length - 1;

		while (low <= high) {
			let delta = (high - low) | 0;
			let halfDelta = (delta / 2) | 0;
			let mid = (low + halfDelta) | 0;

			if (afterLineNumbers[mid] < lineNumber) {
				if (mid + 1 >= afterLineNumbers.length || afterLineNumbers[mid + 1] >= lineNumber) {
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

	private findFirstWhitespaceAfterLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		var lastWhitespaceBeforeLineNumber = this.findLastWhitespaceBeforeLineNumber(lineNumber);
		var firstWhitespaceAfterLineNumber = lastWhitespaceBeforeLineNumber + 1;

		if (firstWhitespaceAfterLineNumber < this.heights.length) {
			return firstWhitespaceAfterLineNumber;
		}

		return -1;
	}

	/**
	 * Find the index of the first whitespace which has `afterLineNumber` >= `lineNumber`.
	 * @return The index of the first whitespace with `afterLineNumber` >= `lineNumber` or -1 if no whitespace is found.
	 */
	public getFirstWhitespaceIndexAfterLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		return this.findFirstWhitespaceAfterLineNumber(lineNumber);
	}

	/**
	 * The number of whitespaces.
	 */
	public getCount(): number {
		return this.heights.length;
	}

	/**
	 * Get the `afterLineNumber` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `afterLineNumber` of whitespace at `index`.
	 */
	public getAfterLineNumberForWhitespaceIndex(index: number): number {
		index = index | 0;

		return this.afterLineNumbers[index];
	}

	/**
	 * Get the `id` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `id` of whitespace at `index`.
	 */
	public getIdForWhitespaceIndex(index: number): number {
		index = index | 0;

		return this.ids[index];
	}

	/**
	 * Get the `height` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `height` of whitespace at `index`.
	 */
	public getHeightForWhitespaceIndex(index: number): number {
		index = index | 0;

		return this.heights[index];
	}

	public getWhitespaces(deviceLineHeight: number): IEditorWhitespace[] {
		deviceLineHeight = deviceLineHeight | 0;

		var result: IEditorWhitespace[] = [];
		for (var i = 0; i < this.heights.length; i++) {
			result.push({
				id: this.ids[i],
				afterLineNumber: this.afterLineNumbers[i],
				heightInLines: this.heights[i] / deviceLineHeight
			});
		}
		return result;
	}
}