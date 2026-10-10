/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FetchFunction } from '../../common/githubTransport.js';

export const nodeFetch: FetchFunction = async (input, init) => {
	const http = await import('http');
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const body = init?.body;
	if (body !== undefined && body !== null && typeof body !== 'string') {
		return Promise.reject(new Error('Agent Host GitHub tests only support string fetch request bodies'));
	}
	if (new URL(url).protocol !== 'http:') {
		return Promise.reject(new Error('Agent Host GitHub tests only support HTTP loopback requests'));
	}
	if (init?.signal?.aborted) {
		return Promise.reject(init.signal.reason);
	}
	return new Promise<Response>((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) {
				return;
			}
			settled = true;
			init?.signal?.removeEventListener('abort', onAbort);
			callback();
		};
		const request = http.request(url, {
			method: init?.method,
			headers: init?.headers === undefined ? undefined : Object.fromEntries(new Headers(init.headers)),
		}, response => {
			const chunks: Buffer[] = [];
			response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
			response.on('aborted', () => finish(() => reject(new Error('Loopback response was aborted'))));
			response.on('error', error => finish(() => reject(error)));
			response.on('end', () => {
				if (!response.complete) {
					finish(() => reject(new Error('Loopback response ended before it was complete')));
					return;
				}
				const headers = new Headers();
				for (const [name, value] of Object.entries(response.headers)) {
					for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
						headers.append(name, item);
					}
				}
				const responseBody = Buffer.concat(chunks);
				finish(() => resolve(new Response(responseBody.length === 0 ? null : new Uint8Array(responseBody), {
					status: response.statusCode,
					statusText: response.statusMessage,
					headers,
				})));
			});
		});
		const onAbort = () => {
			request.destroy();
			finish(() => reject(init?.signal?.reason));
		};
		init?.signal?.addEventListener('abort', onAbort, { once: true });
		request.on('error', error => finish(() => reject(init?.signal?.aborted ? init.signal.reason : error)));
		if (body !== undefined && body !== null) {
			request.write(body);
		}
		request.end();
	});
};
