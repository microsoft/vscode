/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Browser = require('vs/base/browser/browser');
import DomUtils = require('vs/base/browser/dom');

import {IVisibleLineData} from 'vs/editor/browser/view/viewLayer';
import {ILineParts, createLineParts} from 'vs/editor/common/viewLayout/viewLineParts';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

export interface IViewLineData extends IVisibleLineData {

	/**
	 * Width of the line in pixels
	 */
	getWidth(): number;

	/**
	 * Visible ranges for a model range
	 */
	getVisibleRangesForRange(lineNumber:number, startColumn:number, endColumn:number, deltaLeft:number, endNode:HTMLElement): EditorBrowser.HorizontalRange[];

	/**
	 * Returns the column for the text found at a specific offset inside a rendered dom node
	 */
	getColumnOfNodeOffset(lineNumber:number, spanNode:HTMLElement, offset:number): number;

	/**
	 * Let the line know that decorations might have changed
	 */
	onModelDecorationsChanged(): void;
}

class ViewLine implements IViewLineData {

	protected _context:EditorBrowser.IViewContext;
	private _domNode: HTMLElement;

	private _lineParts: ILineParts;

	private _isInvalid: boolean;
	private _isMaybeInvalid: boolean;

	protected _charOffsetInPart:number[];
	private _hasOverflowed:boolean;
	private _lastRenderedPartIndex:number;
	private _cachedWidth: number;

	constructor(context:EditorBrowser.IViewContext) {
		this._context = context;

		this._domNode = null;

		this._isInvalid = true;
		this._isMaybeInvalid = false;
		this._lineParts = null;
		this._charOffsetInPart = [];
		this._hasOverflowed = false;
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
	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): void {
		this._isInvalid = true;
	}

