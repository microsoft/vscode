/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./viewLines';
import { RunOnceScheduler } from 'vs/base/common/async';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { VisibleLinesCollection, IVisibleLinesHost } from 'vs/editor/browser/view/viewLayer';
import { ViewLineOptions, DomReadingContext, ViewLine } from 'vs/editor/browser/viewParts/lines/viewLine';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IViewLines, HorizontalRange, LineVisibleRanges } from 'vs/editor/common/view/renderingContext';
import { Viewport } from 'vs/editor/common/viewModel/viewModel';
import { ViewPart, PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

class LastRenderedData {

	private _currentVisibleRange: Range;

	constructor() {
		this._currentVisibleRange = new Range(1, 1, 1, 1);
	}

	public getCurrentVisibleRange(): Range {
		return this._currentVisibleRange;
	}

	public setCurrentVisibleRange(currentVisibleRange: Range): void {
		this._currentVisibleRange = currentVisibleRange;
	}
}

export class ViewLines extends ViewPart implements IVisibleLinesHost<ViewLine>, IViewLines {
	/**
	 * Adds this ammount of pixels to the right of lines (no-one wants to type near the edge of the viewport)
	 */
	private static HORIZONTAL_EXTRA_PX = 30;

	private readonly _linesContent: FastDomNode<HTMLElement>;
	private readonly _textRangeRestingSpot: HTMLElement;
	private readonly _visibleLines: VisibleLinesCollection<ViewLine>;
	private readonly domNode: FastDomNode<HTMLElement>;

	// --- config
	private _lineHeight: number;
	private _typicalHalfwidthCharacterWidth: number;
	private _isViewportWrapping: boolean;
	private _revealHorizontalRightPadding: number;
	private _canUseLayerHinting: boolean;
	private _viewLineOptions: ViewLineOptions;

	// --- width
	private _maxLineWidth: number;
	private _asyncUpdateLineWidths: RunOnceScheduler;

	private _lastCursorRevealRangeHorizontallyEvent: viewEvents.ViewRevealRangeRequestEvent;
	private _lastRenderedData: LastRenderedData;

	constructor(context: ViewContext, linesContent: FastDomNode<HTMLElement>) {
		super(context);
		this._linesContent = linesContent;
		this._textRangeRestingSpot = document.createElement('div');
		this._visibleLines = new VisibleLinesCollection(this);
		this.domNode = this._visibleLines.domNode;

		const conf = this._context.configuration;

		this._lineHeight = conf.editor.lineHeight;
		this._typicalHalfwidthCharacterWidth = conf.editor.fontInfo.typicalHalfwidthCharacterWidth;
		this._isViewportWrapping = conf.editor.wrappingInfo.isViewportWrapping;
		this._revealHorizontalRightPadding = conf.editor.viewInfo.revealHorizontalRightPadding;
		this._canUseLayerHinting = conf.editor.canUseLayerHinting;
		this._viewLineOptions = new ViewLineOptions(conf, this._context.theme.type);

		PartFingerprints.write(this.domNode, PartFingerprint.ViewLines);
		this.domNode.setClassName('view-lines');
		Configuration.applyFontInfo(this.domNode, conf.editor.fontInfo);

		// --- width & height
		this._maxLineWidth = 0;
		this._asyncUpdateLineWidths = new RunOnceScheduler(() => {
			this._updateLineWidths();
		}, 200);

		this._lastRenderedData = new LastRenderedData();

		this._lastCursorRevealRangeHorizontallyEvent = null;
	}

	public dispose(): void {
		this._asyncUpdateLineWidths.dispose();
		super.dispose();
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this.domNode;
	}

	// ---- begin IVisibleLinesHost

	public createVisibleLine(): ViewLine {
		return new ViewLine(this._viewLineOptions);
	}

	// ---- end IVisibleLinesHost

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this._visibleLines.onConfigurationChanged(e);
		if (e.wrappingInfo) {
			this._maxLineWidth = 0;
		}

		const conf = this._context.configuration;

		if (e.lineHeight) {
			this._lineHeight = conf.editor.lineHeight;
		}
		if (e.fontInfo) {
			this._typicalHalfwidthCharacterWidth = conf.editor.fontInfo.typicalHalfwidthCharacterWidth;
		}
		if (e.wrappingInfo) {
			this._isViewportWrapping = conf.editor.wrappingInfo.isViewportWrapping;
		}
		if (e.viewInfo) {
			this._revealHorizontalRightPadding = conf.editor.viewInfo.revealHorizontalRightPadding;
		}
		if (e.canUseLayerHinting) {
			this._canUseLayerHinting = conf.editor.canUseLayerHinting;
		}
		if (e.fontInfo) {
			Configuration.applyFontInfo(this.domNode, conf.editor.fontInfo);
		}

		this._onOptionsMaybeChanged();

		if (e.layoutInfo) {
			this._maxLineWidth = 0;
		}

		return true;
	}
	private _onOptionsMaybeChanged(): boolean {
		const conf = this._context.configuration;

		let newViewLineOptions = new ViewLineOptions(conf, this._context.theme.type);
		if (!this._viewLineOptions.equals(newViewLineOptions)) {
			this._viewLineOptions = newViewLineOptions;

			let startLineNumber = this._visibleLines.getStartLineNumber();
			let endLineNumber = this._visibleLines.getEndLineNumber();
			for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
				let line = this._visibleLines.getVisibleLine(lineNumber);
				line.onOptionsChanged(this._viewLineOptions);
			}
			return true;
		}

		return false;
	}
	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		let rendStartLineNumber = this._visibleLines.getStartLineNumber();
		let rendEndLineNumber = this._visibleLines.getEndLineNumber();
		let r = false;
		for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
			r = this._visibleLines.getVisibleLine(lineNumber).onSelectionChanged() || r;
		}
		return r;
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		if (true/*e.inlineDecorationsChanged*/) {
			let rendStartLineNumber = this._visibleLines.getStartLineNumber();
			let rendEndLineNumber = this._visibleLines.getEndLineNumber();
			for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
				this._visibleLines.getVisibleLine(lineNumber).onDecorationsChanged();
			}
		}
		return true;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		let shouldRender = this._visibleLines.onFlushed(e);
		this._maxLineWidth = 0;
		return shouldRender;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return this._visibleLines.onLinesChanged(e);
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return this._visibleLines.onLinesDeleted(e);
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return this._visibleLines.onLinesInserted(e);
	}
	public onRevealRangeRequest(e: viewEvents.ViewRevealRangeRequestEvent): boolean {
		let newScrollTop = this._computeScrollTopToRevealRange(this._context.viewLayout.getCurrentViewport(), e.range, e.verticalType);

		if (e.revealHorizontal) {
			this._lastCursorRevealRangeHorizontallyEvent = e;
		}

		this._context.viewLayout.setScrollPosition({ // TODO@Alex: scrolling vertically can be moved to the view model
			scrollTop: newScrollTop
		});

		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this.domNode.setWidth(e.scrollWidth);
		return this._visibleLines.onScrollChanged(e) || true;
	}

	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		return this._visibleLines.onTokensChanged(e);
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._visibleLines.onZonesChanged(e);
	}
	public onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		return this._onOptionsMaybeChanged();
	}

	// ---- end view event handlers

	// ----------- HELPERS FOR OTHERS

	public getPositionFromDOMInfo(spanNode: HTMLElement, offset: number): Position {
		let viewLineDomNode = this._getViewLineDomNode(spanNode);
		if (viewLineDomNode === null) {
			// Couldn't find view line node
			return null;
		}
		let lineNumber = this._getLineNumberFor(viewLineDomNode);

		if (lineNumber === -1) {
			// Couldn't find view line node
			return null;
		}

		if (lineNumber < 1 || lineNumber > this._context.model.getLineCount()) {
			// lineNumber is outside range
			return null;
		}

		if (this._context.model.getLineMaxColumn(lineNumber) === 1) {
			// Line is empty
			return new Position(lineNumber, 1);
		}

		let rendStartLineNumber = this._visibleLines.getStartLineNumber();
		let rendEndLineNumber = this._visibleLines.getEndLineNumber();
		if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
			// Couldn't find line
			return null;
		}

		let column = this._visibleLines.getVisibleLine(lineNumber).getColumnOfNodeOffset(lineNumber, spanNode, offset);
		let minColumn = this._context.model.getLineMinColumn(lineNumber);
		if (column < minColumn) {
			column = minColumn;
		}
		return new Position(lineNumber, column);
	}

	private _getViewLineDomNode(node: HTMLElement): HTMLElement {
		while (node && node.nodeType === 1) {
			if (node.className === ViewLine.CLASS_NAME) {
				return node;
			}
			node = node.parentElement;
		}
		return null;
	}

	/**
	 * @returns the line number of this view line dom node.
	 */
	private _getLineNumberFor(domNode: HTMLElement): number {
		let startLineNumber = this._visibleLines.getStartLineNumber();
		let endLineNumber = this._visibleLines.getEndLineNumber();
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let line = this._visibleLines.getVisibleLine(lineNumber);
			if (domNode === line.getDomNode()) {
				return lineNumber;
			}
		}
		return -1;
	}

	public getLineWidth(lineNumber: number): number {
		let rendStartLineNumber = this._visibleLines.getStartLineNumber();
		let rendEndLineNumber = this._visibleLines.getEndLineNumber();
		if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
			// Couldn't find line
			return -1;
		}

		return this._visibleLines.getVisibleLine(lineNumber).getWidth();
	}

	public linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] {
		if (this.shouldRender()) {
			// Cannot read from the DOM because it is dirty
			// i.e. the model & the dom are out of sync, so I'd be reading something stale
			return null;
		}

		let originalEndLineNumber = range.endLineNumber;
		range = Range.intersectRanges(range, this._lastRenderedData.getCurrentVisibleRange());
		if (!range) {
			return null;
		}

		let visibleRanges: LineVisibleRanges[] = [];
		let domReadingContext = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);

		let nextLineModelLineNumber: number;
		if (includeNewLines) {
			nextLineModelLineNumber = this._context.model.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
		}

		let rendStartLineNumber = this._visibleLines.getStartLineNumber();
		let rendEndLineNumber = this._visibleLines.getEndLineNumber();
		for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {

			if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
				continue;
			}

			let startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
			let endColumn = lineNumber === range.endLineNumber ? range.endColumn : this._context.model.getLineMaxColumn(lineNumber);
			let visibleRangesForLine = this._visibleLines.getVisibleLine(lineNumber).getVisibleRangesForRange(startColumn, endColumn, domReadingContext);

			if (!visibleRangesForLine || visibleRangesForLine.length === 0) {
				continue;
			}

			if (includeNewLines && lineNumber < originalEndLineNumber) {
				let currentLineModelLineNumber = nextLineModelLineNumber;
				nextLineModelLineNumber = this._context.model.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber + 1, 1)).lineNumber;

				if (currentLineModelLineNumber !== nextLineModelLineNumber) {
					visibleRangesForLine[visibleRangesForLine.length - 1].width += this._typicalHalfwidthCharacterWidth;
				}
			}

			visibleRanges.push(new LineVisibleRanges(lineNumber, visibleRangesForLine));
		}

		if (visibleRanges.length === 0) {
			return null;
		}

		return visibleRanges;
	}

	public visibleRangesForRange2(range: Range): HorizontalRange[] {

		if (this.shouldRender()) {
			// Cannot read from the DOM because it is dirty
			// i.e. the model & the dom are out of sync, so I'd be reading something stale
			return null;
		}

		range = Range.intersectRanges(range, this._lastRenderedData.getCurrentVisibleRange());
		if (!range) {
			return null;
		}

		let result: HorizontalRange[] = [];
		let domReadingContext = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);

		let rendStartLineNumber = this._visibleLines.getStartLineNumber();
		let rendEndLineNumber = this._visibleLines.getEndLineNumber();
		for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {

			if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
				continue;
			}

			let startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
			let endColumn = lineNumber === range.endLineNumber ? range.endColumn : this._context.model.getLineMaxColumn(lineNumber);
			let visibleRangesForLine = this._visibleLines.getVisibleLine(lineNumber).getVisibleRangesForRange(startColumn, endColumn, domReadingContext);

			if (!visibleRangesForLine || visibleRangesForLine.length === 0) {
				continue;
			}

			result = result.concat(visibleRangesForLine);
		}

		if (result.length === 0) {
			return null;
		}

		return result;
	}

	// --- implementation

	private _updateLineWidths(): void {
		let rendStartLineNumber = this._visibleLines.getStartLineNumber();
		let rendEndLineNumber = this._visibleLines.getEndLineNumber();

		let localMaxLineWidth = 1;
		for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
			let widthInPx = this._visibleLines.getVisibleLine(lineNumber).getWidth();
			localMaxLineWidth = Math.max(localMaxLineWidth, widthInPx);
		}

		if (rendStartLineNumber === 1 && rendEndLineNumber === this._context.model.getLineCount()) {
			// we know the max line width for all the lines
			this._maxLineWidth = 0;
		}

		this._ensureMaxLineWidth(localMaxLineWidth);
	}

	public prepareRender(): void {
		throw new Error('Not supported');
	}

	public render(): void {
		throw new Error('Not supported');
	}

	public renderText(viewportData: ViewportData): void {
		// (1) render lines - ensures lines are in the DOM
		this._visibleLines.renderLines(viewportData);
		this._lastRenderedData.setCurrentVisibleRange(viewportData.visibleRange);
		this.domNode.setWidth(this._context.viewLayout.getScrollWidth());
		this.domNode.setHeight(Math.min(this._context.viewLayout.getScrollHeight(), 1000000));

		// (2) compute horizontal scroll position:
		//  - this must happen after the lines are in the DOM since it might need a line that rendered just now
		//  - it might change `scrollWidth` and `scrollLeft`
		if (this._lastCursorRevealRangeHorizontallyEvent) {
			let revealHorizontalRange = this._lastCursorRevealRangeHorizontallyEvent.range;
			this._lastCursorRevealRangeHorizontallyEvent = null;

			// allow `visibleRangesForRange2` to work
			this.onDidRender();

			// compute new scroll position
			let newScrollLeft = this._computeScrollLeftToRevealRange(revealHorizontalRange);

			let isViewportWrapping = this._isViewportWrapping;
			if (!isViewportWrapping) {
				// ensure `scrollWidth` is large enough
				this._ensureMaxLineWidth(newScrollLeft.maxHorizontalOffset);
			}

			// set `scrollLeft`
			this._context.viewLayout.setScrollPosition({
				scrollLeft: newScrollLeft.scrollLeft
			});
		}

		// (3) handle scrolling
		this._linesContent.setLayerHinting(this._canUseLayerHinting);
		const adjustedScrollTop = this._context.viewLayout.getScrollTop() - viewportData.bigNumbersDelta;
		this._linesContent.setTop(-adjustedScrollTop);
		this._linesContent.setLeft(-this._context.viewLayout.getScrollLeft());

		// Update max line width (not so important, it is just so the horizontal scrollbar doesn't get too small)
		this._asyncUpdateLineWidths.schedule();
	}

	// --- width

	private _ensureMaxLineWidth(lineWidth: number): void {
		let iLineWidth = Math.ceil(lineWidth);
		if (this._maxLineWidth < iLineWidth) {
			this._maxLineWidth = iLineWidth;
			this._context.viewLayout.onMaxLineWidthChanged(this._maxLineWidth);
		}
	}

	private _computeScrollTopToRevealRange(viewport: Viewport, range: Range, verticalType: viewEvents.VerticalRevealType): number {
		let viewportStartY = viewport.top;
		let viewportHeight = viewport.height;
		let viewportEndY = viewportStartY + viewportHeight;
		let boxStartY: number;
		let boxEndY: number;

		// Have a box that includes one extra line height (for the horizontal scrollbar)
		boxStartY = this._context.viewLayout.getVerticalOffsetForLineNumber(range.startLineNumber);
		boxEndY = this._context.viewLayout.getVerticalOffsetForLineNumber(range.endLineNumber) + this._lineHeight;
		if (verticalType === viewEvents.VerticalRevealType.Simple || verticalType === viewEvents.VerticalRevealType.Bottom) {
			// Reveal one line more when the last line would be covered by the scrollbar - arrow down case or revealing a line explicitly at bottom
			boxEndY += this._lineHeight;
		}

		let newScrollTop: number;

		if (verticalType === viewEvents.VerticalRevealType.Center || verticalType === viewEvents.VerticalRevealType.CenterIfOutsideViewport) {
			if (verticalType === viewEvents.VerticalRevealType.CenterIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) {
				// Box is already in the viewport... do nothing
				newScrollTop = viewportStartY;
			} else {
				// Box is outside the viewport... center it
				let boxMiddleY = (boxStartY + boxEndY) / 2;
				newScrollTop = Math.max(0, boxMiddleY - viewportHeight / 2);
			}
		} else {
			newScrollTop = this._computeMinimumScrolling(viewportStartY, viewportEndY, boxStartY, boxEndY, verticalType === viewEvents.VerticalRevealType.Top, verticalType === viewEvents.VerticalRevealType.Bottom);
		}

		return newScrollTop;
	}

	private _computeScrollLeftToRevealRange(range: Range): { scrollLeft: number; maxHorizontalOffset: number; } {

		let maxHorizontalOffset = 0;

		if (range.startLineNumber !== range.endLineNumber) {
			// Two or more lines? => scroll to base (That's how you see most of the two lines)
			return {
				scrollLeft: 0,
				maxHorizontalOffset: maxHorizontalOffset
			};
		}

		let viewport = this._context.viewLayout.getCurrentViewport();
		let viewportStartX = viewport.left;
		let viewportEndX = viewportStartX + viewport.width;

		let visibleRanges = this.visibleRangesForRange2(range);
		let boxStartX = Number.MAX_VALUE;
		let boxEndX = 0;

		if (!visibleRanges) {
			// Unknown
			return {
				scrollLeft: viewportStartX,
				maxHorizontalOffset: maxHorizontalOffset
			};
		}

		for (let i = 0; i < visibleRanges.length; i++) {
			let visibleRange = visibleRanges[i];
			if (visibleRange.left < boxStartX) {
				boxStartX = visibleRange.left;
			}
			if (visibleRange.left + visibleRange.width > boxEndX) {
				boxEndX = visibleRange.left + visibleRange.width;
			}
		}

		maxHorizontalOffset = boxEndX;

		boxStartX = Math.max(0, boxStartX - ViewLines.HORIZONTAL_EXTRA_PX);
		boxEndX += this._revealHorizontalRightPadding;

		let newScrollLeft = this._computeMinimumScrolling(viewportStartX, viewportEndX, boxStartX, boxEndX);
		return {
			scrollLeft: newScrollLeft,
			maxHorizontalOffset: maxHorizontalOffset
		};
	}

	private _computeMinimumScrolling(viewportStart: number, viewportEnd: number, boxStart: number, boxEnd: number, revealAtStart?: boolean, revealAtEnd?: boolean): number {
		viewportStart = viewportStart | 0;
		viewportEnd = viewportEnd | 0;
		boxStart = boxStart | 0;
		boxEnd = boxEnd | 0;
		revealAtStart = !!revealAtStart;
		revealAtEnd = !!revealAtEnd;

		let viewportLength = viewportEnd - viewportStart;
		let boxLength = boxEnd - boxStart;

		if (boxLength < viewportLength) {
			// The box would fit in the viewport

			if (revealAtStart) {
				return boxStart;
			}

			if (revealAtEnd) {
				return Math.max(0, boxEnd - viewportLength);
			}

			if (boxStart < viewportStart) {
				// The box is above the viewport
				return boxStart;
			} else if (boxEnd > viewportEnd) {
				// The box is below the viewport
				return Math.max(0, boxEnd - viewportLength);
			}
		} else {
			// The box would not fit in the viewport
			// Reveal the beginning of the box
			return boxStart;
		}

		return viewportStart;
	}
}
