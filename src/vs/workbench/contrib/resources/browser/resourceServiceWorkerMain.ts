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
		event.respondWith(handlerPromise.then(handler => {
			return handler.handleFetchEvent(event).then(value => {
				if (value instanceof Response) {
					return value;
				} else {
					return fetch(event.request);
				}
			});
		}));
	});
	self.addEventListener('install', event => {
		//@ts-ignore
		event.waitUntil(self.skipWaiting());
	});

	self.addEventListener('activate', event => {
		//@ts-ignore
		event.waitUntil(self.clients.claim()); // Become available to all pages
	});
})();
