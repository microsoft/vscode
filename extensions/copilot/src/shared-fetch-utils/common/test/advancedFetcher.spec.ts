/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { composeFetchMiddleware, createAdvancedFetch } from '../advancedFetcher';
import type { FetchMiddleware, HttpFetchFn, HttpHeaders, HttpRequest, HttpResponse, WindowStateProvider } from '../fetchTypes';
import { AuthBlockedError, authBlockedMiddleware } from '../middleware/authBlockedMiddleware';
import { etagMiddleware } from '../middleware/etagMiddleware';
import { ServerBackoffError, serverErrorBackoffMiddleware } from '../middleware/serverErrorBackoffMiddleware';
import { WindowInactiveError, windowActiveMiddleware } from '../middleware/windowActiveMiddleware';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeHeaders(entries: Record<string, string> = {}): HttpHeaders {
	const map = new Map(Object.entries(entries));
	return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

function makeResponse(status: number, headers: Record<string, string> = {}, body: unknown = null): HttpResponse {
	// Normalise header keys to lowercase for realistic behaviour
	const lower: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) {
		lower[k.toLowerCase()] = v;
	}
	const serialized = body !== null ? JSON.stringify(body) : null;
	const bodyStream = serialized !== null
		? new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(serialized));
				controller.close();
			},
		})
		: null;
	return {
		status,
		headers: makeHeaders(lower),
		body: bodyStream,
		async text() { return serialized ?? ''; },
		async json() { return JSON.parse(await this.text()); },
	};
}

function stubFetch(response: HttpResponse): HttpFetchFn {
	return vi.fn<HttpFetchFn>().mockResolvedValue(response);
}

const defaultRequest: HttpRequest = { url: 'https://api.test/data', headers: {} };

// ── etagMiddleware ──────────────────────────────────────────────────────

describe('etagMiddleware', () => {
	it('does not add conditional headers on first request', async () => {
		const inner = stubFetch(makeResponse(200, { 'ETag': '"abc"' }));
		const fetch = etagMiddleware()(inner);

		await fetch(defaultRequest);

		expect(inner).toHaveBeenCalledWith(expect.objectContaining({
			headers: expect.not.objectContaining({ 'If-None-Match': expect.anything() }),
		}));
	});

	it('adds If-None-Match on subsequent requests', async () => {
		const inner = stubFetch(makeResponse(200, { 'ETag': '"abc"' }));
		const fetch = etagMiddleware()(inner);

		await fetch(defaultRequest);

		// Second call should include conditional header
		await fetch(defaultRequest);
		expect(inner).toHaveBeenLastCalledWith(expect.objectContaining({
			headers: expect.objectContaining({ 'If-None-Match': '"abc"' }),
		}));
	});

	it('adds If-Modified-Since on subsequent requests', async () => {
		const inner = stubFetch(makeResponse(200, { 'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT' }));
		const fetch = etagMiddleware()(inner);

		await fetch(defaultRequest);
		await fetch(defaultRequest);

		expect(inner).toHaveBeenLastCalledWith(expect.objectContaining({
			headers: expect.objectContaining({ 'If-Modified-Since': 'Wed, 01 Jan 2025 00:00:00 GMT' }),
		}));
	});

	it('returns cached response on 304', async () => {
		const original = makeResponse(200, { 'ETag': '"v1"' });
		const notModified = makeResponse(304);
		const inner = vi.fn<HttpFetchFn>()
			.mockResolvedValueOnce(original)
			.mockResolvedValueOnce(notModified);

		const fetch = etagMiddleware()(inner);

		const first = await fetch(defaultRequest);
		const second = await fetch(defaultRequest);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200); // cached response returned on 304
	});

	it('updates cache on new 200 response', async () => {
		const v1 = makeResponse(200, { 'ETag': '"v1"' });
		const v2 = makeResponse(200, { 'ETag': '"v2"' });
		const inner = vi.fn<HttpFetchFn>()
			.mockResolvedValueOnce(v1)
			.mockResolvedValueOnce(v2);

		const fetch = etagMiddleware()(inner);

		await fetch(defaultRequest);
		const second = await fetch(defaultRequest);

		expect(second.status).toBe(200);
	});
});

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

// ── windowActiveMiddleware ──────────────────────────────────────────────

