/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { getMediaMime } from 'vs/base/common/mime';

//https://stackoverflow.com/questions/56356655/structuring-a-typescript-project-with-workers/56374158#56374158
declare var self: ServiceWorkerGlobalScope;

//#region --- installing/activating

self.addEventListener('install', event => {
	event.waitUntil((async () => {
		await caches.delete(_cacheName); // delete caches with each new version
		await self.skipWaiting();
	}));
});

self.addEventListener('activate', event => {
	event.waitUntil((async () => {
		// (1) enable navigation preloads!
		// (2) become available to all pages
		if (self.registration.navigationPreload) {
			await self.registration.navigationPreload.enable();
		}
		await self.clients.claim();
	})());
});

//#endregion

//#region --- fetching/caching

const _cacheName = 'vscode-resources';
const _resourcePrefix = '/vscode-resources/fetch';
const _pendingFetch = new Map<string, Function>();

self.addEventListener('message', event => {
	const fn = _pendingFetch.get(event.data.token);
	if (fn) {
		fn(event.data.data, event.data.isExtensionResource);
		_pendingFetch.delete(event.data.token);
	}
});

self.addEventListener('fetch', async (event: FetchEvent) => {

	const uri = URI.parse(event.request.url);
	if (uri.path !== _resourcePrefix) {
		// not a /vscode-resources/fetch-url and therefore
		// not (yet?) interesting for us
		event.respondWith(respondWithDefault(event));
		return;
	}

	event.respondWith(respondWithResource(event, uri));
});

async function respondWithDefault(event: FetchEvent): Promise<Response> {
	return await event.preloadResponse || await fetch(event.request);
}

async function respondWithResource(event: FetchEvent, uri: URI): Promise<Response> {
	const cachedValue = await caches.open(_cacheName).then(cache => cache.match(event.request));
	if (cachedValue) {
		return cachedValue;
	}

	return new Promise<Response>(resolve => {

		const token = generateUuid();
		const resourceUri = URI.parse(uri.query);

		_pendingFetch.set(token, async (data: ArrayBuffer, isExtensionResource: boolean) => {

			const res = new Response(data, {
				status: 200,
				headers: { 'Content-Type': getMediaMime(resourceUri.path) || 'text/plain' }
			});

			if (isExtensionResource) {
				// only cache extension resources but not other
				// resources, esp not workspace resources
				await caches.open(_cacheName).then(cache => cache.put(event.request, res.clone()));
			}

			return resolve(res);
		});

		self.clients.get(event.clientId).then(client => {
			client.postMessage({ uri: resourceUri, token });
		});
	});
}

//#endregion
