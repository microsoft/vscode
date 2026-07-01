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


