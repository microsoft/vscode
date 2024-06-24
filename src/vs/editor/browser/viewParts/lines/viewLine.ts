/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import * as platform from 'vs/base/common/platform';
import { IVisibleLine } from 'vs/editor/browser/view/viewLayer';
import { RangeUtil } from 'vs/editor/browser/viewParts/lines/rangeUtil';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { IEditorConfiguration } from 'vs/editor/common/config/editorConfiguration';
import { FloatHorizontalRange, VisibleRanges } from 'vs/editor/browser/view/renderingContext';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { CharacterMapping, ForeignElementType, RenderLineInput, renderViewLine, LineRange, DomPosition } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { InlineDecorationType } from 'vs/editor/common/viewModel';
import { ColorScheme, isHighContrast } from 'vs/platform/theme/common/theme';
import { EditorOption, EditorFontLigatures } from 'vs/editor/common/config/editorOptions';
import { DomReadingContext } from 'vs/editor/browser/viewParts/lines/domReadingContext';

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

let monospaceAssumptionsAreValid = true;

export class ViewLineOptions {
	public readonly themeType: ColorScheme;
	public readonly renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	public readonly renderControlCharacters: boolean;
	public readonly spaceWidth: number;
	public readonly middotWidth: number;
	public readonly wsmiddotWidth: number;
	public readonly useMonospaceOptimizations: boolean;
	public readonly canUseHalfwidthRightwardsArrow: boolean;
	public readonly lineHeight: number;
	public readonly stopRenderingLineAfter: number;
	public readonly fontLigatures: string;

	constructor(config: IEditorConfiguration, themeType: ColorScheme) {
		this.themeType = themeType;
		const options = config.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const experimentalWhitespaceRendering = options.get(EditorOption.experimentalWhitespaceRendering);
		if (experimentalWhitespaceRendering === 'off') {
			this.renderWhitespace = options.get(EditorOption.renderWhitespace);
		} else {
			// whitespace is rendered in a different layer
			this.renderWhitespace = 'none';
		}
		this.renderControlCharacters = options.get(EditorOption.renderControlCharacters);
		this.spaceWidth = fontInfo.spaceWidth;
		this.middotWidth = fontInfo.middotWidth;
		this.wsmiddotWidth = fontInfo.wsmiddotWidth;
		this.useMonospaceOptimizations = (
			fontInfo.isMonospace
			&& !options.get(EditorOption.disableMonospaceOptimizations)
		);
		this.canUseHalfwidthRightwardsArrow = fontInfo.canUseHalfwidthRightwardsArrow;
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
		this.fontLigatures = options.get(EditorOption.fontLigatures);
	}

	public equals(other: ViewLineOptions): boolean {
		return (
			this.themeType === other.themeType
			&& this.renderWhitespace === other.renderWhitespace
			&& this.renderControlCharacters === other.renderControlCharacters
			&& this.spaceWidth === other.spaceWidth
			&& this.middotWidth === other.middotWidth
			&& this.wsmiddotWidth === other.wsmiddotWidth
			&& this.useMonospaceOptimizations === other.useMonospaceOptimizations
			&& this.canUseHalfwidthRightwardsArrow === other.canUseHalfwidthRightwardsArrow
			&& this.lineHeight === other.lineHeight
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.fontLigatures === other.fontLigatures
		);
	}
}

export class ViewLine implements IVisibleLine {

	public static readonly CLASS_NAME = 'view-line';

	private _options: ViewLineOptions;
	private _isMaybeInvalid: boolean;
	private _renderedViewLine: IRenderedViewLine | null;

	constructor(options: ViewLineOptions) {
		this._options = options;
		this._isMaybeInvalid = true;
		this._renderedViewLine = null;
	}

	// --- begin IVisibleLineData

