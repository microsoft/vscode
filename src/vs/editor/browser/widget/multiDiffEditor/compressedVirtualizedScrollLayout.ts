/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../base/common/errors.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';

export type CompressedVirtualizedItemVisibility = 'before' | 'visible' | 'after';

export interface ICompressedVirtualizedItemLayout {
	/** Complete item range in outer scroll coordinates. */
	readonly contentRange: OffsetRange;
	/** Item range in the compressed rendered coordinate system. */
	readonly renderedRange: OffsetRange;
	/** Height removed from the rendered row and represented by item-local scrolling. */
	readonly maxScrollOffset: number;
	/**
	 * Item-local scroll coordinates:
	 *
	 *     0 ---------------------------- maxScrollOffset
	 *     item begins                    item end is aligned
	 */
	readonly scrollOffset: number;
	readonly visibility: CompressedVirtualizedItemVisibility;
}

export interface ICompressedVirtualizedScrollLayout {
	/** Clamped position in the complete outer scroll coordinates. */
	readonly scrollTop: number;
	/** Complete height of all items and inter-item gaps. */
	readonly scrollHeight: number;
	/** Height occupied by the compressed item rows and inter-item gaps. */
	readonly renderedHeight: number;
	readonly contentViewport: OffsetRange;
	readonly renderedViewport: OffsetRange;
	/** Full-content height above the viewport represented by item-local scrolling instead of DOM movement. */
	readonly hiddenContentHeightAboveViewport: number;
	readonly items: readonly ICompressedVirtualizedItemLayout[];
}

export interface ICompressedVirtualizedScrollLayoutInput {
	readonly scrollTop: number;
	readonly viewportHeight: number;
	readonly itemGap: number;
	readonly itemHeights: readonly number[];
}

/**
 * Computes the complete and compressed vertical layout of a virtualized list.
 */
export function computeCompressedVirtualizedScrollLayout(input: ICompressedVirtualizedScrollLayoutInput): ICompressedVirtualizedScrollLayout {
	assertNonNegative('viewportHeight', input.viewportHeight);
	const scrollHeight = computeCompressedVirtualizedScrollHeight(input.itemHeights, input.itemGap);
	const maxScrollTop = Math.max(0, scrollHeight - input.viewportHeight);
	const scrollTop = Math.max(0, Math.min(input.scrollTop, maxScrollTop));
	const contentViewport = OffsetRange.ofStartAndLength(scrollTop, input.viewportHeight);

	let contentTop = 0;
	let renderedTop = 0;
	let hiddenContentHeightAboveViewport = 0;
	const items: ICompressedVirtualizedItemLayout[] = [];

	for (let index = 0; index < input.itemHeights.length; index++) {
		const fullHeight = input.itemHeights[index];
		const renderedHeight = Math.min(fullHeight, input.viewportHeight);
		const maxScrollOffset = fullHeight - renderedHeight;
		const contentRange = OffsetRange.ofStartAndLength(contentTop, fullHeight);
		const renderedRange = OffsetRange.ofStartAndLength(renderedTop, renderedHeight);

		let visibility: CompressedVirtualizedItemVisibility;
		let scrollOffset: number;
		if (contentRange.isBefore(contentViewport)) {
			visibility = 'before';
			scrollOffset = maxScrollOffset;
		} else if (contentRange.isAfter(contentViewport)) {
			visibility = 'after';
			scrollOffset = 0;
		} else {
			visibility = 'visible';
			scrollOffset = Math.max(0, Math.min(contentViewport.start - contentRange.start, maxScrollOffset));
		}

		hiddenContentHeightAboveViewport += scrollOffset;
		items.push({
			contentRange,
			renderedRange,
			maxScrollOffset,
			scrollOffset,
			visibility,
		});

		if (index < input.itemHeights.length - 1) {
			contentTop += fullHeight + input.itemGap;
			renderedTop += renderedHeight + input.itemGap;
		} else {
			contentTop += fullHeight;
			renderedTop += renderedHeight;
		}
	}

	const renderedScrollTop = scrollTop - hiddenContentHeightAboveViewport;
	return {
		scrollTop,
		scrollHeight,
		renderedHeight: renderedTop,
		contentViewport,
		renderedViewport: OffsetRange.ofStartAndLength(renderedScrollTop, input.viewportHeight),
		hiddenContentHeightAboveViewport,
		items,
	};
}

export function computeCompressedVirtualizedScrollHeight(itemHeights: readonly number[], itemGap: number): number {
	assertNonNegative('itemGap', itemGap);
	for (let i = 0; i < itemHeights.length; i++) {
		assertNonNegative(`itemHeights[${i}]`, itemHeights[i]);
	}
	if (itemHeights.length === 0) {
		return 0;
	}
	return itemHeights.reduce((result, height) => result + height, 0) + itemGap * (itemHeights.length - 1);
}

function assertNonNegative(name: string, value: number): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new BugIndicatingError(`${name} must be a finite non-negative number, got ${value}`);
	}
}
