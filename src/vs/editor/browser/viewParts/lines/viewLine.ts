/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { createLineParts, getColumnOfLinePartOffset } from 'vs/editor/common/viewLayout/viewLineParts';
import { renderLine, RenderLineInput, RenderLineOutput } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { IVisibleLineData } from 'vs/editor/browser/view/viewLayer';
import { RangeUtil } from 'vs/editor/browser/viewParts/lines/rangeUtil';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { HorizontalRange } from 'vs/editor/common/view/renderingContext';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';
import { LineParts } from 'vs/editor/common/core/lineParts';

export class ViewLine implements IVisibleLineData {

	private _context: ViewContext;
	private _renderWhitespace: 'none' | 'boundary' | 'all';
	private _renderControlCharacters: boolean;
	private _spaceWidth: number;
	private _lineHeight: number;
	private _stopRenderingLineAfter: number;

	private _isMaybeInvalid: boolean;

	private _renderedViewLine: RenderedViewLine;

	constructor(context: ViewContext) {
		this._context = context;
		this._renderWhitespace = this._context.configuration.editor.viewInfo.renderWhitespace;
		this._renderControlCharacters = this._context.configuration.editor.viewInfo.renderControlCharacters;
		this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._stopRenderingLineAfter = this._context.configuration.editor.viewInfo.stopRenderingLineAfter;

		this._isMaybeInvalid = true;

		this._renderedViewLine = null;
	}

	// --- begin IVisibleLineData

	public getDomNode(): HTMLElement {
		if (this._renderedViewLine && this._renderedViewLine.domNode) {
			return this._renderedViewLine.domNode.domNode;
		}
		return null;
	}
	public setDomNode(domNode: HTMLElement): void {
		if (this._renderedViewLine) {
			this._renderedViewLine.domNode = createFastDomNode(domNode);
		} else {
			throw new Error('I have no rendered view line to set the dom node to...');
		}
	}

	public onContentChanged(): void {
		this._isMaybeInvalid = true;
	}
	public onTokensChanged(): void {
		this._isMaybeInvalid = true;
	}
	public onModelDecorationsChanged(): void {
		this._isMaybeInvalid = true;
	}
	public onConfigurationChanged(e: IConfigurationChangedEvent): void {
		if (e.viewInfo.renderWhitespace) {
			this._isMaybeInvalid = true;
			this._renderWhitespace = this._context.configuration.editor.viewInfo.renderWhitespace;
		}
		if (e.viewInfo.renderControlCharacters) {
			this._isMaybeInvalid = true;
			this._renderControlCharacters = this._context.configuration.editor.viewInfo.renderControlCharacters;
		}
		if (e.fontInfo) {
			this._isMaybeInvalid = true;
			this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		}
		if (e.lineHeight) {
			this._isMaybeInvalid = true;
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.viewInfo.stopRenderingLineAfter) {
			this._isMaybeInvalid = true;
			this._stopRenderingLineAfter = this._context.configuration.editor.viewInfo.stopRenderingLineAfter;
		}
	}

	public shouldUpdateHTML(startLineNumber: number, lineNumber: number, inlineDecorations: InlineDecoration[]): boolean {
		if (this._isMaybeInvalid === false) {
			// it appears that nothing relevant has changed
			return false;
		}
		this._isMaybeInvalid = false;

		let newLineParts = createLineParts(
			lineNumber,
			this._context.model.getLineMinColumn(lineNumber),
			this._context.model.getLineContent(lineNumber),
			this._context.model.getTabSize(),
			this._context.model.getLineTokens(lineNumber),
			inlineDecorations,
			this._renderWhitespace
		);

		let renderLineInput = new RenderLineInput(
			this._context.model.getLineContent(lineNumber),
			this._context.model.getTabSize(),
			this._spaceWidth,
			this._stopRenderingLineAfter,
			this._renderWhitespace,
			this._renderControlCharacters,
			newLineParts
		);

		if (this._renderedViewLine && this._renderedViewLine.input.equals(renderLineInput)) {
			// no need to do anything, we have the same render input
			return false;
		}

		this._renderedViewLine = createRenderedLine(
			this._renderedViewLine ? this._renderedViewLine.domNode : null,
			renderLineInput,
			this._context.model.mightContainRTL(),
			renderLine(renderLineInput)
		);
		return true;
	}

	public getLineOuterHTML(out: string[], lineNumber: number, deltaTop: number): void {
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
		return this._renderedViewLine.html;
	}

	public layoutLine(lineNumber: number, deltaTop: number): void {
		this._renderedViewLine.domNode.setLineNumber(String(lineNumber));
		this._renderedViewLine.domNode.setTop(deltaTop);
		this._renderedViewLine.domNode.setHeight(this._lineHeight);
	}

	// --- end IVisibleLineData

	public getWidth(): number {
		return this._renderedViewLine.getWidth();
	}

