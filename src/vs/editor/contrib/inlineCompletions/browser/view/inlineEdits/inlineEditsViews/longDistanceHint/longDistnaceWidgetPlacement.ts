/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IReader } from '../../../../../../../../base/common/observable.js';
import { ObservableCodeEditor } from '../../../../../../../browser/observableCodeEditor.js';
import { Size2D } from '../../../../../../../common/core/2d/size.js';
import { LineRange } from '../../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../../common/core/ranges/offsetRange.js';
import { getMaxTowerHeightInAvailableArea } from '../../utils/towersLayout.js';

/**
 * Layout constants used for the long-distance hint widget.
 */
export interface WidgetLayoutConstants {
	readonly previewEditorMargin: number;
	readonly widgetPadding: number;
	readonly widgetBorder: number;
	readonly lowerBarHeight: number;
	readonly minWidgetWidth: number;
}
/**
 * Represents a widget placement outline with horizontal and vertical ranges.
 */
export interface WidgetOutline {
	readonly horizontalWidgetRange: OffsetRange;
	readonly verticalWidgetRange: OffsetRange;
}
/**
 * Represents a continuous range of lines with their sizes and positioning.
 * Used to compute available space for widget placement.
 */
export interface ContinuousLineSizes {
	readonly lineRange: LineRange;
	readonly top: number;
	readonly sizes: Size2D[];
}
/**
 * Context for computing widget placement within a continuous line range.
 */
export class WidgetPlacementContext {
	public readonly availableSpaceSizes: Size2D[];
	public readonly availableSpaceHeightPrefixSums: number[];
	public readonly availableSpaceSizesTransposed: Size2D[];

	constructor(
		private readonly _lineRangeInfo: ContinuousLineSizes,
		editorTrueContentWidth: number,
		endOfLinePadding: (lineNumber: number) => number,
	) {
		this.availableSpaceSizes = _lineRangeInfo.sizes.map((s, idx) => {
			const lineNumber = _lineRangeInfo.lineRange.startLineNumber + idx;
			const linePaddingLeft = endOfLinePadding(lineNumber);
			return new Size2D(Math.max(0, editorTrueContentWidth - s.width - linePaddingLeft), s.height);
		});

		this.availableSpaceHeightPrefixSums = getSums(this.availableSpaceSizes, s => s.height);
		this.availableSpaceSizesTransposed = this.availableSpaceSizes.map(s => s.transpose());
	}

	/**
	 * Computes the vertical outline for a widget placed at the given line number.
	 */
	public getWidgetVerticalOutline(
		lineNumber: number,
		previewEditorHeight: number,
		layoutConstants: WidgetLayoutConstants
	): OffsetRange {
		const sizeIdx = lineNumber - this._lineRangeInfo.lineRange.startLineNumber;
		const top = this._lineRangeInfo.top + this.availableSpaceHeightPrefixSums[sizeIdx];
		const editorRange = OffsetRange.ofStartAndLength(top, previewEditorHeight);
		const { previewEditorMargin, widgetPadding, widgetBorder, lowerBarHeight } = layoutConstants;
		const verticalWidgetRange = editorRange.withMargin(previewEditorMargin + widgetPadding + widgetBorder).withMargin(0, lowerBarHeight);
		return verticalWidgetRange;
	}

	/**
	 * Tries to find a valid widget outline within this line range context.
	 */
	public tryFindWidgetOutline(
		targetLineNumber: number,
		previewEditorHeight: number,
		editorTrueContentRight: number,
		layoutConstants: WidgetLayoutConstants
	): WidgetOutline | undefined {
		if (this._lineRangeInfo.lineRange.length < 3) {
			return undefined;
		}
		return findFirstMinimzeDistance(
			this._lineRangeInfo.lineRange.addMargin(-1, -1),
			targetLineNumber,
			lineNumber => {
				const verticalWidgetRange = this.getWidgetVerticalOutline(lineNumber, previewEditorHeight, layoutConstants);
				const maxWidth = getMaxTowerHeightInAvailableArea(
					verticalWidgetRange.delta(-this._lineRangeInfo.top),
					this.availableSpaceSizesTransposed
				);
				if (maxWidth < layoutConstants.minWidgetWidth) {
					return undefined;
				}
				const horizontalWidgetRange = OffsetRange.ofStartAndLength(editorTrueContentRight - maxWidth, maxWidth);
				return { horizontalWidgetRange, verticalWidgetRange };
			}
		);
	}
}
/**
 * Splits line size information into continuous ranges, breaking at positions where
 * the expected vertical position differs from the actual position (e.g., due to folded regions).
 */
export function splitIntoContinuousLineRanges(
	lineRange: LineRange,
	sizes: Size2D[],
	top: number,
	editorObs: ObservableCodeEditor,
	reader: IReader,
): ContinuousLineSizes[] {
	const result: ContinuousLineSizes[] = [];
	let currentRangeStart = lineRange.startLineNumber;
	let currentRangeTop = top;
	let currentSizes: Size2D[] = [];

	for (let i = 0; i < sizes.length; i++) {
		const lineNumber = lineRange.startLineNumber + i;
		const expectedTop = currentRangeTop + currentSizes.reduce((p, c) => p + c.height, 0);
		const actualTop = editorObs.editor.getTopForLineNumber(lineNumber);

		if (i > 0 && actualTop !== expectedTop) {
			// Discontinuity detected - push the current range and start a new one
			result.push({
				lineRange: LineRange.ofLength(currentRangeStart, lineNumber - currentRangeStart),
				top: currentRangeTop,
				sizes: currentSizes,
			});
			currentRangeStart = lineNumber;
			currentRangeTop = actualTop;
			currentSizes = [];
		}
		currentSizes.push(sizes[i]);
	}

	// Push the final range
	result.push({
		lineRange: LineRange.ofLength(currentRangeStart, lineRange.endLineNumberExclusive - currentRangeStart),
		top: currentRangeTop,
		sizes: currentSizes,
	});

	// Don't observe each line individually for performance reasons
	derived({ owner: 'splitIntoContinuousLineRanges' }, r => {
		return editorObs.observeTopForLineNumber(lineRange.endLineNumberExclusive - 1).read(r);
	}).read(reader);

	return result;
}

function findFirstMinimzeDistance<T>(range: LineRange, targetLine: number, predicate: (lineNumber: number) => T | undefined): T | undefined {
	for (let offset = 0; ; offset++) {
		const down = targetLine + offset;
		if (down <= range.endLineNumberExclusive) {
			const result = predicate(down);
			if (result !== undefined) {
				return result;
			}
		}
		const up = targetLine - offset;
		if (up >= range.startLineNumber) {
			const result = predicate(up);
			if (result !== undefined) {
				return result;
			}
		}
		if (up < range.startLineNumber && down > range.endLineNumberExclusive) {
			return undefined;
		}
	}
}

function getSums<T>(array: T[], fn: (item: T) => number): number[] {
	const result: number[] = [0];
	let sum = 0;
	for (const item of array) {
		sum += fn(item);
		result.push(sum);
	}
	return result;
}
