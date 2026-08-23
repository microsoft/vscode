/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FetchBlockedError, type FetchMiddleware, type HttpHeaders } from '../fetchTypes';

export const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;
export const MAX_RATE_LIMIT_BACKOFF_MS = 15 * 60_000;

export class RateLimitBackoffError extends FetchBlockedError {
	constructor(retryAfterMs: number) {
		super(`Rate limited, backing off for ${Math.round(retryAfterMs / 1000)}s`, retryAfterMs);
	}
}

export interface RateLimitBackoffOptions {
	/** Delay applied to the first rate limit when the server sends no hint. */
	readonly initialDelayMs?: number;
	readonly maxDelayMs?: number;
	readonly multiplier?: number;
	/** Injectable clock, primarily so tests do not have to wait on the wall clock. */
	readonly now?: () => number;
}

/**
 * Blocks subsequent requests once the server reports a rate limit, so a client that shares a
 * quota with other callers cannot dig itself deeper.
 *
 * The wait is taken from the server whenever it says so, via `Retry-After` or GitHub's
 * `x-ratelimit-remaining`/`x-ratelimit-reset` pair, and otherwise falls back to an
 * exponentially increasing delay. Either way the wait is capped at {@link maxDelayMs}. The
 * backoff resets on the first response that is not rate limited.
 *
 * This complements {@link serverErrorBackoffMiddleware}, which covers `5xx` responses.
 */
export function rateLimitBackoffMiddleware(options?: RateLimitBackoffOptions): FetchMiddleware {
	const {
		initialDelayMs = DEFAULT_RATE_LIMIT_BACKOFF_MS,
		maxDelayMs = MAX_RATE_LIMIT_BACKOFF_MS,
		multiplier = 2,
		now = Date.now,
	} = options ?? {};
	let consecutiveRateLimits = 0;
	let blockedUntil = 0;

	return (next) => async (request) => {
		if (now() < blockedUntil) {
			throw new RateLimitBackoffError(blockedUntil - now());
		}

		const response = await next(request);

		if (!isRateLimited(response.status, response.headers)) {
			// A response that was already in flight when a concurrent request hit a rate limit must
			// not clear that newer block, otherwise later calls reach the server during the window
			// the server asked us to wait out.
			if (now() >= blockedUntil) {
				consecutiveRateLimits = 0;
				blockedUntil = 0;
			}
			return response;
		}

		consecutiveRateLimits++;
		const hinted = retryAfterFromRateLimitHeaders(response.headers, now);
		const backoff = hinted ?? initialDelayMs * Math.pow(multiplier, consecutiveRateLimits - 1);
		// `maxDelayMs` caps the server's hint too, so a bogus or hostile `Retry-After` cannot stall
		// the client indefinitely. Retrying a little early simply re-arms the backoff.
		const delay = Math.min(backoff, maxDelayMs);
		blockedUntil = now() + delay;
		throw new RateLimitBackoffError(delay);
	};
}

function isRateLimited(status: number, headers: HttpHeaders): boolean {
	if (status === 429) {
		return true;
	}
	// GitHub reports an exhausted primary rate limit as a 403 carrying the quota headers, which
	// has to be told apart from a plain authorization failure.
	return status === 403 && readHeader(headers, 'x-ratelimit-remaining') === '0';
}

export function retryAfterFromRateLimitHeaders(headers: HttpHeaders, now: () => number = Date.now): number | undefined {
	const retryAfter = Number(readHeader(headers, 'retry-after'));
	if (Number.isFinite(retryAfter) && retryAfter > 0) {
		return retryAfter * 1000;
	}
	const reset = Number(readHeader(headers, 'x-ratelimit-reset'));
	if (Number.isFinite(reset) && reset > 0) {
		return Math.max(0, reset * 1000 - now());
	}
	return undefined;
}

/** HTTP header names are case insensitive, but not every headers implementation normalises them. */
function readHeader(headers: HttpHeaders, lowerCaseName: string): string | undefined {
	const canonical = lowerCaseName.replace(/(^|-)([a-z])/g, (_, separator: string, char: string) => separator + char.toUpperCase());
	return headers.get(lowerCaseName) ?? headers.get(canonical) ?? undefined;
}