	public shouldUpdateHTML(lineNumber:number, inlineDecorations:EditorCommon.IModelDecoration[]): boolean {
		var newLineParts:ILineParts = null;

		if (this._isMaybeInvalid || this._isInvalid) {
			// Compute new line parts only if there is some evidence that something might have changed
			newLineParts = this._computeLineParts(lineNumber, inlineDecorations);
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
		out.push(EditorBrowser.ClassNames.VIEW_LINE);
		out.push('">');
		out.push(this.getLineInnerHTML(lineNumber));
		out.push('</div>');
	}

	public getLineInnerHTML(lineNumber: number): string {
		this._isInvalid = false;
		return this._renderMyLine(lineNumber, this._lineParts).join('');
	}

	public layoutLine(lineNumber:number, deltaTop:number): void {
		var currentLineNumber = this._domNode.getAttribute('lineNumber');
		if (currentLineNumber !== lineNumber.toString()) {
			this._domNode.setAttribute('lineNumber', lineNumber.toString());
		}
		DomUtils.StyleMutator.setTop(this._domNode, deltaTop);
		DomUtils.StyleMutator.setHeight(this._domNode, this._context.configuration.editor.lineHeight);
	}

	// --- end IVisibleLineData

	private _computeLineParts(lineNumber:number, inlineDecorations:EditorCommon.IModelDecoration[]): ILineParts {
		return createLineParts(lineNumber, this._context.model.getLineContent(lineNumber), this._context.model.getLineTokens(lineNumber), inlineDecorations, this._context.configuration.editor.renderWhitespace);
	}

	private _renderMyLine(lineNumber:number, lineParts:ILineParts): string[] {

		this._bustReadingCache();

		var r = renderLine({
			lineContent: this._context.model.getLineContent(lineNumber),
			tabSize: this._context.configuration.getIndentationOptions().tabSize,
			stopRenderingLineAfter: this._context.configuration.editor.stopRenderingLineAfter,
			renderWhitespace: this._context.configuration.editor.renderWhitespace,
			parts: lineParts.getParts()
		});

		this._charOffsetInPart = r.charOffsetInPart;
		this._hasOverflowed = r.hasOverflowed;
		this._lastRenderedPartIndex = r.lastRenderedPartIndex;

		return r.output;
	}

	// --- Reading from the DOM methods

	protected _getReadingTarget(): HTMLElement {
		return <HTMLSpanElement>this._domNode.firstChild;
	}

	private _bustReadingCache(): void {
		this._cachedWidth = -1;
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
	public getVisibleRangesForRange(lineNumber:number, startColumn:number, endColumn:number, deltaLeft:number, endNode:HTMLElement): EditorBrowser.HorizontalRange[] {
		var stopRenderingLineAfter = this._context.configuration.editor.stopRenderingLineAfter;

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

		return this._readVisibleRangesForRange(lineNumber, startColumn, endColumn, deltaLeft, endNode);
	}

	protected _readVisibleRangesForRange(lineNumber:number, startColumn:number, endColumn:number, deltaLeft:number, endNode:HTMLElement): EditorBrowser.HorizontalRange[] {

		var result:EditorBrowser.HorizontalRange[];
		if (startColumn === endColumn) {
			result = this._readRawVisibleRangesForPosition(lineNumber, startColumn, deltaLeft, endNode);
		} else {
			result = this._readRawVisibleRangesForRange(lineNumber, startColumn, endColumn, deltaLeft, endNode);
		}

		if (!result || result.length <= 1) {
			return result;
		}

		result.sort(compareVisibleRanges);

		var output: EditorBrowser.HorizontalRange[] = [],
			prevRange: EditorBrowser.HorizontalRange = result[0],
			currRange: EditorBrowser.HorizontalRange;

		for (var i = 1, len = result.length; i < len; i++) {
			currRange = result[i];

			if (prevRange.left + prevRange.width + 0.3 /* account for browser's rounding errors*/ >= currRange.left) {
				prevRange.width = Math.max(prevRange.width, currRange.left + currRange.width - prevRange.left);
			} else {
				output.push(prevRange);
				prevRange = currRange;
			}
		}
		output.push(prevRange);

		return output;
	}

	protected _readRawVisibleRangesForPosition(lineNumber:number, column:number, deltaLeft:number, endNode:HTMLElement): EditorBrowser.HorizontalRange[] {

		if (this._charOffsetInPart.length === 0) {
			// This line is empty
			return [new EditorBrowser.HorizontalRange(0, 0)];
		}

		var partIndex = findIndexInArrayWithMax(this._lineParts, column - 1, this._lastRenderedPartIndex),
			_charOffsetInPart = this._charOffsetInPart[column - 1];

		return this._readRawVisibleRangesFrom(this._getReadingTarget(), partIndex, _charOffsetInPart, partIndex, _charOffsetInPart, deltaLeft, endNode);
	}

	private _readRawVisibleRangesForRange(lineNumber:number, startColumn:number, endColumn:number, deltaLeft:number, endNode:HTMLElement): EditorBrowser.HorizontalRange[] {

		if (startColumn === 1 && endColumn === this._charOffsetInPart.length) {
			// This branch helps IE with bidi text & gives a performance boost to other browsers when reading visible ranges for an entire line

			return [this._readRawVisibleRangeForEntireLine()];
		}

		var startPartIndex = findIndexInArrayWithMax(this._lineParts, startColumn - 1, this._lastRenderedPartIndex),
			start_charOffsetInPart = this._charOffsetInPart[startColumn - 1],
			endPartIndex = findIndexInArrayWithMax(this._lineParts, endColumn - 1, this._lastRenderedPartIndex),
			end_charOffsetInPart = this._charOffsetInPart[endColumn - 1];

		return this._readRawVisibleRangesFrom(this._getReadingTarget(), startPartIndex, start_charOffsetInPart, endPartIndex, end_charOffsetInPart, deltaLeft, endNode);
	}

	private _readRawVisibleRangeForEntireLine(): EditorBrowser.HorizontalRange {
		return new EditorBrowser.HorizontalRange(0, this._getReadingTarget().offsetWidth);
	}

	private _readRawVisibleRangesFrom(domNode:HTMLElement, startChildIndex:number, startOffset:number, endChildIndex:number, endOffset:number, deltaLeft:number, endNode:HTMLElement): EditorBrowser.HorizontalRange[] {
		var range = RangeUtil.createRange();

		try {
			// Panic check
			var min = 0, max = domNode.children.length - 1;
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

			var startElement = domNode.children[startChildIndex].firstChild,
				endElement = domNode.children[endChildIndex].firstChild;

			if (!startElement || !endElement) {
				return null;
			}

			startOffset = Math.min(startElement.textContent.length, Math.max(0, startOffset));
			endOffset = Math.min(endElement.textContent.length, Math.max(0, endOffset));

			range.setStart(startElement, startOffset);
			range.setEnd(endElement, endOffset);

			var clientRects = range.getClientRects(),
				result:EditorBrowser.HorizontalRange[] = null;

			if (clientRects.length > 0) {
				result = this._createRawVisibleRangesFromClientRects(clientRects, deltaLeft);
			}

			return result;

		} catch (e) {
			// This is life ...
			return null;
		} finally {
			RangeUtil.detachRange(range, endNode);
		}
	}

	protected _createRawVisibleRangesFromClientRects(clientRects:ClientRectList, deltaLeft:number): EditorBrowser.HorizontalRange[] {
		var clientRectsLength = clientRects.length,
			cR:ClientRect,
			i:number,
			result:EditorBrowser.HorizontalRange[] = [];

		for (i = 0; i < clientRectsLength; i++) {
			cR = clientRects[i];
			result.push(new EditorBrowser.HorizontalRange(Math.max(0, cR.left - deltaLeft), cR.width));
		}

		return result;
	}

	public getColumnOfNodeOffset(lineNumber:number, spanNode:HTMLElement, offset:number): number {
		var spanIndex = -1;
		while (spanNode) {
			spanNode = <HTMLElement>spanNode.previousSibling;
			spanIndex++;
		}
		var lineParts = this._lineParts.getParts();

		if (spanIndex >= lineParts.length) {
			return this._context.configuration.editor.stopRenderingLineAfter;
		}

		if (offset === 0) {
			return lineParts[spanIndex].startIndex + 1;
		}

		var originalMin = lineParts[spanIndex].startIndex, originalMax:number, originalMaxStartOffset:number;

		if (spanIndex + 1 < lineParts.length) {
			// Stop searching characters at the beginning of the next part
			originalMax = lineParts[spanIndex + 1].startIndex;
			originalMaxStartOffset = this._charOffsetInPart[originalMax - 1] + this._charOffsetInPart[originalMax];
		} else {
			originalMax = this._context.model.getLineMaxColumn(lineNumber) - 1;
			originalMaxStartOffset = this._charOffsetInPart[originalMax];
		}


		var min = originalMin,
			mid:number,
			max = originalMax;

		if (this._context.configuration.editor.stopRenderingLineAfter !== -1) {
			max = Math.min(this._context.configuration.editor.stopRenderingLineAfter - 1, originalMax);
		}

		var midStartOffset:number, nextStartOffset:number, prevStartOffset:number, a:number, b:number;

		// Here are the variables and their relation plotted on an axis

		// prevStartOffset    a    midStartOffset    b    nextStartOffset
		// ------|------------|----------|-----------|-----------|--------->

		// Everything in (a;b] will match mid

		while (min < max) {
			mid = Math.floor( (min + max) / 2 );

			midStartOffset = this._charOffsetInPart[mid];

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

			a = (prevStartOffset + midStartOffset) / 2;
			b = (midStartOffset + nextStartOffset) / 2;

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

	constructor(context:EditorBrowser.IViewContext) {
		super(context);
	}

	protected _createRawVisibleRangesFromClientRects(clientRects:ClientRectList, deltaLeft:number): EditorBrowser.HorizontalRange[] {
		var clientRectsLength = clientRects.length,
			cR:ClientRect,
			i:number,
			result:EditorBrowser.HorizontalRange[] = [],
			ratioX = screen.logicalXDPI / screen.deviceXDPI;

		result = new Array<EditorBrowser.HorizontalRange>(clientRectsLength);
		for (i = 0; i < clientRectsLength; i++) {
			cR = clientRects[i];
			result[i] = new EditorBrowser.HorizontalRange(Math.max(0, cR.left * ratioX - deltaLeft), cR.width * ratioX);
		}

		return result;
	}
}

class WebKitViewLine extends ViewLine {

	constructor(context:EditorBrowser.IViewContext) {
		super(context);
	}

	protected _readVisibleRangesForRange(lineNumber:number, startColumn:number, endColumn:number, deltaLeft:number, endNode:HTMLElement): EditorBrowser.HorizontalRange[] {
		var output = super._readVisibleRangesForRange(lineNumber, startColumn, endColumn, deltaLeft, endNode);

		if (this._context.configuration.editor.fontLigatures && endColumn > 1 && startColumn === endColumn && endColumn === this._charOffsetInPart.length) {
			if (output.length === 1) {
				let lastSpanBoundingClientRect = (<HTMLElement>this._getReadingTarget().lastChild).getBoundingClientRect();
				output[0].left = lastSpanBoundingClientRect.right - deltaLeft;
			}
		}

		if (!output || output.length === 0 || startColumn === endColumn || (startColumn === 1 && endColumn === this._charOffsetInPart.length)) {
			return output;
		}

		// WebKit is buggy and returns an expanded range (to contain words in some cases)
		// The last client rect is enlarged (I think)

		// This is an attempt to patch things up
		// Find position of previous column
		var beforeEndVisibleRanges = this._readRawVisibleRangesForPosition(lineNumber, endColumn - 1, deltaLeft, endNode);
		// Find position of last column
		var endVisibleRanges = this._readRawVisibleRangesForPosition(lineNumber, endColumn, deltaLeft, endNode);

		if (beforeEndVisibleRanges && beforeEndVisibleRanges.length > 0 && endVisibleRanges && endVisibleRanges.length > 0) {
			var beforeEndVisibleRange = beforeEndVisibleRanges[0];
			var endVisibleRange = endVisibleRanges[0];
			var isLTR = (beforeEndVisibleRange.left <= endVisibleRange.left);
			var lastRange = output[output.length - 1];

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

function compareVisibleRanges(a: EditorBrowser.HorizontalRange, b: EditorBrowser.HorizontalRange): number {
	return a.left - b.left;
}

function findIndexInArrayWithMax(lineParts:ILineParts, desiredIndex: number, maxResult:number): number {
	var r = lineParts.findIndexOfOffset(desiredIndex);
	return r <= maxResult ? r : maxResult;
}

export var createLine: (context: EditorBrowser.IViewContext) => IViewLineData = (function() {
	if (window.screen && window.screen.deviceXDPI && (navigator.userAgent.indexOf('Trident/6.0') >= 0 || navigator.userAgent.indexOf('Trident/5.0') >= 0)) {
		// IE11 doesn't need the screen.logicalXDPI / screen.deviceXDPI ratio multiplication
		// for TextRange.getClientRects() anymore
		return createIELine;
	} else if (Browser.isWebKit) {
		return createWebKitLine;
	}
	return createNormalLine;
})();

function createIELine(context: EditorBrowser.IViewContext): IViewLineData {
	return new IEViewLine(context);
}

function createWebKitLine(context: EditorBrowser.IViewContext): IViewLineData {
	return new WebKitViewLine(context);
}

function createNormalLine(context: EditorBrowser.IViewContext): IViewLineData {
	return new ViewLine(context);
}

export interface IRenderLineInput {
	lineContent: string;
	tabSize: number;
	stopRenderingLineAfter: number;
	renderWhitespace: boolean;
	parts: EditorCommon.ILineToken[];
}

export interface IRenderLineOutput {
	charOffsetInPart: number[];
	hasOverflowed: boolean;
	lastRenderedPartIndex: number;
	partsCount: number;
	output: string[];
}

var _space = ' '.charCodeAt(0);
var _tab = '\t'.charCodeAt(0);
var _lowerThan = '<'.charCodeAt(0);
var _greaterThan = '>'.charCodeAt(0);
var _ampersand = '&'.charCodeAt(0);
var _carriageReturn = '\r'.charCodeAt(0);
var _lineSeparator = '\u2028'.charCodeAt(0); //http://www.fileformat.info/info/unicode/char/2028/index.htm
var _bom = 65279;
var _replacementCharacter = '\ufffd';

export function renderLine(input:IRenderLineInput): IRenderLineOutput {
	var lineText = input.lineContent;

	var result: IRenderLineOutput = {
		charOffsetInPart: [],
		hasOverflowed: false,
		lastRenderedPartIndex: 0,
		partsCount: 0,
		output: []
	};

	var partsCount = 0;

	result.output.push('<span>');
	if (lineText.length > 0) {
		var charCode: number,
			i: number,
			len = lineText.length,
			partClassName: string,
			partIndex = -1,
			nextPartIndex = 0,
			tabsCharDelta = 0,
			charOffsetInPart = 0,
			append = '',
			tabSize = input.tabSize,
			insertSpacesCount: number,
			stopRenderingLineAfter = input.stopRenderingLineAfter,
			renderWhitespace = false;

		var actualLineParts = input.parts;
		if (actualLineParts.length === 0) {
			throw new Error('Cannot render non empty line without line parts!');
		}

		if (stopRenderingLineAfter !== -1 && len > stopRenderingLineAfter - 1) {
			append = lineText.substr(stopRenderingLineAfter - 1, 1);
			len = stopRenderingLineAfter - 1;
			result.hasOverflowed = true;
		}

		for (i = 0; i < len; i++) {
			if (i === nextPartIndex) {
				partIndex++;
				nextPartIndex = (partIndex + 1 < actualLineParts.length ? actualLineParts[partIndex + 1].startIndex : Number.MAX_VALUE);
				if (i > 0) {
					result.output.push('</span>');
				}
				partsCount++;
				result.output.push('<span class="');
				partClassName = 'token ' + actualLineParts[partIndex].type.replace(/[^a-z0-9\-]/gi, ' ');
				if (input.renderWhitespace) {
					renderWhitespace = partClassName.indexOf('whitespace') >= 0;
				}
				result.output.push(partClassName);
				result.output.push('">');

				charOffsetInPart = 0;
			}

			result.charOffsetInPart[i] = charOffsetInPart;
			charCode = lineText.charCodeAt(i);

			switch (charCode) {
				case _tab:
					insertSpacesCount = tabSize - (i + tabsCharDelta) % tabSize;
					tabsCharDelta += insertSpacesCount - 1;
					charOffsetInPart += insertSpacesCount - 1;
					if (insertSpacesCount > 0) {
						result.output.push(renderWhitespace ? '&rarr;' : '&nbsp;');
						insertSpacesCount--;
					}
					while (insertSpacesCount > 0) {
						result.output.push('&nbsp;');
						insertSpacesCount--;
					}
					break;

				case _space:
					result.output.push(renderWhitespace ? '&middot;' : '&nbsp;');
					break;

				case _lowerThan:
					result.output.push('&lt;');
					break;

				case _greaterThan:
					result.output.push('&gt;');
					break;

				case _ampersand:
					result.output.push('&amp;');
					break;

				case 0:
					result.output.push('&#00;');
					break;

				case _bom:
				case _lineSeparator:
					result.output.push(_replacementCharacter);
					break;

				case _carriageReturn:
					// zero width space, because carriage return would introduce a line break
					result.output.push('&#8203');
					break;

				default:
					result.output.push(lineText.charAt(i));
			}

			charOffsetInPart ++;
		}
		result.output.push('</span>');

		// When getting client rects for the last character, we will position the
		// text range at the end of the span, insteaf of at the beginning of next span
		result.charOffsetInPart[len] = charOffsetInPart;

		// In case we stop rendering, we record here the index of the last span
		// that should be used for getting client rects
		result.lastRenderedPartIndex = partIndex;

		if (append.length > 0) {
			result.output.push('<span class="');
			result.output.push(partClassName);
			result.output.push('" style="color:grey">');
			result.output.push(append);
			result.output.push('&hellip;</span>');
		}
	} else {
		// This is basically for IE's hit test to work
		result.output.push('<span>&nbsp;</span>');
	}
	result.output.push('</span>');

	result.partsCount = partsCount;

	return result;
}
