/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FetchMiddleware, HttpFetchFn, HttpRequest, HttpResponse } from './fetchTypes';

/**
 * Composes an array of middlewares into a single middleware. Middlewares
 * execute left-to-right: the first element wraps the outermost layer.
 *
 * ```
 * composeFetchMiddleware(a, b, c)(httpFetch)
 * // equivalent to: a(b(c(httpFetch)))
 * ```
 */
export function composeFetchMiddleware(...middlewares: readonly FetchMiddleware[]): FetchMiddleware {
	return (baseFetch) => middlewares.reduceRight<HttpFetchFn>((next, mw) => mw(next), baseFetch);
}

// ── Factory ─────────────────────────────────────────────────────────────

export interface AdvancedFetchOptions<T> {
	/**
	 * The HTTP request to send. May be a static object, a synchronous
	 * factory, or an async factory (useful when headers depend on runtime
	 * state such as an auth token).
	 */
	readonly request: HttpRequest | (() => HttpRequest | Promise<HttpRequest>);

	/**
	 * The underlying HTTP transport. Callers typically bridge their own
	 * `IFetcherService` here.
	 */
	readonly httpFetch: HttpFetchFn;

	/**
	 * Extracts the domain value `T` from a successful HTTP response.
	 */
	readonly parseResponse: (response: HttpResponse) => Promise<T>;

	/**
	 * Middleware applied around the HTTP fetch in the order listed (first
	 * middleware is outermost).
	 */
	readonly middleware?: readonly FetchMiddleware[];
}

/**
 * Creates a `() => Promise<T>` suitable for passing as the `fetch` option
 * of {@link FetchedValue}.
 *
 * @example
 * ```ts
 * const fetchConfig = createAdvancedFetch<ConfigType>({
 *     request: { url: 'https://api.example.com/config', headers: {} },
 *     httpFetch: async (req) => {
 *         const res = await fetcherService.fetch(req.url, {
 *             callSite: 'configFetch',
 *             headers: req.headers,
 *         });
 *         return { status: res.status, headers: res.headers, body: res.body, json: () => res.json(), text: () => res.text() };
 *     },
 *     parseResponse: async (res) => await res.json() as ConfigType,
 *     middleware: [
 *         windowActiveMiddleware(envService),
 *         etagMiddleware(),
 *         authBlockedMiddleware(),
 *         serverErrorBackoffMiddleware(),
 *     ],
 * });
 *
 * const config = new FetchedValue({
 *     fetch: fetchConfig,
 *     isStale: (c) => c.lastUpdated < Date.now() - 60_000,
 * });
 * ```
 */
export function createAdvancedFetch<T>(options: AdvancedFetchOptions<T>): () => Promise<T> {
	const { httpFetch, parseResponse, middleware = [] } = options;
	const composedFetch = composeFetchMiddleware(...middleware)(httpFetch);

	return async () => {
		const request = typeof options.request === 'function' ? await options.request() : options.request;
		const response = await composedFetch(request);
		return parseResponse(response);
	};
}
