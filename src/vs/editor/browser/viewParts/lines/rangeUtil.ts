/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Constants } from 'vs/base/common/uint';
import { FloatHorizontalRange } from 'vs/editor/browser/view/renderingContext';
import { DomReadingContext } from 'vs/editor/browser/viewParts/lines/domReadingContext';

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

	private static _readClientRects(startElement: Node, startOffset: number, endElement: Node, endOffset: number, endNode: HTMLElement): DOMRectList | null {
		const range = this._createRange();
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

	private static _mergeAdjacentRanges(ranges: FloatHorizontalRange[]): FloatHorizontalRange[] {
		if (ranges.length === 1) {
			// There is nothing to merge
			return ranges;
		}

		ranges.sort(FloatHorizontalRange.compare);

		const result: FloatHorizontalRange[] = [];
		let resultLen = 0;
		let prev = ranges[0];

		for (let i = 1, len = ranges.length; i < len; i++) {
			const range = ranges[i];
			if (prev.left + prev.width + 0.9 /* account for browser's rounding errors*/ >= range.left) {
				prev.width = Math.max(prev.width, range.left + range.width - prev.left);
			} else {
				result[resultLen++] = prev;
				prev = range;
			}
		}

		result[resultLen++] = prev;

		return result;
	}

	private static _createHorizontalRangesFromClientRects(clientRects: DOMRectList | null, clientRectDeltaLeft: number, clientRectScale: number): FloatHorizontalRange[] | null {
		if (!clientRects || clientRects.length === 0) {
			return null;
		}

		// We go through FloatHorizontalRange because it has been observed in bi-di text
		// that the clientRects are not coming in sorted from the browser

		const result: FloatHorizontalRange[] = [];
		for (let i = 0, len = clientRects.length; i < len; i++) {
			const clientRect = clientRects[i];
			result[i] = new FloatHorizontalRange(Math.max(0, (clientRect.left - clientRectDeltaLeft) / clientRectScale), clientRect.width / clientRectScale);
		}

		return this._mergeAdjacentRanges(result);
	}

	public static readHorizontalRanges(domNode: HTMLElement, startChildIndex: number, startOffset: number, endChildIndex: number, endOffset: number, context: DomReadingContext): FloatHorizontalRange[] | null {
		// Panic check
		const min = 0;
		const max = domNode.children.length - 1;
		if (min > max) {
			return null;
		}
		startChildIndex = Math.min(max, Math.max(min, startChildIndex));
		endChildIndex = Math.min(max, Math.max(min, endChildIndex));

		if (startChildIndex === endChildIndex && startOffset === endOffset && startOffset === 0 && !domNode.children[startChildIndex].firstChild) {
			// We must find the position at the beginning of a <span>
			// To cover cases of empty <span>s, avoid using a range and use the <span>'s bounding box
			const clientRects = domNode.children[startChildIndex].getClientRects();
			context.markDidDomLayout();
			return this._createHorizontalRangesFromClientRects(clientRects, context.clientRectDeltaLeft, context.clientRectScale);
		}

		// If crossing over to a span only to select offset 0, then use the previous span's maximum offset
		// Chrome is buggy and doesn't handle 0 offsets well sometimes.
		if (startChildIndex !== endChildIndex) {
			if (endChildIndex > 0 && endOffset === 0) {
				endChildIndex--;
				endOffset = Constants.MAX_SAFE_SMALL_INTEGER;
			}
		}

		let startElement = domNode.children[startChildIndex].firstChild;
		let endElement = domNode.children[endChildIndex].firstChild;

		if (!startElement || !endElement) {
			// When having an empty <span> (without any text content), try to move to the previous <span>
			if (!startElement && startOffset === 0 && startChildIndex > 0) {
				startElement = domNode.children[startChildIndex - 1].firstChild;
				startOffset = Constants.MAX_SAFE_SMALL_INTEGER;
			}
			if (!endElement && endOffset === 0 && endChildIndex > 0) {
				endElement = domNode.children[endChildIndex - 1].firstChild;
				endOffset = Constants.MAX_SAFE_SMALL_INTEGER;
			}
		}

		if (!startElement || !endElement) {
			return null;
		}

		startOffset = Math.min(startElement.textContent!.length, Math.max(0, startOffset));
		endOffset = Math.min(endElement.textContent!.length, Math.max(0, endOffset));

		const clientRects = this._readClientRects(startElement, startOffset, endElement, endOffset, context.endNode);
		context.markDidDomLayout();
		return this._createHorizontalRangesFromClientRects(clientRects, context.clientRectDeltaLeft, context.clientRectScale);
	}
}
