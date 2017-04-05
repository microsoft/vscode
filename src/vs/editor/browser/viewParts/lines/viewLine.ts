/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IConfiguration } from 'vs/editor/common/editorCommon';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { renderViewLine, RenderLineInput, CharacterMapping } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { IVisibleLine } from 'vs/editor/browser/view/viewLayer';
import { RangeUtil } from 'vs/editor/browser/viewParts/lines/rangeUtil';
import { HorizontalRange } from 'vs/editor/common/view/renderingContext';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

const canUseFastRenderedViewLine = (function () {
	if (platform.isNative) {
		// In VSCode we know very well when the zoom level changes
		return true;
	}

	if (platform.isLinux || browser.isFirefox || browser.isSafari) {
		// On Linux, it appears that zooming affects char widths (in pixels), which is unexpected.
		// --
		// Even though we read character widths correctly, having read them at a specific zoom level
		// does not mean they are the same at the current zoom level.
		// --
		// This could be improved if we ever figure out how to get an event when browsers zoom,
		// but until then we have to stick with reading client rects.
		// --
		// The same has been observed with Firefox on Windows7
		// --
		// The same has been oversved with Safari
		return false;
	}

	return true;
})();

export class DomReadingContext {

	private readonly _domNode: HTMLElement;
	private _clientRectDeltaLeft: number;
	private _clientRectDeltaLeftRead: boolean;
	public get clientRectDeltaLeft(): number {
		if (!this._clientRectDeltaLeftRead) {
			this._clientRectDeltaLeftRead = true;
			this._clientRectDeltaLeft = this._domNode.getBoundingClientRect().left;
		}
		return this._clientRectDeltaLeft;
	}

	public readonly endNode: HTMLElement;

	constructor(domNode: HTMLElement, endNode: HTMLElement) {
		this._domNode = domNode;
		this._clientRectDeltaLeft = 0;
		this._clientRectDeltaLeftRead = false;
		this.endNode = endNode;
	}

}

export class ViewLineOptions {
	public readonly renderWhitespace: 'none' | 'boundary' | 'all';
	public readonly renderControlCharacters: boolean;
	public readonly spaceWidth: number;
	public readonly useMonospaceOptimizations: boolean;
	public readonly lineHeight: number;
	public readonly stopRenderingLineAfter: number;
	public readonly fontLigatures: boolean;

	constructor(config: IConfiguration) {
		this.renderWhitespace = config.editor.viewInfo.renderWhitespace;
		this.renderControlCharacters = config.editor.viewInfo.renderControlCharacters;
		this.spaceWidth = config.editor.fontInfo.spaceWidth;
		this.useMonospaceOptimizations = (
			config.editor.fontInfo.isMonospace
			&& !config.editor.viewInfo.disableMonospaceOptimizations
		);
		this.lineHeight = config.editor.lineHeight;
		this.stopRenderingLineAfter = config.editor.viewInfo.stopRenderingLineAfter;
		this.fontLigatures = config.editor.viewInfo.fontLigatures;
	}

	public equals(other: ViewLineOptions): boolean {
		return (
			this.renderWhitespace === other.renderWhitespace
			&& this.renderControlCharacters === other.renderControlCharacters
			&& this.spaceWidth === other.spaceWidth
			&& this.useMonospaceOptimizations === other.useMonospaceOptimizations
			&& this.lineHeight === other.lineHeight
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.fontLigatures === other.fontLigatures
		);
	}
}

export class ViewLine implements IVisibleLine {

	private _options: ViewLineOptions;
	private _isMaybeInvalid: boolean;
	private _renderedViewLine: IRenderedViewLine;

