/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import {FastDomNode, createFastDomNode} from 'vs/base/browser/styleMutator';
import {IConfigurationChangedEvent} from 'vs/editor/common/editorCommon';
import {LineParts, createLineParts, getColumnOfLinePartOffset} from 'vs/editor/common/viewLayout/viewLineParts';
import {renderLine, RenderLineInput} from 'vs/editor/common/viewLayout/viewLineRenderer';
import {ClassNames} from 'vs/editor/browser/editorBrowser';
import {IVisibleLineData} from 'vs/editor/browser/view/viewLayer';
import {RangeUtil} from 'vs/editor/browser/viewParts/lines/rangeUtil';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {HorizontalRange} from 'vs/editor/common/view/renderingContext';
import {InlineDecoration} from 'vs/editor/common/viewModel/viewModel';

export class ViewLine implements IVisibleLineData {

	protected _context:ViewContext;
	private _renderWhitespace: boolean;
	private _renderControlCharacters: boolean;
	private _indentGuides: boolean;
	private _spaceWidth: number;
	private _lineHeight: number;
	private _stopRenderingLineAfter: number;

	private _domNode: FastDomNode;

	private _lineParts: LineParts;

	private _isInvalid: boolean;
	private _isMaybeInvalid: boolean;

	protected _charOffsetInPart:number[];
	private _lastRenderedPartIndex:number;
	private _cachedWidth: number;

	constructor(context:ViewContext) {
		this._context = context;
		this._renderWhitespace = this._context.configuration.editor.viewInfo.renderWhitespace;
		this._renderControlCharacters = this._context.configuration.editor.viewInfo.renderControlCharacters;
		this._indentGuides = this._context.configuration.editor.viewInfo.indentGuides;
		this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._stopRenderingLineAfter = this._context.configuration.editor.viewInfo.stopRenderingLineAfter;

		this._domNode = null;
		this._isInvalid = true;
		this._isMaybeInvalid = false;
		this._lineParts = null;
		this._charOffsetInPart = [];
		this._lastRenderedPartIndex = 0;
	}

	// --- begin IVisibleLineData

