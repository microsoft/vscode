/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { Decoration } from 'vs/editor/common/viewLayout/viewLineParts';
import { renderViewLine, RenderLineInput, RenderLineOutput, CharacterMapping } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { IVisibleLineData } from 'vs/editor/browser/view/viewLayer';
import { RangeUtil } from 'vs/editor/browser/viewParts/lines/rangeUtil';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { HorizontalRange } from 'vs/editor/common/view/renderingContext';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';

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

export class ViewLine implements IVisibleLineData {

	private _context: ViewContext;
	private _renderWhitespace: 'none' | 'boundary' | 'all';
	private _renderControlCharacters: boolean;
	private _spaceWidth: number;
	private _useMonospaceOptimizations: boolean;
	private _lineHeight: number;
	private _stopRenderingLineAfter: number;

	private _isMaybeInvalid: boolean;

	private _renderedViewLine: IRenderedViewLine;

	constructor(context: ViewContext) {
		this._context = context;
		this._renderWhitespace = this._context.configuration.editor.viewInfo.renderWhitespace;
		this._renderControlCharacters = this._context.configuration.editor.viewInfo.renderControlCharacters;
		this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		this._useMonospaceOptimizations = (
			this._context.configuration.editor.fontInfo.isMonospace
			&& !this._context.configuration.editor.viewInfo.disableMonospaceOptimizations
		);
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
		if (e.viewInfo.disableMonospaceOptimizations) {
			this._isMaybeInvalid = true;
			this._useMonospaceOptimizations = (
				this._context.configuration.editor.fontInfo.isMonospace
				&& !this._context.configuration.editor.viewInfo.disableMonospaceOptimizations
			);
		}
		if (e.fontInfo) {
			this._isMaybeInvalid = true;
			this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
			this._useMonospaceOptimizations = (
				this._context.configuration.editor.fontInfo.isMonospace
				&& !this._context.configuration.editor.viewInfo.disableMonospaceOptimizations
			);
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

		const model = this._context.model;
		const actualInlineDecorations = Decoration.filter(inlineDecorations, lineNumber, model.getLineMinColumn(lineNumber), model.getLineMaxColumn(lineNumber));
		const lineContent = model.getLineContent(lineNumber);

		let renderLineInput = new RenderLineInput(
			this._useMonospaceOptimizations,
			lineContent,
			model.mightContainRTL(),
			model.getLineMinColumn(lineNumber) - 1,
			model.getLineTokens(lineNumber),
			actualInlineDecorations,
			model.getTabSize(),
			this._spaceWidth,
			this._stopRenderingLineAfter,
			this._renderWhitespace,
			this._renderControlCharacters
		);

		if (this._renderedViewLine && this._renderedViewLine.input.equals(renderLineInput)) {
			// no need to do anything, we have the same render input
			return false;
		}

		const output = renderViewLine(renderLineInput);

		let renderedViewLine: IRenderedViewLine = null;
		if (canUseFastRenderedViewLine && this._useMonospaceOptimizations && !output.containsForeignElements) {
			let isRegularASCII = true;
			if (model.mightContainNonBasicASCII()) {
				isRegularASCII = strings.isBasicASCII(lineContent);
			}

			if (isRegularASCII && lineContent.length < 1000) {
				// Browser rounding errors have been observed in Chrome and IE, so using the fast
				// view line only for short lines. Please test before removing the length check...
				renderedViewLine = new FastRenderedViewLine(
					this._renderedViewLine ? this._renderedViewLine.domNode : null,
					renderLineInput,
					output
				);
			}
		}

		if (!renderedViewLine) {
			let isWhitespaceOnly = /^\s*$/.test(renderLineInput.lineContent);
			renderedViewLine = createRenderedLine(
				this._renderedViewLine ? this._renderedViewLine.domNode : null,
				renderLineInput,
				isWhitespaceOnly,
				output
			);
		}

		this._renderedViewLine = renderedViewLine;

		return true;
	}

	public getLineOuterHTML(out: string[], lineNumber: number, deltaTop: number): void {
		out.push(`<div lineNumber="${lineNumber}" style="top:${deltaTop}px;height:${this._lineHeight}px;" class="${ClassNames.VIEW_LINE}">`);
		out.push(this.getLineInnerHTML(lineNumber));
		out.push(`</div>`);
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
	domNode: FastDomNode;
	readonly input: RenderLineInput;
	readonly html: string;
	getWidth(): number;
	getVisibleRangesForRange(startColumn: number, endColumn: number, context: DomReadingContext): HorizontalRange[];
	getColumnOfNodeOffset(lineNumber: number, spanNode: HTMLElement, offset: number): number;
}

/**
 * A rendered line which is guaranteed to contain only regular ASCII and is rendered with a monospace font.
 */
class FastRenderedViewLine implements IRenderedViewLine {

	public domNode: FastDomNode;
	public readonly input: RenderLineInput;
	public readonly html: string;

	private readonly _characterMapping: CharacterMapping;
	private readonly _charWidth: number;
	private readonly _charOffset: Uint32Array;

	constructor(domNode: FastDomNode, renderLineInput: RenderLineInput, renderLineOutput: RenderLineOutput) {
		this.domNode = domNode;
		this.input = renderLineInput;
		this.html = renderLineOutput.output;

		this._characterMapping = renderLineOutput.characterMapping;
		this._charWidth = renderLineInput.spaceWidth;
		this._charOffset = FastRenderedViewLine._createCharOffset(renderLineOutput.characterMapping);
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

	public getWidth(): number {
		return this._getCharPosition(this._charOffset.length);
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
		if (this._charOffset.length === 0) {
			// No characters on this line
			return 0;
		}
		return Math.round(this._charWidth * this._charOffset[column - 1]);
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

	public domNode: FastDomNode;
	public readonly input: RenderLineInput;
	public readonly html: string;

	protected readonly _characterMapping: CharacterMapping;
	private readonly _isWhitespaceOnly: boolean;
	private _cachedWidth: number;

	/**
	 * This is a map that is used only when the line is guaranteed to have no RTL text.
	 */
	private _pixelOffsetCache: Int32Array;

	constructor(domNode: FastDomNode, renderLineInput: RenderLineInput, isWhitespaceOnly: boolean, renderLineOutput: RenderLineOutput) {
		this.domNode = domNode;
		this.input = renderLineInput;
		this.html = renderLineOutput.output;
		this._characterMapping = renderLineOutput.characterMapping;
		this._isWhitespaceOnly = isWhitespaceOnly;
		this._cachedWidth = -1;

		this._pixelOffsetCache = null;
		if (!renderLineOutput.containsRTL) {
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

		if (column === this._characterMapping.length && this._isWhitespaceOnly) {
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

const createRenderedLine: (domNode: FastDomNode, renderLineInput: RenderLineInput, isWhitespaceOnly: boolean, renderLineOutput: RenderLineOutput) => RenderedViewLine = (function () {
	if (browser.isWebKit) {
		return createWebKitRenderedLine;
	}
	return createNormalRenderedLine;
})();

function createWebKitRenderedLine(domNode: FastDomNode, renderLineInput: RenderLineInput, isWhitespaceOnly: boolean, renderLineOutput: RenderLineOutput): RenderedViewLine {
	return new WebKitRenderedViewLine(domNode, renderLineInput, isWhitespaceOnly, renderLineOutput);
}

function createNormalRenderedLine(domNode: FastDomNode, renderLineInput: RenderLineInput, isWhitespaceOnly: boolean, renderLineOutput: RenderLineOutput): RenderedViewLine {
	return new RenderedViewLine(domNode, renderLineInput, isWhitespaceOnly, renderLineOutput);
}
