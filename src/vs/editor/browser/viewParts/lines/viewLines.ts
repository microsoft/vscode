/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./viewLines';
import { RunOnceScheduler } from 'vs/base/common/async';
import { StyleMutator } from 'vs/base/browser/styleMutator';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { ViewLayer } from 'vs/editor/browser/view/viewLayer';
import { ViewLineOptions, DomReadingContext, ViewLine } from 'vs/editor/browser/viewParts/lines/viewLine';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IViewLines, VisibleRange, LineVisibleRanges } from 'vs/editor/common/view/renderingContext';
import { ILayoutProvider } from 'vs/editor/browser/viewLayout/layoutProvider';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';

class LastRenderedData {

	private _currentVisibleRange: Range;
	private _bigNumbersDelta: number;

	constructor() {
		this._currentVisibleRange = new Range(1, 1, 1, 1);
		this._bigNumbersDelta = 0;
	}

	public getCurrentVisibleRange(): Range {
		return this._currentVisibleRange;
	}

	public setCurrentVisibleRange(currentVisibleRange: Range): void {
		this._currentVisibleRange = currentVisibleRange;
	}

	public getBigNumbersDelta(): number {
		return this._bigNumbersDelta;
	}

	public setBigNumbersDelta(bigNumbersDelta: number): void {
		this._bigNumbersDelta = bigNumbersDelta;
	}
}

export class ViewLines extends ViewLayer<ViewLine> implements IViewLines {
	/**
	 * Width to extends a line to render the line feed at the end of the line
	 */
	private static LINE_FEED_WIDTH = 10;
	/**
	 * Adds this ammount of pixels to the right of lines (no-one wants to type near the edge of the viewport)
	 */
	private static HORIZONTAL_EXTRA_PX = 30;


	private _layoutProvider: ILayoutProvider;
	private _textRangeRestingSpot: HTMLElement;

	// --- config
	private _lineHeight: number;
	private _isViewportWrapping: boolean;
	private _revealHorizontalRightPadding: number;
	private _canUseTranslate3d: boolean;
	private _viewLineOptions: ViewLineOptions;

	// --- width
	private _maxLineWidth: number;
	private _asyncUpdateLineWidths: RunOnceScheduler;

	private _lastCursorRevealRangeHorizontallyEvent: editorCommon.IViewRevealRangeEvent;
	private _lastRenderedData: LastRenderedData;

	constructor(context: ViewContext, layoutProvider: ILayoutProvider) {
		super(context);
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._isViewportWrapping = this._context.configuration.editor.wrappingInfo.isViewportWrapping;
		this._revealHorizontalRightPadding = this._context.configuration.editor.viewInfo.revealHorizontalRightPadding;
		this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		this._viewLineOptions = new ViewLineOptions(this._context.configuration);
		this._layoutProvider = layoutProvider;

		PartFingerprints.write(this.domNode.domNode, PartFingerprint.ViewLines);
		this.domNode.setClassName(ClassNames.VIEW_LINES);
		Configuration.applyFontInfo(this.domNode, this._context.configuration.editor.fontInfo);

		// --- width & height
		this._maxLineWidth = 0;
		this._asyncUpdateLineWidths = new RunOnceScheduler(() => {
			this._updateLineWidths();
		}, 200);

		this._lastRenderedData = new LastRenderedData();

		this._lastCursorRevealRangeHorizontallyEvent = null;
		this._textRangeRestingSpot = document.createElement('div');
		this._textRangeRestingSpot.className = 'textRangeRestingSpot';
	}

	public dispose(): void {
		this._asyncUpdateLineWidths.dispose();
		this._layoutProvider = null;
		super.dispose();
	}

	public getDomNode(): HTMLElement {
		return this.domNode.domNode;
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		super.onConfigurationChanged(e);
		if (e.wrappingInfo) {
			this._maxLineWidth = 0;
		}

		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.wrappingInfo) {
			this._isViewportWrapping = this._context.configuration.editor.wrappingInfo.isViewportWrapping;
		}
		if (e.viewInfo.revealHorizontalRightPadding) {
			this._revealHorizontalRightPadding = this._context.configuration.editor.viewInfo.revealHorizontalRightPadding;
		}
		if (e.viewInfo.canUseTranslate3d) {
			this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		}
		if (e.fontInfo) {
			Configuration.applyFontInfo(this.domNode, this._context.configuration.editor.fontInfo);
		}

