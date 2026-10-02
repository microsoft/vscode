/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFetchRequest, IGitHubFetchService } from '../common/fetch.js';
import { RequestFetch } from '../common/types.js';

export class BrowserFetchService implements IGitHubFetchService {

	declare readonly _serviceBrand: undefined;
	readonly egress = 'browser';

	constructor(private readonly fetchImpl: RequestFetch = (input, init) => globalThis.fetch(input, init)) { }

	async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		const request = createFetchRequest(input, init);
		request.signal.throwIfAborted();
		return this.fetchImpl(request);
	}
}
