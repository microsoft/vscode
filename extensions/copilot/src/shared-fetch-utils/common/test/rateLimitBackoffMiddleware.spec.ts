/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import type { HttpHeaders, HttpRequest, HttpResponse } from '../fetchTypes';
import { RateLimitBackoffError, rateLimitBackoffMiddleware } from '../middleware/rateLimitBackoffMiddleware';

function makeHeaders(entries: Record<string, string> = {}): HttpHeaders {
	const map = new Map(Object.entries(entries).map(([key, value]) => [key.toLowerCase(), value]));
	return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

function makeResponse(status: number, headers: Record<string, string> = {}): HttpResponse {
	return {
		status,
		headers: makeHeaders(headers),
		body: null,
		async text() { return ''; },
		async json() { return {}; },
	};
}

const request: HttpRequest = { url: 'https://api.github.com/example', headers: {} };

describe('rateLimitBackoffMiddleware', () => {
	let now: number;
	let calls: number;

	beforeEach(() => {
		now = Date.UTC(2026, 0, 1);
		calls = 0;
	});

	/** Wires the middleware around a stub that always returns the given response. */
	function withResponse(response: HttpResponse) {
		return rateLimitBackoffMiddleware({ now: () => now })(async () => {
			calls++;
			return response;
		});
	}

	async function expectBlocked(fetchFn: (request: HttpRequest) => Promise<HttpResponse>): Promise<number> {
		try {
			await fetchFn(request);
			throw new Error('expected the request to be blocked');
		} catch (err) {
			expect(err).toBeInstanceOf(RateLimitBackoffError);
			return (err as RateLimitBackoffError).retryAfterMs;
		}
	}

	it('passes successful responses straight through', async () => {
		const fetchFn = withResponse(makeResponse(200));

		expect((await fetchFn(request)).status).toBe(200);
	});

	it('leaves a plain 403 alone so auth failures are not mistaken for rate limits', async () => {
		const fetchFn = withResponse(makeResponse(403));

		expect((await fetchFn(request)).status).toBe(403);
	});

	it('blocks further requests after a 429 and honours retry-after', async () => {
		const fetchFn = withResponse(makeResponse(429, { 'retry-after': '120' }));

		const firstDelay = await expectBlocked(fetchFn);
		// The second attempt is refused locally, without reaching the server.
		const callsAfterBlock = calls;
		await expectBlocked(fetchFn);

		expect({ firstDelay, callsAfterBlock, callsNow: calls }).toEqual({ firstDelay: 120_000, callsAfterBlock: 1, callsNow: 1 });
	});

	it('treats an exhausted quota 403 as a rate limit and waits for the reset', async () => {
		const resetEpochSeconds = Math.floor((now + 10 * 60_000) / 1000);
		const fetchFn = withResponse(makeResponse(403, {
			'x-ratelimit-remaining': '0',
			'x-ratelimit-reset': String(resetEpochSeconds)
		}));

		const delay = await expectBlocked(fetchFn);

		// Still blocked partway through the window, allowed through once it passes.
		now += 5 * 60_000;
		await expectBlocked(fetchFn);
		const callsDuringWindow = calls;

		now += 6 * 60_000;
		await expectBlocked(fetchFn);

		expect({ delay, callsDuringWindow, callsAfterWindow: calls }).toEqual({ delay: 10 * 60_000, callsDuringWindow: 1, callsAfterWindow: 2 });
	});

	it('backs off exponentially when the server sends no hint', async () => {
		const fetchFn = withResponse(makeResponse(429));

		const delays: number[] = [];
		for (let attempt = 0; attempt < 3; attempt++) {
			delays.push(await expectBlocked(fetchFn));
			now += delays[delays.length - 1];
		}

		expect(delays).toEqual([60_000, 120_000, 240_000]);
	});

	it('caps the server hint so a bogus retry-after cannot stall the client', async () => {
		const fetchFn = rateLimitBackoffMiddleware({ maxDelayMs: 600_000, now: () => now })(async () => {
			calls++;
			return makeResponse(429, { 'retry-after': '86400' });
		});

		expect(await expectBlocked(fetchFn)).toBe(600_000);
	});

	it('keeps a newer block when an older successful response lands afterwards', async () => {
		let releaseSlowResponse = () => { };
		const slowResponse = new Promise<void>(resolve => { releaseSlowResponse = resolve; });
		let isFirstCall = true;
		const fetchFn = rateLimitBackoffMiddleware({ now: () => now })(async () => {
			calls++;
			if (isFirstCall) {
				isFirstCall = false;
				await slowResponse;
				return makeResponse(200);
			}
			return makeResponse(429, { 'retry-after': '120' });
		});

		// A slow success is still in flight when a second request is rate limited.
		const inFlight = fetchFn(request);
		await expectBlocked(fetchFn);
		releaseSlowResponse();
		await inFlight;

		// The block established by the newer 429 must survive the older success.
		const delayAfterSuccess = await expectBlocked(fetchFn);

		expect({ delayAfterSuccess, calls }).toEqual({ delayAfterSuccess: 120_000, calls: 2 });
	});

	it('resets the backoff once a request succeeds', async () => {
		let status = 429;
		const fetchFn = rateLimitBackoffMiddleware({ now: () => now })(async () => {
			calls++;
			return makeResponse(status);
		});

		await expectBlocked(fetchFn);
		now += 60_000;

		status = 200;
		await fetchFn(request);

		// Back to the initial delay rather than continuing to double.
		status = 429;
		expect(await expectBlocked(fetchFn)).toBe(60_000);
	});
});
