/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib="webworker" />

const sw: ServiceWorkerGlobalScope = self as any as ServiceWorkerGlobalScope;

const VERSION = 4;

const resourceCacheName = `vscode-resource-cache-${VERSION}`;

const rootPath = sw.location.pathname.replace(/\/service-worker.js$/, '');

const searchParams = new URL(location.toString()).searchParams;

const remoteAuthority = searchParams.get('remoteAuthority');

let outerIframeMessagePort: MessagePort | undefined;

/**
 * Origin used for resources
 */
const resourceBaseAuthority = searchParams.get('vscode-resource-base-authority');

const resolveTimeout = 30_000;

type RequestStoreResult<T> = {
	status: 'ok';
	value: T;
} | {
	status: 'timeout';
};

interface RequestStoreEntry<T> {
	resolve: (x: RequestStoreResult<T>) => void;
	promise: Promise<RequestStoreResult<T>>;
}

class RequestStore<T> {
	private map: Map<number, RequestStoreEntry<T>> = new Map();
	private requestPool: number = 0;

	create(): { requestId: number; promise: Promise<RequestStoreResult<T>> } {
		const requestId = ++this.requestPool;

		let resolve: (x: RequestStoreResult<T>) => void;
		const promise = new Promise<RequestStoreResult<T>>(r => resolve = r);

		const entry: RequestStoreEntry<T> = { resolve: resolve!, promise };
		this.map.set(requestId, entry);

		const dispose = () => {
			clearTimeout(timeout);
			const existingEntry = this.map.get(requestId);
			if (existingEntry === entry) {
				existingEntry.resolve({ status: 'timeout' });
				this.map.delete(requestId);
			}
		};
		const timeout = setTimeout(dispose, resolveTimeout);
		return { requestId, promise };
	}

	resolve(requestId: number, result: T): boolean {
		const entry = this.map.get(requestId);
		if (!entry) {
			return false;
		}
		entry.resolve({ status: 'ok', value: result });
		this.map.delete(requestId);
		return true;
	}
}

/**
 * Map of requested paths to responses.
 */
const resourceRequestStore = new RequestStore<ResourceResponse>();

/**
 * Map of requested localhost origins to optional redirects.
 */
const localhostRequestStore = new RequestStore<string | undefined>();

const unauthorized = () =>
	new Response('Unauthorized', { status: 401, });

const notFound = () =>
	new Response('Not Found', { status: 404, });

const methodNotAllowed = () =>
	new Response('Method Not Allowed', { status: 405, });

const requestTimeout = () =>
	new Response('Request Timeout', { status: 408, });

sw.addEventListener('message', async (event: ExtendableMessageEvent) => {
	if (!event.source) {
		return;
	}

	const source = event.source as Client;
	switch (event.data.channel) {
		case 'version': {
			outerIframeMessagePort = event.ports[0];
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
		case 'did-load-resource': {
			const response = event.data.data as ResourceResponse;
			if (!resourceRequestStore.resolve(response.id, response)) {
				console.log('Could not resolve unknown resource', response.path);
			}
			return;
		}
		case 'did-load-localhost': {
			const data = event.data.data;
			if (!localhostRequestStore.resolve(data.id, data.location)) {
				console.log('Could not resolve unknown localhost', data.origin);
			}
			return;
		}
		default: {
			console.log('Unknown message');
			return;
		}
	}
});

sw.addEventListener('fetch', (event: FetchEvent) => {
	const requestUrl = new URL(event.request.url);
	if (typeof resourceBaseAuthority === 'string' && requestUrl.protocol === 'https:' && requestUrl.hostname.endsWith('.' + resourceBaseAuthority)) {
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
			default: {
				return event.respondWith(methodNotAllowed());
			}
		}
	}

	// If we're making a request against the remote authority, we want to go
	// through VS Code itself so that we are authenticated properly.  If the
	// service worker is hosted on the same origin we will have cookies and
	// authentication will not be an issue.
	if (requestUrl.origin !== sw.origin && requestUrl.host === remoteAuthority) {
		switch (event.request.method) {
			case 'GET':
			case 'HEAD': {
				return event.respondWith(processResourceRequest(event, {
					path: requestUrl.pathname,
					scheme: requestUrl.protocol.slice(0, requestUrl.protocol.length - 1),
					authority: requestUrl.host,
					query: requestUrl.search.replace(/^\?/, ''),
				}));
			}
			default: {
				return event.respondWith(methodNotAllowed());
			}
		}
	}

	// See if it's a localhost request
	if (requestUrl.origin !== sw.origin && requestUrl.host.match(/^(localhost|127.0.0.1|0.0.0.0):(\d+)$/)) {
		return event.respondWith(processLocalhostRequest(event, requestUrl));
	}
});

sw.addEventListener('install', (event: ExtendableEvent) => {
	event.waitUntil(sw.skipWaiting()); // Activate worker immediately
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil(sw.clients.claim()); // Become available to all pages
});

interface ResourceRequestUrlComponents {
	scheme: string;
	authority: string;
	path: string;
	query: string;
}

