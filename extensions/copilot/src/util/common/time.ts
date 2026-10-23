/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Used for representing seconds into a human readable string like 6 hours and 50 minutes.
 * This is primarily used to represent how long to wait for a rate limit.
 * @param seconds The number of seconds to convert to a human readable string.
 * @returns A human readable string representing the number of seconds.
 */
export function secondsToHumanReadableTime(seconds: number): string {
	if (seconds < 90) {
		return `${seconds} seconds`;
	}

	const minutes = Math.floor(seconds / 60);
	if (seconds <= 5400) {
		return `${minutes} minutes`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	let result = `${hours} hours`;
	if (remainingMinutes > 0) {
		result += ` ${remainingMinutes} minutes`;
	}

	return result;
}