/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A rail mark with a mutable centre position (px), used by {@link spaceMarkCenters}. */
export interface IPositionedMark {
	center: number;
}

/**
 * Nudges ascending mark centres so no two are closer than `minGap`, keeping them within the rail
 * `[minGap/2, height - minGap/2]` and as near their desired (proportional) position as room
 * allows. Prompts can sit arbitrarily close in content space (a short turn, or once the adaptive
 * height estimates settle), which would otherwise let the marks' clickable hit targets overlap.
 *
 * When the marks cannot all fit at full spacing they are distributed evenly (the best achievable).
 * Mutates `marks[i].center` in place; `marks` must already be sorted by ascending `center`.
 */
export function spaceMarkCenters(marks: readonly IPositionedMark[], height: number, minGap: number): void {
	const n = marks.length;
	if (n === 0) {
		return;
	}
	const lo = minGap / 2;
	const hi = height - minGap / 2;
	if (hi <= lo) {
		return; // Rail too short to space meaningfully; leave positions as-is.
	}
	if ((n - 1) * minGap > hi - lo) {
		// Too many marks to fit at full spacing (n >= 2 here): spread them evenly (spacing < minGap).
		const step = (hi - lo) / (n - 1);
		for (let i = 0; i < n; i++) {
			marks[i].center = lo + i * step;
		}
		return;
	}
	// Forward pass: enforce the minimum gap and the top bound.
	let prev = lo - minGap;
	for (let i = 0; i < n; i++) {
		prev = marks[i].center = Math.max(marks[i].center, prev + minGap, lo);
	}
	// Backward pass: pull marks back within the bottom bound while preserving the gap.
	let next = hi + minGap;
	for (let i = n - 1; i >= 0; i--) {
		next = marks[i].center = Math.min(marks[i].center, next - minGap, hi);
	}
}
