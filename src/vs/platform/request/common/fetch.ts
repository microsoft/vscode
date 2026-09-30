/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IFetchService = createDecorator<IFetchService>('fetchService');
export const FETCH_CHANNEL_NAME = 'fetch';

/** Local HTTP fetch without application retries, automatic redirects, cookies, or remote fallback. */
export interface IFetchService {
	readonly _serviceBrand: undefined;

	/** The caller owns cancellation, response consumption, byte limits, and redirect handling. */
	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export function createFetchRequest(input: string | URL | Request, init?: RequestInit): Request {
	const request = new Request(input, { ...init, redirect: 'manual', credentials: 'omit' });
	validateFetchUrl(request.url);
	return request;
}

export function validateFetchUrl(value: string): void {
	const url = new URL(value);
	if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
		throw new Error('Fetch requires an HTTP(S) URL without embedded credentials');
	}
}
