/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Listen for messages from clients.
const resolvedPaths = new Map();

self.addEventListener('message', (event) => {
	switch (event.data.channel) {
		case 'loaded-resource':
			{
				const data = event.data.data;
				const target = resolvedPaths.get(data.path);
				if (!target) {
					console.log('Loaded unknown resource', data.path);
					return;
				}

				if (data.status === 200) {
					target.resolve(new Response(data.data, {
						status: 200,
						headers: { 'Content-Type': data.mime },
					}).clone());
				} else {
					target.resolve(new Response('Not Found', {
						status: 404,
					}).clone());
				}
			}
			return;
	}
});

var clients;
const resourceRoot = '/vscode-resource';

self.addEventListener('fetch', (event) => {
	const requestUrl = new URL(event.request.url);

	if (!requestUrl.pathname.startsWith(resourceRoot + '/')) {
		return event.respondWith(fetch(event.request));
	}

	event.respondWith((async () => {
		const resourcePath = requestUrl.pathname.replace(resourceRoot, '');

		const existing = resolvedPaths.get(resourcePath);
		if (existing) {
			return existing.promise.then(r => r.clone());
		}

		const allClients = await clients.matchAll({
			includeUncontrolled: true
		});

		for (const client of allClients) {
			const clientUrl = new URL(client.url);
			if (clientUrl.pathname === '/') {
				client.postMessage({
					channel: 'load-resource',
					path: resourcePath
				});

				if (resolvedPaths.has(resourcePath)) {
					// Someone else added it in the mean time
					return resolvedPaths.get(resolvedPaths).promise;
				}

				let resolve;
				const promise = new Promise(r => resolve = r);
				resolvedPaths.set(resourcePath, { resolve, promise });
				return promise.then(r => r.clone());
			}
		}
	})());
});

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting()); // Activate worker immediately
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim()); // Become available to all pages
});