	public getVisibleRangesForRange(startColumn: number, endColumn: number, clientRectDeltaLeft: number, endNode: HTMLElement): HorizontalRange[] {
		return this._renderedViewLine.getVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);
	}

	public getColumnOfNodeOffset(lineNumber: number, spanNode: HTMLElement, offset: number): number {
		return this._renderedViewLine.getColumnOfNodeOffset(lineNumber, spanNode, offset);
	}
}

/**
 * Every time we render a line, we save what we have rendered in an instance of this class.
 */
class RenderedViewLine {

	public domNode: FastDomNode;
	public readonly input: RenderLineInput;
	public readonly html: string;

	protected readonly _charOffsetInPart: number[];
	private readonly _lastRenderedPartIndex: number;
	private readonly _isWhitespaceOnly: boolean;
	private _cachedWidth: number;

	/**
	 * This is a map that is used only when the line is guaranteed to have no RTL text.
	 */
	private _pixelOffsetCache: number[];

	constructor(domNode: FastDomNode, renderLineInput: RenderLineInput, modelContainsRTL: boolean, renderLineOutput: RenderLineOutput) {
		this.domNode = domNode;
		this.input = renderLineInput;
		this.html = renderLineOutput.output;
		this._charOffsetInPart = renderLineOutput.charOffsetInPart;
		this._lastRenderedPartIndex = renderLineOutput.lastRenderedPartIndex;
		this._isWhitespaceOnly = renderLineOutput.isWhitespaceOnly;
		this._cachedWidth = -1;

		this._pixelOffsetCache = null;
		if (!modelContainsRTL) {
			this._pixelOffsetCache = [];
			for (let column = 0, maxLineColumn = this.input.lineParts.maxLineColumn; column <= maxLineColumn; column++) {
				this._pixelOffsetCache[column] = -1;
			}
		}
	}

	// --- Reading from the DOM methods

	protected _getReadingTarget(): HTMLElement {
		return <HTMLSpanElement>this.domNode.domNode.firstChild;
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
	public getVisibleRangesForRange(startColumn: number, endColumn: number, clientRectDeltaLeft: number, endNode: HTMLElement): HorizontalRange[] {
		startColumn = startColumn | 0; // @perf
		endColumn = endColumn | 0; // @perf
		clientRectDeltaLeft = clientRectDeltaLeft | 0; // @perf
		const stopRenderingLineAfter = this.input.stopRenderingLineAfter | 0; // @perf

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

		if (this._pixelOffsetCache !== null) {
			// the text is LTR
			let startOffset = this._readPixelOffset(startColumn, clientRectDeltaLeft, endNode);
			if (startOffset === -1) {
				return null;
			}

			let endOffset = this._readPixelOffset(endColumn, clientRectDeltaLeft, endNode);
			if (endOffset === -1) {
				return null;
			}

			return [new HorizontalRange(startOffset, endOffset - startOffset)];
		}

		return this._readVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);
	}

	protected _readVisibleRangesForRange(startColumn: number, endColumn: number, clientRectDeltaLeft: number, endNode: HTMLElement): HorizontalRange[] {
		if (startColumn === endColumn) {
			let pixelOffset = this._readPixelOffset(startColumn, clientRectDeltaLeft, endNode);
			if (pixelOffset === -1) {
				return null;
			} else {
				return [new HorizontalRange(pixelOffset, 0)];
			}
		} else {
			return this._readRawVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);
		}
	}

	protected _readPixelOffset(column: number, clientRectDeltaLeft: number, endNode: HTMLElement): number {
		if (this._pixelOffsetCache !== null) {
			// the text is LTR

			let cachedPixelOffset = this._pixelOffsetCache[column];
			if (cachedPixelOffset !== -1) {
				return cachedPixelOffset;
			}

			let result = this._actualReadPixelOffset(column, clientRectDeltaLeft, endNode);
			this._pixelOffsetCache[column] = result;
			return result;
		}

		return this._actualReadPixelOffset(column, clientRectDeltaLeft, endNode);
	}

	private _actualReadPixelOffset(column: number, clientRectDeltaLeft: number, endNode: HTMLElement): number {

		if (this._charOffsetInPart.length === 0) {
			// This line is empty
			return 0;
		}

		if (column === this._charOffsetInPart.length && this._isWhitespaceOnly) {
			// This branch helps in the case of whitespace only lines which have a width set
			return this.getWidth();
		}

		let partIndex = findIndexInArrayWithMax(this.input.lineParts, column - 1, this._lastRenderedPartIndex);
		let charOffsetInPart = this._charOffsetInPart[column - 1];

		let r = RangeUtil.readHorizontalRanges(this._getReadingTarget(), partIndex, charOffsetInPart, partIndex, charOffsetInPart, clientRectDeltaLeft, this._getScaleRatio(), endNode);
		if (!r || r.length === 0) {
			return -1;
		}
		return r[0].left;
	}

	private _readRawVisibleRangesForRange(startColumn: number, endColumn: number, clientRectDeltaLeft: number, endNode: HTMLElement): HorizontalRange[] {

		if (startColumn === 1 && endColumn === this._charOffsetInPart.length) {
			// This branch helps IE with bidi text & gives a performance boost to other browsers when reading visible ranges for an entire line

			return [new HorizontalRange(0, this.getWidth())];
		}

		let startPartIndex = findIndexInArrayWithMax(this.input.lineParts, startColumn - 1, this._lastRenderedPartIndex);
		let startCharOffsetInPart = this._charOffsetInPart[startColumn - 1];
		let endPartIndex = findIndexInArrayWithMax(this.input.lineParts, endColumn - 1, this._lastRenderedPartIndex);
		let endCharOffsetInPart = this._charOffsetInPart[endColumn - 1];

		return RangeUtil.readHorizontalRanges(this._getReadingTarget(), startPartIndex, startCharOffsetInPart, endPartIndex, endCharOffsetInPart, clientRectDeltaLeft, this._getScaleRatio(), endNode);
	}

	protected _getScaleRatio(): number {
		return 1;
	}

	/**
	 * Returns the column for the text found at a specific offset inside a rendered dom node
	 */
	public getColumnOfNodeOffset(lineNumber: number, spanNode: HTMLElement, offset: number): number {
		let spanNodeTextContentLength = spanNode.textContent.length;

		let spanIndex = -1;
		while (spanNode) {
			spanNode = <HTMLElement>spanNode.previousSibling;
			spanIndex++;
		}
		let lineParts = this.input.lineParts.parts;

		return getColumnOfLinePartOffset(
			this.input.stopRenderingLineAfter,
			lineParts,
			this.input.lineParts.maxLineColumn,
			this._charOffsetInPart,
			spanIndex,
			spanNodeTextContentLength,
			offset
		);
	}
}

