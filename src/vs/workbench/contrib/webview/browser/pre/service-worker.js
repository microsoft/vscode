/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Root path for resources
 */
const resourceRoot = '/vscode-resource';

/**
 * @typedef {{resolve: () => void, promise: Promise<Response> }} ResourcePathEntry
 */

/**
 * Map of requested paths to responses.
 */
const resourceRequestManager = new class ResourceRequestManager {
	constructor() {
		/** @type {Map<string, ResourcePathEntry>} */
		this.map = new Map();
	}

	/**
	 * @param {string} webviewId
	 * @param {string} path
	 * @return {ResourcePathEntry | undefined}
	 */
	get(webviewId, path) {
		return this.map.get(this._key(webviewId, path));
	}

	/**
	 * @param {string} webviewId
	 * @param {string} path
	 * @return {boolean}
	 */
	has(webviewId, path) {
		return this.map.has(this._key(webviewId, path));
	}

	/**
	 * @param {string} webviewId
	 * @param {string} path
	 * @param {ResourcePathEntry} entry
	 */
	set(webviewId, path, entry) {
		this.map.set(this._key(webviewId, path), entry);
	}

	/**
	 * @param {string} webviewId
	 * @param {string} path
	 * @return {string}
	 */
	_key(webviewId, path) {
		return `${webviewId}@@@${path}`;
	}
}();

const notFoundResponse = new Response('Not Found', {
	status: 404,
});

self.addEventListener('message', (event) => {
	switch (event.data.channel) {
		case 'loaded-resource':
			{
				const webviewId = getWebviewIdForClient(event.source);
				const data = event.data.data;
				const target = resourceRequestManager.get(webviewId, data.path);
				if (!target) {
					console.log('Loaded unknown resource', data.path);
					return;
				}

				if (data.status === 200) {
					target.resolve(new Response(data.data, {
						status: 200,
						headers: { 'Content-Type': data.mime },
					}));
				} else {
					target.resolve(notFoundResponse.clone());
				}
				return;
			}
	}

	console.log('Unknown message');
});

self.addEventListener('fetch', (event) => {
	const requestUrl = new URL(event.request.url);

	if (!requestUrl.pathname.startsWith(resourceRoot + '/')) {
		return event.respondWith(fetch(event.request));
	}

	event.respondWith((async () => {
		const client = await self.clients.get(event.clientId);
		if (!client) {
			console.log('Could not find inner client for request');
			return notFoundResponse.clone();
		}

		const webviewId = getWebviewIdForClient(client);
		const resourcePath = requestUrl.pathname.replace(resourceRoot, '');

		const existing = resourceRequestManager.get(webviewId, resourcePath);
		if (existing) {
			return existing.promise.then(r => r.clone());
		}

		const allClients = await self.clients.matchAll({ includeUncontrolled: true });
		if (resourceRequestManager.has(webviewId, resourcePath)) {
			// Someone else added it in the meantime
			return resourceRequestManager.get(resourceRequestManager).promise.then(r => r.clone());
		}

		// Find parent iframe
		for (const client of allClients) {
			const clientUrl = new URL(client.url);
			if (clientUrl.pathname === '/' && clientUrl.search.match(new RegExp('\\bid=' + webviewId))) {
				client.postMessage({
					channel: 'load-resource',
					path: resourcePath
				});

				let resolve;
				const promise = new Promise(r => resolve = r);
				resourceRequestManager.set(webviewId, resourcePath, { resolve, promise });
				return promise.then(r => r.clone());
			}
		}

		console.log('Could not find parent client for request');
		return notFoundResponse.clone();
	})());
});

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting()); // Activate worker immediately
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim()); // Become available to all pages
});


function getWebviewIdForClient(client) {
	const requesterClientUrl = new URL(client.url);
	return requesterClientUrl.search.match(/\bid=([a-z0-9-]+)/i)[1];
}
