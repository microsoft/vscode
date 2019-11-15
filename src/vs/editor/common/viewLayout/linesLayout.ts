/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IViewWhitespaceViewportData } from 'vs/editor/common/viewModel/viewModel';
import * as strings from 'vs/base/common/strings';

export interface IEditorWhitespace {
	readonly id: string;
	readonly afterLineNumber: number;
	readonly heightInLines: number;
}

/**
 * Layouting of objects that take vertical space (by having a height) and push down other objects.
 *
 * These objects are basically either text (lines) or spaces between those lines (whitespaces).
 * This provides commodity operations for working with lines that contain whitespace that pushes lines lower (vertically).
 */
export class LinesLayout {

	private static INSTANCE_COUNT = 0;

	private readonly _instanceId: string;

	/**
	 * heights[i] is the height in pixels for whitespace at index i
	 */
	private readonly _heights: number[];

	/**
	 * minWidths[i] is the min width in pixels for whitespace at index i
	 */
	private readonly _minWidths: number[];

	/**
	 * afterLineNumbers[i] is the line number whitespace at index i is after
	 */
	private readonly _afterLineNumbers: number[];

	/**
	 * ordinals[i] is the orinal of the whitespace at index i
	 */
	private readonly _ordinals: number[];

	/**
	 * prefixSum[i] = SUM(heights[j]), 1 <= j <= i
	 */
	private readonly _prefixSum: number[];

	/**
	 * prefixSum[i], 1 <= i <= prefixSumValidIndex can be trusted
	 */
	private _prefixSumValidIndex: number;

	/**
	 * ids[i] is the whitespace id of whitespace at index i
	 */
	private readonly _ids: string[];

	/**
	 * index at which a whitespace is positioned (inside heights, afterLineNumbers, prefixSum members)
	 */
	private readonly _whitespaceId2Index: {
		[id: string]: number;
	};

	/**
	 * last whitespace id issued
	 */
	private _lastWhitespaceId: number;

	private _minWidth: number;

	/**
	 * Keep track of the total number of lines.
	 * This is useful for doing binary searches or for doing hit-testing.
	 */
	private _lineCount: number;

	/**
	 * The height of a line in pixels.
	 */
	private _lineHeight: number;

	constructor(lineCount: number, lineHeight: number) {
		this._instanceId = strings.singleLetterHash(++LinesLayout.INSTANCE_COUNT);
		this._heights = [];
		this._minWidths = [];
		this._ids = [];
		this._afterLineNumbers = [];
		this._ordinals = [];
		this._prefixSum = [];
		this._prefixSumValidIndex = -1;
		this._whitespaceId2Index = {};
		this._lastWhitespaceId = 0;
		this._minWidth = -1; /* marker for not being computed */
		this._lineCount = lineCount;
		this._lineHeight = lineHeight;
	}

