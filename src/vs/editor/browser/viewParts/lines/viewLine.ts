/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {HorizontalRange, IConfigurationChangedEvent, IModelDecoration} from 'vs/editor/common/editorCommon';
import {ILineParts, createLineParts} from 'vs/editor/common/viewLayout/viewLineParts';
import {renderLine} from 'vs/editor/common/viewLayout/viewLineRenderer';
import {ClassNames, IViewContext} from 'vs/editor/browser/editorBrowser';
import {IVisibleLineData} from 'vs/editor/browser/view/viewLayer';

export class ViewLine implements IVisibleLineData {

	protected _context:IViewContext;
	private _domNode: HTMLElement;

	private _lineParts: ILineParts;

	private _isInvalid: boolean;
	private _isMaybeInvalid: boolean;

	protected _charOffsetInPart:number[];
	private _lastRenderedPartIndex:number;
	private _cachedWidth: number;

	constructor(context:IViewContext) {
		this._context = context;
		this._domNode = null;
		this._isInvalid = true;
		this._isMaybeInvalid = false;
		this._lineParts = null;
		this._charOffsetInPart = [];
		this._lastRenderedPartIndex = 0;
	}

	// --- begin IVisibleLineData

	public getDomNode(): HTMLElement {
		return this._domNode;
	}
	public setDomNode(domNode:HTMLElement): void {
		this._domNode = domNode;
	}

	public onContentChanged(): void {
		this._isInvalid = true;
	}
	public onLinesInsertedAbove(): void {
		this._isMaybeInvalid = true;
	}
	public onLinesDeletedAbove(): void {
		this._isMaybeInvalid = true;
	}
	public onLineChangedAbove(): void {
		this._isMaybeInvalid = true;
	}
	public onTokensChanged(): void {
		this._isMaybeInvalid = true;
	}
	public onModelDecorationsChanged(): void {
		this._isMaybeInvalid = true;
	}
	public onConfigurationChanged(e:IConfigurationChangedEvent): void {
		this._isInvalid = true;
	}

	public shouldUpdateHTML(lineNumber:number, inlineDecorations:IModelDecoration[]): boolean {
		let newLineParts:ILineParts = null;

		if (this._isMaybeInvalid || this._isInvalid) {
			// Compute new line parts only if there is some evidence that something might have changed
			newLineParts = createLineParts(
				lineNumber,
				this._context.model.getLineMinColumn(lineNumber),
				this._context.model.getLineContent(lineNumber),
				this._context.model.getLineTokens(lineNumber),
				inlineDecorations,
				this._context.configuration.editor.renderWhitespace
			);
		}

		// Decide if isMaybeInvalid flips isInvalid to true
		if (this._isMaybeInvalid) {
			if (!this._isInvalid) {
				if (!this._lineParts || !this._lineParts.equals(newLineParts)) {
					this._isInvalid = true;
				}
			}
			this._isMaybeInvalid = false;
		}

		if (this._isInvalid) {
			this._lineParts = newLineParts;
		}

		return this._isInvalid;
	}

	public getLineOuterHTML(out:string[], lineNumber:number, deltaTop:number): void {
		out.push('<div lineNumber="');
		out.push(lineNumber.toString());
		out.push('" style="top:');
		out.push(deltaTop.toString());
		out.push('px;height:');
		out.push(this._context.configuration.editor.lineHeight.toString());
		out.push('px;" class="');
		out.push(ClassNames.VIEW_LINE);
		out.push('">');
		out.push(this.getLineInnerHTML(lineNumber));
		out.push('</div>');
	}

	public getLineInnerHTML(lineNumber: number): string {
		this._isInvalid = false;
		return this._render(lineNumber, this._lineParts).join('');
	}

	public layoutLine(lineNumber:number, deltaTop:number): void {
		let desiredLineNumber = String(lineNumber);
		let currentLineNumber = this._domNode.getAttribute('lineNumber');
		if (currentLineNumber !== desiredLineNumber) {
			this._domNode.setAttribute('lineNumber', desiredLineNumber);
		}
		StyleMutator.setTop(this._domNode, deltaTop);
		StyleMutator.setHeight(this._domNode, this._context.configuration.editor.lineHeight);
	}

	// --- end IVisibleLineData

