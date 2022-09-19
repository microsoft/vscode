/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

/// <reference no-default-lib="true"/>
/// <reference lib="webworker" />

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {any} */ (self));

const VERSION = 4;

const resourceCacheName = `vscode-resource-cache-${VERSION}`;

const rootPath = sw.location.pathname.replace(/\/service-worker.js$/, '');

const searchParams = new URL(location.toString()).searchParams;

const remoteAuthority = searchParams.get('remoteAuthority');

/**
 * Origin used for resources
 */
const resourceBaseAuthority = searchParams.get('vscode-resource-base-authority');

const resolveTimeout = 30000;

/**
 * @template T
 * @typedef {{
 *     resolve: (x: T) => void,
 *     promise: Promise<T>
 * }} RequestStoreEntry
 */

/**
 * Caches
 * @template T
 */
class RequestStore {
	constructor() {
		/** @type {Map<number, RequestStoreEntry<T>>} */
		this.map = new Map();

		this.requestPool = 0;
	}

	/**
	 * @param {number} requestId
	 * @return {Promise<T> | undefined}
	 */
	get(requestId) {
		const entry = this.map.get(requestId);
		return entry && entry.promise;
	}

	/**
	 * @returns {{ requestId: number, promise: Promise<T> }}
	 */
	create() {
		const requestId = ++this.requestPool;

		/** @type {undefined | ((x: T) => void)} */
		let resolve;

		/** @type {Promise<T>} */
		const promise = new Promise(r => resolve = r);

		/** @type {RequestStoreEntry<T>} */
		const entry = { resolve: /** @type {(x: T) => void} */ (resolve), promise };

		this.map.set(requestId, entry);

		const dispose = () => {
			clearTimeout(timeout);
			const existingEntry = this.map.get(requestId);
			if (existingEntry === entry) {
				return this.map.delete(requestId);
			}
		};
		const timeout = setTimeout(dispose, resolveTimeout);
		return { requestId, promise };
	}

	/**
	 * @param {number} requestId
	 * @param {T} result
	 * @return {boolean}
	 */
	resolve(requestId, result) {
		const entry = this.map.get(requestId);
		if (!entry) {
			return false;
		}
		entry.resolve(result);
		this.map.delete(requestId);
		return true;
	}
}

/**
 * @typedef {{ readonly status: 200; id: number; path: string; mime: string; data: Uint8Array; etag: string | undefined; mtime: number | undefined; }
 * 		| { readonly status: 304; id: number; path: string; mime: string; mtime: number | undefined }
 *		| { readonly status: 401; id: number; path: string }
 *		| { readonly status: 404; id: number; path: string }} ResourceResponse
 */

/**
 * Map of requested paths to responses.
 *
 * @type {RequestStore<ResourceResponse>}
 */
const resourceRequestStore = new RequestStore();

/**
 * Map of requested localhost origins to optional redirects.
 *
 * @type {RequestStore<string | undefined>}
 */
const localhostRequestStore = new RequestStore();

const unauthorized = () =>
	new Response('Unauthorized', { status: 401, });

const notFound = () =>
	new Response('Not Found', { status: 404, });

const methodNotAllowed = () =>
	new Response('Method Not Allowed', { status: 405, });

sw.addEventListener('message', async (event) => {
	switch (event.data.channel) {
		case 'version':
			{
				const source = /** @type {Client} */ (event.source);
				sw.clients.get(source.id).then(client => {
					if (client) {
						client.postMessage({
							channel: 'version',
							version: VERSION
						});
					}
				});
				return;
			}
		case 'did-load-resource':
			{
				/** @type {ResourceResponse} */
				const response = event.data.data;
				if (!resourceRequestStore.resolve(response.id, response)) {
					console.log('Could not resolve unknown resource', response.path);
				}
				return;
			}
		case 'did-load-localhost':
			{
				const data = event.data.data;
				if (!localhostRequestStore.resolve(data.id, data.location)) {
					console.log('Could not resolve unknown localhost', data.origin);
				}
				return;
			}
		default:
			console.log('Unknown message');
			return;
	}
});

