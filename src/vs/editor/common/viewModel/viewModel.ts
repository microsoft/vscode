/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { INewScrollPosition, IModelDecoration, EndOfLinePreference, IViewState } from 'vs/editor/common/editorCommon';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ViewEvent, IViewEventListener } from 'vs/editor/common/view/viewEvents';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Scrollable, IScrollPosition } from 'vs/base/common/scrollable';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IEditorWhitespace } from 'vs/editor/common/viewLayout/whitespaceComputer';

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

	saveState(): IViewState;
	restoreState(state: IViewState): void;

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
	convertViewSelectionToModelSelection(viewSelection: Selection): Selection;
	validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position;
	validateViewRange(viewRange: Range, expectedModelRange: Range): Range;

	// Model -> View conversion and related methods
	convertModelPositionToViewPosition(modelPosition: Position): Position;
	convertModelRangeToViewRange(modelRange: Range): Range;
	convertModelSelectionToViewSelection(modelSelection: Selection): Selection;
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

	getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[];
	getViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData;
	getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): MinimapLinesRenderingData;
	getCompletelyVisibleViewRange(): Range;
	getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range;

	getTabSize(): number;
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineIndentGuide(lineNumber: number): number;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
	getAllOverviewRulerDecorations(): ViewModelDecoration[];
	getValueInRange(range: Range, eol: EndOfLinePreference): string;

	getModelLineMaxColumn(modelLineNumber: number): number;
	validateModelPosition(modelPosition: IPosition): Position;

	deduceModelPositionRelativeToViewPosition(viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position;
	getPlainTextToCopy(ranges: Range[], emptySelectionClipboard: boolean): string;
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
	public readonly tokens: ViewLineToken[];

	constructor(
		content: string,
		minColumn: number,
		maxColumn: number,
		tokens: ViewLineToken[]
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
	 * If set to false, it is guaranteed that `content` contains only LTR chars.
	 */
	public readonly mightContainRTL: boolean;
	/**
	 * If set to false, it is guaranteed that `content` contains only basic ASCII chars.
	 */
	public readonly mightContainNonBasicASCII: boolean;
	/**
	 * The tokens at this view line.
	 */
	public readonly tokens: ViewLineToken[];
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
		tokens: ViewLineToken[],
		inlineDecorations: InlineDecoration[],
		tabSize: number
	) {
		this.minColumn = minColumn;
		this.maxColumn = maxColumn;
		this.content = content;
		this.mightContainRTL = mightContainRTL;
		this.mightContainNonBasicASCII = mightContainNonBasicASCII;
		this.tokens = tokens;
		this.inlineDecorations = inlineDecorations;
		this.tabSize = tabSize;
	}
}

export class InlineDecoration {
	_inlineDecorationBrand: void;

	readonly range: Range;
	readonly inlineClassName: string;
	readonly insertsBeforeOrAfter: boolean;

	constructor(range: Range, inlineClassName: string, insertsBeforeOrAfter: boolean) {
		this.range = range;
		this.inlineClassName = inlineClassName;
		this.insertsBeforeOrAfter = insertsBeforeOrAfter;
	}
}

export class ViewModelDecoration {
	_viewModelDecorationBrand: void;

	public range: Range;
	public readonly source: IModelDecoration;

	constructor(source: IModelDecoration) {
		this.range = null;
		this.source = source;
	}
}

export class ViewEventsCollector {

	private _events: ViewEvent[];
	private _eventsLen = 0;

	constructor() {
		this._events = [];
		this._eventsLen = 0;
	}

	public emit(event: ViewEvent) {
		this._events[this._eventsLen++] = event;
	}

	public finalize(): ViewEvent[] {
		let result = this._events;
		this._events = null;
		return result;
	}

}