	public getDomNode(): HTMLElement | null {
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
	public onSelectionChanged(): boolean {
		if (isHighContrast(this._options.themeType) || this._options.renderWhitespace === 'selection') {
			this._isMaybeInvalid = true;
			return true;
		}
		return false;
	}

	public renderLine(lineNumber: number, deltaTop: number, lineHeight: number, viewportData: ViewportData, sb: StringBuilder): boolean {
		if (this._isMaybeInvalid === false) {
			// it appears that nothing relevant has changed
			return false;
		}

		this._isMaybeInvalid = false;

		const lineData = viewportData.getViewLineRenderingData(lineNumber);
		const options = this._options;
		const actualInlineDecorations = LineDecoration.filter(lineData.inlineDecorations, lineNumber, lineData.minColumn, lineData.maxColumn);

		// Only send selection information when needed for rendering whitespace
		let selectionsOnLine: LineRange[] | null = null;
		if (isHighContrast(options.themeType) || this._options.renderWhitespace === 'selection') {
			const selections = viewportData.selections;
			for (const selection of selections) {

				if (selection.endLineNumber < lineNumber || selection.startLineNumber > lineNumber) {
					// Selection does not intersect line
					continue;
				}

				const startColumn = (selection.startLineNumber === lineNumber ? selection.startColumn : lineData.minColumn);
				const endColumn = (selection.endLineNumber === lineNumber ? selection.endColumn : lineData.maxColumn);

				if (startColumn < endColumn) {
					if (isHighContrast(options.themeType)) {
						actualInlineDecorations.push(new LineDecoration(startColumn, endColumn, 'inline-selected-text', InlineDecorationType.Regular));
					}
					if (this._options.renderWhitespace === 'selection') {
						if (!selectionsOnLine) {
							selectionsOnLine = [];
						}

						selectionsOnLine.push(new LineRange(startColumn - 1, endColumn - 1));
					}
				}
			}
		}

		const renderLineInput = new RenderLineInput(
			options.useMonospaceOptimizations,
			options.canUseHalfwidthRightwardsArrow,
			lineData.content,
			lineData.continuesWithWrappedLine,
			lineData.isBasicASCII,
			lineData.containsRTL,
			lineData.minColumn - 1,
			lineData.tokens,
			actualInlineDecorations,
			lineData.tabSize,
			lineData.startVisibleColumn,
			options.spaceWidth,
			options.middotWidth,
			options.wsmiddotWidth,
			options.stopRenderingLineAfter,
			options.renderWhitespace,
			options.renderControlCharacters,
			options.fontLigatures !== EditorFontLigatures.OFF,
			selectionsOnLine
		);

		if (this._renderedViewLine && this._renderedViewLine.input.equals(renderLineInput)) {
			// no need to do anything, we have the same render input
			return false;
		}

		sb.appendString('<div style="top:');
		sb.appendString(String(deltaTop));
		sb.appendString('px;height:');
		sb.appendString(String(lineHeight));
		sb.appendString('px;" class="');
		sb.appendString(ViewLine.CLASS_NAME);
		sb.appendString('">');

		const output = renderViewLine(renderLineInput, sb);

		sb.appendString('</div>');

		let renderedViewLine: IRenderedViewLine | null = null;
		if (monospaceAssumptionsAreValid && canUseFastRenderedViewLine && lineData.isBasicASCII && options.useMonospaceOptimizations && output.containsForeignElements === ForeignElementType.None) {
			renderedViewLine = new FastRenderedViewLine(
				this._renderedViewLine ? this._renderedViewLine.domNode : null,
				renderLineInput,
				output.characterMapping
			);
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

		return true;
	}

	public layoutLine(lineNumber: number, deltaTop: number, lineHeight: number): void {
		if (this._renderedViewLine && this._renderedViewLine.domNode) {
			this._renderedViewLine.domNode.setTop(deltaTop);
			this._renderedViewLine.domNode.setHeight(lineHeight);
		}
	}

	// --- end IVisibleLineData

	public getWidth(context: DomReadingContext | null): number {
		if (!this._renderedViewLine) {
			return 0;
		}
		return this._renderedViewLine.getWidth(context);
	}

	public getWidthIsFast(): boolean {
		if (!this._renderedViewLine) {
			return true;
		}
		return this._renderedViewLine.getWidthIsFast();
	}

	public needsMonospaceFontCheck(): boolean {
		if (!this._renderedViewLine) {
			return false;
		}
		return (this._renderedViewLine instanceof FastRenderedViewLine);
	}

	public monospaceAssumptionsAreValid(): boolean {
		if (!this._renderedViewLine) {
			return monospaceAssumptionsAreValid;
		}
		if (this._renderedViewLine instanceof FastRenderedViewLine) {
			return this._renderedViewLine.monospaceAssumptionsAreValid();
		}
		return monospaceAssumptionsAreValid;
	}

	public onMonospaceAssumptionsInvalidated(): void {
		if (this._renderedViewLine && this._renderedViewLine instanceof FastRenderedViewLine) {
			this._renderedViewLine = this._renderedViewLine.toSlowRenderedLine();
		}
	}

	public getVisibleRangesForRange(lineNumber: number, startColumn: number, endColumn: number, context: DomReadingContext): VisibleRanges | null {
		if (!this._renderedViewLine) {
			return null;
		}

		startColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, startColumn));
		endColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, endColumn));

		const stopRenderingLineAfter = this._renderedViewLine.input.stopRenderingLineAfter;

		if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter + 1 && endColumn > stopRenderingLineAfter + 1) {
			// This range is obviously not visible
			return new VisibleRanges(true, [new FloatHorizontalRange(this.getWidth(context), 0)]);
		}

		if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter + 1) {
			startColumn = stopRenderingLineAfter + 1;
		}

		if (stopRenderingLineAfter !== -1 && endColumn > stopRenderingLineAfter + 1) {
			endColumn = stopRenderingLineAfter + 1;
		}

		const horizontalRanges = this._renderedViewLine.getVisibleRangesForRange(lineNumber, startColumn, endColumn, context);
		if (horizontalRanges && horizontalRanges.length > 0) {
			return new VisibleRanges(false, horizontalRanges);
		}

		return null;
	}

	public getColumnOfNodeOffset(spanNode: HTMLElement, offset: number): number {
		if (!this._renderedViewLine) {
			return 1;
		}
		return this._renderedViewLine.getColumnOfNodeOffset(spanNode, offset);
	}
}

