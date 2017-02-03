/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IEditorWhitespace, IViewWhitespaceViewportData } from 'vs/editor/common/editorCommon';
import { WhitespaceComputer } from 'vs/editor/common/viewLayout/whitespaceComputer';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

/**
 * Layouting of objects that take vertical space (by having a height) and push down other objects.
 *
 * These objects are basically either text (lines) or spaces between those lines (whitespaces).
 * This provides commodity operations for working with lines that contain whitespace that pushes lines lower (vertically).
 * This is written with no knowledge of an editor in mind.
 */
export class VerticalObjects {

	/**
	 * Keep track of the total number of lines.
	 * This is useful for doing binary searches or for doing hit-testing.
	 */
	private linesCount: number;

	/**
	 * Contains whitespace information in pixels
	 */
	private whitespaces: WhitespaceComputer;

	constructor() {
		this.linesCount = 0;
		this.whitespaces = new WhitespaceComputer();
	}

	/**
	 * Set the number of lines.
	 *
	 * @param newLineCount New number of lines.
	 */
	public replaceLines(newLineCount: number): void {
		this.linesCount = newLineCount;
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
		return this.whitespaces.insertWhitespace(afterLineNumber, ordinal, heightInPx);
	}

	public changeWhitespace(id: number, newAfterLineNumber: number, newHeight: number): boolean {
		return this.whitespaces.changeWhitespace(id, newAfterLineNumber, newHeight);
	}

	/**
	 * Remove an existing whitespace.
	 *
	 * @param id The whitespace to remove
	 * @return Returns true if the whitespace is found and it is removed.
	 */
	public removeWhitespace(id: number): boolean {
		return this.whitespaces.removeWhitespace(id);
	}

