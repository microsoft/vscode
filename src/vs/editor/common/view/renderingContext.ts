/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IViewLayout, ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';

export interface IViewLines {
	linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[];
	visibleRangesForRange2(range: Range, deltaTop: number): VisibleRange[];
}

export class RenderingContext implements IRenderingContext {

	_renderingContextBrand: void;

	public readonly viewportData: ViewportData;

	public readonly scrollWidth: number;
	public readonly scrollHeight: number;

	public readonly visibleRange: Range;
	public readonly bigNumbersDelta: number;

	public readonly viewportTop: number;
	public readonly viewportWidth: number;
	public readonly viewportHeight: number;
	public readonly viewportLeft: number;

	private readonly _viewLayout: IViewLayout;
	private readonly _viewLines: IViewLines;

	constructor(viewLines: IViewLines, viewLayout: IViewLayout, viewportData: ViewportData) {
		this._viewLines = viewLines;
		this._viewLayout = viewLayout;
		this.viewportData = viewportData;

		this.scrollWidth = this._viewLayout.getScrollWidth();
		this.scrollHeight = this._viewLayout.getScrollHeight();

		this.visibleRange = this.viewportData.visibleRange;
		this.bigNumbersDelta = this.viewportData.bigNumbersDelta;

		const vInfo = this._viewLayout.getCurrentViewport();
		this.viewportWidth = vInfo.width;
		this.viewportHeight = vInfo.height;
		this.viewportLeft = vInfo.left;
		this.viewportTop = vInfo.top;
	}

	public getScrolledTopFromAbsoluteTop(absoluteTop: number): number {
		return this._viewLayout.getScrolledTopFromAbsoluteTop(absoluteTop);
	}

	public getVerticalOffsetForLineNumber(lineNumber: number): number {
		return this._viewLayout.getVerticalOffsetForLineNumber(lineNumber);
	}

	public lineIsVisible(lineNumber: number): boolean {
		return (
			this.viewportData.visibleRange.startLineNumber <= lineNumber
			&& lineNumber <= this.viewportData.visibleRange.endLineNumber
		);
	}

	public getDecorationsInViewport(): ViewModelDecoration[] {
		return this.viewportData.getDecorationsInViewport();
	}

	public linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] {
		return this._viewLines.linesVisibleRangesForRange(range, includeNewLines);
	}

	public visibleRangeForPosition(position: Position): VisibleRange {
		const deltaTop = this.viewportData.visibleRangesDeltaTop;
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
	readonly viewportData: ViewportData;

	readonly scrollWidth: number;
	readonly scrollHeight: number;

	readonly visibleRange: Range;
	readonly bigNumbersDelta: number;

	readonly viewportTop: number;
	readonly viewportWidth: number;
	readonly viewportHeight: number;
	readonly viewportLeft: number;

	getScrolledTopFromAbsoluteTop(absoluteTop: number): number;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
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