interface IRenderedViewLine {
	domNode: FastDomNode<HTMLElement> | null;
	readonly input: RenderLineInput;
	getWidth(context: DomReadingContext | null): number;
	getWidthIsFast(): boolean;
	getVisibleRangesForRange(lineNumber: number, startColumn: number, endColumn: number, context: DomReadingContext): FloatHorizontalRange[] | null;
	getColumnOfNodeOffset(spanNode: HTMLElement, offset: number): number;
}

const enum Constants {
	/**
	 * It seems that rounding errors occur with long lines, so the purely multiplication based
	 * method is only viable for short lines. For longer lines, we look up the real position of
	 * every 300th character and use multiplication based on that.
	 *
	 * See https://github.com/microsoft/vscode/issues/33178
	 */
	MaxMonospaceDistance = 300
}

/**
 * A rendered line which is guaranteed to contain only regular ASCII and is rendered with a monospace font.
 */
class FastRenderedViewLine implements IRenderedViewLine {

	public domNode: FastDomNode<HTMLElement> | null;
	public readonly input: RenderLineInput;

	private readonly _characterMapping: CharacterMapping;
	private readonly _charWidth: number;
	private readonly _keyColumnPixelOffsetCache: Float32Array | null;
	private _cachedWidth: number = -1;

	constructor(domNode: FastDomNode<HTMLElement> | null, renderLineInput: RenderLineInput, characterMapping: CharacterMapping) {
		this.domNode = domNode;
		this.input = renderLineInput;
		const keyColumnCount = Math.floor(renderLineInput.lineContent.length / Constants.MaxMonospaceDistance);
		if (keyColumnCount > 0) {
			this._keyColumnPixelOffsetCache = new Float32Array(keyColumnCount);
			for (let i = 0; i < keyColumnCount; i++) {
				this._keyColumnPixelOffsetCache[i] = -1;
			}
		} else {
			this._keyColumnPixelOffsetCache = null;
		}

		this._characterMapping = characterMapping;
		this._charWidth = renderLineInput.spaceWidth;
	}

	public getWidth(context: DomReadingContext | null): number {
		if (!this.domNode || this.input.lineContent.length < Constants.MaxMonospaceDistance) {
			const horizontalOffset = this._characterMapping.getHorizontalOffset(this._characterMapping.length);
			return Math.round(this._charWidth * horizontalOffset);
		}
		if (this._cachedWidth === -1) {
			this._cachedWidth = this._getReadingTarget(this.domNode).offsetWidth;
			context?.markDidDomLayout();
		}
		return this._cachedWidth;
	}

	public getWidthIsFast(): boolean {
		return (this.input.lineContent.length < Constants.MaxMonospaceDistance) || this._cachedWidth !== -1;
	}

