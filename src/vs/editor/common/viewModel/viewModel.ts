/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { INewScrollPosition } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference, IModelDecorationOptions } from 'vs/editor/common/model';
import { IViewLineTokens } from 'vs/editor/common/core/lineTokens';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IViewEventListener } from 'vs/editor/common/view/viewEvents';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Scrollable, IScrollPosition } from 'vs/base/common/scrollable';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IEditorWhitespace } from 'vs/editor/common/viewLayout/whitespaceComputer';
import { ITheme } from 'vs/platform/theme/common/themeService';
import * as strings from 'vs/base/common/strings';

export interface IViewWhitespaceViewportData {
	readonly id: number;
	readonly afterLineNumber: number;
	readonly verticalOffset: number;
	readonly height: number;
}

export class Viewport {
	readonly _viewportBrand: void;

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

	readonly scrollable: Scrollable;

	onMaxLineWidthChanged(width: number): void;

	getScrollWidth(): number;
	getScrollHeight(): number;

	getCurrentScrollLeft(): number;
	getCurrentScrollTop(): number;
	getCurrentViewport(): Viewport;

	getFutureViewport(): Viewport;

	validateScrollPosition(scrollPosition: INewScrollPosition): IScrollPosition;
	setScrollPositionNow(position: INewScrollPosition): void;
	setScrollPositionSmooth(position: INewScrollPosition): void;
	deltaScrollNow(deltaScrollLeft: number, deltaScrollTop: number): void;

	getLinesViewportData(): IPartialViewLinesViewportData;
	getLinesViewportDataAtScrollTop(scrollTop: number): IPartialViewLinesViewportData;
	getWhitespaces(): IEditorWhitespace[];

	isAfterLines(verticalOffset: number): boolean;
	getLineNumberAtVerticalOffset(verticalOffset: number): number;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
	getWhitespaceAtVerticalOffset(verticalOffset: number): IViewWhitespaceViewportData;

	// --------------- Begin vertical whitespace management

	/**
	 * Reserve rendering space.
	 * @return an identifier that can be later used to remove or change the whitespace.
	 */
	addWhitespace(afterLineNumber: number, ordinal: number, height: number): number;
	/**
	 * Change the properties of a whitespace.
	 */
	changeWhitespace(id: number, newAfterLineNumber: number, newHeight: number): boolean;
	/**
	 * Remove rendering space
	 */
	removeWhitespace(id: number): boolean;
	/**
	 * Get the layout information for whitespaces currently in the viewport
	 */
	getWhitespaceViewportData(): IViewWhitespaceViewportData[];

	// TODO@Alex whitespace management should work via a change accessor sort of thing
	onHeightMaybeChanged(): void;

	// --------------- End vertical whitespace management
}

export interface ICoordinatesConverter {
	// View -> Model conversion and related methods
	convertViewPositionToModelPosition(viewPosition: Position): Position;
	convertViewRangeToModelRange(viewRange: Range): Range;
	validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position;
	validateViewRange(viewRange: Range, expectedModelRange: Range): Range;

	// Model -> View conversion and related methods
	convertModelPositionToViewPosition(modelPosition: Position): Position;
	convertModelRangeToViewRange(modelRange: Range): Range;
	modelPositionIsVisible(modelPosition: Position): boolean;
}

export interface IViewModel {

	addEventListener(listener: IViewEventListener): IDisposable;

	readonly coordinatesConverter: ICoordinatesConverter;

	readonly viewLayout: IViewLayout;

	/**
	 * Gives a hint that a lot of requests are about to come in for these line numbers.
	 */
	setViewport(startLineNumber: number, endLineNumber: number, centeredLineNumber: number): void;
	setHasFocus(hasFocus: boolean): void;

	getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[];
	getViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData;
	getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): MinimapLinesRenderingData;
	getCompletelyVisibleViewRange(): Range;
	getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range;

	getTabSize(): number;
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[];
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
	getAllOverviewRulerDecorations(theme: ITheme): IOverviewRulerDecorations;
	invalidateOverviewRulerColorCache(): void;
	getValueInRange(range: Range, eol: EndOfLinePreference): string;

	getModelLineMaxColumn(modelLineNumber: number): number;
	validateModelPosition(modelPosition: IPosition): Position;

	deduceModelPositionRelativeToViewPosition(viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position;
	getEOL(): string;
	getPlainTextToCopy(ranges: Range[], emptySelectionClipboard: boolean): string | string[];
	getHTMLToCopy(ranges: Range[], emptySelectionClipboard: boolean): string;
}

export class MinimapLinesRenderingData {
	public readonly tabSize: number;
	public readonly data: ViewLineData[];

	constructor(
		tabSize: number,
		data: ViewLineData[]
	) {
		this.tabSize = tabSize;
		this.data = data;
	}
}

export class ViewLineData {
	_viewLineDataBrand: void;

	/**
	 * The content at this view line.
	 */
	public readonly content: string;
	/**
	 * The minimum allowed column at this view line.
	 */
	public readonly minColumn: number;
	/**
	 * The maximum allowed column at this view line.
	 */
	public readonly maxColumn: number;
	/**
	 * The tokens at this view line.
	 */
	public readonly tokens: IViewLineTokens;

	constructor(
		content: string,
		minColumn: number,
		maxColumn: number,
		tokens: IViewLineTokens
	) {
		this.content = content;
		this.minColumn = minColumn;
		this.maxColumn = maxColumn;
		this.tokens = tokens;
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

	constructor(
		minColumn: number,
		maxColumn: number,
		content: string,
		mightContainRTL: boolean,
		mightContainNonBasicASCII: boolean,
		tokens: IViewLineTokens,
		inlineDecorations: InlineDecoration[],
		tabSize: number
	) {
		this.minColumn = minColumn;
		this.maxColumn = maxColumn;
		this.content = content;

		this.isBasicASCII = ViewLineRenderingData.isBasicASCII(content, mightContainNonBasicASCII);
		this.containsRTL = ViewLineRenderingData.containsRTL(content, this.isBasicASCII, mightContainRTL);

		this.tokens = tokens;
		this.inlineDecorations = inlineDecorations;
		this.tabSize = tabSize;
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
	After = 2
}

export class InlineDecoration {
	constructor(
		public readonly range: Range,
		public readonly inlineClassName: string,
		public readonly type: InlineDecorationType
	) {
	}
}

export class ViewModelDecoration {
	_viewModelDecorationBrand: void;

	public readonly range: Range;
	public readonly options: IModelDecorationOptions;

	constructor(range: Range, options: IModelDecorationOptions) {
		this.range = range;
		this.options = options;
	}
}

/**
 * Decorations are encoded in a number array using the following scheme:
 *  - 3*i = lane
 *  - 3*i+1 = startLineNumber
 *  - 3*i+2 = endLineNumber
 */
export interface IOverviewRulerDecorations {
	[color: string]: number[];
}
