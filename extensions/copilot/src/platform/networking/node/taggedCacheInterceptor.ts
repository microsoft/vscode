/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as undici from 'undici';

/**
 * Internal response header stamped by {@link taggedCacheInterceptor} so the
 * fetcher can attribute a response to the cache for telemetry purposes.
 */
export const VSCODE_CACHE_STATUS_HEADER = 'x-vscode-cache-status';

export type CacheStatus = 'hit' | 'stale-hit' | 'revalidated' | 'miss';

/**
 * Wraps undici's built-in `interceptors.cache(...)` and stamps the served
 * response with {@link VSCODE_CACHE_STATUS_HEADER} so downstream code can
 * tell whether the response came from the cache without relying on header
 * heuristics.
 *
 * Detection is based on observing whether the cache interceptor invoked the
 * downstream dispatcher for a given request and whether it added conditional
 * revalidation headers — both of which are deterministic for a given code
 * path in `undici/lib/interceptor/cache.js`.
 */
export function taggedCacheInterceptor(
	cacheOpts: Parameters<typeof undici.interceptors.cache>[0],
): undici.Dispatcher.DispatcherComposeInterceptor {
	const cacheInterceptor = undici.interceptors.cache(cacheOpts);

	return (dispatch) => (opts, handler) => {
		const state = { networkCalled: false, conditional: false };

		const countingDispatch: typeof dispatch = (dOpts, dHandler) => {
			state.networkCalled = true;
			const h = dOpts.headers as Record<string, string> | undefined;
			state.conditional = !!(h && (h['if-modified-since'] || h['if-none-match']));
			return dispatch(dOpts, dHandler);
		};

		const taggingHandler = new Proxy(handler, {
			get(target, prop, receiver) {
				if (prop === 'onResponseStart') {
					return (
						controller: Parameters<NonNullable<undici.Dispatcher.DispatchHandler['onResponseStart']>>[0],
						statusCode: number,
						headers: unknown,
						statusMessage?: string,
					) => {
						const status = classify(state, headers);
						stampStatus(headers, status);
						const orig = Reflect.get(target, prop, receiver) as undici.Dispatcher.DispatchHandler['onResponseStart'];
						return orig?.call(target, controller, statusCode, headers as Parameters<NonNullable<undici.Dispatcher.DispatchHandler['onResponseStart']>>[2], statusMessage);
					};
				}
				const value = Reflect.get(target, prop, receiver);
				return typeof value === 'function' ? value.bind(target) : value;
			},
		}) as undici.Dispatcher.DispatchHandler;

		return cacheInterceptor(countingDispatch)(opts, taggingHandler);
	};
}

function classify(
	state: { networkCalled: boolean; conditional: boolean },
	headers: unknown,
): CacheStatus {
	if (!state.networkCalled) {
		return isStaleWarning(headers) ? 'stale-hit' : 'hit';
	}
	if (state.conditional) {
		return 'revalidated';
	}
	return 'miss';
}

function isStaleWarning(headers: unknown): boolean {
	const value = readHeader(headers, 'warning');
	return typeof value === 'string' && value.startsWith('110');
}

function readHeader(headers: unknown, name: string): string | undefined {
	if (!headers || typeof headers !== 'object') {
		return undefined;
	}
	const value = (headers as Record<string, unknown>)[name];
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value) && typeof value[0] === 'string') {
		return value[0];
	}
	return undefined;
}

function stampStatus(headers: unknown, status: CacheStatus): void {
	if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
		(headers as Record<string, string>)[VSCODE_CACHE_STATUS_HEADER] = status;
	}
}