sw.addEventListener('fetch', (event) => {
	const requestUrl = new URL(event.request.url);
	if (requestUrl.protocol === 'https:' && requestUrl.hostname.endsWith('.' + resourceBaseAuthority)) {
		switch (event.request.method) {
			case 'GET':
			case 'HEAD': {
				const firstHostSegment = requestUrl.hostname.slice(0, requestUrl.hostname.length - (resourceBaseAuthority.length + 1));
				const scheme = firstHostSegment.split('+', 1)[0];
				const authority = firstHostSegment.slice(scheme.length + 1); // may be empty
				return event.respondWith(processResourceRequest(event, {
					scheme,
					authority,
					path: requestUrl.pathname,
					query: requestUrl.search.replace(/^\?/, ''),
				}));
			}
			default:
				return event.respondWith(methodNotAllowed());
		}
	}

	// If we're making a request against the remote authority, we want to go
	// through VS Code itself so that we are authenticated properly.  If the
	// service worker is hosted on the same origin we will have cookies and
	// authentication will not be an issue.
	if (requestUrl.origin !== sw.origin && requestUrl.host === remoteAuthority) {
		switch (event.request.method) {
			case 'GET':
			case 'HEAD':
				return event.respondWith(processResourceRequest(event, {
					path: requestUrl.pathname,
					scheme: requestUrl.protocol.slice(0, requestUrl.protocol.length - 1),
					authority: requestUrl.host,
					query: requestUrl.search.replace(/^\?/, ''),
				}));

			default:
				return event.respondWith(methodNotAllowed());
		}
	}

	// See if it's a localhost request
	if (requestUrl.origin !== sw.origin && requestUrl.host.match(/^(localhost|127.0.0.1|0.0.0.0):(\d+)$/)) {
		return event.respondWith(processLocalhostRequest(event, requestUrl));
	}
});

sw.addEventListener('install', (event) => {
	event.waitUntil(sw.skipWaiting()); // Activate worker immediately
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim()); // Become available to all pages
});

/**
 * @param {FetchEvent} event
 * @param {{
 * 		scheme: string;
 * 		authority: string;
 * 		path: string;
 * 		query: string;
 * }} requestUrlComponents
 */
