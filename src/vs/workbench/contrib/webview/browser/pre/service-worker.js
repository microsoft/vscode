/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Root path for resources
 */
const resourceRoot = '/vscode-resource';

/**
 * @template T
 * @typedef {{
 *     resolve: () => void,
 *     promise: Promise<T>
 * }} RequestStoreEntry
 */

/**
 * @template T
 */
class RequestStore {
	constructor() {
		/** @type {Map<string, RequestStoreEntry<T>>} */
		this.map = new Map();
	}

	/**
	 * @param {string} webviewId
	 * @param {string} path
	 * @return {RequestStoreEntry<T> | undefined}
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
	 * @param {RequestStoreEntry<T>} entry
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
}

/**
 * Map of requested paths to responses.
 *
 * @type {RequestStore<Response>}
 */
const resourceRequestStore = new RequestStore();

/**
 * Map of requested paths to responses.
 *
 * @type {RequestStore<string | undefined>}
 */
const localhostRequestStore = new RequestStore();

const notFoundResponse = new Response('Not Found', {
	status: 404,
});


self.addEventListener('message', (event) => {
	switch (event.data.channel) {
		case 'loaded-resource':
			{
				const webviewId = getWebviewIdForClient(event.source);
				const data = event.data.data;
				const target = resourceRequestStore.get(webviewId, data.path);
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

		case 'loaded-localhost':
			{
				const webviewId = getWebviewIdForClient(event.source);
				const data = event.data.data;
				const target = localhostRequestStore.get(webviewId, data.origin);
				if (!target) {
					console.log('Loaded unknown localhost', data.origin);
					return;
				}

				target.resolve(data.location);
				return;
			}
	}

	console.log('Unknown message');
});

self.addEventListener('fetch', (event) => {
	const requestUrl = new URL(event.request.url);
	console.log(requestUrl.host);

	// See if it's a resource request
	if (requestUrl.origin === self.origin && requestUrl.pathname.startsWith(resourceRoot + '/')) {
		return event.respondWith(processResourceRequest(event, requestUrl));
	}

	// See if it's a localhost request
	if (requestUrl.origin !== self.origin && requestUrl.host.match(/^localhost:(\d+)$/)) {
		return event.respondWith(processLocalhostRequest(event, requestUrl));
	}
});

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting()); // Activate worker immediately
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim()); // Become available to all pages
});

async function processResourceRequest(event, requestUrl) {
	const client = await self.clients.get(event.clientId);
	if (!client) {
		// This is expected when requesting resources on other localhost ports
		// that are not spawned by vs code
		console.log('Could not find inner client for request');
		return notFoundResponse.clone();
	}

	const webviewId = getWebviewIdForClient(client);
	const resourcePath = requestUrl.pathname.replace(resourceRoot, '');

	const allClients = await self.clients.matchAll({ includeUncontrolled: true });

	// Check if we've already resolved this request
	const existing = resourceRequestStore.get(webviewId, resourcePath);
	if (existing) {
		return existing.promise.then(r => r.clone());
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
			resourceRequestStore.set(webviewId, resourcePath, { resolve, promise, resolved: false });
			return promise.then(r => r.clone());
		}
	}

	console.log('Could not find parent client for request');
	return notFoundResponse.clone();
}

/**
 * @param {*} event
 * @param {URL} requestUrl
 */
async function processLocalhostRequest(event, requestUrl) {
	const client = await self.clients.get(event.clientId);
	if (!client) {
		// This is expected when requesting resources on other localhost ports
		// that are not spawned by vs code
		return undefined;
	}
	const webviewId = getWebviewIdForClient(client);
	const origin = requestUrl.origin;

	const resolveRedirect = redirectOrigin => {
		if (!redirectOrigin) {
			return fetch(event.request);
		}
		const location = event.request.url.replace(new RegExp(`^${requestUrl.origin}(/|$)`), `${redirectOrigin}$1`);
		return new Response(null, {
			status: 302,
			headers: {
				Location: location
			}
		});
	};

	const allClients = await self.clients.matchAll({ includeUncontrolled: true });

	// Check if we've already resolved this request
	const existing = localhostRequestStore.get(webviewId, origin);
	if (existing) {
		return existing.promise.then(resolveRedirect);
	}

	// Find parent iframe
	for (const client of allClients) {
		const clientUrl = new URL(client.url);
		if (clientUrl.pathname === '/' && clientUrl.search.match(new RegExp('\\bid=' + webviewId))) {
			client.postMessage({
				channel: 'load-localhost',
				origin: origin
			});

			let resolve;
			const promise = new Promise(r => resolve = r);
			localhostRequestStore.set(webviewId, origin, { resolve, promise });
			return promise.then(resolveRedirect);
		}
	}

	console.log('Could not find parent client for request');
	return notFoundResponse.clone();
}

function getWebviewIdForClient(client) {
	const requesterClientUrl = new URL(client.url);
	return requesterClientUrl.search.match(/\bid=([a-z0-9-]+)/i)[1];
}