	public monospaceAssumptionsAreValid(): boolean {
		if (!this.domNode) {
			return monospaceAssumptionsAreValid;
		}
		if (this.input.lineContent.length < Constants.MaxMonospaceDistance) {
			const expectedWidth = this.getWidth(null);
			const actualWidth = (<HTMLSpanElement>this.domNode.domNode.firstChild).offsetWidth;
			if (Math.abs(expectedWidth - actualWidth) >= 2) {
				// more than 2px off
				console.warn(`monospace assumptions have been violated, therefore disabling monospace optimizations!`);
				monospaceAssumptionsAreValid = false;
			}
		}
		return monospaceAssumptionsAreValid;
	}

	public toSlowRenderedLine(): RenderedViewLine {
		return createRenderedLine(this.domNode, this.input, this._characterMapping, false, ForeignElementType.None);
	}

	public getVisibleRangesForRange(lineNumber: number, startColumn: number, endColumn: number, context: DomReadingContext): FloatHorizontalRange[] | null {
		const startPosition = this._getColumnPixelOffset(lineNumber, startColumn, context);
		const endPosition = this._getColumnPixelOffset(lineNumber, endColumn, context);
		return [new FloatHorizontalRange(startPosition, endPosition - startPosition)];
	}

	private _getColumnPixelOffset(lineNumber: number, column: number, context: DomReadingContext): number {
		if (column <= Constants.MaxMonospaceDistance) {
			const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
			return this._charWidth * horizontalOffset;
		}

		const keyColumnOrdinal = Math.floor((column - 1) / Constants.MaxMonospaceDistance) - 1;
		const keyColumn = (keyColumnOrdinal + 1) * Constants.MaxMonospaceDistance + 1;
		let keyColumnPixelOffset = -1;
		if (this._keyColumnPixelOffsetCache) {
			keyColumnPixelOffset = this._keyColumnPixelOffsetCache[keyColumnOrdinal];
			if (keyColumnPixelOffset === -1) {
				keyColumnPixelOffset = this._actualReadPixelOffset(lineNumber, keyColumn, context);
				this._keyColumnPixelOffsetCache[keyColumnOrdinal] = keyColumnPixelOffset;
			}
		}

		if (keyColumnPixelOffset === -1) {
			// Could not read actual key column pixel offset
			const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
			return this._charWidth * horizontalOffset;
		}

		const keyColumnHorizontalOffset = this._characterMapping.getHorizontalOffset(keyColumn);
		const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
		return keyColumnPixelOffset + this._charWidth * (horizontalOffset - keyColumnHorizontalOffset);
	}

	private _getReadingTarget(myDomNode: FastDomNode<HTMLElement>): HTMLElement {
		return <HTMLSpanElement>myDomNode.domNode.firstChild;
	}

	private _actualReadPixelOffset(lineNumber: number, column: number, context: DomReadingContext): number {
		if (!this.domNode) {
			return -1;
		}
		const domPosition = this._characterMapping.getDomPosition(column);
		const r = RangeUtil.readHorizontalRanges(this._getReadingTarget(this.domNode), domPosition.partIndex, domPosition.charIndex, domPosition.partIndex, domPosition.charIndex, context);
		if (!r || r.length === 0) {
			return -1;
		}
		return r[0].left;
	}

	public getColumnOfNodeOffset(spanNode: HTMLElement, offset: number): number {
		return getColumnOfNodeOffset(this._characterMapping, spanNode, offset);
	}
}

/**
 * Every time we render a line, we save what we have rendered in an instance of this class.
 */
class RenderedViewLine implements IRenderedViewLine {

	public domNode: FastDomNode<HTMLElement> | null;
	public readonly input: RenderLineInput;

	protected readonly _characterMapping: CharacterMapping;
	private readonly _isWhitespaceOnly: boolean;
	private readonly _containsForeignElements: ForeignElementType;
	private _cachedWidth: number;

	/**
	 * This is a map that is used only when the line is guaranteed to have no RTL text.
	 */
	private readonly _pixelOffsetCache: Float32Array | null;

