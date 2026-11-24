/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { composeFetchMiddleware } from '../advancedFetcher';
import type { FetchMiddleware, HttpFetchFn, HttpRequest, HttpResponse } from '../fetchTypes';
import { AuthBlockedError, authBlockedMiddleware } from '../middleware/authBlockedMiddleware';
import { ServerBackoffError, serverErrorBackoffMiddleware } from '../middleware/serverErrorBackoffMiddleware';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeResponse(status: number): HttpResponse {
	return {
		status,
		headers: { get: () => null },
		body: null,
		async text() { return ''; },
		async json() { return JSON.parse(await this.text()); },
	};
}

function stubFetch(response: HttpResponse): HttpFetchFn {
	return vi.fn<HttpFetchFn>().mockResolvedValue(response);
}

const defaultRequest: HttpRequest = { url: 'https://api.test/data', headers: {} };

// ── authBlockedMiddleware ─────────────────────────────────────────────

describe('authBlockedMiddleware', () => {
	const authedRequest: HttpRequest = { url: 'https://api.test/data', headers: { 'Authorization': 'Bearer token-a' } };

	it('allows requests normally', async () => {
		const inner = stubFetch(makeResponse(200));
		const fetch = authBlockedMiddleware()(inner);

		const result = await fetch(authedRequest);
		expect(result.status).toBe(200);
	});

	it('throws AuthBlockedError after 401', async () => {
		const inner = stubFetch(makeResponse(401));
		const fetch = authBlockedMiddleware()(inner);

		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);
	});

	it('throws AuthBlockedError after 403', async () => {
		const inner = stubFetch(makeResponse(403));
		const fetch = authBlockedMiddleware()(inner);

		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);
	});

	it('blocks subsequent requests with same token after blocking', async () => {
		const inner = vi.fn<HttpFetchFn>()
			.mockResolvedValueOnce(makeResponse(401))
			.mockResolvedValueOnce(makeResponse(200));
		const fetch = authBlockedMiddleware(60_000)(inner);

		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);

		// Subsequent request with same token should be blocked without calling inner
		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);
		expect(inner).toHaveBeenCalledTimes(1);
	});

	it('clears block when token changes', async () => {
		const inner = vi.fn<HttpFetchFn>()
			.mockResolvedValueOnce(makeResponse(401))
			.mockResolvedValueOnce(makeResponse(200));
		const fetch = authBlockedMiddleware(60_000)(inner);

		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);

		// Change token → block should clear
		const newTokenRequest: HttpRequest = { url: 'https://api.test/data', headers: { 'Authorization': 'Bearer token-new' } };
		const result = await fetch(newTokenRequest);
		expect(result.status).toBe(200);
		expect(inner).toHaveBeenCalledTimes(2);
	});

	it('clears block after duration expires', async () => {
		const inner = vi.fn<HttpFetchFn>()
			.mockResolvedValueOnce(makeResponse(401))
			.mockResolvedValueOnce(makeResponse(200));
		const fetch = authBlockedMiddleware(100)(inner);

		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);

		vi.useFakeTimers();
		try {
			vi.advanceTimersByTime(150);
			// Block expired → request should proceed
			const result = await fetch(authedRequest);
			expect(result.status).toBe(200);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not block when there is no Authorization header', async () => {
		const inner = stubFetch(makeResponse(401));
		const fetch = authBlockedMiddleware()(inner);

		// No Authorization header → middleware passes through the response
		const result = await fetch(defaultRequest);
		expect(result.status).toBe(401);
	});
});

// ── serverErrorBackoffMiddleware ────────────────────────────────────────

