/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FloatHorizontalRange } from '../../view/renderingContext.js';
export class RangeUtil {
    static _createRange() {
        if (!this._handyReadyRange) {
            this._handyReadyRange = document.createRange();
        }
        return this._handyReadyRange;
    }
    static _detachRange(range, endNode) {
        // Move range out of the span node, IE doesn't like having many ranges in
        // the same spot and will act badly for lines containing dashes ('-')
        range.selectNodeContents(endNode);
    }
    static _readClientRects(startElement, startOffset, endElement, endOffset, endNode) {
        const range = this._createRange();
        try {
            range.setStart(startElement, startOffset);
            range.setEnd(endElement, endOffset);
            return range.getClientRects();
        }
        catch (e) {
            // This is life ...
            return null;
        }
        finally {
            this._detachRange(range, endNode);
        }
    }
    static _mergeAdjacentRanges(ranges) {
        if (ranges.length === 1) {
            // There is nothing to merge
            return ranges;
        }
        ranges.sort(FloatHorizontalRange.compare);
        const result = [];
        let resultLen = 0;
        let prev = ranges[0];
        for (let i = 1, len = ranges.length; i < len; i++) {
            const range = ranges[i];
            if (prev.left + prev.width + 0.9 /* account for browser's rounding errors*/ >= range.left) {
                prev.width = Math.max(prev.width, range.left + range.width - prev.left);
            }
            else {
                result[resultLen++] = prev;
                prev = range;
            }
        }
        result[resultLen++] = prev;
        return result;
    }
    static _createHorizontalRangesFromClientRects(clientRects, clientRectDeltaLeft, clientRectScale) {
        if (!clientRects || clientRects.length === 0) {
            return null;
        }
        // We go through FloatHorizontalRange because it has been observed in bi-di text
        // that the clientRects are not coming in sorted from the browser
        const result = [];
        for (let i = 0, len = clientRects.length; i < len; i++) {
            const clientRect = clientRects[i];
            result[i] = new FloatHorizontalRange(Math.max(0, (clientRect.left - clientRectDeltaLeft) / clientRectScale), clientRect.width / clientRectScale);
        }
        return this._mergeAdjacentRanges(result);
    }
    static readHorizontalRanges(domNode, startChildIndex, startOffset, endChildIndex, endOffset, context) {
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
                endOffset = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
            }
        }
        let startElement = domNode.children[startChildIndex].firstChild;
        let endElement = domNode.children[endChildIndex].firstChild;
        if (!startElement || !endElement) {
            // When having an empty <span> (without any text content), try to move to the previous <span>
            if (!startElement && startOffset === 0 && startChildIndex > 0) {
                startElement = domNode.children[startChildIndex - 1].firstChild;
                startOffset = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
            }
            if (!endElement && endOffset === 0 && endChildIndex > 0) {
                endElement = domNode.children[endChildIndex - 1].firstChild;
                endOffset = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
            }
        }
        if (!startElement || !endElement) {
            return null;
        }
        startOffset = Math.min(startElement.textContent.length, Math.max(0, startOffset));
        endOffset = Math.min(endElement.textContent.length, Math.max(0, endOffset));
        const clientRects = this._readClientRects(startElement, startOffset, endElement, endOffset, context.endNode);
        context.markDidDomLayout();
        return this._createHorizontalRangesFromClientRects(clientRects, context.clientRectDeltaLeft, context.clientRectScale);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFuZ2VVdGlsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL3ZpZXdMaW5lcy9yYW5nZVV0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHdEUsTUFBTSxPQUFPLFNBQVM7SUFTYixNQUFNLENBQUMsWUFBWTtRQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNoRCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDOUIsQ0FBQztJQUVPLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBWSxFQUFFLE9BQW9CO1FBQzdELHlFQUF5RTtRQUN6RSxxRUFBcUU7UUFDckUsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFTyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsWUFBa0IsRUFBRSxXQUFtQixFQUFFLFVBQWdCLEVBQUUsU0FBaUIsRUFBRSxPQUFvQjtRQUNqSSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDO1lBQ0osS0FBSyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDMUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFcEMsT0FBTyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDL0IsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixtQkFBbUI7WUFDbkIsT0FBTyxJQUFJLENBQUM7UUFDYixD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