	/**
	 * Notify the layouter that lines have been deleted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the deletion started, inclusive
	 * @param toLineNumber The line number at which the deletion ended, inclusive
	 */
	public onModelLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		this.linesCount -= (toLineNumber - fromLineNumber + 1);
		this.whitespaces.onModelLinesDeleted(fromLineNumber, toLineNumber);
	}

	/**
	 * Notify the layouter that lines have been inserted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the insertion started, inclusive
	 * @param toLineNumber The line number at which the insertion ended, inclusive.
	 */
	public onModelLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this.linesCount += (toLineNumber - fromLineNumber + 1);
		this.whitespaces.onModelLinesInserted(fromLineNumber, toLineNumber);
	}

	/**
	 * Get the sum of heights for all objects.
	 *
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return The sum of heights for all objects.
	 */
	public getTotalHeight(deviceLineHeight: number): number {
		deviceLineHeight = deviceLineHeight | 0;

		let linesHeight = deviceLineHeight * this.linesCount;
		let whitespacesHeight = this.whitespaces.getTotalHeight();
		return linesHeight + whitespacesHeight;
	}

	/**
	 * Get the vertical offset (the sum of heights for all objects above) a certain line number.
	 *
	 * @param lineNumber The line number
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return The sum of heights for all objects above `lineNumber`.
	 */
	public getVerticalOffsetForLineNumber(lineNumber: number, deviceLineHeight: number): number {
		lineNumber = lineNumber | 0;
		deviceLineHeight = deviceLineHeight | 0;

		let previousLinesHeight: number;
		if (lineNumber > 1) {
			previousLinesHeight = deviceLineHeight * (lineNumber - 1);
		} else {
			previousLinesHeight = 0;
		}

		let previousWhitespacesHeight = this.whitespaces.getAccumulatedHeightBeforeLineNumber(lineNumber);

		return previousLinesHeight + previousWhitespacesHeight;
	}

	/**
	 * Returns the accumulated height of whitespaces before the given line number.
	 *
	 * @param lineNumber The line number
	 */
	public getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber: number): number {
		return this.whitespaces.getAccumulatedHeightBeforeLineNumber(lineNumber);
	}

	/**
	 * Returns if there is any whitespace in the document.
	 */
	public hasWhitespace(): boolean {
		return this.whitespaces.getCount() > 0;
	}

	public isAfterLines(verticalOffset: number, deviceLineHeight: number): boolean {
		let totalHeight = this.getTotalHeight(deviceLineHeight);
		return verticalOffset > totalHeight;
	}

	/**
	 * Find the first line number that is at or after vertical offset `verticalOffset`.
	 * i.e. if getVerticalOffsetForLine(line) is x and getVerticalOffsetForLine(line + 1) is y, then
	 * getLineNumberAtOrAfterVerticalOffset(i) = line, x <= i < y.
	 *
	 * @param verticalOffset The vertical offset to search at.
	 * @param deviceLineHeight The height, in piexels, for one rendered line.
	 * @return The line number at or after vertical offset `verticalOffset`.
	 */
	public getLineNumberAtOrAfterVerticalOffset(verticalOffset: number, deviceLineHeight: number): number {
		verticalOffset = verticalOffset | 0;
		deviceLineHeight = deviceLineHeight | 0;

		if (verticalOffset < 0) {
			return 1;
		}

		let minLineNumber = 1;
		let linesCount = this.linesCount | 0;
		let maxLineNumber = linesCount;

		while (minLineNumber < maxLineNumber) {
			let midLineNumber = ((minLineNumber + maxLineNumber) / 2) | 0;

			let midLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(midLineNumber, deviceLineHeight) | 0;

			if (verticalOffset >= midLineNumberVerticalOffset + deviceLineHeight) {
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
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return A structure describing the lines positioned between `verticalOffset1` and `verticalOffset2`.
	 */
	public getLinesViewportData(verticalOffset1: number, verticalOffset2: number, deviceLineHeight: number): IPartialViewLinesViewportData {
		verticalOffset1 = verticalOffset1 | 0;
		verticalOffset2 = verticalOffset2 | 0;
		deviceLineHeight = deviceLineHeight | 0;

		// Find first line number
		// We don't live in a perfect world, so the line number might start before or after verticalOffset1
		let startLineNumber = this.getLineNumberAtOrAfterVerticalOffset(verticalOffset1, deviceLineHeight) | 0;

		let endLineNumber = this.linesCount | 0;
		let startLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(startLineNumber, deviceLineHeight) | 0;

		// Also keep track of what whitespace we've got
		let whitespaceIndex = this.whitespaces.getFirstWhitespaceIndexAfterLineNumber(startLineNumber) | 0;
		let whitespaceCount = this.whitespaces.getCount() | 0;
		let currentWhitespaceHeight: number;
		let currentWhitespaceAfterLineNumber: number;

		if (whitespaceIndex === -1) {
			whitespaceIndex = whitespaceCount;
			currentWhitespaceAfterLineNumber = endLineNumber + 1;
			currentWhitespaceHeight = 0;
		} else {
			currentWhitespaceAfterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
			currentWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
		}

		let currentVerticalOffset = startLineNumberVerticalOffset;
		let currentLineRelativeOffset = currentVerticalOffset;

		// IE (all versions) cannot handle units above about 1,533,908 px, so every 500k pixels bring numbers down
		const STEP_SIZE = 500000;
		let bigNumbersDelta = 0;
		if (startLineNumberVerticalOffset >= STEP_SIZE) {
			// Compute a delta that guarantees that lines are positioned at `lineHeight` increments
			bigNumbersDelta = Math.floor(startLineNumberVerticalOffset / STEP_SIZE) * STEP_SIZE;
			bigNumbersDelta = Math.floor(bigNumbersDelta / deviceLineHeight) * deviceLineHeight;

			currentLineRelativeOffset -= bigNumbersDelta;
		}

		let linesOffsets: number[] = [];

		let verticalCenter = verticalOffset1 + (verticalOffset2 - verticalOffset1) / 2;
		let centeredLineNumber = -1;

		// Figure out how far the lines go
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {

			if (centeredLineNumber === -1) {
				let currentLineTop = currentVerticalOffset;
				let currentLineBottom = currentVerticalOffset + deviceLineHeight;
				if ((currentLineTop <= verticalCenter && verticalCenter < currentLineBottom) || currentLineTop > verticalCenter) {
					centeredLineNumber = lineNumber;
				}
			}

			// Count current line height in the vertical offsets
			currentVerticalOffset += deviceLineHeight;
			linesOffsets[lineNumber - startLineNumber] = currentLineRelativeOffset;

			// Next line starts immediately after this one
			currentLineRelativeOffset += deviceLineHeight;
			while (currentWhitespaceAfterLineNumber === lineNumber) {
				// Push down next line with the height of the current whitespace
				currentLineRelativeOffset += currentWhitespaceHeight;

				// Count current whitespace in the vertical offsets
				currentVerticalOffset += currentWhitespaceHeight;
				whitespaceIndex++;

				if (whitespaceIndex >= whitespaceCount) {
					currentWhitespaceAfterLineNumber = endLineNumber + 1;
				} else {
					currentWhitespaceAfterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
					currentWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
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

		return {
			viewportTop: verticalOffset1 - bigNumbersDelta,
			viewportHeight: verticalOffset2 - verticalOffset1,
			bigNumbersDelta: bigNumbersDelta,
			startLineNumber: startLineNumber,
			endLineNumber: endLineNumber,
			visibleRangesDeltaTop: -(verticalOffset1 - bigNumbersDelta),
			relativeVerticalOffset: linesOffsets,
			centeredLineNumber: centeredLineNumber
		};
	}

	public getVerticalOffsetForWhitespaceIndex(whitespaceIndex: number, deviceLineHeight: number): number {
		whitespaceIndex = whitespaceIndex | 0;
		deviceLineHeight = deviceLineHeight | 0;

		let afterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);

		let previousLinesHeight: number;
		if (afterLineNumber >= 1) {
			previousLinesHeight = deviceLineHeight * afterLineNumber;
		} else {
			previousLinesHeight = 0;
		}

		let previousWhitespacesHeight: number;
		if (whitespaceIndex > 0) {
			previousWhitespacesHeight = this.whitespaces.getAccumulatedHeight(whitespaceIndex - 1);
		} else {
			previousWhitespacesHeight = 0;
		}
		return previousLinesHeight + previousWhitespacesHeight;
	}

	public getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset: number, deviceLineHeight: number): number {
		verticalOffset = verticalOffset | 0;
		deviceLineHeight = deviceLineHeight | 0;

		let midWhitespaceIndex: number,
			minWhitespaceIndex = 0,
			maxWhitespaceIndex = this.whitespaces.getCount() - 1,
			midWhitespaceVerticalOffset: number,
			midWhitespaceHeight: number;

		if (maxWhitespaceIndex < 0) {
			return -1;
		}

		// Special case: nothing to be found
		let maxWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(maxWhitespaceIndex, deviceLineHeight);
		let maxWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(maxWhitespaceIndex);
		if (verticalOffset >= maxWhitespaceVerticalOffset + maxWhitespaceHeight) {
			return -1;
		}

		while (minWhitespaceIndex < maxWhitespaceIndex) {
			midWhitespaceIndex = Math.floor((minWhitespaceIndex + maxWhitespaceIndex) / 2);

			midWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(midWhitespaceIndex, deviceLineHeight);
			midWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(midWhitespaceIndex);

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
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return Precisely the whitespace that is layouted at `verticaloffset` or null.
	 */
	public getWhitespaceAtVerticalOffset(verticalOffset: number, deviceLineHeight: number): IViewWhitespaceViewportData {
		verticalOffset = verticalOffset | 0;
		deviceLineHeight = deviceLineHeight | 0;

		let candidateIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset, deviceLineHeight);

		if (candidateIndex < 0) {
			return null;
		}

		if (candidateIndex >= this.whitespaces.getCount()) {
			return null;
		}

		let candidateTop = this.getVerticalOffsetForWhitespaceIndex(candidateIndex, deviceLineHeight);

		if (candidateTop > verticalOffset) {
			return null;
		}

		let candidateHeight = this.whitespaces.getHeightForWhitespaceIndex(candidateIndex);
		let candidateId = this.whitespaces.getIdForWhitespaceIndex(candidateIndex);
		let candidateAfterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(candidateIndex);

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
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return An array with all the whitespaces in the viewport. If no whitespace is in viewport, the array is empty.
	 */
	public getWhitespaceViewportData(verticalOffset1: number, verticalOffset2: number, deviceLineHeight: number): IViewWhitespaceViewportData[] {
		verticalOffset1 = verticalOffset1 | 0;
		verticalOffset2 = verticalOffset2 | 0;
		deviceLineHeight = deviceLineHeight | 0;

		let startIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset1, deviceLineHeight);
		let endIndex = this.whitespaces.getCount() - 1;

		if (startIndex < 0) {
			return [];
		}

		let result: IViewWhitespaceViewportData[] = [],
			i: number,
			top: number,
			height: number;

		for (i = startIndex; i <= endIndex; i++) {
			top = this.getVerticalOffsetForWhitespaceIndex(i, deviceLineHeight);
			height = this.whitespaces.getHeightForWhitespaceIndex(i);
			if (top >= verticalOffset2) {
				break;
			}

			result.push({
				id: this.whitespaces.getIdForWhitespaceIndex(i),
				afterLineNumber: this.whitespaces.getAfterLineNumberForWhitespaceIndex(i),
				verticalOffset: top,
				height: height
			});
		}

		return result;
	}

	public getWhitespaces(deviceLineHeight: number): IEditorWhitespace[] {
		return this.whitespaces.getWhitespaces(deviceLineHeight);
	}
}