		let newViewLineOptions = new ViewLineOptions(this._context.configuration);
		if (!this._viewLineOptions.equals(newViewLineOptions)) {
			this._viewLineOptions = newViewLineOptions;

			let startLineNumber = this._linesCollection.getStartLineNumber();
			let endLineNumber = this._linesCollection.getEndLineNumber();
			for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
				let line = this._linesCollection.getLine(lineNumber);
				line.onOptionsChanged(this._viewLineOptions);
			}
		}

		return true;
	}

	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		let shouldRender = super.onLayoutChanged(layoutInfo);
		this._maxLineWidth = 0;
		return shouldRender;
	}

	public onModelFlushed(): boolean {
		let shouldRender = super.onModelFlushed();
		this._maxLineWidth = 0;
		return shouldRender;
	}

	public onModelDecorationsChanged(e: editorCommon.IViewDecorationsChangedEvent): boolean {
		let shouldRender = super.onModelDecorationsChanged(e);
		if (true/*e.inlineDecorationsChanged*/) {
			let rendStartLineNumber = this._linesCollection.getStartLineNumber();
			let rendEndLineNumber = this._linesCollection.getEndLineNumber();
			for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
				this._linesCollection.getLine(lineNumber).onModelDecorationsChanged();
			}
		}
		return shouldRender || true;
	}

	public onCursorRevealRange(e: editorCommon.IViewRevealRangeEvent): boolean {
		let newScrollTop = this._computeScrollTopToRevealRange(this._layoutProvider.getCurrentViewport(), e.range, e.verticalType);

		if (e.revealHorizontal) {
			this._lastCursorRevealRangeHorizontallyEvent = e;
		}

		this._layoutProvider.setScrollPosition({
			scrollTop: newScrollTop
		});

		return true;
	}

	public onCursorScrollRequest(e: editorCommon.IViewScrollRequestEvent): boolean {
		let currentScrollTop = this._layoutProvider.getScrollTop();
		let newScrollTop = currentScrollTop + e.deltaLines * this._lineHeight;
		this._layoutProvider.setScrollPosition({
			scrollTop: newScrollTop
		});
		return true;
	}

	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		this.domNode.setWidth(e.scrollWidth);
		return super.onScrollChanged(e) || true;
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

		let rendStartLineNumber = this._linesCollection.getStartLineNumber();
		let rendEndLineNumber = this._linesCollection.getEndLineNumber();
		if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
			// Couldn't find line
			return null;
		}

		let column = this._linesCollection.getLine(lineNumber).getColumnOfNodeOffset(lineNumber, spanNode, offset);
		let minColumn = this._context.model.getLineMinColumn(lineNumber);
		if (column < minColumn) {
			column = minColumn;
		}
		return new Position(lineNumber, column);
	}

	private _getViewLineDomNode(node: HTMLElement): HTMLElement {
		while (node && node.nodeType === 1) {
			if (node.className === ClassNames.VIEW_LINE) {
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
		const inp = this._linesCollection._get();
		const rendLineNumberStart = inp.rendLineNumberStart;
		const lines = inp.lines;

		for (let i = 0; i < lines.length; i++) {
			let lineDomNode = lines[i].getDomNode();
			if (domNode === lineDomNode) {
				return rendLineNumberStart + i;
			}
		}
		return -1;
	}

	public getLineWidth(lineNumber: number): number {
		let rendStartLineNumber = this._linesCollection.getStartLineNumber();
		let rendEndLineNumber = this._linesCollection.getEndLineNumber();
		if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
			// Couldn't find line
			return -1;
		}

		return this._linesCollection.getLine(lineNumber).getWidth();
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
			nextLineModelLineNumber = this._context.model.convertViewPositionToModelPosition(range.startLineNumber, 1).lineNumber;
		}

		let rendStartLineNumber = this._linesCollection.getStartLineNumber();
		let rendEndLineNumber = this._linesCollection.getEndLineNumber();
		for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {

			if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
				continue;
			}

			let startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
			let endColumn = lineNumber === range.endLineNumber ? range.endColumn : this._context.model.getLineMaxColumn(lineNumber);
			let visibleRangesForLine = this._linesCollection.getLine(lineNumber).getVisibleRangesForRange(startColumn, endColumn, domReadingContext);

			if (!visibleRangesForLine || visibleRangesForLine.length === 0) {
				continue;
			}

			if (includeNewLines && lineNumber < originalEndLineNumber) {
				let currentLineModelLineNumber = nextLineModelLineNumber;
				nextLineModelLineNumber = this._context.model.convertViewPositionToModelPosition(lineNumber + 1, 1).lineNumber;

				if (currentLineModelLineNumber !== nextLineModelLineNumber) {
					visibleRangesForLine[visibleRangesForLine.length - 1].width += ViewLines.LINE_FEED_WIDTH;
				}
			}

			visibleRanges.push(new LineVisibleRanges(lineNumber, visibleRangesForLine));
		}

		if (visibleRanges.length === 0) {
			return null;
		}

		return visibleRanges;
	}

	public visibleRangesForRange2(range: Range, deltaTop: number): VisibleRange[] {

		if (this.shouldRender()) {
			// Cannot read from the DOM because it is dirty
			// i.e. the model & the dom are out of sync, so I'd be reading something stale
			return null;
		}

		range = Range.intersectRanges(range, this._lastRenderedData.getCurrentVisibleRange());
		if (!range) {
			return null;
		}

		let result: VisibleRange[] = [];
		let domReadingContext = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);
		let bigNumbersDelta = this._lastRenderedData.getBigNumbersDelta();

		let rendStartLineNumber = this._linesCollection.getStartLineNumber();
		let rendEndLineNumber = this._linesCollection.getEndLineNumber();
		for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {

			if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
				continue;
			}

			let startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
			let endColumn = lineNumber === range.endLineNumber ? range.endColumn : this._context.model.getLineMaxColumn(lineNumber);
			let visibleRangesForLine = this._linesCollection.getLine(lineNumber).getVisibleRangesForRange(startColumn, endColumn, domReadingContext);

			if (!visibleRangesForLine || visibleRangesForLine.length === 0) {
				continue;
			}

			let adjustedLineNumberVerticalOffset = this._layoutProvider.getVerticalOffsetForLineNumber(lineNumber) - bigNumbersDelta + deltaTop;
			for (let i = 0, len = visibleRangesForLine.length; i < len; i++) {
				result.push(new VisibleRange(adjustedLineNumberVerticalOffset, visibleRangesForLine[i].left, visibleRangesForLine[i].width));
			}
		}

		if (result.length === 0) {
			return null;
		}

		return result;
	}

	// --- implementation

	protected _createLine(): ViewLine {
		return new ViewLine(this._viewLineOptions);
	}

	private _updateLineWidths(): void {
		let rendStartLineNumber = this._linesCollection.getStartLineNumber();
		let rendEndLineNumber = this._linesCollection.getEndLineNumber();

		let localMaxLineWidth = 1;
		for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
			let widthInPx = this._linesCollection.getLine(lineNumber).getWidth();
			localMaxLineWidth = Math.max(localMaxLineWidth, widthInPx);
		}

		this._ensureMaxLineWidth(localMaxLineWidth);
	}

	public prepareRender(): void {
		throw new Error('Not supported');
	}

	public render(): void {
		throw new Error('Not supported');
	}

	public renderText(viewportData: ViewportData, onAfterLinesRendered: () => void): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

		// (1) render lines - ensures lines are in the DOM
		super._renderLines(viewportData);
		this._lastRenderedData.setBigNumbersDelta(viewportData.bigNumbersDelta);
		this._lastRenderedData.setCurrentVisibleRange(viewportData.visibleRange);
		this.domNode.setWidth(this._layoutProvider.getScrollWidth());
		this.domNode.setHeight(Math.min(this._layoutProvider.getTotalHeight(), 1000000));

		// (2) execute DOM writing that forces sync layout (e.g. textArea manipulation)
		onAfterLinesRendered();

		// (3) compute horizontal scroll position:
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
			this._layoutProvider.setScrollPosition({
				scrollLeft: newScrollLeft.scrollLeft
			});
		}

		// (4) handle scrolling
		if (this._canUseTranslate3d) {
			let transform = 'translate3d(' + -this._layoutProvider.getScrollLeft() + 'px, ' + viewportData.visibleRangesDeltaTop + 'px, 0px)';
			StyleMutator.setTransform(<HTMLElement>this.domNode.domNode.parentNode, transform);
			StyleMutator.setTop(<HTMLElement>this.domNode.domNode.parentNode, 0); // TODO@Alex
			StyleMutator.setLeft(<HTMLElement>this.domNode.domNode.parentNode, 0); // TODO@Alex
		} else {
			StyleMutator.setTransform(<HTMLElement>this.domNode.domNode.parentNode, '');
			StyleMutator.setTop(<HTMLElement>this.domNode.domNode.parentNode, viewportData.visibleRangesDeltaTop); // TODO@Alex
			StyleMutator.setLeft(<HTMLElement>this.domNode.domNode.parentNode, -this._layoutProvider.getScrollLeft()); // TODO@Alex
		}

		// Update max line width (not so important, it is just so the horizontal scrollbar doesn't get too small)
		this._asyncUpdateLineWidths.schedule();
	}

	// --- width

	private _ensureMaxLineWidth(lineWidth: number): void {
		let iLineWidth = Math.ceil(lineWidth);
		if (this._maxLineWidth < iLineWidth) {
			this._maxLineWidth = iLineWidth;
			this._layoutProvider.onMaxLineWidthChanged(this._maxLineWidth);
		}
	}

	private _computeScrollTopToRevealRange(viewport: editorCommon.Viewport, range: Range, verticalType: editorCommon.VerticalRevealType): number {
		let viewportStartY = viewport.top;
		let viewportHeight = viewport.height;
		let viewportEndY = viewportStartY + viewportHeight;
		let boxStartY: number;
		let boxEndY: number;

		// Have a box that includes one extra line height (for the horizontal scrollbar)
		boxStartY = this._layoutProvider.getVerticalOffsetForLineNumber(range.startLineNumber);
		boxEndY = this._layoutProvider.getVerticalOffsetForLineNumber(range.endLineNumber) + this._layoutProvider.heightInPxForLine(range.endLineNumber);
		if (verticalType === editorCommon.VerticalRevealType.Simple || verticalType === editorCommon.VerticalRevealType.Bottom) {
			// Reveal one line more when the last line would be covered by the scrollbar - arrow down case or revealing a line explicitly at bottom
			boxEndY += this._lineHeight;
		}

		let newScrollTop: number;

		if (verticalType === editorCommon.VerticalRevealType.Center || verticalType === editorCommon.VerticalRevealType.CenterIfOutsideViewport) {
			if (verticalType === editorCommon.VerticalRevealType.CenterIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) {
				// Box is already in the viewport... do nothing
				newScrollTop = viewportStartY;
			} else {
				// Box is outside the viewport... center it
				let boxMiddleY = (boxStartY + boxEndY) / 2;
				newScrollTop = Math.max(0, boxMiddleY - viewportHeight / 2);
			}
		} else {
			newScrollTop = this._computeMinimumScrolling(viewportStartY, viewportEndY, boxStartY, boxEndY, verticalType === editorCommon.VerticalRevealType.Top, verticalType === editorCommon.VerticalRevealType.Bottom);
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

		let viewport = this._layoutProvider.getCurrentViewport();
		let viewportStartX = viewport.left;
		let viewportEndX = viewportStartX + viewport.width;

		let visibleRanges = this.visibleRangesForRange2(range, 0);
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
