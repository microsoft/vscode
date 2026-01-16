/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../common/core/range.js';
import { IViewModel } from '../../../common/viewModel.js';

export function subtractRanges(range: Range, excludeRanges: Range[], viewModel: IViewModel): Range[] {
	if (excludeRanges.length === 0) {
		return [Range.lift(range)];
	}

	const visibleRanges: Range[] = [];
	let currentStart = Range.getStartPosition(range);
	const searchEnd = Range.getEndPosition(range);

	// Sort hidden areas by start position once, filtering to only intersecting ranges
	const sortedHidden = excludeRanges
		.filter(hidden => Range.areIntersecting(range, hidden))
		.sort((a, b) => Range.compareRangesUsingStarts(a, b));

	for (const hidden of sortedHidden) {
		const hiddenStart = Range.getStartPosition(hidden);
		const hiddenEnd = Range.getEndPosition(hidden);

		// Add visible range before this hidden area
		if (currentStart.isBefore(hiddenStart)) {
			const visibleRange = Range.fromPositions(currentStart, hiddenStart);
			if (!visibleRange.isEmpty()) {
				visibleRanges.push(visibleRange);
			}
		}

		// Move current start to after the hidden area (if hidden end is after current start)
		if (currentStart.isBefore(hiddenEnd) || currentStart.equals(hiddenEnd)) {
			currentStart = hiddenEnd;
		}
	}

	// Add remaining visible range after all hidden areas
	if (currentStart.isBefore(searchEnd)) {
		const visibleRange = Range.fromPositions(currentStart, searchEnd);
		visibleRanges.push(visibleRange);
	}

	return visibleRanges;
}