	constructor(domNode: FastDomNode<HTMLElement> | null, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: ForeignElementType) {
		this.domNode = domNode;
		this.input = renderLineInput;
		this._characterMapping = characterMapping;
		this._isWhitespaceOnly = /^\s*$/.test(renderLineInput.lineContent);
		this._containsForeignElements = containsForeignElements;
		this._cachedWidth = -1;

		this._pixelOffsetCache = null;
		if (!containsRTL || this._characterMapping.length === 0 /* the line is empty */) {
			this._pixelOffsetCache = new Float32Array(Math.max(2, this._characterMapping.length + 1));
			for (let column = 0, len = this._characterMapping.length; column <= len; column++) {
				this._pixelOffsetCache[column] = -1;
			}
		}
	}

	// --- Reading from the DOM methods

	protected _getReadingTarget(myDomNode: FastDomNode<HTMLElement>): HTMLElement {
		return <HTMLSpanElement>myDomNode.domNode.firstChild;
	}

	/**
	 * Width of the line in pixels
	 */
	public getWidth(context: DomReadingContext | null): number {
		if (!this.domNode) {
			return 0;
		}
		if (this._cachedWidth === -1) {
			this._cachedWidth = this._getReadingTarget(this.domNode).offsetWidth;
			context?.markDidDomLayout();
		}
		return this._cachedWidth;
	}

	public getWidthIsFast(): boolean {
		if (this._cachedWidth === -1) {
			return false;
		}
		return true;
	}

	/**
	 * Visible ranges for a model range
	 */
	public getVisibleRangesForRange(lineNumber: number, startColumn: number, endColumn: number, context: DomReadingContext): FloatHorizontalRange[] | null {
		if (!this.domNode) {
			return null;
		}
		if (this._pixelOffsetCache !== null) {
			// the text is LTR
			const startOffset = this._readPixelOffset(this.domNode, lineNumber, startColumn, context);
			if (startOffset === -1) {
				return null;
			}

			const endOffset = this._readPixelOffset(this.domNode, lineNumber, endColumn, context);
			if (endOffset === -1) {
				return null;
			}

			return [new FloatHorizontalRange(startOffset, endOffset - startOffset)];
		}

		return this._readVisibleRangesForRange(this.domNode, lineNumber, startColumn, endColumn, context);
	}

	protected _readVisibleRangesForRange(domNode: FastDomNode<HTMLElement>, lineNumber: number, startColumn: number, endColumn: number, context: DomReadingContext): FloatHorizontalRange[] | null {
		if (startColumn === endColumn) {
			const pixelOffset = this._readPixelOffset(domNode, lineNumber, startColumn, context);
			if (pixelOffset === -1) {
				return null;
			} else {
				return [new FloatHorizontalRange(pixelOffset, 0)];
			}
		} else {
			return this._readRawVisibleRangesForRange(domNode, startColumn, endColumn, context);
		}
	}

	protected _readPixelOffset(domNode: FastDomNode<HTMLElement>, lineNumber: number, column: number, context: DomReadingContext): number {
		if (this._characterMapping.length === 0) {
			// This line has no content
			if (this._containsForeignElements === ForeignElementType.None) {
				// We can assume the line is really empty
				return 0;
			}
			if (this._containsForeignElements === ForeignElementType.After) {
				// We have foreign elements after the (empty) line
				return 0;
			}
			if (this._containsForeignElements === ForeignElementType.Before) {
				// We have foreign elements before the (empty) line
				return this.getWidth(context);
			}
			// We have foreign elements before & after the (empty) line
			const readingTarget = this._getReadingTarget(domNode);
			if (readingTarget.firstChild) {
				context.markDidDomLayout();
				return (<HTMLSpanElement>readingTarget.firstChild).offsetWidth;
			} else {
				return 0;
			}
		}

		if (this._pixelOffsetCache !== null) {
			// the text is LTR

			const cachedPixelOffset = this._pixelOffsetCache[column];
			if (cachedPixelOffset !== -1) {
				return cachedPixelOffset;
			}

			const result = this._actualReadPixelOffset(domNode, lineNumber, column, context);
			this._pixelOffsetCache[column] = result;
			return result;
		}

		return this._actualReadPixelOffset(domNode, lineNumber, column, context);
	}

