/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../common/lifecycle.js';

/**
 * Replace `Math.random` with a seeded pseudo-random number generator
 * (mulberry32). Returns a disposable that restores the previous `Math.random`.
 *
 * Follows the same push/restore pattern as {@link pushGlobalTimeApi}.
 */
export function pushRandomOverwrite(seed: number): IDisposable {
	const previous = Math.random;
	Math.random = mulberry32(seed);
	return {
		dispose: () => {
			Math.random = previous;
		},
	};
}

/**
 * Mulberry32 — a fast, high-quality 32-bit seeded PRNG that produces values in [0, 1).
 * TODO@hediet: Use random.ts
 */
function mulberry32(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6D2B79F5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}
