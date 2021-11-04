/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IScrollPosition, Scrollable } from 'vs/base/common/scrollable';
import * as strings from 'vs/base/common/strings';
import { IViewLineTokens } from 'vs/editor/common/core/lineTokens';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { INewScrollPosition, ScrollType } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference, IActiveIndentGuideInfo, IModelDecorationOptions, TextModelResolvedOptions, ITextModel, InjectedTextOptions, PositionAffinity, IndentGuide, BracketGuideOptions } from 'vs/editor/common/model';
import { VerticalRevealType } from 'vs/editor/common/view/viewEvents';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IEditorWhitespace, IWhitespaceChangeAccessor } from 'vs/editor/common/viewLayout/linesLayout';
import { EditorTheme } from 'vs/editor/common/view/viewContext';
import { ICursorSimpleModel, PartialCursorState, CursorState, IColumnSelectData, EditOperationType, CursorConfiguration } from 'vs/editor/common/controller/cursorCommon';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { LineInjectedText } from 'vs/editor/common/model/textModelEvents';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { WrappingIndent } from 'vs/editor/common/config/editorOptions';

export interface IViewWhitespaceViewportData {
	readonly id: string;
	readonly afterLineNumber: number;
	readonly verticalOffset: number;
	readonly height: number;
}

export class Viewport {
	readonly _viewportBrand: void = undefined;

	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;

	constructor(top: number, left: number, width: number, height: number) {
		this.top = top | 0;
		this.left = left | 0;
		this.width = width | 0;
		this.height = height | 0;
	}
}

export interface IViewLayout {

	getScrollable(): Scrollable;

	getScrollWidth(): number;
	getScrollHeight(): number;

	getCurrentScrollLeft(): number;
	getCurrentScrollTop(): number;
	getCurrentViewport(): Viewport;

	getFutureViewport(): Viewport;

	validateScrollPosition(scrollPosition: INewScrollPosition): IScrollPosition;

	getLinesViewportData(): IPartialViewLinesViewportData;
	getLinesViewportDataAtScrollTop(scrollTop: number): IPartialViewLinesViewportData;
	getWhitespaces(): IEditorWhitespace[];

	isAfterLines(verticalOffset: number): boolean;
	isInTopPadding(verticalOffset: number): boolean;
	isInBottomPadding(verticalOffset: number): boolean;
	getLineNumberAtVerticalOffset(verticalOffset: number): number;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
	getWhitespaceAtVerticalOffset(verticalOffset: number): IViewWhitespaceViewportData | null;

	/**
	 * Get the layout information for whitespaces currently in the viewport
	 */
	getWhitespaceViewportData(): IViewWhitespaceViewportData[];
}

export interface ICoordinatesConverter {
	// View -> Model conversion and related methods
	convertViewPositionToModelPosition(viewPosition: Position): Position;
	convertViewRangeToModelRange(viewRange: Range): Range;
	validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position;
	validateViewRange(viewRange: Range, expectedModelRange: Range): Range;

	// Model -> View conversion and related methods
	convertModelPositionToViewPosition(modelPosition: Position, affinity?: PositionAffinity): Position;
	/**
	 * @param affinity Only has an effect if the range is empty.
	*/
	convertModelRangeToViewRange(modelRange: Range, affinity?: PositionAffinity): Range;
	modelPositionIsVisible(modelPosition: Position): boolean;
	getModelLineViewLineCount(modelLineNumber: number): number;
	getViewLineNumberOfModelPosition(modelLineNumber: number, modelColumn: number): number;
}

export class OutputPosition {
	outputLineIndex: number;
	outputOffset: number;

	constructor(outputLineIndex: number, outputOffset: number) {
		this.outputLineIndex = outputLineIndex;
		this.outputOffset = outputOffset;
	}

	toString(): string {
		return `${this.outputLineIndex}:${this.outputOffset}`;
	}

	toPosition(baseLineNumber: number): Position {
		return new Position(baseLineNumber + this.outputLineIndex, this.outputOffset + 1);
	}
}

