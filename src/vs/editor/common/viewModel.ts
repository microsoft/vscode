/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../base/common/arrays.js';
import { IScrollPosition, Scrollable } from '../../base/common/scrollable.js';
import * as strings from '../../base/common/strings.js';
import { ISimpleModel } from './viewModel/screenReaderSimpleModel.js';
import { ICoordinatesConverter } from './coordinatesConverter.js';
import { IPosition, Position } from './core/position.js';
import { Range } from './core/range.js';
import { CursorConfiguration, CursorState, EditOperationType, IColumnSelectData, ICursorSimpleModel, PartialCursorState } from './cursorCommon.js';
import { CursorChangeReason } from './cursorEvents.js';
import { INewScrollPosition, ScrollType } from './editorCommon.js';
import { EditorTheme } from './editorTheme.js';
import { EndOfLinePreference, IGlyphMarginLanesModel, IModelDecorationOptions, ITextModel, TextDirection } from './model.js';
import { ILineBreaksComputer, InjectedText } from './modelLineProjectionData.js';
import { BracketGuideOptions, IActiveIndentGuideInfo, IndentGuide } from './textModelGuides.js';
import { IViewLineTokens } from './tokens/lineTokens.js';
import { ViewEventHandler } from './viewEventHandler.js';
import { VerticalRevealType } from './viewEvents.js';
import { InlineDecoration, SingleLineInlineDecoration } from './viewModel/inlineDecorations.js';

export interface IViewModel extends ICursorSimpleModel, ISimpleModel {

	readonly model: ITextModel;

	readonly coordinatesConverter: ICoordinatesConverter;

	readonly viewLayout: IViewLayout;

	readonly cursorConfig: CursorConfiguration;

	readonly glyphLanes: IGlyphMarginLanesModel;

	addViewEventHandler(eventHandler: ViewEventHandler): void;
	removeViewEventHandler(eventHandler: ViewEventHandler): void;

	/**
	 * Gives a hint that a lot of requests are about to come in for these line numbers.
	 */
	setViewport(startLineNumber: number, endLineNumber: number, centeredLineNumber: number): void;
	visibleLinesStabilized(): void;
	setHasFocus(hasFocus: boolean): void;
	setHasWidgetFocus(hasWidgetFocus: boolean): void;
	onCompositionStart(): void;
	onCompositionEnd(): void;

	getFontSizeAtPosition(position: IPosition): string | null;
	getMinimapDecorationsInRange(range: Range): ViewModelDecoration[];
	getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[];
	getTextDirection(lineNumber: number): TextDirection;
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
	revealAllCursors(source: string | null | undefined, revealHorizontal: boolean, minimalReveal?: boolean): void;
	revealPrimaryCursor(source: string | null | undefined, revealHorizontal: boolean, minimalReveal?: boolean): void;
	revealTopMostCursor(source: string | null | undefined): void;
	revealBottomMostCursor(source: string | null | undefined): void;
	revealRange(source: string | null | undefined, revealHorizontal: boolean, viewRange: Range, verticalType: VerticalRevealType, scrollType: ScrollType): void;
	//#endregion

	//#region viewLayout
	changeWhitespace(callback: (accessor: IWhitespaceChangeAccessor) => void): void;
	//#endregion

	batchEvents(callback: () => void): void;
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
	getLineHeightForLineNumber(lineNumber: number): number;
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

export interface ILineHeightChangeAccessor {
	insertOrChangeCustomLineHeight(decorationId: string, startLineNumber: number, endLineNumber: number, lineHeight: number): void;
	removeCustomLineHeight(decorationId: string): void;
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

	/**
	 * The height of a line.
	 */
	readonly lineHeight: number;
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
	/**
	 * The direction to use for rendering the line.
	 */
	public readonly textDirection: TextDirection;
	/**
	 * Whether the line has variable fonts
	 */
	public readonly hasVariableFonts: boolean;

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
		textDirection: TextDirection,
		hasVariableFonts: boolean
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
		this.textDirection = textDirection;
		this.hasVariableFonts = hasVariableFonts;
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

	public static compareByRenderingProps(a: OverviewRulerDecorationsGroup, b: OverviewRulerDecorationsGroup): number {
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

	public static equals(a: OverviewRulerDecorationsGroup, b: OverviewRulerDecorationsGroup): boolean {
		return (
			a.color === b.color
			&& a.zIndex === b.zIndex
			&& arrays.equals(a.data, b.data)
		);
	}

	public static equalsArr(a: OverviewRulerDecorationsGroup[], b: OverviewRulerDecorationsGroup[]): boolean {
		return arrays.equals(a, b, OverviewRulerDecorationsGroup.equals);
	}
}
