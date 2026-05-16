/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitGlobAware } from '../../../../base/common/glob.js';

/**
 * Append a single glob/path pattern to a comma-separated search include/exclude field
 * when it is not already present (after trimming comma-separated entries).
 */
export function mergeSearchPatternIfNotExists(currentPatterns: string, newPattern: string): string {
	return mergeSearchPatternsIfNotExist(currentPatterns, [newPattern]);
}

/**
 * Append multiple patterns, skipping any that are already present. Each entry in
 * `newPatterns` is treated as one pattern (do not pass a single comma-joined string for several paths).
 */
export function mergeSearchPatternsIfNotExist(currentPatterns: string, newPatterns: readonly string[]): string {
	const orderedParts: string[] = [];
	const seen = new Set<string>();
	for (const p of splitGlobAware(currentPatterns, ',')) {
		const t = p.trim();
		if (t && !seen.has(t)) {
			seen.add(t);
			orderedParts.push(t);
		}
	}
	let changed = false;
	for (const p of newPatterns) {
		const t = p.trim();
		if (t && !seen.has(t)) {
			seen.add(t);
			orderedParts.push(t);
			changed = true;
		}
	}
	if (!changed) {
		return currentPatterns;
	}
	return orderedParts.join(', ');
}