	private _render(lineNumber:number, lineParts:ILineParts): string[] {

		this._cachedWidth = -1;

		let r = renderLine({
			lineContent: this._context.model.getLineContent(lineNumber),
			tabSize: this._context.model.getTabSize(),
			stopRenderingLineAfter: this._context.configuration.editor.stopRenderingLineAfter,
			renderWhitespace: this._context.configuration.editor.renderWhitespace,
			parts: lineParts.getParts()
		});

		this._charOffsetInPart = r.charOffsetInPart;
		this._lastRenderedPartIndex = r.lastRenderedPartIndex;

		return r.output;
	}

	// --- Reading from the DOM methods

	protected _getReadingTarget(): HTMLElement {
		return <HTMLSpanElement>this._domNode.firstChild;
	}

	/**
	 * Width of the line in pixels
	 */
	public getWidth(): number {
		if (this._cachedWidth === -1) {
			this._cachedWidth = this._getReadingTarget().offsetWidth;
		}
		return this._cachedWidth;
	}

	/**
	 * Visible ranges for a model range
	 */
	public getVisibleRangesForRange(startColumn:number, endColumn:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {
		let stopRenderingLineAfter = this._context.configuration.editor.stopRenderingLineAfter;

		if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter && endColumn > stopRenderingLineAfter) {
			// This range is obviously not visible
			return null;
		}

		if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter) {
			startColumn = stopRenderingLineAfter;
		}

		if (stopRenderingLineAfter !== -1 && endColumn > stopRenderingLineAfter) {
			endColumn = stopRenderingLineAfter;
		}