	private _actualReadPixelOffset(domNode: FastDomNode<HTMLElement>, lineNumber: number, column: number, context: DomReadingContext): number {
		if (this._characterMapping.length === 0) {
			// This line has no content
			const r = RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), 0, 0, 0, 0, context);
			if (!r || r.length === 0) {
				return -1;
			}
			return r[0].left;
		}

		if (column === this._characterMapping.length && this._isWhitespaceOnly && this._containsForeignElements === ForeignElementType.None) {
			// This branch helps in the case of whitespace only lines which have a width set
			return this.getWidth(context);
		}

		const domPosition = this._characterMapping.getDomPosition(column);

		const r = RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), domPosition.partIndex, domPosition.charIndex, domPosition.partIndex, domPosition.charIndex, context);
		if (!r || r.length === 0) {
			return -1;
		}
		const result = r[0].left;
		if (this.input.isBasicASCII) {
			const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
			const expectedResult = Math.round(this.input.spaceWidth * horizontalOffset);
			if (Math.abs(expectedResult - result) <= 1) {
				return expectedResult;
			}
		}
		return result;
	}

	private _readRawVisibleRangesForRange(domNode: FastDomNode<HTMLElement>, startColumn: number, endColumn: number, context: DomReadingContext): FloatHorizontalRange[] | null {

		if (startColumn === 1 && endColumn === this._characterMapping.length) {
			// This branch helps IE with bidi text & gives a performance boost to other browsers when reading visible ranges for an entire line

			return [new FloatHorizontalRange(0, this.getWidth(context))];
		}

		const startDomPosition = this._characterMapping.getDomPosition(startColumn);
		const endDomPosition = this._characterMapping.getDomPosition(endColumn);

		return RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), startDomPosition.partIndex, startDomPosition.charIndex, endDomPosition.partIndex, endDomPosition.charIndex, context);
	}

	/**
	 * Returns the column for the text found at a specific offset inside a rendered dom node
	 */
	public getColumnOfNodeOffset(spanNode: HTMLElement, offset: number): number {
		return getColumnOfNodeOffset(this._characterMapping, spanNode, offset);
	}
}

class WebKitRenderedViewLine extends RenderedViewLine {
	protected override _readVisibleRangesForRange(domNode: FastDomNode<HTMLElement>, lineNumber: number, startColumn: number, endColumn: number, context: DomReadingContext): FloatHorizontalRange[] | null {
		const output = super._readVisibleRangesForRange(domNode, lineNumber, startColumn, endColumn, context);

		if (!output || output.length === 0 || startColumn === endColumn || (startColumn === 1 && endColumn === this._characterMapping.length)) {
			return output;
		}

		// WebKit is buggy and returns an expanded range (to contain words in some cases)
		// The last client rect is enlarged (I think)
		if (!this.input.containsRTL) {
			// This is an attempt to patch things up
			// Find position of last column
			const endPixelOffset = this._readPixelOffset(domNode, lineNumber, endColumn, context);
			if (endPixelOffset !== -1) {
				const lastRange = output[output.length - 1];
				if (lastRange.left < endPixelOffset) {
					// Trim down the width of the last visible range to not go after the last column's position
					lastRange.width = endPixelOffset - lastRange.left;
				}
			}
		}

		return output;
	}
}

const createRenderedLine: (domNode: FastDomNode<HTMLElement> | null, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: ForeignElementType) => RenderedViewLine = (function () {
	if (browser.isWebKit) {
		return createWebKitRenderedLine;
	}
	return createNormalRenderedLine;
})();

function createWebKitRenderedLine(domNode: FastDomNode<HTMLElement> | null, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: ForeignElementType): RenderedViewLine {
	return new WebKitRenderedViewLine(domNode, renderLineInput, characterMapping, containsRTL, containsForeignElements);
}

function createNormalRenderedLine(domNode: FastDomNode<HTMLElement> | null, renderLineInput: RenderLineInput, characterMapping: CharacterMapping, containsRTL: boolean, containsForeignElements: ForeignElementType): RenderedViewLine {
	return new RenderedViewLine(domNode, renderLineInput, characterMapping, containsRTL, containsForeignElements);
}

export function getColumnOfNodeOffset(characterMapping: CharacterMapping, spanNode: HTMLElement, offset: number): number {
	const spanNodeTextContentLength = spanNode.textContent!.length;

	let spanIndex = -1;
	while (spanNode) {
		spanNode = <HTMLElement>spanNode.previousSibling;
		spanIndex++;
	}

	return characterMapping.getColumn(new DomPosition(spanIndex, offset), spanNodeTextContentLength);
}
