/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../common/core/range.js';
import { IViewModel } from '../../../common/viewModel.js';

/**
 * Subtracts excluded ranges from a source range, returning the visible parts.
 * This efficiently computes Range minus Range[].
 *
 * @param range The source range to subtract from
 * @param excludeRanges Ranges to exclude from the source range
 * @param viewModel The view model used to get line column bounds
 * @returns Array of ranges representing the visible parts after exclusion
 *
 * Performance: O(n + m*k) where n is the number of lines in the range,
 * m is the number of exclude ranges, and k is the average number of exclude
 * ranges that start at the same line (typically k is very small, close to 1).
 */
export function subtractRanges(range: Range, excludeRanges: Range[], viewModel: IViewModel,): Range[] {
	if (excludeRanges.length === 0) {
		return [range];
	}

	// Sort exclude ranges by start line for efficient processing
	const sortedExcludes = excludeRanges
		.filter(hidden => Range.areIntersecting(range, hidden))
		.sort((a, b) => Range.compareRangesUsingStarts(a, b));

	const result: Range[] = [];
	let visibleStart: number | null = null;
	let excludeIndex = 0;

	for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
		// Advance excludeIndex past any exclude ranges that end before the current line
		while (excludeIndex < sortedExcludes.length && sortedExcludes[excludeIndex].endLineNumber < line) {
			excludeIndex++;
		}

		// Check if this line is hidden by the current exclude range
		// Since excludeRanges are sorted and we've advanced past ended ones,
		// we only need to check if the current exclude covers this line
		const hidden = excludeIndex < sortedExcludes.length &&
			line >= sortedExcludes[excludeIndex].startLineNumber &&
			line <= sortedExcludes[excludeIndex].endLineNumber;

		if (hidden) {
			// End current visible range if any
			if (visibleStart !== null) {
				const startCol = visibleStart === range.startLineNumber ? range.startColumn : viewModel.getLineMinColumn(visibleStart);
				const endLine = line - 1;
				const endCol = endLine === range.endLineNumber ? range.endColumn : viewModel.getLineMaxColumn(endLine);
				result.push(new Range(visibleStart, startCol, endLine, endCol));
				visibleStart = null;
			}
		} else {
			// Start or continue visible range
			if (visibleStart === null) {
				visibleStart = line;
			}
		}
	}

	// Add any remaining visible range
	if (visibleStart !== null) {
		const startCol = visibleStart === range.startLineNumber ? range.startColumn : viewModel.getLineMinColumn(visibleStart);
		result.push(new Range(visibleStart, startCol, range.endLineNumber, range.endColumn));
	}

	return result;
}