		return this._readVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);
	}

	protected _readVisibleRangesForRange(startColumn:number, endColumn:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {

		let result: HorizontalRange[];
		if (startColumn === endColumn) {
			result = this._readRawVisibleRangesForPosition(startColumn, clientRectDeltaLeft, endNode);
		} else {
			result = this._readRawVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);
		}

		if (!result || result.length <= 1) {
			return result;
		}

		result.sort(compareVisibleRanges);

		let output: HorizontalRange[] = [];
		let prevRange: HorizontalRange = result[0];

		for (let i = 1, len = result.length; i < len; i++) {
			let currRange = result[i];

			if (prevRange.left + prevRange.width + 0.9 /* account for browser's rounding errors*/ >= currRange.left) {
				prevRange.width = Math.max(prevRange.width, currRange.left + currRange.width - prevRange.left);
			} else {
				output.push(prevRange);
				prevRange = currRange;
			}
		}
		output.push(prevRange);

		return output;
	}

	protected _readRawVisibleRangesForPosition(column:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {

		if (this._charOffsetInPart.length === 0) {
			// This line is empty
			return [new HorizontalRange(0, 0)];
		}

		let partIndex = findIndexInArrayWithMax(this._lineParts, column - 1, this._lastRenderedPartIndex);
		let charOffsetInPart = this._charOffsetInPart[column - 1];

		return this._readRawVisibleRangesFrom(this._getReadingTarget(), partIndex, charOffsetInPart, partIndex, charOffsetInPart, clientRectDeltaLeft, endNode);
	}

	private _readRawVisibleRangesForRange(startColumn:number, endColumn:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {

		if (startColumn === 1 && endColumn === this._charOffsetInPart.length) {
			// This branch helps IE with bidi text & gives a performance boost to other browsers when reading visible ranges for an entire line

			return [this._readRawVisibleRangeForEntireLine()];
		}

		let startPartIndex = findIndexInArrayWithMax(this._lineParts, startColumn - 1, this._lastRenderedPartIndex);
		let startCharOffsetInPart = this._charOffsetInPart[startColumn - 1];
		let endPartIndex = findIndexInArrayWithMax(this._lineParts, endColumn - 1, this._lastRenderedPartIndex);
		let endCharOffsetInPart = this._charOffsetInPart[endColumn - 1];

		return this._readRawVisibleRangesFrom(this._getReadingTarget(), startPartIndex, startCharOffsetInPart, endPartIndex, endCharOffsetInPart, clientRectDeltaLeft, endNode);
	}

	private _readRawVisibleRangeForEntireLine(): HorizontalRange {
		return new HorizontalRange(0, this._getReadingTarget().offsetWidth);
	}

	private _readRawVisibleRangesFrom(domNode:HTMLElement, startChildIndex:number, startOffset:number, endChildIndex:number, endOffset:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {
		let range = RangeUtil.createRange();

		try {
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

			range.setStart(startElement, startOffset);
			range.setEnd(endElement, endOffset);

			let clientRects = range.getClientRects();
			if (clientRects.length === 0) {
				return null;
			}

			return this._createRawVisibleRangesFromClientRects(clientRects, clientRectDeltaLeft);

		} catch (e) {
			// This is life ...
			return null;
		} finally {
			RangeUtil.detachRange(range, endNode);
		}
	}

	protected _createRawVisibleRangesFromClientRects(clientRects:ClientRectList, clientRectDeltaLeft:number): HorizontalRange[] {
		let result:HorizontalRange[] = [];
		for (let i = 0, len = clientRects.length; i < len; i++) {
			let cR = clientRects[i];
			result.push(new HorizontalRange(Math.max(0, cR.left - clientRectDeltaLeft), cR.width));
		}
		return result;
	}

	/**
	 * Returns the column for the text found at a specific offset inside a rendered dom node
	 */
	public getColumnOfNodeOffset(lineNumber:number, spanNode:HTMLElement, offset:number): number {
		let spanIndex = -1;
		while (spanNode) {
			spanNode = <HTMLElement>spanNode.previousSibling;
			spanIndex++;
		}
		let lineParts = this._lineParts.getParts();

		if (spanIndex >= lineParts.length) {
			return this._context.configuration.editor.stopRenderingLineAfter;
		}

		if (offset === 0) {
			return lineParts[spanIndex].startIndex + 1;
		}

		let originalMin = lineParts[spanIndex].startIndex;
		let originalMax:number;
		let originalMaxStartOffset:number;

		if (spanIndex + 1 < lineParts.length) {
			// Stop searching characters at the beginning of the next part
			originalMax = lineParts[spanIndex + 1].startIndex;
			originalMaxStartOffset = this._charOffsetInPart[originalMax - 1] + this._charOffsetInPart[originalMax];
		} else {
			originalMax = this._context.model.getLineMaxColumn(lineNumber) - 1;
			originalMaxStartOffset = this._charOffsetInPart[originalMax];
		}

		let min = originalMin;
		let max = originalMax;

		if (this._context.configuration.editor.stopRenderingLineAfter !== -1) {
			max = Math.min(this._context.configuration.editor.stopRenderingLineAfter - 1, originalMax);
		}

		let nextStartOffset:number;
		let prevStartOffset:number;

		// Here are the variables and their relation plotted on an axis

		// prevStartOffset    a    midStartOffset    b    nextStartOffset
		// ------|------------|----------|-----------|-----------|--------->

		// Everything in (a;b] will match mid

		while (min < max) {
			let mid = Math.floor( (min + max) / 2 );
			let midStartOffset = this._charOffsetInPart[mid];

			if (mid === originalMax) {
				// Using Number.MAX_VALUE to ensure that any offset after midStartOffset will match mid
				nextStartOffset = Number.MAX_VALUE;
			} else if (mid + 1 === originalMax) {
				// mid + 1 is already in next part and might have the _charOffsetInPart = 0
				nextStartOffset = originalMaxStartOffset;
			} else {
				nextStartOffset = this._charOffsetInPart[mid + 1];
			}

			if (mid === originalMin) {
				// Using Number.MIN_VALUE to ensure that any offset before midStartOffset will match mid
				prevStartOffset = Number.MIN_VALUE;
			} else {
				prevStartOffset = this._charOffsetInPart[mid - 1];
			}

			let a = (prevStartOffset + midStartOffset) / 2;
			let b = (midStartOffset + nextStartOffset) / 2;

			if (a < offset && offset <= b) {
				// Hit!
				return mid + 1;
			}

			if (offset <= a) {
				max = mid - 1;
			} else {
				min = mid + 1;
			}
		}

		return min + 1;
	}
}

class IEViewLine extends ViewLine {

	constructor(context:IViewContext) {
		super(context);
	}

	protected _createRawVisibleRangesFromClientRects(clientRects:ClientRectList, clientRectDeltaLeft:number): HorizontalRange[] {
		let ratioX = screen.logicalXDPI / screen.deviceXDPI;
		let result:HorizontalRange[] = [];
		for (let i = 0, len = clientRects.length; i < len; i++) {
			let cR = clientRects[i];
			result[i] = new HorizontalRange(Math.max(0, cR.left * ratioX - clientRectDeltaLeft), cR.width * ratioX);
		}

		return result;
	}
}

class WebKitViewLine extends ViewLine {

	constructor(context:IViewContext) {
		super(context);
	}

	protected _readVisibleRangesForRange(startColumn:number, endColumn:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {
		let output = super._readVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);

		if (this._context.configuration.editor.fontLigatures && output.length === 1 && endColumn > 1 && endColumn === this._charOffsetInPart.length) {
			let lastSpanBoundingClientRect = (<HTMLElement>this._getReadingTarget().lastChild).getBoundingClientRect();
			let lastSpanBoundingClientRectRight = lastSpanBoundingClientRect.right - clientRectDeltaLeft;
			if (startColumn === endColumn) {
				output[0].left = lastSpanBoundingClientRectRight;
				output[0].width = 0;
			} else {
				output[0].width = lastSpanBoundingClientRectRight - output[0].left;
			}
			return output;
		}

		if (!output || output.length === 0 || startColumn === endColumn || (startColumn === 1 && endColumn === this._charOffsetInPart.length)) {
			return output;
		}

		// WebKit is buggy and returns an expanded range (to contain words in some cases)
		// The last client rect is enlarged (I think)

		// This is an attempt to patch things up
		// Find position of previous column
		let beforeEndVisibleRanges = this._readRawVisibleRangesForPosition(endColumn - 1, clientRectDeltaLeft, endNode);
		// Find position of last column
		let endVisibleRanges = this._readRawVisibleRangesForPosition(endColumn, clientRectDeltaLeft, endNode);

		if (beforeEndVisibleRanges && beforeEndVisibleRanges.length > 0 && endVisibleRanges && endVisibleRanges.length > 0) {
			let beforeEndVisibleRange = beforeEndVisibleRanges[0];
			let endVisibleRange = endVisibleRanges[0];
			let isLTR = (beforeEndVisibleRange.left <= endVisibleRange.left);
			let lastRange = output[output.length - 1];

			if (isLTR && lastRange.left < endVisibleRange.left) {
				// Trim down the width of the last visible range to not go after the last column's position
				lastRange.width = endVisibleRange.left - lastRange.left;
			}
		}

		return output;
	}
}

class RangeUtil {

	/**
	 * Reusing the same range here
	 * because IE is buggy and constantly freezes when using a large number
	 * of ranges and calling .detach on them
	 */
	private static _handyReadyRange:Range;

	public static createRange(): Range {
		if (!RangeUtil._handyReadyRange) {
			RangeUtil._handyReadyRange = document.createRange();
		}
		return RangeUtil._handyReadyRange;
	}

	public static detachRange(range:Range, endNode:HTMLElement): void {
		// Move range out of the span node, IE doesn't like having many ranges in
		// the same spot and will act badly for lines containing dashes ('-')
		range.selectNodeContents(endNode);
	}
}

function compareVisibleRanges(a: HorizontalRange, b: HorizontalRange): number {
	return a.left - b.left;
}

function findIndexInArrayWithMax(lineParts:ILineParts, desiredIndex: number, maxResult:number): number {
	let r = lineParts.findIndexOfOffset(desiredIndex);
	return r <= maxResult ? r : maxResult;
}

export let createLine: (context: IViewContext) => ViewLine = (function() {
	if (window.screen && window.screen.deviceXDPI && (navigator.userAgent.indexOf('Trident/6.0') >= 0 || navigator.userAgent.indexOf('Trident/5.0') >= 0)) {
		// IE11 doesn't need the screen.logicalXDPI / screen.deviceXDPI ratio multiplication
		// for TextRange.getClientRects() anymore
		return createIELine;
	} else if (browser.isWebKit) {
		return createWebKitLine;
	}
	return createNormalLine;
})();

function createIELine(context: IViewContext): ViewLine {
	return new IEViewLine(context);
}

function createWebKitLine(context: IViewContext): ViewLine {
	return new WebKitViewLine(context);
}

function createNormalLine(context: IViewContext): ViewLine {
	return new ViewLine(context);
}