describe('serverErrorBackoffMiddleware', () => {
	it('allows requests normally on success', async () => {
		const inner = stubFetch(makeResponse(200));
		const fetch = serverErrorBackoffMiddleware()(inner);

		const result = await fetch(defaultRequest);
		expect(result.status).toBe(200);
	});

	it('throws ServerBackoffError on 500', async () => {
		const inner = stubFetch(makeResponse(500));
		const fetch = serverErrorBackoffMiddleware({ initialDelayMs: 100 })(inner);

		await expect(fetch(defaultRequest)).rejects.toThrow(ServerBackoffError);
	});

	it('blocks subsequent requests during backoff window', async () => {
		const inner = vi.fn<HttpFetchFn>()
			.mockResolvedValueOnce(makeResponse(503))
			.mockResolvedValueOnce(makeResponse(200));
		const fetch = serverErrorBackoffMiddleware({ initialDelayMs: 60_000 })(inner);

		await expect(fetch(defaultRequest)).rejects.toThrow(ServerBackoffError);

		// Within backoff window → blocked without calling inner
		await expect(fetch(defaultRequest)).rejects.toThrow(ServerBackoffError);
		expect(inner).toHaveBeenCalledTimes(1);
	});

	it('applies exponential backoff on consecutive failures', async () => {
		const inner = vi.fn<HttpFetchFn>().mockResolvedValue(makeResponse(500));
		const fetch = serverErrorBackoffMiddleware({ initialDelayMs: 100, multiplier: 2 })(inner);

		vi.useFakeTimers();
		try {
			// First failure → 100ms backoff
			await expect(fetch(defaultRequest)).rejects.toThrow(ServerBackoffError);
			vi.advanceTimersByTime(110);

			// Second failure → 200ms backoff
			await expect(fetch(defaultRequest)).rejects.toThrow(ServerBackoffError);
			vi.advanceTimersByTime(210);

			// Third failure → 400ms backoff
			await expect(fetch(defaultRequest)).rejects.toSatisfy(
				(err: ServerBackoffError) => err.retryAfterMs >= 399,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('caps backoff at maxDelayMs', async () => {
		const inner = vi.fn<HttpFetchFn>().mockResolvedValue(makeResponse(500));
		const fetch = serverErrorBackoffMiddleware({ initialDelayMs: 100, maxDelayMs: 300, multiplier: 10 })(inner);

		vi.useFakeTimers();
		try {
			await expect(fetch(defaultRequest)).rejects.toThrow(ServerBackoffError);
			vi.advanceTimersByTime(110);

			// Second failure → min(100*10, 300) = 300
			await expect(fetch(defaultRequest)).rejects.toSatisfy(
				(err: ServerBackoffError) => err.retryAfterMs <= 300,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('resets backoff on success', async () => {
		const inner = vi.fn<HttpFetchFn>()
			.mockResolvedValueOnce(makeResponse(500))
			.mockResolvedValueOnce(makeResponse(200))
			.mockResolvedValueOnce(makeResponse(500));
		const fetch = serverErrorBackoffMiddleware({ initialDelayMs: 100 })(inner);

		vi.useFakeTimers();
		try {
			await expect(fetch(defaultRequest)).rejects.toThrow(ServerBackoffError);
			vi.advanceTimersByTime(110);

			// Success → resets
			const ok = await fetch(defaultRequest);
			expect(ok.status).toBe(200);

			// Next 500 → starts at initialDelayMs again
			await expect(fetch(defaultRequest)).rejects.toSatisfy(
				(err: ServerBackoffError) => err.retryAfterMs <= 100,
			);
		} finally {
			vi.useRealTimers();
		}
	});
});

// ── composeFetchMiddleware ──────────────────────────────────────────────

describe('composeFetchMiddleware', () => {
	it('composes middlewares left-to-right (first = outermost)', async () => {
		const order: string[] = [];

		const mwA: FetchMiddleware = (next) => async (req) => {
			order.push('a-before');
			const res = await next(req);
			order.push('a-after');
			return res;
		};
		const mwB: FetchMiddleware = (next) => async (req) => {
			order.push('b-before');
			const res = await next(req);
			order.push('b-after');
			return res;
		};

		const inner = stubFetch(makeResponse(200));
		const fetch = composeFetchMiddleware(mwA, mwB)(inner);

		await fetch(defaultRequest);

		expect(order).toEqual(['a-before', 'b-before', 'b-after', 'a-after']);
	});

	it('identity when no middlewares are provided', async () => {
		const inner = stubFetch(makeResponse(200));
		const fetch = composeFetchMiddleware()(inner);

		const result = await fetch(defaultRequest);
		expect(result.status).toBe(200);
	});
});

// ── Full-stack integration ──────────────────────────────────────────────

describe('full middleware stack', () => {
	let authedRequest: HttpRequest;
	let inner: ReturnType<typeof vi.fn<HttpFetchFn>>;
	let fetch: (request: HttpRequest) => Promise<HttpResponse>;

	beforeEach(() => {
		authedRequest = { url: 'https://api.test/data', headers: { 'Authorization': 'Bearer tok-1' } };
		inner = vi.fn<HttpFetchFn>().mockResolvedValue(makeResponse(200));

		const composed = composeFetchMiddleware(
			authBlockedMiddleware(),
			serverErrorBackoffMiddleware({ initialDelayMs: 100 }),
		);
		fetch = composed(inner);
	});

	it('happy path passes through all middlewares', async () => {
		const res = await fetch(authedRequest);
		expect(res.status).toBe(200);
		expect(inner).toHaveBeenCalledTimes(1);
	});

	it('auth failure blocks all further requests until token changes', async () => {
		inner.mockResolvedValueOnce(makeResponse(401));

		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);
		await expect(fetch(authedRequest)).rejects.toThrow(AuthBlockedError);

		const newTokenRequest: HttpRequest = { url: 'https://api.test/data', headers: { 'Authorization': 'Bearer tok-2' } };
		inner.mockResolvedValueOnce(makeResponse(200));
		const res = await fetch(newTokenRequest);
		expect(res.status).toBe(200);
	});
});