	constructor(options: ViewLineOptions) {
		this._options = options;
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
	public onDecorationsChanged(): void {
		this._isMaybeInvalid = true;
	}
	public onOptionsChanged(newOptions: ViewLineOptions): void {
		this._isMaybeInvalid = true;
		this._options = newOptions;
	}

	public renderLine(lineNumber: number, deltaTop: number, viewportData: ViewportData): string {
		if (this._isMaybeInvalid === false) {
			// it appears that nothing relevant has changed
			return null;
		}

		this._isMaybeInvalid = false;

		const lineData = viewportData.getViewLineRenderingData(lineNumber);
		const options = this._options;
		const actualInlineDecorations = LineDecoration.filter(lineData.inlineDecorations, lineNumber, lineData.minColumn, lineData.maxColumn);
		let renderLineInput = new RenderLineInput(
			options.useMonospaceOptimizations,
			lineData.content,
			lineData.mightContainRTL,
			lineData.minColumn - 1,
			lineData.tokens,
			actualInlineDecorations,
			lineData.tabSize,
			options.spaceWidth,
			options.stopRenderingLineAfter,
			options.renderWhitespace,
			options.renderControlCharacters,
			options.fontLigatures
		);

		if (this._renderedViewLine && this._renderedViewLine.input.equals(renderLineInput)) {
			// no need to do anything, we have the same render input
			return null;
		}

		const output = renderViewLine(renderLineInput);

		let renderedViewLine: IRenderedViewLine = null;
		if (canUseFastRenderedViewLine && options.useMonospaceOptimizations && !output.containsForeignElements) {
			let isRegularASCII = true;
			if (lineData.mightContainNonBasicASCII) {
				isRegularASCII = strings.isBasicASCII(lineData.content);
			}

			if (isRegularASCII && lineData.content.length < 1000) {
				// Browser rounding errors have been observed in Chrome and IE, so using the fast
				// view line only for short lines. Please test before removing the length check...
				renderedViewLine = new FastRenderedViewLine(
					this._renderedViewLine ? this._renderedViewLine.domNode : null,
					renderLineInput,
					output.characterMapping
				);
			}
		}

		if (!renderedViewLine) {
			renderedViewLine = createRenderedLine(
				this._renderedViewLine ? this._renderedViewLine.domNode : null,
				renderLineInput,
				output.characterMapping,
				output.containsRTL,
				output.containsForeignElements
			);
		}

		this._renderedViewLine = renderedViewLine;

		return `<div style="top:${deltaTop}px;height:${this._options.lineHeight}px;" class="${ClassNames.VIEW_LINE}">${output.html}</div>`;
	}

	public layoutLine(lineNumber: number, deltaTop: number): void {
		if (this._renderedViewLine && this._renderedViewLine.domNode) {
			this._renderedViewLine.domNode.setTop(deltaTop);
			this._renderedViewLine.domNode.setHeight(this._options.lineHeight);
		}
	}

	// --- end IVisibleLineData

	public getWidth(): number {
		if (!this._renderedViewLine) {
			return 0;
		}
		return this._renderedViewLine.getWidth();
	}

	public getVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[] {
		startColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, startColumn));
		endColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, endColumn));
		return this._renderedViewLine.getVisibleRangesForRange(startColumn, endColumn, context);
	}

	public getColumnOfNodeOffset(lineNumber: number, spanNode: HTMLElement, offset: number): number {
		return this._renderedViewLine.getColumnOfNodeOffset(lineNumber, spanNode, offset);
	}
}

interface IRenderedViewLine {
	domNode: FastDomNode<HTMLElement>;
	readonly input: RenderLineInput;
	getWidth(): number;
	getVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[];
	getColumnOfNodeOffset(lineNumber: number, spanNode: HTMLElement, offset: number): number;
}

/**
 * A rendered line which is guaranteed to contain only regular ASCII and is rendered with a monospace font.
 */
class FastRenderedViewLine implements IRenderedViewLine {

	public domNode: FastDomNode<HTMLElement>;
	public readonly input: RenderLineInput;

	private readonly _characterMapping: CharacterMapping;
	private readonly _charWidth: number;
	private _charOffset: Uint32Array;

	constructor(domNode: FastDomNode<HTMLElement>, renderLineInput: RenderLineInput, characterMapping: CharacterMapping) {
		this.domNode = domNode;
		this.input = renderLineInput;

		this._characterMapping = characterMapping;
		this._charWidth = renderLineInput.spaceWidth;
		this._charOffset = null;
	}