	/**
	 * Find the insertion index for a new value inside a sorted array of values.
	 * If the value is already present in the sorted array, the insertion index will be after the already existing value.
	 */
	public static findInsertionIndex(sortedArray: number[], value: number, ordinals: number[], valueOrdinal: number): number {
		let low = 0;
		let high = sortedArray.length;

		while (low < high) {
			let mid = ((low + high) >>> 1);

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
	 * Change the height of a line in pixels.
	 */
	public setLineHeight(lineHeight: number): void {
		this._lineHeight = lineHeight;
	}

	/**
	 * Set the number of lines.
	 *
	 * @param lineCount New number of lines.
	 */
	public onFlushed(lineCount: number): void {
		this._lineCount = lineCount;
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
	public insertWhitespace(afterLineNumber: number, ordinal: number, heightInPx: number, minWidth: number): string {
		afterLineNumber = afterLineNumber | 0;
		ordinal = ordinal | 0;
		heightInPx = heightInPx | 0;
		minWidth = minWidth | 0;

		let id = this._instanceId + (++this._lastWhitespaceId);
		let insertionIndex = LinesLayout.findInsertionIndex(this._afterLineNumbers, afterLineNumber, this._ordinals, ordinal);
		this._insertWhitespaceAtIndex(id, insertionIndex, afterLineNumber, ordinal, heightInPx, minWidth);
		this._minWidth = -1; /* marker for not being computed */
		return id;
	}

	private _insertWhitespaceAtIndex(id: string, insertIndex: number, afterLineNumber: number, ordinal: number, heightInPx: number, minWidth: number): void {
		insertIndex = insertIndex | 0;
		afterLineNumber = afterLineNumber | 0;
		ordinal = ordinal | 0;
		heightInPx = heightInPx | 0;
		minWidth = minWidth | 0;

		this._heights.splice(insertIndex, 0, heightInPx);
		this._minWidths.splice(insertIndex, 0, minWidth);
		this._ids.splice(insertIndex, 0, id);
		this._afterLineNumbers.splice(insertIndex, 0, afterLineNumber);
		this._ordinals.splice(insertIndex, 0, ordinal);
		this._prefixSum.splice(insertIndex, 0, 0);

		let keys = Object.keys(this._whitespaceId2Index);
		for (let i = 0, len = keys.length; i < len; i++) {
			let sid = keys[i];
			let oldIndex = this._whitespaceId2Index[sid];
			if (oldIndex >= insertIndex) {
				this._whitespaceId2Index[sid] = oldIndex + 1;
			}
		}

		this._whitespaceId2Index[id] = insertIndex;
		this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, insertIndex - 1);
	}

	/**
	 * Change properties associated with a certain whitespace.
	 */
	public changeWhitespace(id: string, newAfterLineNumber: number, newHeight: number): boolean {
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
	public changeWhitespaceHeight(id: string, newHeightInPx: number): boolean {
		newHeightInPx = newHeightInPx | 0;

		if (this._whitespaceId2Index.hasOwnProperty(id)) {
			let index = this._whitespaceId2Index[id];
			if (this._heights[index] !== newHeightInPx) {
				this._heights[index] = newHeightInPx;
				this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, index - 1);
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
	public changeWhitespaceAfterLineNumber(id: string, newAfterLineNumber: number): boolean {
		newAfterLineNumber = newAfterLineNumber | 0;

		if (this._whitespaceId2Index.hasOwnProperty(id)) {
			let index = this._whitespaceId2Index[id];
			if (this._afterLineNumbers[index] !== newAfterLineNumber) {
				// `afterLineNumber` changed for this whitespace

				// Record old ordinal
				let ordinal = this._ordinals[index];

				// Record old height
				let heightInPx = this._heights[index];

				// Record old min width
				let minWidth = this._minWidths[index];

				// Since changing `afterLineNumber` can trigger a reordering, we're gonna remove this whitespace
				this.removeWhitespace(id);

				// And add it again
				let insertionIndex = LinesLayout.findInsertionIndex(this._afterLineNumbers, newAfterLineNumber, this._ordinals, ordinal);
				this._insertWhitespaceAtIndex(id, insertionIndex, newAfterLineNumber, ordinal, heightInPx, minWidth);

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
	public removeWhitespace(id: string): boolean {
		if (this._whitespaceId2Index.hasOwnProperty(id)) {
			let index = this._whitespaceId2Index[id];
			delete this._whitespaceId2Index[id];
			this._removeWhitespaceAtIndex(index);
			this._minWidth = -1; /* marker for not being computed */
			return true;
		}

		return false;
	}

	private _removeWhitespaceAtIndex(removeIndex: number): void {
		removeIndex = removeIndex | 0;

		this._heights.splice(removeIndex, 1);
		this._minWidths.splice(removeIndex, 1);
		this._ids.splice(removeIndex, 1);
		this._afterLineNumbers.splice(removeIndex, 1);
		this._ordinals.splice(removeIndex, 1);
		this._prefixSum.splice(removeIndex, 1);
		this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, removeIndex - 1);

		let keys = Object.keys(this._whitespaceId2Index);
		for (let i = 0, len = keys.length; i < len; i++) {
			let sid = keys[i];
			let oldIndex = this._whitespaceId2Index[sid];
			if (oldIndex >= removeIndex) {
				this._whitespaceId2Index[sid] = oldIndex - 1;
			}
		}
	}

	/**
	 * Notify the layouter that lines have been deleted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the deletion started, inclusive
	 * @param toLineNumber The line number at which the deletion ended, inclusive
	 */
	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		fromLineNumber = fromLineNumber | 0;
		toLineNumber = toLineNumber | 0;

		this._lineCount -= (toLineNumber - fromLineNumber + 1);
		for (let i = 0, len = this._afterLineNumbers.length; i < len; i++) {
			let afterLineNumber = this._afterLineNumbers[i];

			if (fromLineNumber <= afterLineNumber && afterLineNumber <= toLineNumber) {
				// The line this whitespace was after has been deleted
				//  => move whitespace to before first deleted line
				this._afterLineNumbers[i] = fromLineNumber - 1;
			} else if (afterLineNumber > toLineNumber) {
				// The line this whitespace was after has been moved up
				//  => move whitespace up
				this._afterLineNumbers[i] -= (toLineNumber - fromLineNumber + 1);
			}
		}
	}

	/**
	 * Notify the layouter that lines have been inserted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the insertion started, inclusive
	 * @param toLineNumber The line number at which the insertion ended, inclusive.
	 */
	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		fromLineNumber = fromLineNumber | 0;
		toLineNumber = toLineNumber | 0;

		this._lineCount += (toLineNumber - fromLineNumber + 1);
		for (let i = 0, len = this._afterLineNumbers.length; i < len; i++) {
			let afterLineNumber = this._afterLineNumbers[i];

			if (fromLineNumber <= afterLineNumber) {
				this._afterLineNumbers[i] += (toLineNumber - fromLineNumber + 1);
			}
		}
	}

	/**
	 * Get the sum of all the whitespaces.
	 */
	public getWhitespacesTotalHeight(): number {
		if (this._heights.length === 0) {
			return 0;
		}
		return this.getWhitespacesAccumulatedHeight(this._heights.length - 1);
	}

	/**
	 * Return the sum of the heights of the whitespaces at [0..index].
	 * This includes the whitespace at `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return The sum of the heights of all whitespaces before the one at `index`, including the one at `index`.
	 */
	public getWhitespacesAccumulatedHeight(index: number): number {
		index = index | 0;

		let startIndex = Math.max(0, this._prefixSumValidIndex + 1);
		if (startIndex === 0) {
			this._prefixSum[0] = this._heights[0];
			startIndex++;
		}

		for (let i = startIndex; i <= index; i++) {
			this._prefixSum[i] = this._prefixSum[i - 1] + this._heights[i];
		}
		this._prefixSumValidIndex = Math.max(this._prefixSumValidIndex, index);
		return this._prefixSum[index];
	}

	/**
	 * Get the sum of heights for all objects.
	 *
	 * @return The sum of heights for all objects.
	 */
	public getLinesTotalHeight(): number {
		let linesHeight = this._lineHeight * this._lineCount;
		let whitespacesHeight = this.getWhitespacesTotalHeight();
		return linesHeight + whitespacesHeight;
	}

	/**
	 * Returns the accumulated height of whitespaces before the given line number.
	 *
	 * @param lineNumber The line number
	 */
	public getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		let lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);

		if (lastWhitespaceBeforeLineNumber === -1) {
			return 0;
		}

		return this.getWhitespacesAccumulatedHeight(lastWhitespaceBeforeLineNumber);
	}

	private _findLastWhitespaceBeforeLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		// Find the whitespace before line number
		let afterLineNumbers = this._afterLineNumbers;
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

	private _findFirstWhitespaceAfterLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		let lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);
		let firstWhitespaceAfterLineNumber = lastWhitespaceBeforeLineNumber + 1;

		if (firstWhitespaceAfterLineNumber < this._heights.length) {
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

		return this._findFirstWhitespaceAfterLineNumber(lineNumber);
	}

	/**
	 * Get the vertical offset (the sum of heights for all objects above) a certain line number.
	 *
	 * @param lineNumber The line number
	 * @return The sum of heights for all objects above `lineNumber`.
	 */
	public getVerticalOffsetForLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		let previousLinesHeight: number;
		if (lineNumber > 1) {
			previousLinesHeight = this._lineHeight * (lineNumber - 1);
		} else {
			previousLinesHeight = 0;
		}

		let previousWhitespacesHeight = this.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber);

		return previousLinesHeight + previousWhitespacesHeight;
	}

