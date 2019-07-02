/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { getMediaMime } from 'vs/base/common/mime';

const cacheName = 'vscode-resources';

declare const clients: { get(s: string): Promise<any> };


const _pending = new Map<string, Function>();

export function handleMessageEvent(event: MessageEvent): void {
	const fn = _pending.get(event.data.token);
	if (fn) {
		fn(event.data.data);
		_pending.delete(event.data.token);
	}
}

export async function handleFetchEvent(event: any): Promise<Response | undefined> {

	const url = URI.parse(event.request.url);

	if (url.path !== '/vscode-resources/fetch') {
		return undefined;
	}

	if (!event.clientId) {
		return undefined;
	}

	const cachedValue = await caches.open(cacheName).then(cache => cache.match(event.request));
	if (cachedValue) {
		return cachedValue;
	}

	// console.log('fetch', url.query);
	try {
		const token = generateUuid();
		return new Promise<Response>(async resolve => {

			const handle = setTimeout(() => {
				resolve(new Response(undefined, { status: 500, statusText: 'timeout' }));
				_pending.delete(token);
			}, 5000);

			_pending.set(token, (data: ArrayBuffer) => {
				clearTimeout(handle);
				const res = new Response(data, {
					status: 200,
					headers: { 'Content-Type': getMediaMime(URI.parse(url.query).path) || 'text/plain' }
				});
				caches.open(cacheName).then(cache => {
					cache.put(event.request, res.clone());
					resolve(res);
				});
			});

			const client = await clients.get(event.clientId);
			client.postMessage({ uri: url.query, token });
		});


	} catch (err) {
		console.error(err);
		return new Response(err, { status: 500 });
	}
}

