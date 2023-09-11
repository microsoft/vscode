/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IScrollPosition, Scrollable } from 'vs/base/common/scrollable';
import * as strings from 'vs/base/common/strings';
import { CursorConfiguration, CursorState, EditOperationType, IColumnSelectData, ICursorSimpleModel, PartialCursorState } from 'vs/editor/common/cursorCommon';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { IViewLineTokens } from 'vs/editor/common/tokens/lineTokens';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { INewScrollPosition, ScrollType } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference, IModelDecorationOptions, ITextModel, PositionAffinity } from 'vs/editor/common/model';
import { BracketGuideOptions, IActiveIndentGuideInfo, IndentGuide } from 'vs/editor/common/textModelGuides';
import { EditorTheme } from 'vs/editor/common/editorTheme';
import { VerticalRevealType } from 'vs/editor/common/viewEvents';
import { ILineBreaksComputer, InjectedText } from 'vs/editor/common/modelLineProjectionData';
import { ViewEventHandler } from 'vs/editor/common/viewEventHandler';

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
	visibleLinesStabilized(): void;
	setHasFocus(hasFocus: boolean): void;
	onCompositionStart(): void;
	onCompositionEnd(): void;

	getMinimapDecorationsInRange(range: Range): ViewModelDecoration[];
	getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[];
	getViewportViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData;
	getViewLineRenderingData(lineNumber: number): ViewLineRenderingData;
	getViewLineData(lineNumber: number): ViewLineData;
	getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): MinimapLinesRenderingData;
	getCompletelyVisibleViewRange(): Range;
	getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range;

	getHiddenAreas(): Range[];

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
	getValueInRange(range: Range, eol: EndOfLinePreference): string;
	getValueLengthInRange(range: Range, eol: EndOfLinePreference): number;
	modifyPosition(position: Position, offset: number): Position;

	getInjectedTextAt(viewPosition: Position): InjectedText | null;

	deduceModelPositionRelativeToViewPosition(viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position;
	getPlainTextToCopy(modelRanges: Range[], emptySelectionClipboard: boolean, forceCRLF: boolean): string | string[];
	getRichTextToCopy(modelRanges: Range[], emptySelectionClipboard: boolean): { html: string; mode: string } | null;

	createLineBreaksComputer(): ILineBreaksComputer;

	//#region cursor
	getPrimaryCursorState(): CursorState;
	getLastAddedCursorIndex(): number;
	getCursorStates(): CursorState[];
	setCursorStates(source: string | null | undefined, reason: CursorChangeReason, states: PartialCursorState[] | null): boolean;
	getCursorColumnSelectData(): IColumnSelectData;
	getCursorAutoClosedCharacters(): Range[];
	setCursorColumnSelectData(columnSelectData: IColumnSelectData): void;
	getPrevEditOperationType(): EditOperationType;
	setPrevEditOperationType(type: EditOperationType): void;
	revealPrimaryCursor(source: string | null | undefined, revealHorizontal: boolean, minimalReveal?: boolean): void;
	revealTopMostCursor(source: string | null | undefined): void;
	revealBottomMostCursor(source: string | null | undefined): void;
	revealRange(source: string | null | undefined, revealHorizontal: boolean, viewRange: Range, verticalType: VerticalRevealType, scrollType: ScrollType): void;
	//#endregion

	//#region viewLayout
	changeWhitespace(callback: (accessor: IWhitespaceChangeAccessor) => void): void;
	//#endregion
}

export interface IViewLayout {

	getScrollable(): Scrollable;

	getScrollWidth(): number;
	getScrollHeight(): number;

	getCurrentScrollLeft(): number;
	getCurrentScrollTop(): number;
	getCurrentViewport(): Viewport;

	getFutureViewport(): Viewport;

	setScrollPosition(position: INewScrollPosition, type: ScrollType): void;
	deltaScrollNow(deltaScrollLeft: number, deltaScrollTop: number): void;

	validateScrollPosition(scrollPosition: INewScrollPosition): IScrollPosition;

