/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IViewLayout, ViewModelDecoration } from 'vs/editor/common/viewModel';

export interface IViewLines {
	linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] | null;
	visibleRangeForPosition(position: Position): HorizontalPosition | null;
}

export abstract class RestrictedRenderingContext {
	_restrictedRenderingContextBrand: void = undefined;

	public readonly viewportData: ViewportData;

	public readonly scrollWidth: number;
	public readonly scrollHeight: number;

	public readonly visibleRange: Range;
	public readonly bigNumbersDelta: number;

	public readonly scrollTop: number;
	public readonly scrollLeft: number;

	public readonly viewportWidth: number;
	public readonly viewportHeight: number;

	private readonly _viewLayout: IViewLayout;

	constructor(viewLayout: IViewLayout, viewportData: ViewportData) {
		this._viewLayout = viewLayout;
		this.viewportData = viewportData;

		this.scrollWidth = this._viewLayout.getScrollWidth();
		this.scrollHeight = this._viewLayout.getScrollHeight();

		this.visibleRange = this.viewportData.visibleRange;
		this.bigNumbersDelta = this.viewportData.bigNumbersDelta;

		const vInfo = this._viewLayout.getCurrentViewport();
		this.scrollTop = vInfo.top;
		this.scrollLeft = vInfo.left;
		this.viewportWidth = vInfo.width;
		this.viewportHeight = vInfo.height;
	}

	public getScrolledTopFromAbsoluteTop(absoluteTop: number): number {
		return absoluteTop - this.scrollTop;
	}

	public getVerticalOffsetForLineNumber(lineNumber: number, includeViewZones?: boolean): number {
		return this._viewLayout.getVerticalOffsetForLineNumber(lineNumber, includeViewZones);
	}

	public getVerticalOffsetAfterLineNumber(lineNumber: number, includeViewZones?: boolean): number {
		return this._viewLayout.getVerticalOffsetAfterLineNumber(lineNumber, includeViewZones);
	}

	public getDecorationsInViewport(): ViewModelDecoration[] {
		return this.viewportData.getDecorationsInViewport();
	}

}

export class RenderingContext extends RestrictedRenderingContext {
	_renderingContextBrand: void = undefined;

	private readonly _viewLines: IViewLines;

	constructor(viewLayout: IViewLayout, viewportData: ViewportData, viewLines: IViewLines) {
		super(viewLayout, viewportData);
		this._viewLines = viewLines;
	}

	public linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] | null {
		return this._viewLines.linesVisibleRangesForRange(range, includeNewLines);
	}

	public visibleRangeForPosition(position: Position): HorizontalPosition | null {
		return this._viewLines.visibleRangeForPosition(position);
	}
}

export class LineVisibleRanges {
	/**
	 * Returns the element with the smallest `lineNumber`.
	 */
	public static firstLine(ranges: LineVisibleRanges[] | null): LineVisibleRanges | null {
		if (!ranges) {
			return null;
		}
		let result: LineVisibleRanges | null = null;
		for (const range of ranges) {
			if (!result || range.lineNumber < result.lineNumber) {
				result = range;
			}
		}
		return result;
	}

	/**
	 * Returns the element with the largest `lineNumber`.
	 */
	public static lastLine(ranges: LineVisibleRanges[] | null): LineVisibleRanges | null {
		if (!ranges) {
			return null;
		}
		let result: LineVisibleRanges | null = null;
		for (const range of ranges) {
			if (!result || range.lineNumber > result.lineNumber) {
				result = range;
			}
		}
		return result;
	}

	constructor(
		public readonly outsideRenderedLine: boolean,
		public readonly lineNumber: number,
		public readonly ranges: HorizontalRange[]
	) { }
}

export class HorizontalRange {
	_horizontalRangeBrand: void = undefined;

	public left: number;
	public width: number;

	public static from(ranges: FloatHorizontalRange[]): HorizontalRange[] {
		const result = new Array(ranges.length);
		for (let i = 0, len = ranges.length; i < len; i++) {
			const range = ranges[i];
			result[i] = new HorizontalRange(range.left, range.width);
		}
		return result;
	}

	constructor(left: number, width: number) {
		this.left = Math.round(left);
		this.width = Math.round(width);
	}

	public toString(): string {
		return `[${this.left},${this.width}]`;
	}
}

export class FloatHorizontalRange {
	_floatHorizontalRangeBrand: void = undefined;

	public left: number;
	public width: number;

	constructor(left: number, width: number) {
		this.left = left;
		this.width = width;
	}

	public toString(): string {
		return `[${this.left},${this.width}]`;
	}

	public static compare(a: FloatHorizontalRange, b: FloatHorizontalRange): number {
		return a.left - b.left;
	}
}

export class HorizontalPosition {
	public outsideRenderedLine: boolean;
	/**
	 * Math.round(this.originalLeft)
	 */
	public left: number;
	public originalLeft: number;

	constructor(outsideRenderedLine: boolean, left: number) {
		this.outsideRenderedLine = outsideRenderedLine;
		this.originalLeft = left;
		this.left = Math.round(this.originalLeft);
	}
}

export class VisibleRanges {
	constructor(
		public readonly outsideRenderedLine: boolean,
		public readonly ranges: FloatHorizontalRange[]
	) {
	}
}