	/**
	 * Returns if there is any whitespace in the document.
	 */
	public hasWhitespace(): boolean {
		return this.getWhitespacesCount() > 0;
	}

	/**
	 * The maximum min width for all whitespaces.
	 */
	public getWhitespaceMinWidth(): number {
		if (this._minWidth === -1) {
			let minWidth = 0;
			for (let i = 0, len = this._minWidths.length; i < len; i++) {
				minWidth = Math.max(minWidth, this._minWidths[i]);
			}
			this._minWidth = minWidth;
		}
		return this._minWidth;
	}

	/**
	 * Check if `verticalOffset` is below all lines.
	 */
	public isAfterLines(verticalOffset: number): boolean {
		let totalHeight = this.getLinesTotalHeight();
		return verticalOffset > totalHeight;
	}

	/**
	 * Find the first line number that is at or after vertical offset `verticalOffset`.
	 * i.e. if getVerticalOffsetForLine(line) is x and getVerticalOffsetForLine(line + 1) is y, then
	 * getLineNumberAtOrAfterVerticalOffset(i) = line, x <= i < y.
	 *
	 * @param verticalOffset The vertical offset to search at.
	 * @return The line number at or after vertical offset `verticalOffset`.
	 */
	public getLineNumberAtOrAfterVerticalOffset(verticalOffset: number): number {
		verticalOffset = verticalOffset | 0;

		if (verticalOffset < 0) {
			return 1;
		}

		const linesCount = this._lineCount | 0;
		const lineHeight = this._lineHeight;
		let minLineNumber = 1;
		let maxLineNumber = linesCount;

		while (minLineNumber < maxLineNumber) {
			let midLineNumber = ((minLineNumber + maxLineNumber) / 2) | 0;

			let midLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(midLineNumber) | 0;

			if (verticalOffset >= midLineNumberVerticalOffset + lineHeight) {
				// vertical offset is after mid line number
				minLineNumber = midLineNumber + 1;
			} else if (verticalOffset >= midLineNumberVerticalOffset) {
				// Hit
				return midLineNumber;
			} else {
				// vertical offset is before mid line number, but mid line number could still be what we're searching for
				maxLineNumber = midLineNumber;
			}
		}

		if (minLineNumber > linesCount) {
			return linesCount;
		}

		return minLineNumber;
	}

