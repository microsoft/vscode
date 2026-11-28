/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FetchMiddleware, HttpFetchFn } from './fetchTypes';

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
