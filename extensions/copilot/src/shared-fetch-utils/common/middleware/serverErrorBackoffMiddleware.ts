/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FetchBlockedError, type FetchMiddleware } from '../fetchTypes';

export class ServerBackoffError extends FetchBlockedError {
	constructor(retryAfterMs: number) {
		super(`Backing off for ${Math.round(retryAfterMs / 1000)}s after server error`, retryAfterMs);
	}
}

export interface BackoffOptions {
	readonly initialDelayMs?: number;
	readonly maxDelayMs?: number;
	readonly multiplier?: number;
}

/**
 * After a `5xx` response, blocks subsequent requests for an exponentially
 * increasing duration. The backoff resets on the first successful response.
 */
export function serverErrorBackoffMiddleware(options?: BackoffOptions): FetchMiddleware {
	const { initialDelayMs = 1_000, maxDelayMs = 60_000, multiplier = 2 } = options ?? {};
	let consecutiveFailures = 0;
	let backoffUntil = 0;

	return (next) => async (request) => {
		if (Date.now() < backoffUntil) {
			throw new ServerBackoffError(backoffUntil - Date.now());
		}

		const response = await next(request);

		if (response.status >= 500) {
			consecutiveFailures++;
			const delay = Math.min(
				initialDelayMs * Math.pow(multiplier, consecutiveFailures - 1),
				maxDelayMs,
			);
			backoffUntil = Date.now() + delay;
			throw new ServerBackoffError(delay);
		}

		// Success → reset
		consecutiveFailures = 0;
		backoffUntil = 0;

		return response;
	};
}