	/**
	 * Get all the lines and their relative vertical offsets that are positioned between `verticalOffset1` and `verticalOffset2`.
	 *
	 * @param verticalOffset1 The beginning of the viewport.
	 * @param verticalOffset2 The end of the viewport.
	 * @return A structure describing the lines positioned between `verticalOffset1` and `verticalOffset2`.
	 */
	public getLinesViewportData(verticalOffset1: number, verticalOffset2: number): IPartialViewLinesViewportData {
		verticalOffset1 = verticalOffset1 | 0;
		verticalOffset2 = verticalOffset2 | 0;
		const lineHeight = this._lineHeight;

		// Find first line number
		// We don't live in a perfect world, so the line number might start before or after verticalOffset1
		const startLineNumber = this.getLineNumberAtOrAfterVerticalOffset(verticalOffset1) | 0;
		const startLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(startLineNumber) | 0;

		let endLineNumber = this._lineCount | 0;

		// Also keep track of what whitespace we've got
		let whitespaceIndex = this.getFirstWhitespaceIndexAfterLineNumber(startLineNumber) | 0;
		const whitespaceCount = this.getWhitespacesCount() | 0;
		let currentWhitespaceHeight: number;
		let currentWhitespaceAfterLineNumber: number;

		if (whitespaceIndex === -1) {
			whitespaceIndex = whitespaceCount;
			currentWhitespaceAfterLineNumber = endLineNumber + 1;
			currentWhitespaceHeight = 0;
		} else {
			currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
			currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
		}

		let currentVerticalOffset = startLineNumberVerticalOffset;
		let currentLineRelativeOffset = currentVerticalOffset;

		// IE (all versions) cannot handle units above about 1,533,908 px, so every 500k pixels bring numbers down
		const STEP_SIZE = 500000;
		let bigNumbersDelta = 0;
		if (startLineNumberVerticalOffset >= STEP_SIZE) {
			// Compute a delta that guarantees that lines are positioned at `lineHeight` increments
			bigNumbersDelta = Math.floor(startLineNumberVerticalOffset / STEP_SIZE) * STEP_SIZE;
			bigNumbersDelta = Math.floor(bigNumbersDelta / lineHeight) * lineHeight;

			currentLineRelativeOffset -= bigNumbersDelta;
		}

		let linesOffsets: number[] = [];

		const verticalCenter = verticalOffset1 + (verticalOffset2 - verticalOffset1) / 2;
		let centeredLineNumber = -1;

		// Figure out how far the lines go
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {

			if (centeredLineNumber === -1) {
				let currentLineTop = currentVerticalOffset;
				let currentLineBottom = currentVerticalOffset + lineHeight;
				if ((currentLineTop <= verticalCenter && verticalCenter < currentLineBottom) || currentLineTop > verticalCenter) {
					centeredLineNumber = lineNumber;
				}
			}

			// Count current line height in the vertical offsets
			currentVerticalOffset += lineHeight;
			linesOffsets[lineNumber - startLineNumber] = currentLineRelativeOffset;

			// Next line starts immediately after this one
			currentLineRelativeOffset += lineHeight;
			while (currentWhitespaceAfterLineNumber === lineNumber) {
				// Push down next line with the height of the current whitespace
				currentLineRelativeOffset += currentWhitespaceHeight;

				// Count current whitespace in the vertical offsets
				currentVerticalOffset += currentWhitespaceHeight;
				whitespaceIndex++;

				if (whitespaceIndex >= whitespaceCount) {
					currentWhitespaceAfterLineNumber = endLineNumber + 1;
				} else {
					currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
					currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
				}
			}

			if (currentVerticalOffset >= verticalOffset2) {
				// We have covered the entire viewport area, time to stop
				endLineNumber = lineNumber;
				break;
			}
		}

		if (centeredLineNumber === -1) {
			centeredLineNumber = endLineNumber;
		}

		const endLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(endLineNumber) | 0;

		let completelyVisibleStartLineNumber = startLineNumber;
		let completelyVisibleEndLineNumber = endLineNumber;

		if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
			if (startLineNumberVerticalOffset < verticalOffset1) {
				completelyVisibleStartLineNumber++;
			}
		}
		if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
			if (endLineNumberVerticalOffset + lineHeight > verticalOffset2) {
				completelyVisibleEndLineNumber--;
			}
		}

		return {
			bigNumbersDelta: bigNumbersDelta,
			startLineNumber: startLineNumber,
			endLineNumber: endLineNumber,
			relativeVerticalOffset: linesOffsets,
			centeredLineNumber: centeredLineNumber,
			completelyVisibleStartLineNumber: completelyVisibleStartLineNumber,
			completelyVisibleEndLineNumber: completelyVisibleEndLineNumber
		};
	}

	public getVerticalOffsetForWhitespaceIndex(whitespaceIndex: number): number {
		whitespaceIndex = whitespaceIndex | 0;

		let afterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);

		let previousLinesHeight: number;
		if (afterLineNumber >= 1) {
			previousLinesHeight = this._lineHeight * afterLineNumber;
		} else {
			previousLinesHeight = 0;
		}

		let previousWhitespacesHeight: number;
		if (whitespaceIndex > 0) {
			previousWhitespacesHeight = this.getWhitespacesAccumulatedHeight(whitespaceIndex - 1);
		} else {
			previousWhitespacesHeight = 0;
		}
		return previousLinesHeight + previousWhitespacesHeight;
	}

	public getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset: number): number {
		verticalOffset = verticalOffset | 0;

		let midWhitespaceIndex: number,
			minWhitespaceIndex = 0,
			maxWhitespaceIndex = this.getWhitespacesCount() - 1,
			midWhitespaceVerticalOffset: number,
			midWhitespaceHeight: number;

		if (maxWhitespaceIndex < 0) {
			return -1;
		}

		// Special case: nothing to be found
		let maxWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(maxWhitespaceIndex);
		let maxWhitespaceHeight = this.getHeightForWhitespaceIndex(maxWhitespaceIndex);
		if (verticalOffset >= maxWhitespaceVerticalOffset + maxWhitespaceHeight) {
			return -1;
		}

		while (minWhitespaceIndex < maxWhitespaceIndex) {
			midWhitespaceIndex = Math.floor((minWhitespaceIndex + maxWhitespaceIndex) / 2);

			midWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(midWhitespaceIndex);
			midWhitespaceHeight = this.getHeightForWhitespaceIndex(midWhitespaceIndex);

			if (verticalOffset >= midWhitespaceVerticalOffset + midWhitespaceHeight) {
				// vertical offset is after whitespace
				minWhitespaceIndex = midWhitespaceIndex + 1;
			} else if (verticalOffset >= midWhitespaceVerticalOffset) {
				// Hit
				return midWhitespaceIndex;
			} else {
				// vertical offset is before whitespace, but midWhitespaceIndex might still be what we're searching for
				maxWhitespaceIndex = midWhitespaceIndex;
			}
		}
		return minWhitespaceIndex;
	}

	/**
	 * Get exactly the whitespace that is layouted at `verticalOffset`.
	 *
	 * @param verticalOffset The vertical offset.
	 * @return Precisely the whitespace that is layouted at `verticaloffset` or null.
	 */
	public getWhitespaceAtVerticalOffset(verticalOffset: number): IViewWhitespaceViewportData | null {
		verticalOffset = verticalOffset | 0;

		let candidateIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset);

		if (candidateIndex < 0) {
			return null;
		}

		if (candidateIndex >= this.getWhitespacesCount()) {
			return null;
		}

		let candidateTop = this.getVerticalOffsetForWhitespaceIndex(candidateIndex);

		if (candidateTop > verticalOffset) {
			return null;
		}

		let candidateHeight = this.getHeightForWhitespaceIndex(candidateIndex);
		let candidateId = this.getIdForWhitespaceIndex(candidateIndex);
		let candidateAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(candidateIndex);

		return {
			id: candidateId,
			afterLineNumber: candidateAfterLineNumber,
			verticalOffset: candidateTop,
			height: candidateHeight
		};
	}

	/**
	 * Get a list of whitespaces that are positioned between `verticalOffset1` and `verticalOffset2`.
	 *
	 * @param verticalOffset1 The beginning of the viewport.
	 * @param verticalOffset2 The end of the viewport.
	 * @return An array with all the whitespaces in the viewport. If no whitespace is in viewport, the array is empty.
	 */
	public getWhitespaceViewportData(verticalOffset1: number, verticalOffset2: number): IViewWhitespaceViewportData[] {
		verticalOffset1 = verticalOffset1 | 0;
		verticalOffset2 = verticalOffset2 | 0;

		let startIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset1);
		let endIndex = this.getWhitespacesCount() - 1;

		if (startIndex < 0) {
			return [];
		}

		let result: IViewWhitespaceViewportData[] = [];
		for (let i = startIndex; i <= endIndex; i++) {
			let top = this.getVerticalOffsetForWhitespaceIndex(i);
			let height = this.getHeightForWhitespaceIndex(i);
			if (top >= verticalOffset2) {
				break;
			}

			result.push({
				id: this.getIdForWhitespaceIndex(i),
				afterLineNumber: this.getAfterLineNumberForWhitespaceIndex(i),
				verticalOffset: top,
				height: height
			});
		}

		return result;
	}

	/**
	 * Get all whitespaces.
	 */
	public getWhitespaces(): IEditorWhitespace[] {
		let result: IEditorWhitespace[] = [];
		for (let i = 0; i < this._heights.length; i++) {
			result.push({
				id: this._ids[i],
				afterLineNumber: this._afterLineNumbers[i],
				heightInLines: this._heights[i] / this._lineHeight
			});
		}
		return result;
	}

	/**
	 * The number of whitespaces.
	 */
	public getWhitespacesCount(): number {
		return this._heights.length;
	}

	/**
	 * Get the `id` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `id` of whitespace at `index`.
	 */
	public getIdForWhitespaceIndex(index: number): string {
		index = index | 0;

		return this._ids[index];
	}

	/**
	 * Get the `afterLineNumber` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `afterLineNumber` of whitespace at `index`.
	 */
	public getAfterLineNumberForWhitespaceIndex(index: number): number {
		index = index | 0;

		return this._afterLineNumbers[index];
	}

	/**
	 * Get the `height` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `height` of whitespace at `index`.
	 */
	public getHeightForWhitespaceIndex(index: number): number {
		index = index | 0;

		return this._heights[index];
	}
}