/**
 * *input*:
 * ```
 * xxxxxxxxxxxxxxxxxxxxxxxxxxx
 * ```
 *
 * -> Applying injections `[i...i]`, *inputWithInjections*:
 * ```
 * xxxxxx[iiiiiiiiii]xxxxxxxxxxxxxxxxx[ii]xxxx
 * ```
 *
 * -> breaking at offsets `|` in `xxxxxx[iiiiiii|iii]xxxxxxxxxxx|xxxxxx[ii]xxxx|`:
 * ```
 * xxxxxx[iiiiiii
 * iii]xxxxxxxxxxx
 * xxxxxx[ii]xxxx
 * ```
 *
 * -> applying wrappedTextIndentLength, *output*:
 * ```
 * xxxxxx[iiiiiii
 *    iii]xxxxxxxxxxx
 *    xxxxxx[ii]xxxx
 * ```
 */
export class LineBreakData {
	constructor(
		public injectionOffsets: number[] | null,
		/**
		 * `injectionOptions.length` must equal `injectionOffsets.length`
		 */
		public injectionOptions: InjectedTextOptions[] | null,
		/**
		 * Refers to offsets after applying injections to the source.
		 * The last break offset indicates the length of the source after applying injections.
		 */
		public breakOffsets: number[],
		/**
		 * Refers to offsets after applying injections
		 */
		public breakOffsetsVisibleColumn: number[],
		public wrappedTextIndentLength: number
	) {
	}

	public getOutputLineCount(): number {
		return this.breakOffsets.length;
	}

	public getMinOutputOffset(outputLineIndex: number): number {
		if (outputLineIndex > 0) {
			return this.wrappedTextIndentLength;
		}
		return 0;
	}

	public getLineLength(outputLineIndex: number): number {
		// These offsets refer to model text with injected text.
		const startOffset = outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0;
		const endOffset = this.breakOffsets[outputLineIndex];

		let lineLength = endOffset - startOffset;
		if (outputLineIndex > 0) {
			lineLength += this.wrappedTextIndentLength;
		}
		return lineLength;
	}

	public getMaxOutputOffset(outputLineIndex: number): number {
		return this.getLineLength(outputLineIndex);
	}

	public translateToInputOffset(outputLineIndex: number, outputOffset: number): number {
		if (outputLineIndex > 0) {
			outputOffset = Math.max(0, outputOffset - this.wrappedTextIndentLength);
		}

		const offsetInInputWithInjection = outputLineIndex === 0 ? outputOffset : this.breakOffsets[outputLineIndex - 1] + outputOffset;
		let offsetInInput = offsetInInputWithInjection;

		if (this.injectionOffsets !== null) {
			for (let i = 0; i < this.injectionOffsets.length; i++) {
				if (offsetInInput > this.injectionOffsets[i]) {
					if (offsetInInput < this.injectionOffsets[i] + this.injectionOptions![i].content.length) {
						// `inputOffset` is within injected text
						offsetInInput = this.injectionOffsets[i];
					} else {
						offsetInInput -= this.injectionOptions![i].content.length;
					}
				} else {
					break;
				}
			}
		}

		return offsetInInput;
	}

	public translateToOutputPosition(inputOffset: number, affinity: PositionAffinity = PositionAffinity.None): OutputPosition {
		let inputOffsetInInputWithInjection = inputOffset;
		if (this.injectionOffsets !== null) {
			for (let i = 0; i < this.injectionOffsets.length; i++) {
				if (inputOffset < this.injectionOffsets[i]) {
					break;
				}

				if (affinity !== PositionAffinity.Right && inputOffset === this.injectionOffsets[i]) {
					break;
				}

				inputOffsetInInputWithInjection += this.injectionOptions![i].content.length;
			}
		}

		return this.offsetInInputWithInjectionsToOutputPosition(inputOffsetInInputWithInjection, affinity);
	}

