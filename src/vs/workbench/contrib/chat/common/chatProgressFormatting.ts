/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/**
 * Format a millisecond duration as a human-readable elapsed time string.
 * Examples: "0s", "45s", "1m 23s", "12m 5s"
 */
export function formatElapsedTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) {
		return localize('seconds', "{0}s", totalSeconds);
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return localize('minutesSeconds', "{0}m {1}s", minutes, seconds);
}

/**
 * Format a token count as a human-readable string.
 * Examples: "500", "1.2k", "1.5m"
 */
export function formatTokenCount(count: number): string {
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(1)}m`;
	} else if (count >= 1000) {
		const value = count / 1000;
		if (value >= 10) {
			const roundedValue = value.toFixed(0);
			if (roundedValue === '1000') {
				return `${(count / 1_000_000).toFixed(1)}m`;
			}
			return `${roundedValue}k`;
		}
		return `${value.toFixed(1)}k`;
	}
	return count.toString();
}
