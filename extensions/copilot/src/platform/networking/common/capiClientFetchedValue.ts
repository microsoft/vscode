/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MakeRequestOptions, RequestMetadata } from '@vscode/copilot-api';
import { createAdvancedFetch } from '../../../shared-fetch-utils/common/advancedFetcher';
import type { HttpResponse } from '../../../shared-fetch-utils/common/fetchTypes';
import { FetchedValue } from '../../../shared-fetch-utils/common/fetchedValue';
import { authBlockedMiddleware } from '../../../shared-fetch-utils/common/middleware/authBlockedMiddleware';
import { etagMiddleware } from '../../../shared-fetch-utils/common/middleware/etagMiddleware';
import { serverErrorBackoffMiddleware } from '../../../shared-fetch-utils/common/middleware/serverErrorBackoffMiddleware';
import type { ICAPIClientService } from '../../endpoint/common/capiClient';
import type { IEnvService } from '../../env/common/envService';

export interface CapiClientFetchedValueOptions<T> {
	/**
	 * The request options passed to {@link ICAPIClientService.makeRequest}.
	 */
	readonly request: (() => MakeRequestOptions | Promise<MakeRequestOptions>);

	/**
	 * Metadata for the CAPI request (e.g. {@link RequestType}).
	 */
	readonly requestMetadata: RequestMetadata;

	/**
	 * Extracts the domain value `T` from the HTTP response.
	 *
	 * `body` is the JSON-parsed object on success, the raw response text
	 * when the body is not valid JSON (e.g. error pages), or `undefined`
	 * when the response has no body (e.g. 204, 304 handled by etag cache).
	 */
	readonly parseResponse: (response: HttpResponse) => Promise<T>;

	/**
	 * Determines whether the current cached value is stale and should be
	 * re-fetched. Passed through to {@link FetchedValueOptions.isStale}.
	 */
	readonly isStale: (value: T) => boolean;

	/**
	 * When `true`, automatically resolves once per minute to keep the cache
	 * hot. Passed through to {@link FetchedValueOptions.keepCacheHot}.
	 */
	readonly keepCacheHot?: boolean;
}

/**
 * Creates a {@link FetchedValue} that fetches via
 * {@link ICAPIClientService.makeRequest} with the full advanced-fetcher
 * middleware stack applied.
 *
 * This is the recommended way to create periodically-refreshed cached
 * values backed by CAPI endpoints.
 *
 * @example
 * ```ts
 * const config = createCapiClientFetchedValue(capiClientService, envService, {
 *     request: async () => ({
 *         headers: { Authorization: `Bearer ${await getToken()}` },
 *         method: 'POST',
 *         json: { key: 'value' },
 *     }),
 *     requestMetadata: { type: RequestType.CopilotToken },
 *     isStale: (c) => c.expiresAt < Date.now(),
 * });
 *
 * const fresh = await config.resolve();
 * ```
 */
export function createCapiClientFetchedValue<T>(
	capiClientService: ICAPIClientService,
	envService: IEnvService,
	options: CapiClientFetchedValueOptions<T>,
): FetchedValue<T> {
	const {
		request,
		requestMetadata,
		parseResponse,
		isStale,
		keepCacheHot,
	} = options;

	const fetch = createAdvancedFetch<T>({
		request: async () => {
			const currentRequestOpts = await request();
			return {
				url: `capi:${requestMetadata.type}`,
				headers: currentRequestOpts.headers ?? {},
				method: currentRequestOpts.method ?? 'GET',
				state: currentRequestOpts
			};
		},
		httpFetch: async (httpRequest) => {
			const response = await capiClientService.makeRequest<Response>({
				...(httpRequest.state ?? {}),
				method: httpRequest.method,
				// Use the headers from the middleware pipeline (may include
				// If-None-Match, If-Modified-Since, etc.)
				headers: httpRequest.headers,
			}, requestMetadata);

			return response;
		},
		parseResponse,
		middleware: [
			etagMiddleware(),
			authBlockedMiddleware(),
			serverErrorBackoffMiddleware(),
		],
	});

	return new FetchedValue<T>({
		fetch,
		isStale,
		keepCacheHot,
	});
}