	private offsetInInputWithInjectionsToOutputPosition(offsetInInputWithInjections: number, affinity: PositionAffinity = PositionAffinity.None): OutputPosition {
		let low = 0;
		let high = this.breakOffsets.length - 1;
		let mid = 0;
		let midStart = 0;

		while (low <= high) {
			mid = low + ((high - low) / 2) | 0;

			const midStop = this.breakOffsets[mid];
			midStart = mid > 0 ? this.breakOffsets[mid - 1] : 0;

			if (affinity === PositionAffinity.Left) {
				if (offsetInInputWithInjections <= midStart) {
					high = mid - 1;
				} else if (offsetInInputWithInjections > midStop) {
					low = mid + 1;
				} else {
					break;
				}
			} else {
				if (offsetInInputWithInjections < midStart) {
					high = mid - 1;
				} else if (offsetInInputWithInjections >= midStop) {
					low = mid + 1;
				} else {
					break;
				}
			}
		}

		let outputOffset = offsetInInputWithInjections - midStart;
		if (mid > 0) {
			outputOffset += this.wrappedTextIndentLength;
		}

		return new OutputPosition(mid, outputOffset);
	}

	public normalizeOutputPosition(outputLineIndex: number, outputOffset: number, affinity: PositionAffinity): OutputPosition {
		if (this.injectionOffsets !== null) {
			const offsetInInputWithInjections = this.outputPositionToOffsetInInputWithInjections(outputLineIndex, outputOffset + this.wrappedTextIndentLength);
			const normalizedOffsetInUnwrappedLine = this.normalizeOffsetInInputWithInjectionsAroundInjections(offsetInInputWithInjections, affinity);
			if (normalizedOffsetInUnwrappedLine !== offsetInInputWithInjections) {
				// injected text caused a change
				return this.offsetInInputWithInjectionsToOutputPosition(normalizedOffsetInUnwrappedLine, affinity);
			}
		}

		if (affinity === PositionAffinity.Left) {
			if (outputLineIndex > 0 && outputOffset === this.getMinOutputOffset(outputLineIndex)) {
				return new OutputPosition(outputLineIndex - 1, this.getMaxOutputOffset(outputLineIndex - 1));
			}
		}
		else if (affinity === PositionAffinity.Right) {
			const maxOutputLineIndex = this.getOutputLineCount() - 1;
			if (outputLineIndex < maxOutputLineIndex && outputOffset === this.getMaxOutputOffset(outputLineIndex)) {
				return new OutputPosition(outputLineIndex + 1, this.getMinOutputOffset(outputLineIndex + 1));
			}
		}

		return new OutputPosition(outputLineIndex, outputOffset);
	}

	private outputPositionToOffsetInInputWithInjections(outputLineIndex: number, outputOffset: number): number {
		if (outputLineIndex > 0) {
			outputOffset -= this.wrappedTextIndentLength;
		}
		const result = (outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0) + outputOffset;
		return result;
	}

	private normalizeOffsetInInputWithInjectionsAroundInjections(offsetInInputWithInjections: number, affinity: PositionAffinity): number {
		const injectedText = this.getInjectedTextAtOffset(offsetInInputWithInjections);
		if (!injectedText) {
			return offsetInInputWithInjections;
		}

		if (affinity === PositionAffinity.None) {
			if (offsetInInputWithInjections === injectedText.offsetInInputWithInjections + injectedText.length) {
				// go to the end of this injected text
				return injectedText.offsetInInputWithInjections + injectedText.length;
			} else {
				// go to the start of this injected text
				return injectedText.offsetInInputWithInjections;
			}
		}

		if (affinity === PositionAffinity.Right) {
			let result = injectedText.offsetInInputWithInjections + injectedText.length;
			let index = injectedText.injectedTextIndex;
			// traverse all injected text that touch each other
			while (index + 1 < this.injectionOffsets!.length && this.injectionOffsets![index + 1] === this.injectionOffsets![index]) {
				result += this.injectionOptions![index + 1].content.length;
				index++;
			}
			return result;
		}

		// affinity is left
		let result = injectedText.offsetInInputWithInjections;
		let index = injectedText.injectedTextIndex;
		// traverse all injected text that touch each other
		while (index - 1 >= 0 && this.injectionOffsets![index - 1] === this.injectionOffsets![index]) {
			result -= this.injectionOptions![index - 1].content.length;
			index++;
		}
		return result;
	}

