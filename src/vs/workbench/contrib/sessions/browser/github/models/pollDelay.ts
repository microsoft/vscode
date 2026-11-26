/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stringHash } from '../../../../../../base/common/hash.js';

/**
 * Returns the delay between two polls of one model. The key adds a stable offset of up to half the
 * interval so that the many models polled at the same time do not all issue their requests in the
 * same instant and overflow the request queue.
 */
export function getStaggeredPollDelay(key: string, intervalMs: number): number {
	const spread = Math.floor(intervalMs / 2);
	if (spread <= 0) {
		return intervalMs;
	}
	// Keys that differ in a trailing digit hash to adjacent values, so mix the bits (murmur3 finalizer).
	let hash = stringHash(key, 0);
	hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
	hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
	hash ^= hash >>> 16;
	return intervalMs + (hash >>> 0) % spread;
}
