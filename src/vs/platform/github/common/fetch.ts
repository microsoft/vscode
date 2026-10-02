/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { RequestFetch } from './types.js';

export const IGitHubFetchService = createDecorator<IGitHubFetchService>('gitHubFetchService');

/** Single-attempt networking; the engine owns retries, redirects, deadlines and response limits. */
export interface IGitHubFetchService {
	readonly _serviceBrand: undefined;
	readonly egress: 'browser' | 'node';
	readonly fetch: RequestFetch;
}

export function createFetchRequest(input: string | URL | Request, init?: RequestInit): Request {
	const request = new Request(input, { ...init, redirect: 'manual', credentials: 'omit' });
	validateFetchUrl(request.url);
	return request;
}

function validateFetchUrl(value: string): void {
	const url = new URL(value);
	if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
		throw new Error('Fetch requires an HTTP(S) URL without embedded credentials');
	}
}
