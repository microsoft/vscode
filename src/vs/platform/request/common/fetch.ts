/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Creates an HTTP fetch with manual redirects and no ambient origin credentials. */
export function createFetch(fetchImpl: (request: Request) => Promise<Response> = request => globalThis.fetch(request)): typeof globalThis.fetch {
	return async (input, init) => {
		const request = new Request(input, { ...init, redirect: 'manual', credentials: 'omit' });
		const url = new URL(request.url);
		if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
			throw new Error('Fetch requires an HTTP(S) URL without embedded credentials');
		}
		request.signal.throwIfAborted();
		return fetchImpl(request);
	};
}