	public getInjectedText(outputLineIndex: number, outputOffset: number): InjectedText | null {
		const offset = this.outputPositionToOffsetInInputWithInjections(outputLineIndex, outputOffset);
		const injectedText = this.getInjectedTextAtOffset(offset);
		if (!injectedText) {
			return null;
		}
		return {
			options: this.injectionOptions![injectedText.injectedTextIndex]
		};
	}

	private getInjectedTextAtOffset(offsetInInputWithInjections: number): { injectedTextIndex: number, offsetInInputWithInjections: number, length: number } | undefined {
		const injectionOffsets = this.injectionOffsets;
		const injectionOptions = this.injectionOptions;

		if (injectionOffsets !== null) {
			let totalInjectedTextLengthBefore = 0;
			for (let i = 0; i < injectionOffsets.length; i++) {
				const length = injectionOptions![i].content.length;
				const injectedTextStartOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore;
				const injectedTextEndOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore + length;

				if (injectedTextStartOffsetInInputWithInjections > offsetInInputWithInjections) {
					// Injected text starts later.
					break; // All later injected texts have an even larger offset.
				}

				if (offsetInInputWithInjections <= injectedTextEndOffsetInInputWithInjections) {
					// Injected text ends after or with the given position (but also starts with or before it).
					return {
						injectedTextIndex: i,
						offsetInInputWithInjections: injectedTextStartOffsetInInputWithInjections,
						length
					};
				}

				totalInjectedTextLengthBefore += length;
			}
		}

		return undefined;
	}
}

export interface ILineBreaksComputerFactory {
	createLineBreaksComputer(fontInfo: FontInfo, tabSize: number, wrappingColumn: number, wrappingIndent: WrappingIndent): ILineBreaksComputer;
}

export interface ILineBreaksComputer {
	/**
	 * Pass in `previousLineBreakData` if the only difference is in breaking columns!!!
	 */
	addRequest(lineText: string, injectedText: LineInjectedText[] | null, previousLineBreakData: LineBreakData | null): void;
	finalize(): (LineBreakData | null)[];
}

export interface IViewModel extends ICursorSimpleModel {

	readonly model: ITextModel;

	readonly coordinatesConverter: ICoordinatesConverter;

	readonly viewLayout: IViewLayout;

	readonly cursorConfig: CursorConfiguration;

	addViewEventHandler(eventHandler: ViewEventHandler): void;
	removeViewEventHandler(eventHandler: ViewEventHandler): void;

	/**
	 * Gives a hint that a lot of requests are about to come in for these line numbers.
	 */
	setViewport(startLineNumber: number, endLineNumber: number, centeredLineNumber: number): void;
	tokenizeViewport(): void;
	setHasFocus(hasFocus: boolean): void;
	onCompositionStart(): void;
	onCompositionEnd(): void;
	onDidColorThemeChange(): void;

	getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[];
	getViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData;
	getViewLineData(lineNumber: number): ViewLineData;
	getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): MinimapLinesRenderingData;
	getCompletelyVisibleViewRange(): Range;
	getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range;

	getTextModelOptions(): TextModelResolvedOptions;
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineLength(lineNumber: number): number;
	getActiveIndentGuide(lineNumber: number, minLineNumber: number, maxLineNumber: number): IActiveIndentGuideInfo;
	getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[];
	getBracketGuidesInRangeByLine(startLineNumber: number, endLineNumber: number, activePosition: IPosition | null, options: BracketGuideOptions): IndentGuide[][];
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
	getAllOverviewRulerDecorations(theme: EditorTheme): OverviewRulerDecorationsGroup[];
	invalidateOverviewRulerColorCache(): void;
	invalidateMinimapColorCache(): void;
	getValueInRange(range: Range, eol: EndOfLinePreference): string;

	getInjectedTextAt(viewPosition: Position): InjectedText | null;

	getModelLineMaxColumn(modelLineNumber: number): number;
	validateModelPosition(modelPosition: IPosition): Position;
	validateModelRange(range: IRange): Range;

	deduceModelPositionRelativeToViewPosition(viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position;
	getEOL(): string;
	getPlainTextToCopy(modelRanges: Range[], emptySelectionClipboard: boolean, forceCRLF: boolean): string | string[];
	getRichTextToCopy(modelRanges: Range[], emptySelectionClipboard: boolean): { html: string, mode: string } | null;

	//#region model

	pushStackElement(): void;

	//#endregion

	createLineBreaksComputer(): ILineBreaksComputer;

	//#region cursor
	getPrimaryCursorState(): CursorState;
	getLastAddedCursorIndex(): number;
	getCursorStates(): CursorState[];
	setCursorStates(source: string | null | undefined, reason: CursorChangeReason, states: PartialCursorState[] | null): void;
	getCursorColumnSelectData(): IColumnSelectData;
	getCursorAutoClosedCharacters(): Range[];
	setCursorColumnSelectData(columnSelectData: IColumnSelectData): void;
	getPrevEditOperationType(): EditOperationType;
	setPrevEditOperationType(type: EditOperationType): void;
	revealPrimaryCursor(source: string | null | undefined, revealHorizontal: boolean): void;
	revealTopMostCursor(source: string | null | undefined): void;
	revealBottomMostCursor(source: string | null | undefined): void;
	revealRange(source: string | null | undefined, revealHorizontal: boolean, viewRange: Range, verticalType: VerticalRevealType, scrollType: ScrollType): void;
	//#endregion

	//#region viewLayout
	getVerticalOffsetForLineNumber(viewLineNumber: number): number;
	getScrollTop(): number;
	setScrollTop(newScrollTop: number, scrollType: ScrollType): void;
	setScrollPosition(position: INewScrollPosition, type: ScrollType): void;
	deltaScrollNow(deltaScrollLeft: number, deltaScrollTop: number): void;
	changeWhitespace(callback: (accessor: IWhitespaceChangeAccessor) => void): void;
	setMaxLineWidth(maxLineWidth: number): void;
	//#endregion
}

export class InjectedText {
	constructor(public readonly options: InjectedTextOptions) { }
}

export class MinimapLinesRenderingData {
	public readonly tabSize: number;
	public readonly data: Array<ViewLineData | null>;

	constructor(
		tabSize: number,
		data: Array<ViewLineData | null>
	) {
		this.tabSize = tabSize;
		this.data = data;
	}
}

export class ViewLineData {
	_viewLineDataBrand: void = undefined;

	/**
	 * The content at this view line.
	 */
	public readonly content: string;
	/**
	 * Does this line continue with a wrapped line?
	 */
	public readonly continuesWithWrappedLine: boolean;
	/**
	 * The minimum allowed column at this view line.
	 */
	public readonly minColumn: number;
	/**
	 * The maximum allowed column at this view line.
	 */
	public readonly maxColumn: number;
	/**
	 * The visible column at the start of the line (after the fauxIndent).
	 */
	public readonly startVisibleColumn: number;
	/**
	 * The tokens at this view line.
	 */
	public readonly tokens: IViewLineTokens;

	/**
	 * Additional inline decorations for this line.
	*/
	public readonly inlineDecorations: readonly SingleLineInlineDecoration[] | null;

	constructor(
		content: string,
		continuesWithWrappedLine: boolean,
		minColumn: number,
		maxColumn: number,
		startVisibleColumn: number,
		tokens: IViewLineTokens,
		inlineDecorations: readonly SingleLineInlineDecoration[] | null
	) {
		this.content = content;
		this.continuesWithWrappedLine = continuesWithWrappedLine;
		this.minColumn = minColumn;
		this.maxColumn = maxColumn;
		this.startVisibleColumn = startVisibleColumn;
		this.tokens = tokens;
		this.inlineDecorations = inlineDecorations;
	}
}

