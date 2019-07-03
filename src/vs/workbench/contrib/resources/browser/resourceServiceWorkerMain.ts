/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {
	type Handler = {
		handleFetchEvent(event: Event): Promise<Response | undefined>;
		handleMessageEvent(event: MessageEvent): void;
	};

	const handlerPromise = new Promise<Handler>((resolve, reject) => {
		// load loader
		const baseUrl = '../../../../../';
		importScripts(baseUrl + 'vs/loader.js');
		require.config({
			baseUrl,
			catchError: true
		});
		require(['vs/workbench/contrib/resources/browser/resourceServiceWorker'], resolve, reject);
	});

	self.addEventListener('message', event => {
		handlerPromise.then(handler => {
			handler.handleMessageEvent(event);
		});
	});

	self.addEventListener('fetch', (event: any) => {
		event.respondWith(handlerPromise.then(async handler => {
			// try handler
			const value = await handler.handleFetchEvent(event);
			if (value instanceof Response) {
				return value;
			}
			// try the network (prefetch or fetch)
			const res = await event.preloadResponse;
			if (res) {
				return res;
			} else {
				return fetch(event.request);
			}
		}));
	});
	self.addEventListener('install', (event: any) => {
		event.waitUntil((self as any).skipWaiting());
	});

	self.addEventListener('activate', (event: any) => {

		event.waitUntil((async () => {
			await (self as any).registration.navigationPreload.enable(); // Enable navigation preloads!
			await (self as any).clients.claim(); // Become available to all pages
		})());
	});
})();