	setMaxLineWidth(maxLineWidth: number): void;
	setOverlayWidgetsMinWidth(overlayWidgetsMinWidth: number): void;

	getLinesViewportData(): IPartialViewLinesViewportData;
	getLinesViewportDataAtScrollTop(scrollTop: number): IPartialViewLinesViewportData;
	getWhitespaces(): IEditorWhitespace[];

	isAfterLines(verticalOffset: number): boolean;
	isInTopPadding(verticalOffset: number): boolean;
	isInBottomPadding(verticalOffset: number): boolean;
	getLineNumberAtVerticalOffset(verticalOffset: number): number;
	getVerticalOffsetForLineNumber(lineNumber: number, includeViewZones?: boolean): number;
	getVerticalOffsetAfterLineNumber(lineNumber: number, includeViewZones?: boolean): number;
	getWhitespaceAtVerticalOffset(verticalOffset: number): IViewWhitespaceViewportData | null;

	/**
	 * Get the layout information for whitespaces currently in the viewport
	 */
	getWhitespaceViewportData(): IViewWhitespaceViewportData[];
}

export interface IEditorWhitespace {
	readonly id: string;
	readonly afterLineNumber: number;
	readonly height: number;
}

/**
 * An accessor that allows for whitespace to be added, removed or changed in bulk.
 */
export interface IWhitespaceChangeAccessor {
	insertWhitespace(afterLineNumber: number, ordinal: number, heightInPx: number, minWidth: number): string;
	changeOneWhitespace(id: string, newAfterLineNumber: number, newHeight: number): void;
	removeWhitespace(id: string): void;
}

export interface IPartialViewLinesViewportData {
	/**
	 * Value to be substracted from `scrollTop` (in order to vertical offset numbers < 1MM)
	 */
	readonly bigNumbersDelta: number;
	/**
	 * The first (partially) visible line number.
	 */
	readonly startLineNumber: number;
	/**
	 * The last (partially) visible line number.
	 */
	readonly endLineNumber: number;
	/**
	 * relativeVerticalOffset[i] is the `top` position for line at `i` + `startLineNumber`.
	 */
	readonly relativeVerticalOffset: number[];
	/**
	 * The centered line in the viewport.
	 */
	readonly centeredLineNumber: number;
	/**
	 * The first completely visible line number.
	 */
	readonly completelyVisibleStartLineNumber: number;
	/**
	 * The last completely visible line number.
	 */
	readonly completelyVisibleEndLineNumber: number;
}

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

export interface ICoordinatesConverter {
	// View -> Model conversion and related methods
	convertViewPositionToModelPosition(viewPosition: Position): Position;
	convertViewRangeToModelRange(viewRange: Range): Range;
	validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position;
	validateViewRange(viewRange: Range, expectedModelRange: Range): Range;

	// Model -> View conversion and related methods
	/**
	 * @param allowZeroLineNumber Should it return 0 when there are hidden lines at the top and the position is in the hidden area?
	 * @param belowHiddenRanges When the model position is in a hidden area, should it return the first view position after or before?
	 */
	convertModelPositionToViewPosition(modelPosition: Position, affinity?: PositionAffinity, allowZeroLineNumber?: boolean, belowHiddenRanges?: boolean): Position;
	/**
	 * @param affinity Only has an effect if the range is empty.
	*/
	convertModelRangeToViewRange(modelRange: Range, affinity?: PositionAffinity): Range;
	modelPositionIsVisible(modelPosition: Position): boolean;
	getModelLineViewLineCount(modelLineNumber: number): number;
	getViewLineNumberOfModelPosition(modelLineNumber: number, modelColumn: number): number;
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

	public static equalsArr(a: OverviewRulerDecorationsGroup[], b: OverviewRulerDecorationsGroup[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0, len = a.length; i < len; i++) {
			if (OverviewRulerDecorationsGroup.cmp(a[i], b[i]) !== 0) {
				return false;
			}
		}
		return true;
	}
}