async function processResourceRequest(event, requestUrlComponents) {
	const client = await sw.clients.get(event.clientId);
	if (!client) {
		console.error('Could not find inner client for request');
		return notFound();
	}

	const webviewId = getWebviewIdForClient(client);
	if (!webviewId) {
		console.error('Could not resolve webview id');
		return notFound();
	}

	const shouldTryCaching = (event.request.method === 'GET');

	/**
	 * @param {ResourceResponse} entry
	 * @param {Response | undefined} cachedResponse
	 */
	const resolveResourceEntry = (entry, cachedResponse) => {
		if (entry.status === 304) { // Not modified
			if (cachedResponse) {
				return cachedResponse.clone();
			} else {
				throw new Error('No cache found');
			}
		}

		if (entry.status === 401) {
			return unauthorized();
		}

		if (entry.status !== 200) {
			return notFound();
		}

		/** @type {Record<string, string>} */
		const commonHeaders = {
			'Access-Control-Allow-Origin': '*',
		};

		const byteLength = entry.data.byteLength;

		const range = event.request.headers.get('range');
		if (range) {
			// To support seeking for videos, we need to handle range requests
			const bytes = range.match(/^bytes\=(\d+)\-(\d+)?$/g);
			if (bytes) {
				// TODO: Right now we are always reading the full file content. This is a bad idea
				// for large video files :)

				const start = Number(bytes[1]);
				const end = Number(bytes[2]) || byteLength - 1;
				return new Response(entry.data.slice(start, end + 1), {
					status: 206,
					headers: {
						...commonHeaders,
						'Content-range': `bytes 0-${end}/${byteLength}`,
					}
				});
			} else {
				// We don't understand the requested bytes
				return new Response(null, {
					status: 416,
					headers: {
						...commonHeaders,
						'Content-range': `*/${byteLength}`
					}
				});
			}
		}

		/** @type {Record<string, string>} */
		const headers = {
			...commonHeaders,
			'Content-Type': entry.mime,
			'Content-Length': byteLength.toString(),
		};

		if (entry.etag) {
			headers['ETag'] = entry.etag;
			headers['Cache-Control'] = 'no-cache';
		}
		if (entry.mtime) {
			headers['Last-Modified'] = new Date(entry.mtime).toUTCString();
		}

		// support COI requests, see network.ts#COI.getHeadersFromQuery(...)
		const coiRequest = new URL(event.request.url).searchParams.get('vscode-coi');
		if (coiRequest === '3') {
			headers['Cross-Origin-Opener-Policy'] = 'same-origin';
			headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
		} else if (coiRequest === '2') {
			headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
		} else if (coiRequest === '1') {
			headers['Cross-Origin-Opener-Policy'] = 'same-origin';
		}

		const response = new Response(entry.data, {
			status: 200,
			headers
		});

		if (shouldTryCaching && entry.etag) {
			caches.open(resourceCacheName).then(cache => {
				return cache.put(event.request, response);
			});
		}
		return response.clone();
	};

	const parentClients = await getOuterIframeClient(webviewId);
	if (!parentClients.length) {
		console.log('Could not find parent client for request');
		return notFound();
	}

	/** @type {Response | undefined} */
	let cached;
	if (shouldTryCaching) {
		const cache = await caches.open(resourceCacheName);
		cached = await cache.match(event.request);
	}

	const { requestId, promise } = resourceRequestStore.create();

	for (const parentClient of parentClients) {
		parentClient.postMessage({
			channel: 'load-resource',
			id: requestId,
			scheme: requestUrlComponents.scheme,
			authority: requestUrlComponents.authority,
			path: requestUrlComponents.path,
			query: requestUrlComponents.query,
			ifNoneMatch: cached?.headers.get('ETag'),
		});
	}

	return promise.then(entry => resolveResourceEntry(entry, cached));
}

/**
 * @param {FetchEvent} event
 * @param {URL} requestUrl
 * @return {Promise<Response>}
 */
async function processLocalhostRequest(event, requestUrl) {
	const client = await sw.clients.get(event.clientId);
	if (!client) {
		// This is expected when requesting resources on other localhost ports
		// that are not spawned by vs code
		return fetch(event.request);
	}
	const webviewId = getWebviewIdForClient(client);
	if (!webviewId) {
		console.error('Could not resolve webview id');
		return fetch(event.request);
	}

	const origin = requestUrl.origin;

	/**
	 * @param {string | undefined} redirectOrigin
	 * @return {Promise<Response>}
	 */
	const resolveRedirect = async (redirectOrigin) => {
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

	const parentClients = await getOuterIframeClient(webviewId);
	if (!parentClients.length) {
		console.log('Could not find parent client for request');
		return notFound();
	}

	const { requestId, promise } = localhostRequestStore.create();
	for (const parentClient of parentClients) {
		parentClient.postMessage({
			channel: 'load-localhost',
			origin: origin,
			id: requestId,
		});
	}

	return promise.then(resolveRedirect);
}

/**
 * @param {Client} client
 * @returns {string | null}
 */
function getWebviewIdForClient(client) {
	const requesterClientUrl = new URL(client.url);
	return requesterClientUrl.searchParams.get('id');
}

/**
 * @param {string} webviewId
 * @returns {Promise<Client[]>}
 */
async function getOuterIframeClient(webviewId) {
	const allClients = await sw.clients.matchAll({ includeUncontrolled: true });
	return allClients.filter(client => {
		const clientUrl = new URL(client.url);
		const hasExpectedPathName = (clientUrl.pathname === `${rootPath}/` || clientUrl.pathname === `${rootPath}/index.html` || clientUrl.pathname === `${rootPath}/index-no-csp.html`);
		return hasExpectedPathName && clientUrl.searchParams.get('id') === webviewId;
	});
}
