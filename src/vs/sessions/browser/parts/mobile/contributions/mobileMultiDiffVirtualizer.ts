/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IMobileMultiDiffVirtualizerMetrics {
	readonly fileHeaderHeight: number;
	readonly hunkHeaderHeight: number;
	readonly rowHeight: number;
	readonly bodyVerticalPadding: number;
	readonly placeholderHeight: number;
}

export interface IMobileMultiDiffVirtualItem {
	readonly collapsed?: boolean;
	readonly state: 'unloaded' | 'loading' | 'loaded' | 'empty' | 'error';
	readonly estimatedHunkCount?: number;
	readonly estimatedRowCount?: number;
	readonly hunkCount?: number;
	readonly rowCount?: number;
}

export interface IMobileMultiDiffVirtualLayoutOptions {
	readonly viewportHeight: number;
	readonly scrollTop: number;
	readonly overscan?: number;
	readonly metrics: IMobileMultiDiffVirtualizerMetrics;
}

export interface IMobileMultiDiffVirtualItemLayout {
	readonly index: number;
	readonly virtualTop: number;
	readonly virtualHeight: number;
	readonly renderTop: number;
	readonly renderHeight: number;
	readonly innerOffset: number;
}

export interface IMobileMultiDiffVirtualLayout {
	readonly totalHeight: number;
	readonly items: readonly IMobileMultiDiffVirtualItemLayout[];
}

export function computeMobileMultiDiffItemHeight(item: IMobileMultiDiffVirtualItem, metrics: IMobileMultiDiffVirtualizerMetrics): number {
	if (item.collapsed) {
		return metrics.fileHeaderHeight;
	}

	if (item.state !== 'loaded') {
		if (item.state === 'unloaded' || item.state === 'loading') {
			const estimatedHeight = computeDiffBodyHeight(item.estimatedHunkCount, item.estimatedRowCount, metrics);
			if (estimatedHeight !== undefined) {
				return metrics.fileHeaderHeight + estimatedHeight;
			}
		}
		return metrics.fileHeaderHeight + metrics.placeholderHeight;
	}

	const bodyHeight = computeDiffBodyHeight(item.hunkCount, item.rowCount, metrics);
	if (bodyHeight === undefined) {
		return metrics.fileHeaderHeight + metrics.placeholderHeight;
	}

	return metrics.fileHeaderHeight + bodyHeight;
}

function computeDiffBodyHeight(
	hunkCount: number | undefined,
	rowCount: number | undefined,
	metrics: IMobileMultiDiffVirtualizerMetrics,
): number | undefined {
	const normalizedHunkCount = Math.max(0, hunkCount ?? 0);
	const normalizedRowCount = Math.max(0, rowCount ?? 0);
	if (normalizedHunkCount === 0 && normalizedRowCount === 0) {
		return undefined;
	}

	return metrics.bodyVerticalPadding
		+ normalizedHunkCount * metrics.hunkHeaderHeight
		+ normalizedRowCount * metrics.rowHeight;
}

export function computeMobileMultiDiffVirtualLayout(
	items: readonly IMobileMultiDiffVirtualItem[],
	options: IMobileMultiDiffVirtualLayoutOptions,
): IMobileMultiDiffVirtualLayout {
	const viewportHeight = Math.max(0, options.viewportHeight);
	const scrollTop = Math.max(0, options.scrollTop);
	const overscan = Math.max(0, options.overscan ?? 0);
	const visibleStart = Math.max(0, scrollTop - overscan);
	const visibleEnd = scrollTop + viewportHeight + overscan;

	let totalHeight = 0;
	const visibleItems: IMobileMultiDiffVirtualItemLayout[] = [];

	for (let index = 0; index < items.length; index++) {
		const virtualTop = totalHeight;
		const virtualHeight = computeMobileMultiDiffItemHeight(items[index], options.metrics);
		const virtualBottom = virtualTop + virtualHeight;
		totalHeight = virtualBottom;

		if (virtualHeight <= 0 || virtualTop >= visibleEnd || virtualBottom <= visibleStart) {
			continue;
		}

		const innerOffset = clamp(scrollTop - virtualTop, 0, virtualHeight);

		visibleItems.push({
			index,
			virtualTop,
			virtualHeight,
			renderTop: virtualTop,
			renderHeight: virtualHeight,
			innerOffset,
		});
	}

	return {
		totalHeight,
		items: visibleItems,
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