export class ViewLineRenderingData {
	/**
	 * The minimum allowed column at this view line.
	 */
	public readonly minColumn: number;
	/**
	 * The maximum allowed column at this view line.
	 */
	public readonly maxColumn: number;
	/**
	 * The content at this view line.
	 */
	public readonly content: string;
	/**
	 * Does this line continue with a wrapped line?
	 */
	public readonly continuesWithWrappedLine: boolean;
	/**
	 * Describes if `content` contains RTL characters.
	 */
	public readonly containsRTL: boolean;
	/**
	 * Describes if `content` contains non basic ASCII chars.
	 */
	public readonly isBasicASCII: boolean;
	/**
	 * The tokens at this view line.
	 */
	public readonly tokens: IViewLineTokens;
	/**
	 * Inline decorations at this view line.
	 */
	public readonly inlineDecorations: InlineDecoration[];
	/**
	 * The tab size for this view model.
	 */
	public readonly tabSize: number;
	/**
	 * The visible column at the start of the line (after the fauxIndent)
	 */
	public readonly startVisibleColumn: number;

	constructor(
		minColumn: number,
		maxColumn: number,
		content: string,
		continuesWithWrappedLine: boolean,
		mightContainRTL: boolean,
		mightContainNonBasicASCII: boolean,
		tokens: IViewLineTokens,
		inlineDecorations: InlineDecoration[],
		tabSize: number,
		startVisibleColumn: number,
	) {
		this.minColumn = minColumn;
		this.maxColumn = maxColumn;
		this.content = content;
		this.continuesWithWrappedLine = continuesWithWrappedLine;

		this.isBasicASCII = ViewLineRenderingData.isBasicASCII(content, mightContainNonBasicASCII);
		this.containsRTL = ViewLineRenderingData.containsRTL(content, this.isBasicASCII, mightContainRTL);

		this.tokens = tokens;
		this.inlineDecorations = inlineDecorations;
		this.tabSize = tabSize;
		this.startVisibleColumn = startVisibleColumn;
	}

	public static isBasicASCII(lineContent: string, mightContainNonBasicASCII: boolean): boolean {
		if (mightContainNonBasicASCII) {
			return strings.isBasicASCII(lineContent);
		}
		return true;
	}

	public static containsRTL(lineContent: string, isBasicASCII: boolean, mightContainRTL: boolean): boolean {
		if (!isBasicASCII && mightContainRTL) {
			return strings.containsRTL(lineContent);
		}
		return false;
	}
}

export const enum InlineDecorationType {
	Regular = 0,
	Before = 1,
	After = 2,
	RegularAffectingLetterSpacing = 3
}

export class InlineDecoration {
	constructor(
		public readonly range: Range,
		public readonly inlineClassName: string,
		public readonly type: InlineDecorationType
	) {
	}
}

export class SingleLineInlineDecoration {
	constructor(
		public readonly startOffset: number,
		public readonly endOffset: number,
		public readonly inlineClassName: string,
		public readonly inlineClassNameAffectsLetterSpacing: boolean
	) {
	}

	toInlineDecoration(lineNumber: number): InlineDecoration {
		return new InlineDecoration(
			new Range(lineNumber, this.startOffset + 1, lineNumber, this.endOffset + 1),
			this.inlineClassName,
			this.inlineClassNameAffectsLetterSpacing ? InlineDecorationType.RegularAffectingLetterSpacing : InlineDecorationType.Regular
		);
	}
}

export class ViewModelDecoration {
	_viewModelDecorationBrand: void = undefined;

	public readonly range: Range;
	public readonly options: IModelDecorationOptions;

	constructor(range: Range, options: IModelDecorationOptions) {
		this.range = range;
		this.options = options;
	}
}

export class OverviewRulerDecorationsGroup {

	constructor(
		public readonly color: string,
		public readonly zIndex: number,
		/**
		 * Decorations are encoded in a number array using the following scheme:
		 *  - 3*i = lane
		 *  - 3*i+1 = startLineNumber
		 *  - 3*i+2 = endLineNumber
		 */
		public readonly data: number[]
	) { }

	public static cmp(a: OverviewRulerDecorationsGroup, b: OverviewRulerDecorationsGroup): number {
		if (a.zIndex === b.zIndex) {
			if (a.color < b.color) {
				return -1;
			}
			if (a.color > b.color) {
				return 1;
			}
			return 0;
		}
		return a.zIndex - b.zIndex;
	}
}