	private static _createCharOffset(characterMapping: CharacterMapping): Uint32Array {
		const partLengths = characterMapping.getPartLengths();
		const len = characterMapping.length;

		let result = new Uint32Array(len);
		let currentPartIndex = 0;
		let currentPartOffset = 0;
		for (let ch = 0; ch < len; ch++) {
			const partData = characterMapping.charOffsetToPartData(ch);
			const partIndex = CharacterMapping.getPartIndex(partData);
			const charIndex = CharacterMapping.getCharIndex(partData);

			while (currentPartIndex < partIndex) {
				currentPartOffset += partLengths[currentPartIndex];
				currentPartIndex++;
			}

			result[ch] = currentPartOffset + charIndex;
		}

		return result;
	}

	private _getOrCreateCharOffset(): Uint32Array {
		if (this._charOffset === null) {
			this._charOffset = FastRenderedViewLine._createCharOffset(this._characterMapping);
		}
		return this._charOffset;
	}

	public getWidth(): number {
		const charOffset = this._getOrCreateCharOffset();
		return this._getCharPosition(charOffset.length);
	}

	public getVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[] {
		startColumn = startColumn | 0; // @perf
		endColumn = endColumn | 0; // @perf
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

		const startPosition = this._getCharPosition(startColumn);
		const endPosition = this._getCharPosition(endColumn);
		return [new HorizontalRange(startPosition, endPosition - startPosition)];
	}

	private _getCharPosition(column: number): number {
		const charOffset = this._getOrCreateCharOffset();
		if (charOffset.length === 0) {
			// No characters on this line
			return 0;
		}
		return Math.round(this._charWidth * charOffset[column - 1]);
	}

	public getColumnOfNodeOffset(lineNumber: number, spanNode: HTMLElement, offset: number): number {
		let spanNodeTextContentLength = spanNode.textContent.length;

		let spanIndex = -1;
		while (spanNode) {
			spanNode = <HTMLElement>spanNode.previousSibling;
			spanIndex++;
		}

		let charOffset = this._characterMapping.partDataToCharOffset(spanIndex, spanNodeTextContentLength, offset);
		return charOffset + 1;
	}
}

/**
 * Every time we render a line, we save what we have rendered in an instance of this class.
 */
class RenderedViewLine {

	public domNode: FastDomNode<HTMLElement>;
	public readonly input: RenderLineInput;

	protected readonly _characterMapping: CharacterMapping;
	private readonly _isWhitespaceOnly: boolean;
	private readonly _containsForeignElements: boolean;
	private _cachedWidth: number;

	/**
	 * This is a map that is used only when the line is guaranteed to have no RTL text.
	 */
	private _pixelOffsetCache: Int32Array;

