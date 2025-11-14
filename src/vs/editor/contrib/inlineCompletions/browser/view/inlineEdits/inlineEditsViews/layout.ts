/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Size2D } from '../../../../../../common/core/2d/size.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';

/**
 * The tower areas are arranged from left to right, touch and are aligned at the bottom.
 * The requested tower is placed at the requested left offset.
 */
export function canFitInAvailableArea(towerSize: Size2D, towerLeftOffset: number, availableTowerAreas: Size2D[]): boolean {
	const towerRightOffset = towerLeftOffset + towerSize.width;

	// Calculate the accumulated width to find which tower areas the requested tower overlaps
	let currentLeftOffset = 0;
	for (const availableArea of availableTowerAreas) {
		const currentRightOffset = currentLeftOffset + availableArea.width;

		// Check if the requested tower overlaps with this available area
		const overlapLeft = Math.max(towerLeftOffset, currentLeftOffset);
		const overlapRight = Math.min(towerRightOffset, currentRightOffset);

		if (overlapLeft < overlapRight) {
			// There is an overlap - check if the tower can fit vertically
			if (towerSize.height > availableArea.height) {
				return false;
			}
		}

		currentLeftOffset = currentRightOffset;

		// Early exit if we've passed the tower's right edge
		if (currentLeftOffset >= towerRightOffset) {
			break;
		}
	}

	// Check if the tower extends beyond all available areas
	return towerRightOffset <= currentLeftOffset;
}

/**
 * The tower areas are arranged from left to right, touch and are aligned at the bottom.
 * How high can a tower be placed at the requested horizontal range, so that its size fits into the union of the stacked availableTowerAreas?
 */
export function getMaxTowerHeightInAvailableArea(towerHorizontalRange: OffsetRange, availableTowerAreas: Size2D[]): number {
	const towerLeftOffset = towerHorizontalRange.start;
	const towerRightOffset = towerHorizontalRange.endExclusive;

	let minHeight = Number.MAX_VALUE;

	// Calculate the accumulated width to find which tower areas the requested tower overlaps
	let currentLeftOffset = 0;
	for (const availableArea of availableTowerAreas) {
		const currentRightOffset = currentLeftOffset + availableArea.width;

		// Check if the requested tower overlaps with this available area
		const overlapLeft = Math.max(towerLeftOffset, currentLeftOffset);
		const overlapRight = Math.min(towerRightOffset, currentRightOffset);

		if (overlapLeft < overlapRight) {
			// There is an overlap - track the minimum height
			minHeight = Math.min(minHeight, availableArea.height);
		}

		currentLeftOffset = currentRightOffset;
	}

	if (towerRightOffset > currentLeftOffset) {
		return 0;
	}

	// If no overlap was found, return 0
	return minHeight === Number.MAX_VALUE ? 0 : minHeight;
}