describe('windowActiveMiddleware', () => {
	it('calls next when window is active', async () => {
		const provider: WindowStateProvider = { isActive: true };
		const inner = stubFetch(makeResponse(200));
		const fetch = windowActiveMiddleware(provider)(inner);

		const result = await fetch(defaultRequest);
		expect(result.status).toBe(200);
		expect(inner).toHaveBeenCalledTimes(1);
	});

	it('throws WindowInactiveError when window is inactive', async () => {
		const provider: WindowStateProvider = { isActive: false };
		const inner = stubFetch(makeResponse(200));
		const fetch = windowActiveMiddleware(provider)(inner);

		await expect(fetch(defaultRequest)).rejects.toThrow(WindowInactiveError);
		expect(inner).not.toHaveBeenCalled();
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

// ── createAdvancedFetch ─────────────────────────────────────────────────

describe('createAdvancedFetch', () => {
	it('creates a () => Promise<T> that parses responses', async () => {
		const fetchFn = createAdvancedFetch({
			request: defaultRequest,
			httpFetch: async () => makeResponse(200, {}, { name: 'test' }),
			parseResponse: async (res) => ((await res.json()) as { name: string }).name,
		});

		const result = await fetchFn();
		expect(result).toBe('test');
	});

	it('accepts a request factory function', async () => {
		let callCount = 0;
		const fetchFn = createAdvancedFetch({
			request: () => {
				callCount++;
				return { url: `https://api.test/${callCount}`, headers: { 'X-Count': String(callCount) } };
			},
			httpFetch: async (req) => makeResponse(200, {}, { url: req.url }),
			parseResponse: async (res) => ((await res.json()) as { url: string }).url,
		});

		expect(await fetchFn()).toBe('https://api.test/1');
		expect(await fetchFn()).toBe('https://api.test/2');
	});

	it('applies middleware stack', async () => {
		const provider = { isActive: false };

		const fetchFn = createAdvancedFetch({
			request: defaultRequest,
			httpFetch: async () => makeResponse(200),
			parseResponse: async (res) => res.status,
			middleware: [windowActiveMiddleware(provider)],
		});

		// Inactive → middleware throws
		await expect(fetchFn()).rejects.toThrow(WindowInactiveError);
	});

	it('composes with FetchedValue', async () => {
		// Integration-level smoke test: createAdvancedFetch produces a function
		// compatible with FetchedValue's `fetch` option signature.
		const { FetchedValue } = await import('../fetchedValue');

		const fetchFn = createAdvancedFetch({
			request: defaultRequest,
			httpFetch: async () => makeResponse(999),
			parseResponse: async (res) => res.status,
		});

		const fv = new FetchedValue({
			fetch: fetchFn,
			isStale: () => false,
		});

		expect(fv.value).toBeUndefined();
		const value = await fv.resolve();
		expect(value).toBe(999);
		expect(fv.value).toBe(999);

		fv.dispose();
	});
});

// ── Full-stack integration ──────────────────────────────────────────────

describe('full middleware stack', () => {
	let provider: { isActive: boolean };
	let authedRequest: HttpRequest;
	let inner: ReturnType<typeof vi.fn<HttpFetchFn>>;
	let fetch: (request: HttpRequest) => Promise<HttpResponse>;

	beforeEach(() => {
		provider = { isActive: true };
		authedRequest = { url: 'https://api.test/data', headers: { 'Authorization': 'Bearer tok-1' } };
		inner = vi.fn<HttpFetchFn>().mockResolvedValue(makeResponse(200, { 'ETag': '"v1"' }));

		const composed = composeFetchMiddleware(
			windowActiveMiddleware(provider),
			authBlockedMiddleware(),
			serverErrorBackoffMiddleware({ initialDelayMs: 100 }),
			etagMiddleware(),
		);
		fetch = composed(inner);
	});

	it('happy path passes through all middlewares', async () => {
		const res = await fetch(authedRequest);
		expect(res.status).toBe(200);
		expect(inner).toHaveBeenCalledTimes(1);
	});

	it('window inactive throws WindowInactiveError', async () => {
		// Prime the cache
		await fetch(authedRequest);
		expect(inner).toHaveBeenCalledTimes(1);

		// Become inactive → middleware throws before reaching network
		provider.isActive = false;
		await expect(fetch(authedRequest)).rejects.toThrow(WindowInactiveError);
		expect(inner).toHaveBeenCalledTimes(1); // no additional call
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
