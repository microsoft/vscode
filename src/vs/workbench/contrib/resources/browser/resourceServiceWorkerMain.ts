/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {

	type Handler = {
		handleFetchEvent(event: Event): void;
	};
	let handler: Handler | undefined;

	self.addEventListener('fetch', event => {
		console.log('FETCH', event);
		if (handler) {
			handler.handleFetchEvent(event);
		} else {
			//@ts-ignore
			event.respondWith(fetch(event.request));
		}
	});
	self.addEventListener('install', event => {

		let loadPromise = new Promise((resolve, reject) => {

			// load loader
			const monacoBaseUrl = '../../../../../';
			importScripts(monacoBaseUrl + 'vs/loader.js');
			require.config({
				baseUrl: monacoBaseUrl,
				catchError: true
			});

			require(['vs/workbench/contrib/resources/browser/resourceServiceWorker'], module => {
				handler = module;
				resolve();
			}, reject);
		});

		//@ts-ignore
		event.waitUntil(Promise.all([loadPromise, self.skipWaiting()]));
	});

	self.addEventListener('activate', event => {
		//@ts-ignore
		event.waitUntil(self.clients.claim()); // Become available to all pages
	});
})();
