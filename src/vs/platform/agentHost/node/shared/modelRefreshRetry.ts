/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const MODEL_REFRESH_MAX_ATTEMPTS = 5;
export const MODEL_REFRESH_BASE_DELAY_MS = 1_000;
export const MODEL_REFRESH_MAX_DELAY_MS = 30_000;

/**
 * Equal-jitter exponential backoff for model-catalog refreshes.
 */
export function modelRefreshBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
	const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
	return Math.round(exp / 2 + Math.random() * (exp / 2));
}
