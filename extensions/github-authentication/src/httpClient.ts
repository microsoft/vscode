/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHttpClient, IHttpRequest, IHttpResponse } from './common/http';
import { Log } from './common/logger';
import { fetching } from './node/fetch';

/**
 * The real client. Lives outside `common` because the fetcher it wraps is platform specific: the
 * web build swaps `node/fetch` for `browser/fetch` underneath it.
 */
export class FetchHttpClient implements IHttpClient {

	constructor(private readonly _logger: Log) { }

	async send({ url, method, headers, body, retryFallbacks }: IHttpRequest): Promise<IHttpResponse> {
		const response = await fetching(url, {
			logger: this._logger,
			retryFallbacks,
			expectJSON: true,
			method,
			headers,
			body
		});
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			json: () => response.json()
		};
	}
}
