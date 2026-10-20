/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const RATE_LIMIT_MAX_RETRIES = 3;
export const RATE_LIMIT_WAIT_BUDGET_MS = 15_000;

const RATE_LIMIT_BASE_DELAY_MS = 1_000;
const RATE_LIMIT_MAX_BACKOFF_MS = 8_000;

/** Parse `Retry-After` as delta-seconds or an HTTP date. */
export function retryAfterSeconds(value: string | string[] | undefined): number | undefined {
	const raw = (Array.isArray(value) ? value[0] : value)?.trim();
	if (raw) {
		const seconds = Number(raw);
		if (Number.isSafeInteger(seconds) && seconds >= 0) {
			return seconds;
		}
		const date = Number.isNaN(seconds) ? Date.parse(raw) : NaN;
		if (Number.isFinite(date)) {
			return Math.max(0, (date - Date.now()) / 1000);
		}
	}
	return undefined;
}

/** Honor the server's delay verbatim, or use a capped exponential backoff when none was supplied. */
export function rateLimitDelay(retryAfter: number | undefined, attempt: number): number {
	return retryAfter !== undefined
		? retryAfter * 1000
		: Math.min(RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt), RATE_LIMIT_MAX_BACKOFF_MS);
}
