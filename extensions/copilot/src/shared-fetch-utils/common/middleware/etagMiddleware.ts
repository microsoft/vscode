/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FetchMiddleware, HttpResponse } from '../fetchTypes';
import { cloneResponse } from '../httpResponse';

/**
 * Adds `If-None-Match` / `If-Modified-Since` conditional request headers
 * and transparently handles `304 Not Modified` responses by returning the
 * previously cached response body.
 */
export function etagMiddleware(): FetchMiddleware {
	let cachedEtag: string | undefined;
	let cachedLastModified: string | undefined;
	let cachedResponse: HttpResponse | undefined;

	return (next) => async (request) => {
		if (request.method && request.method.toUpperCase() !== 'GET') {
			return next(request);
		}

		const headers = { ...request.headers };
		if (cachedEtag) {
			headers['If-None-Match'] = cachedEtag;
		}
		if (cachedLastModified) {
			headers['If-Modified-Since'] = cachedLastModified;
		}

		const response = await next({ ...request, headers });

		if (response.status === 304 && cachedResponse) {
			const [returnCopy, keepCopy] = cloneResponse(cachedResponse);
			cachedResponse = keepCopy;
			return returnCopy;
		}

		const etag = response.headers.get('etag') ?? undefined;
		const lastModified = response.headers.get('last-modified') ?? undefined;
		if (etag) {
			cachedEtag = etag;
		}
		if (lastModified) {
			cachedLastModified = lastModified;
		}

		// Only clone and cache when the server provided conditional headers,
		// otherwise there is no point paying the cost of cloning the stream.
		if (etag || lastModified) {
			const [returnCopy, cacheCopy] = cloneResponse(response);
			cachedResponse = cacheCopy;
			return returnCopy;
		}

		return response;
	};
}
