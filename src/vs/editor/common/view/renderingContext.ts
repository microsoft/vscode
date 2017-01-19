/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';
import { ViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { Viewport } from 'vs/editor/common/editorCommon';

export interface ILayoutProvider {
	getScrollWidth(): number;
	getScrollHeight(): number;
	getCurrentViewport(): Viewport;

	getScrolledTopFromAbsoluteTop(top: number): number;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
}

export interface IViewLines {
	linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[];
	visibleRangesForRange2(range: Range, deltaTop: number): VisibleRange[];
}

export class RenderingContext implements IRenderingContext {

	_renderingContextBrand: void;

	public readonly linesViewportData: ViewLinesViewportData;

	public readonly scrollWidth: number;
	public readonly scrollHeight: number;

	public readonly visibleRange: Range;
	public readonly bigNumbersDelta: number;

	public readonly viewportTop: number;
	public readonly viewportWidth: number;
	public readonly viewportHeight: number;
	public readonly viewportLeft: number;

	private readonly _layoutProvider: ILayoutProvider;
	private readonly _viewLines: IViewLines;

	constructor(viewLines: IViewLines, layoutProvider: ILayoutProvider, linesViewportData: ViewLinesViewportData) {
		this._viewLines = viewLines;
		this._layoutProvider = layoutProvider;
		this.linesViewportData = linesViewportData;

		this.scrollWidth = this._layoutProvider.getScrollWidth();
		this.scrollHeight = this._layoutProvider.getScrollHeight();

		this.visibleRange = this.linesViewportData.visibleRange;
		this.bigNumbersDelta = this.linesViewportData.bigNumbersDelta;

		const vInfo = this._layoutProvider.getCurrentViewport();
		this.viewportWidth = vInfo.width;
		this.viewportHeight = vInfo.height;
		this.viewportLeft = vInfo.left;
		this.viewportTop = vInfo.top;
	}

	public getScrolledTopFromAbsoluteTop(absoluteTop: number): number {
		return this._layoutProvider.getScrolledTopFromAbsoluteTop(absoluteTop);
	}

	public getViewportVerticalOffsetForLineNumber(lineNumber: number): number {
		const verticalOffset = this._layoutProvider.getVerticalOffsetForLineNumber(lineNumber);
		const scrolledTop = this._layoutProvider.getScrolledTopFromAbsoluteTop(verticalOffset);
		return scrolledTop;
	}

	public lineIsVisible(lineNumber: number): boolean {
		return (
			this.linesViewportData.visibleRange.startLineNumber <= lineNumber
			&& lineNumber <= this.linesViewportData.visibleRange.endLineNumber
		);
	}

	public getDecorationsInViewport(): ViewModelDecoration[] {
		return this.linesViewportData.getDecorationsInViewport();
	}

	public linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] {
		return this._viewLines.linesVisibleRangesForRange(range, includeNewLines);
	}

	public visibleRangeForPosition(position: Position): VisibleRange {
		const deltaTop = this.linesViewportData.visibleRangesDeltaTop;
		const visibleRanges = this._viewLines.visibleRangesForRange2(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			deltaTop
		);
		if (!visibleRanges) {
			return null;
		}
		return visibleRanges[0];
	}
}

export interface IRestrictedRenderingContext {
	linesViewportData: ViewLinesViewportData;

	scrollWidth: number;
	scrollHeight: number;

	visibleRange: Range;
	bigNumbersDelta: number;

	viewportTop: number;
	viewportWidth: number;
	viewportHeight: number;
	viewportLeft: number;

	getScrolledTopFromAbsoluteTop(absoluteTop: number): number;
	getViewportVerticalOffsetForLineNumber(lineNumber: number): number;
	lineIsVisible(lineNumber: number): boolean;

	getDecorationsInViewport(): ViewModelDecoration[];
}

export interface IRenderingContext extends IRestrictedRenderingContext {

	linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[];

	visibleRangeForPosition(position: Position): VisibleRange;
}

export class LineVisibleRanges {
	_lineVisibleRangesBrand: void;

	public lineNumber: number;
	public ranges: HorizontalRange[];

	constructor(lineNumber: number, ranges: HorizontalRange[]) {
		this.lineNumber = lineNumber;
		this.ranges = ranges;
	}
}

export class VisibleRange {
	_visibleRangeBrand: void;

	public top: number;
	public left: number;
	public width: number;

	constructor(top: number, left: number, width: number) {
		this.top = top | 0;
		this.left = left | 0;
		this.width = width | 0;
	}
}

export class HorizontalRange {
	_horizontalRangeBrand: void;

	public left: number;
	public width: number;

	constructor(left: number, width: number) {
		this.left = Math.round(left);
		this.width = Math.round(width);
	}

	public toString(): string {
		return `[${this.left},${this.width}]`;
	}
}