	public getDomNode(): HTMLElement {
		if (!this._domNode) {
			return null;
		}
		return this._domNode.domNode;
	}
	public setDomNode(domNode:HTMLElement): void {
		this._domNode = createFastDomNode(domNode);
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
		if (e.viewInfo.renderWhitespace) {
			this._renderWhitespace = this._context.configuration.editor.viewInfo.renderWhitespace;
		}
		if (e.viewInfo.renderControlCharacters) {
			this._renderControlCharacters = this._context.configuration.editor.viewInfo.renderControlCharacters;
		}
		if (e.viewInfo.indentGuides) {
			this._indentGuides = this._context.configuration.editor.viewInfo.indentGuides;
		}
		if (e.fontInfo) {
			this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		}
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.viewInfo.stopRenderingLineAfter) {
			this._stopRenderingLineAfter = this._context.configuration.editor.viewInfo.stopRenderingLineAfter;
		}
		this._isInvalid = true;
	}

	public shouldUpdateHTML(startLineNumber:number, lineNumber:number, inlineDecorations:InlineDecoration[]): boolean {
		let newLineParts:LineParts = null;

		if (this._isMaybeInvalid || this._isInvalid) {
			// Compute new line parts only if there is some evidence that something might have changed
			newLineParts = createLineParts(
				lineNumber,
				this._context.model.getLineMinColumn(lineNumber),
				this._context.model.getLineContent(lineNumber),
				this._context.model.getTabSize(),
				this._context.model.getLineTokens(lineNumber),
				inlineDecorations,
				this._renderWhitespace,
				this._indentGuides ? this._context.model.getLineIndentGuide(lineNumber) : 0
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
		out.push(this._lineHeight.toString());
		out.push('px;" class="');
		out.push(ClassNames.VIEW_LINE);
		out.push('">');
		out.push(this.getLineInnerHTML(lineNumber));
		out.push('</div>');
	}

	public getLineInnerHTML(lineNumber: number): string {
		this._isInvalid = false;
		return this._render(lineNumber, this._lineParts);
	}

	public layoutLine(lineNumber:number, deltaTop:number): void {
		this._domNode.setLineNumber(String(lineNumber));
		this._domNode.setTop(deltaTop);
		this._domNode.setHeight(this._lineHeight);
	}

	// --- end IVisibleLineData

	private _render(lineNumber:number, lineParts:LineParts): string {

		this._cachedWidth = -1;

		let r = renderLine(new RenderLineInput(
			this._context.model.getLineContent(lineNumber),
			this._context.model.getTabSize(),
			this._spaceWidth,
			this._stopRenderingLineAfter,
			this._renderWhitespace,
			this._renderControlCharacters,
			lineParts.getParts()
		));

		this._charOffsetInPart = r.charOffsetInPart;
		this._lastRenderedPartIndex = r.lastRenderedPartIndex;

		return r.output;
	}

	// --- Reading from the DOM methods

	protected _getReadingTarget(): HTMLElement {
		return <HTMLSpanElement>this._domNode.domNode.firstChild;
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
		startColumn = startColumn|0; // @perf
		endColumn = endColumn|0; // @perf
		clientRectDeltaLeft = clientRectDeltaLeft|0; // @perf
		const stopRenderingLineAfter = this._stopRenderingLineAfter|0; // @perf

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
		if (startColumn === endColumn) {
			return this._readRawVisibleRangesForPosition(startColumn, clientRectDeltaLeft, endNode);
		} else {
			return this._readRawVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);
		}
	}

	protected _readRawVisibleRangesForPosition(column:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {

		if (this._charOffsetInPart.length === 0) {
			// This line is empty
			return [new HorizontalRange(0, 0)];
		}

		let partIndex = findIndexInArrayWithMax(this._lineParts, column - 1, this._lastRenderedPartIndex);
		let charOffsetInPart = this._charOffsetInPart[column - 1];

		return RangeUtil.readHorizontalRanges(this._getReadingTarget(), partIndex, charOffsetInPart, partIndex, charOffsetInPart, clientRectDeltaLeft, this._getScaleRatio(), endNode);
	}

	private _readRawVisibleRangesForRange(startColumn:number, endColumn:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {

		if (startColumn === 1 && endColumn === this._charOffsetInPart.length) {
			// This branch helps IE with bidi text & gives a performance boost to other browsers when reading visible ranges for an entire line

			return [new HorizontalRange(0, this.getWidth())];
		}

		let startPartIndex = findIndexInArrayWithMax(this._lineParts, startColumn - 1, this._lastRenderedPartIndex);
		let startCharOffsetInPart = this._charOffsetInPart[startColumn - 1];
		let endPartIndex = findIndexInArrayWithMax(this._lineParts, endColumn - 1, this._lastRenderedPartIndex);
		let endCharOffsetInPart = this._charOffsetInPart[endColumn - 1];

		return RangeUtil.readHorizontalRanges(this._getReadingTarget(), startPartIndex, startCharOffsetInPart, endPartIndex, endCharOffsetInPart, clientRectDeltaLeft, this._getScaleRatio(), endNode);
	}

	protected _getScaleRatio(): number {
		return 1;
	}

	/**
	 * Returns the column for the text found at a specific offset inside a rendered dom node
	 */
	public getColumnOfNodeOffset(lineNumber:number, spanNode:HTMLElement, offset:number): number {
		let spanNodeTextContentLength = spanNode.textContent.length;

		let spanIndex = -1;
		while (spanNode) {
			spanNode = <HTMLElement>spanNode.previousSibling;
			spanIndex++;
		}
		let lineParts = this._lineParts.getParts();

		return getColumnOfLinePartOffset(
			this._stopRenderingLineAfter,
			lineParts,
			this._context.model.getLineMaxColumn(lineNumber),
			this._charOffsetInPart,
			spanIndex,
			spanNodeTextContentLength,
			offset
		);
	}
}

class IEViewLine extends ViewLine {

	constructor(context:ViewContext) {
		super(context);
	}

	protected _getScaleRatio(): number {
		return screen.logicalXDPI / screen.deviceXDPI;
	}
}

class WebKitViewLine extends ViewLine {

	constructor(context:ViewContext) {
		super(context);
	}

	protected _readVisibleRangesForRange(startColumn:number, endColumn:number, clientRectDeltaLeft:number, endNode:HTMLElement): HorizontalRange[] {
		let output = super._readVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);

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


function findIndexInArrayWithMax(lineParts:LineParts, desiredIndex: number, maxResult:number): number {
	let r = lineParts.findIndexOfOffset(desiredIndex);
	return r <= maxResult ? r : maxResult;
}

export let createLine: (context: ViewContext) => ViewLine = (function() {
	if (window.screen && window.screen.deviceXDPI && (navigator.userAgent.indexOf('Trident/6.0') >= 0 || navigator.userAgent.indexOf('Trident/5.0') >= 0)) {
		// IE11 doesn't need the screen.logicalXDPI / screen.deviceXDPI ratio multiplication
		// for TextRange.getClientRects() anymore
		return createIELine;
	} else if (browser.isWebKit) {
		return createWebKitLine;
	}
	return createNormalLine;
})();

function createIELine(context: ViewContext): ViewLine {
	return new IEViewLine(context);
}

function createWebKitLine(context: ViewContext): ViewLine {
	return new WebKitViewLine(context);
}

function createNormalLine(context: ViewContext): ViewLine {
	return new ViewLine(context);
}

