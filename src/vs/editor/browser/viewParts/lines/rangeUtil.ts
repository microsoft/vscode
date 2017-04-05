/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { HorizontalRange } from 'vs/editor/common/view/renderingContext';

class FloatHorizontalRange {
	_floatHorizontalRangeBrand: void;

	public readonly left: number;
	public readonly width: number;

	constructor(left: number, width: number) {
		this.left = left;
		this.width = width;
	}

	public toString(): string {
		return `[${this.left},${this.width}]`;
	}

	public static compare(a: FloatHorizontalRange, b: FloatHorizontalRange): number {
		return a.left - b.left;
	}
}

export class RangeUtil {

	/**
	 * Reusing the same range here
	 * because IE is buggy and constantly freezes when using a large number
	 * of ranges and calling .detach on them
	 */
	private static _handyReadyRange: Range;

	private static _createRange(): Range {
		if (!this._handyReadyRange) {
			this._handyReadyRange = document.createRange();
		}
		return this._handyReadyRange;
	}

	private static _detachRange(range: Range, endNode: HTMLElement): void {
		// Move range out of the span node, IE doesn't like having many ranges in
		// the same spot and will act badly for lines containing dashes ('-')
		range.selectNodeContents(endNode);
	}

	private static _readClientRects(startElement: Node, startOffset: number, endElement: Node, endOffset: number, endNode: HTMLElement): ClientRectList {
		let range = this._createRange();
		try {
			range.setStart(startElement, startOffset);
			range.setEnd(endElement, endOffset);

			return range.getClientRects();
		} catch (e) {
			// This is life ...
			return null;
		} finally {
			this._detachRange(range, endNode);
		}
	}

	private static _mergeAdjacentRanges(ranges: FloatHorizontalRange[]): HorizontalRange[] {
		if (ranges.length === 1) {
			// There is nothing to merge
			return [new HorizontalRange(ranges[0].left, ranges[0].width)];
		}

		ranges.sort(FloatHorizontalRange.compare);

		let result: HorizontalRange[] = [], resultLen = 0;
		let prevLeft = ranges[0].left;
		let prevWidth = ranges[0].width;

		for (let i = 1, len = ranges.length; i < len; i++) {
			const range = ranges[i];
			const myLeft = range.left;
			const myWidth = range.width;

			if (prevLeft + prevWidth + 0.9 /* account for browser's rounding errors*/ >= myLeft) {
				prevWidth = Math.max(prevWidth, myLeft + myWidth - prevLeft);
			} else {
				result[resultLen++] = new HorizontalRange(prevLeft, prevWidth);
				prevLeft = myLeft;
				prevWidth = myWidth;
			}
		}

		result[resultLen++] = new HorizontalRange(prevLeft, prevWidth);

		return result;
	}

	private static _createHorizontalRangesFromClientRects(clientRects: ClientRectList, clientRectDeltaLeft: number): HorizontalRange[] {
		if (!clientRects || clientRects.length === 0) {
			return null;
		}

		// We go through FloatHorizontalRange because it has been observed in bi-di text
		// that the clientRects are not coming in sorted from the browser

		let result: FloatHorizontalRange[] = [];
		for (let i = 0, len = clientRects.length; i < len; i++) {
			const clientRect = clientRects[i];
			result[i] = new FloatHorizontalRange(Math.max(0, clientRect.left - clientRectDeltaLeft), clientRect.width);
		}

		return this._mergeAdjacentRanges(result);
	}

	public static readHorizontalRanges(domNode: HTMLElement, startChildIndex: number, startOffset: number, endChildIndex: number, endOffset: number, clientRectDeltaLeft: number, endNode: HTMLElement): HorizontalRange[] {
		// Panic check
		let min = 0;
		let max = domNode.children.length - 1;
		if (min > max) {
			return null;
		}
		startChildIndex = Math.min(max, Math.max(min, startChildIndex));
		endChildIndex = Math.min(max, Math.max(min, endChildIndex));

		// If crossing over to a span only to select offset 0, then use the previous span's maximum offset
		// Chrome is buggy and doesn't handle 0 offsets well sometimes.
		if (startChildIndex !== endChildIndex) {
			if (endChildIndex > 0 && endOffset === 0) {
				endChildIndex--;
				endOffset = Number.MAX_VALUE;
			}
		}

		let startElement = domNode.children[startChildIndex].firstChild;
		let endElement = domNode.children[endChildIndex].firstChild;

		if (!startElement || !endElement) {
			return null;
		}

		startOffset = Math.min(startElement.textContent.length, Math.max(0, startOffset));
		endOffset = Math.min(endElement.textContent.length, Math.max(0, endOffset));

		let clientRects = this._readClientRects(startElement, startOffset, endElement, endOffset, endNode);
		return this._createHorizontalRangesFromClientRects(clientRects, clientRectDeltaLeft);
	}
}