class IERenderedViewLine extends RenderedViewLine {
	protected _getScaleRatio(): number {
		return screen.logicalXDPI / screen.deviceXDPI;
	}
}

class WebKitRenderedViewLine extends RenderedViewLine {
	protected _readVisibleRangesForRange(startColumn: number, endColumn: number, clientRectDeltaLeft: number, endNode: HTMLElement): HorizontalRange[] {
		let output = super._readVisibleRangesForRange(startColumn, endColumn, clientRectDeltaLeft, endNode);

		if (!output || output.length === 0 || startColumn === endColumn || (startColumn === 1 && endColumn === this._charOffsetInPart.length)) {
			return output;
		}

		// WebKit is buggy and returns an expanded range (to contain words in some cases)
		// The last client rect is enlarged (I think)

		// This is an attempt to patch things up
		// Find position of previous column
		let beforeEndPixelOffset = this._readPixelOffset(endColumn - 1, clientRectDeltaLeft, endNode);
		// Find position of last column
		let endPixelOffset = this._readPixelOffset(endColumn, clientRectDeltaLeft, endNode);

		if (beforeEndPixelOffset !== -1 && endPixelOffset !== -1) {
			let isLTR = (beforeEndPixelOffset <= endPixelOffset);
			let lastRange = output[output.length - 1];

			if (isLTR && lastRange.left < endPixelOffset) {
				// Trim down the width of the last visible range to not go after the last column's position
				lastRange.width = endPixelOffset - lastRange.left;
			}
		}

		return output;
	}
}

function findIndexInArrayWithMax(lineParts: LineParts, desiredIndex: number, maxResult: number): number {
	let r = lineParts.findIndexOfOffset(desiredIndex);
	return r <= maxResult ? r : maxResult;
}

const createRenderedLine: (domNode: FastDomNode, renderLineInput: RenderLineInput, modelContainsRTL: boolean, renderLineOutput: RenderLineOutput) => RenderedViewLine = (function () {
	if (window.screen && window.screen.deviceXDPI && (navigator.userAgent.indexOf('Trident/6.0') >= 0 || navigator.userAgent.indexOf('Trident/5.0') >= 0)) {
		// IE11 doesn't need the screen.logicalXDPI / screen.deviceXDPI ratio multiplication
		// for TextRange.getClientRects() anymore
		return createIERenderedLine;
	} else if (browser.isWebKit) {
		return createWebKitRenderedLine;
	}
	return createNormalRenderedLine;
})();

function createIERenderedLine(domNode: FastDomNode, renderLineInput: RenderLineInput, modelContainsRTL: boolean, renderLineOutput: RenderLineOutput): RenderedViewLine {
	return new IERenderedViewLine(domNode, renderLineInput, modelContainsRTL, renderLineOutput);
}

function createWebKitRenderedLine(domNode: FastDomNode, renderLineInput: RenderLineInput, modelContainsRTL: boolean, renderLineOutput: RenderLineOutput): RenderedViewLine {
	return new WebKitRenderedViewLine(domNode, renderLineInput, modelContainsRTL, renderLineOutput);
}

function createNormalRenderedLine(domNode: FastDomNode, renderLineInput: RenderLineInput, modelContainsRTL: boolean, renderLineOutput: RenderLineOutput): RenderedViewLine {
	return new RenderedViewLine(domNode, renderLineInput, modelContainsRTL, renderLineOutput);
}