	constructor(domNode: FastDomNode<HTMLElement>, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: boolean) {
		this.domNode = domNode;
		this.input = renderLineInput;
		this._characterMapping = characterMapping;
		this._isWhitespaceOnly = /^\s*$/.test(renderLineInput.lineContent);
		this._containsForeignElements = containsForeignElements;
		this._cachedWidth = -1;

		this._pixelOffsetCache = null;
		if (!containsRTL) {
			this._pixelOffsetCache = new Int32Array(this._characterMapping.length + 1);
			for (let column = 0, len = this._characterMapping.length; column <= len; column++) {
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
	public getVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[] {
		startColumn = startColumn | 0; // @perf
		endColumn = endColumn | 0; // @perf
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
			let startOffset = this._readPixelOffset(startColumn, context);
			if (startOffset === -1) {
				return null;
			}

			let endOffset = this._readPixelOffset(endColumn, context);
			if (endOffset === -1) {
				return null;
			}

			return [new HorizontalRange(startOffset, endOffset - startOffset)];
		}

		return this._readVisibleRangesForRange(startColumn, endColumn, context);
	}

	protected _readVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[] {
		if (startColumn === endColumn) {
			let pixelOffset = this._readPixelOffset(startColumn, context);
			if (pixelOffset === -1) {
				return null;
			} else {
				return [new HorizontalRange(pixelOffset, 0)];
			}
		} else {
			return this._readRawVisibleRangesForRange(startColumn, endColumn, context);
		}
	}

	protected _readPixelOffset(column: number, context: DomReadingContext): number {
		if (this._characterMapping.length === 0) {
			// This line is empty
			return 0;
		}

		if (this._pixelOffsetCache !== null) {
			// the text is LTR

			let cachedPixelOffset = this._pixelOffsetCache[column];
			if (cachedPixelOffset !== -1) {
				return cachedPixelOffset;
			}

			let result = this._actualReadPixelOffset(column, context);
			this._pixelOffsetCache[column] = result;
			return result;
		}

		return this._actualReadPixelOffset(column, context);
	}

	private _actualReadPixelOffset(column: number, context: DomReadingContext): number {

		if (column === this._characterMapping.length && this._isWhitespaceOnly && !this._containsForeignElements) {
			// This branch helps in the case of whitespace only lines which have a width set
			return this.getWidth();
		}

		let partData = this._characterMapping.charOffsetToPartData(column - 1);
		let partIndex = CharacterMapping.getPartIndex(partData);
		let charOffsetInPart = CharacterMapping.getCharIndex(partData);

		let r = RangeUtil.readHorizontalRanges(this._getReadingTarget(), partIndex, charOffsetInPart, partIndex, charOffsetInPart, context.clientRectDeltaLeft, context.endNode);
		if (!r || r.length === 0) {
			return -1;
		}
		return r[0].left;
	}

	private _readRawVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[] {

		if (startColumn === 1 && endColumn === this._characterMapping.length) {
			// This branch helps IE with bidi text & gives a performance boost to other browsers when reading visible ranges for an entire line

			return [new HorizontalRange(0, this.getWidth())];
		}

		let startPartData = this._characterMapping.charOffsetToPartData(startColumn - 1);
		let startPartIndex = CharacterMapping.getPartIndex(startPartData);
		let startCharOffsetInPart = CharacterMapping.getCharIndex(startPartData);

		let endPartData = this._characterMapping.charOffsetToPartData(endColumn - 1);
		let endPartIndex = CharacterMapping.getPartIndex(endPartData);
		let endCharOffsetInPart = CharacterMapping.getCharIndex(endPartData);

		return RangeUtil.readHorizontalRanges(this._getReadingTarget(), startPartIndex, startCharOffsetInPart, endPartIndex, endCharOffsetInPart, context.clientRectDeltaLeft, context.endNode);
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

		let charOffset = this._characterMapping.partDataToCharOffset(spanIndex, spanNodeTextContentLength, offset);
		return charOffset + 1;
	}
}

class WebKitRenderedViewLine extends RenderedViewLine {
	protected _readVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[] {
		let output = super._readVisibleRangesForRange(startColumn, endColumn, context);

		if (!output || output.length === 0 || startColumn === endColumn || (startColumn === 1 && endColumn === this._characterMapping.length)) {
			return output;
		}

		// WebKit is buggy and returns an expanded range (to contain words in some cases)
		// The last client rect is enlarged (I think)

		// This is an attempt to patch things up
		// Find position of previous column
		let beforeEndPixelOffset = this._readPixelOffset(endColumn - 1, context);
		// Find position of last column
		let endPixelOffset = this._readPixelOffset(endColumn, context);

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

const createRenderedLine: (domNode: FastDomNode<HTMLElement>, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: boolean) => RenderedViewLine = (function () {
	if (browser.isWebKit) {
		return createWebKitRenderedLine;
	}
	return createNormalRenderedLine;
})();

function createWebKitRenderedLine(domNode: FastDomNode<HTMLElement>, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: boolean): RenderedViewLine {
	return new WebKitRenderedViewLine(domNode, renderLineInput, characterMapping, containsRTL, containsForeignElements);
}

function createNormalRenderedLine(domNode: FastDomNode<HTMLElement>, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: boolean): RenderedViewLine {
	return new RenderedViewLine(domNode, renderLineInput, characterMapping, containsRTL, containsForeignElements);
}