async function processResourceRequest(
	event: FetchEvent,
	requestUrlComponents: ResourceRequestUrlComponents
): Promise<Response> {
	let client = await sw.clients.get(event.clientId);
	if (!client) {
		client = await getWorkerClientForId(event.clientId);
		if (!client) {
			console.error('Could not find inner client for request');
			return notFound();
		}
	}

	const webviewId = getWebviewIdForClient(client);

	// Refs https://github.com/microsoft/vscode/issues/244143
	// With PlzDedicatedWorker, worker subresources and blob wokers
	// will use clients different from the window client.
	// Since we cannot different a worker main resource from a worker subresource
	// we will use message channel to the outer iframe provided at the time
	// of service worker controller version initialization.
	if (!webviewId && client.type !== 'worker' && client.type !== 'sharedworker') {
		console.error('Could not resolve webview id');
		return notFound();
	}

	const shouldTryCaching = (event.request.method === 'GET');

	const resolveResourceEntry = (
		result: RequestStoreResult<ResourceResponse>,
		cachedResponse: Response | undefined
	): Response => {
		if (result.status === 'timeout') {
			return requestTimeout();
		}

		const entry = result.value;
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

		const commonHeaders: Record<string, string> = {
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

		const headers: Record<string, string> = {
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

		const response = new Response(entry.data as Uint8Array<ArrayBuffer>, {
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

	let cached: Response | undefined;
	if (shouldTryCaching) {
		const cache = await caches.open(resourceCacheName);
		cached = await cache.match(event.request);
	}

	const { requestId, promise } = resourceRequestStore.create();

	if (webviewId) {
		const parentClients = await getOuterIframeClient(webviewId);
		if (!parentClients.length) {
			console.log('Could not find parent client for request');
			return notFound();
		}

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
	} else if (client.type === 'worker' || client.type === 'sharedworker') {
		outerIframeMessagePort?.postMessage({
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

async function processLocalhostRequest(
	event: FetchEvent,
	requestUrl: URL
): Promise<Response> {
	const client = await sw.clients.get(event.clientId);
	if (!client) {
		// This is expected when requesting resources on other localhost ports
		// that are not spawned by vs code
		return fetch(event.request);
	}
	const webviewId = getWebviewIdForClient(client);
	// Refs https://github.com/microsoft/vscode/issues/244143
	// With PlzDedicatedWorker, worker subresources and blob wokers
	// will use clients different from the window client.
	// Since we cannot different a worker main resource from a worker subresource
	// we will use message channel to the outer iframe provided at the time
	// of service worker controller version initialization.
	if (!webviewId && client.type !== 'worker' && client.type !== 'sharedworker') {
		console.error('Could not resolve webview id');
		return fetch(event.request);
	}

	const origin = requestUrl.origin;

	const resolveRedirect = async (
		result: RequestStoreResult<string | undefined>
	): Promise<Response> => {
		if (result.status !== 'ok' || !result.value) {
			return fetch(event.request);
		}

		const redirectOrigin = result.value;
		const location = event.request.url.replace(new RegExp(`^${requestUrl.origin}(/|$)`), `${redirectOrigin}$1`);
		return new Response(null, {
			status: 302,
			headers: {
				Location: location
			}
		});
	};

	const { requestId, promise } = localhostRequestStore.create();
	if (webviewId) {
		const parentClients = await getOuterIframeClient(webviewId);
		if (!parentClients.length) {
			console.log('Could not find parent client for request');
			return notFound();
		}
		for (const parentClient of parentClients) {
			parentClient.postMessage({
				channel: 'load-localhost',
				origin: origin,
				id: requestId,
			});
		}
	} else if (client.type === 'worker' || client.type === 'sharedworker') {
		outerIframeMessagePort?.postMessage({
			channel: 'load-localhost',
			origin: origin,
			id: requestId,
		});
	}

	return promise.then(resolveRedirect);
}

function getWebviewIdForClient(client: Client): string | null {
	const requesterClientUrl = new URL(client.url);
	return requesterClientUrl.searchParams.get('id');
}

async function getOuterIframeClient(webviewId: string): Promise<Client[]> {
	const allClients = await sw.clients.matchAll({ includeUncontrolled: true });
	return allClients.filter(client => {
		const clientUrl = new URL(client.url);
		const hasExpectedPathName = (clientUrl.pathname === `${rootPath}/` || clientUrl.pathname === `${rootPath}/index.html` || clientUrl.pathname === `${rootPath}/index-no-csp.html`);
		return hasExpectedPathName && clientUrl.searchParams.get('id') === webviewId;
	});
}

async function getWorkerClientForId(clientId: string): Promise<Client | undefined> {
	const allDedicatedWorkerClients = await sw.clients.matchAll({ type: 'worker' });
	const allSharedWorkerClients = await sw.clients.matchAll({ type: 'sharedworker' });
	const allWorkerClients = [...allDedicatedWorkerClients, ...allSharedWorkerClients];
	return allWorkerClients.find(client => {
		return client.id === clientId;
	});
}

type ResourceResponse =
	| { readonly status: 200; id: number; path: string; mime: string; data: Uint8Array; etag: string | undefined; mtime: number | undefined }
	| { readonly status: 304; id: number; path: string; mime: string; mtime: number | undefined }
	| { readonly status: 401; id: number; path: string }
	| { readonly status: 404; id: number; path: string }
	;
