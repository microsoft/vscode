/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Viewport calculation utilities for virtual scrolling
 */
export interface ViewportInfo {
	startIndex: number;
	endIndex: number;
	offsetY: number;
	totalHeight: number;
	visibleCount: number;
}

export interface ColumnViewportInfo {
	startIndex: number;
	endIndex: number;
	offsetX: number;
	totalWidth: number;
	visibleCount: number;
}

export class ViewportCalculator {
	/**
	 * Calculate visible rows for virtual scrolling
	 */
	static calculateVisibleRows(
		scrollTop: number,
		containerHeight: number,
		itemHeight: number,
		totalItems: number,
		overscan: number = 5
	): ViewportInfo {
		const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
		const visibleCount = Math.ceil(containerHeight / itemHeight);
		const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + overscan * 2);
		
		return {
			startIndex,
			endIndex,
			offsetY: startIndex * itemHeight,
			totalHeight: totalItems * itemHeight,
			visibleCount
		};
	}

	/**
	 * Calculate visible columns for horizontal virtual scrolling
	 */
	static calculateVisibleColumns(
		scrollLeft: number,
		containerWidth: number,
		columnWidths: number[],
		overscan: number = 2
	): ColumnViewportInfo {
		if (columnWidths.length === 0) {
			return {
				startIndex: 0,
				endIndex: -1,
				offsetX: 0,
				totalWidth: 0,
				visibleCount: 0
			};
		}

		let currentX = 0;
		let startIndex = 0;
		let endIndex = columnWidths.length - 1;

		// Find start index
		for (let i = 0; i < columnWidths.length; i++) {
			if (currentX + columnWidths[i] > scrollLeft) {
				startIndex = Math.max(0, i - overscan);
				break;
			}
			currentX += columnWidths[i];
		}

		// Find end index - fix the logic to include columns that are visible
		currentX = this.getTotalWidthUpToIndex(columnWidths, startIndex);
		const targetWidth = scrollLeft + containerWidth;
		
		for (let i = startIndex; i < columnWidths.length; i++) {
			currentX += columnWidths[i];
			if (currentX > targetWidth) {
				endIndex = Math.min(columnWidths.length - 1, i + overscan);
				break;
			}
		}

		const offsetX = this.getTotalWidthUpToIndex(columnWidths, startIndex);
		const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

		return {
			startIndex,
			endIndex,
			offsetX,
			totalWidth,
			visibleCount: endIndex - startIndex + 1
		};
	}

	/**
	 * Get total width up to a specific column index
	 */
	private static getTotalWidthUpToIndex(columnWidths: number[], index: number): number {
		let totalWidth = 0;
		for (let i = 0; i < index && i < columnWidths.length; i++) {
			totalWidth += columnWidths[i];
		}
		return totalWidth;
	}

	/**
	 * Calculate the scroll position needed to bring an item into view
	 */
	static calculateScrollToItem(
		itemIndex: number,
		itemHeight: number,
		containerHeight: number,
		currentScrollTop: number
	): number {
		const itemTop = itemIndex * itemHeight;
		const itemBottom = itemTop + itemHeight;
		const viewportTop = currentScrollTop;
		const viewportBottom = currentScrollTop + containerHeight;

		// Item is above viewport
		if (itemTop < viewportTop) {
			return itemTop;
		}

		// Item is below viewport
		if (itemBottom > viewportBottom) {
			return itemBottom - containerHeight;
		}

		// Item is already visible
		return currentScrollTop;
	}

	/**
	 * Calculate scroll position to center an item in the viewport
	 */
	static calculateScrollToCenterItem(
		itemIndex: number,
		itemHeight: number,
		containerHeight: number,
		totalItems: number
	): number {
		const itemTop = itemIndex * itemHeight;
		const scrollTop = itemTop - (containerHeight - itemHeight) / 2;
		const maxScrollTop = totalItems * itemHeight - containerHeight;
		
		return Math.max(0, Math.min(scrollTop, maxScrollTop));
	}
}

