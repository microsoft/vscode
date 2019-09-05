/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

//#region --- lib.webworker.d.ts madness ---

interface ExtendableEvent extends Event {
	waitUntil(f: any): void;
}

interface FetchEvent extends ExtendableEvent {
	readonly clientId: string;
	readonly preloadResponse: Promise<any>;
	readonly replacesClientId: string;
	readonly request: Request;
	readonly resultingClientId: string;
	respondWith(r: Response | Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
	readonly data: any;
	readonly lastEventId: string;
	readonly origin: string;
	readonly ports: ReadonlyArray<MessagePort>;
	readonly source: ServiceWorker | MessagePort | null;
}

interface ServiceWorkerGlobalScopeEventMap {
	'activate': ExtendableEvent;
	'fetch': FetchEvent;
	'install': ExtendableEvent;
	'message': ExtendableMessageEvent;
	'messageerror': MessageEvent;
}

interface Clients {
	claim(): Promise<void>;
	get(id: string): Promise<any>;
}

interface ServiceWorkerGlobalScope {
	readonly clients: Clients;
	onactivate: ((this: ServiceWorkerGlobalScope, ev: ExtendableEvent) => any) | null;
	onfetch: ((this: ServiceWorkerGlobalScope, ev: FetchEvent) => any) | null;
	oninstall: ((this: ServiceWorkerGlobalScope, ev: ExtendableEvent) => any) | null;
	onmessage: ((this: ServiceWorkerGlobalScope, ev: ExtendableMessageEvent) => any) | null;
	onmessageerror: ((this: ServiceWorkerGlobalScope, ev: MessageEvent) => any) | null;
	readonly registration: ServiceWorkerRegistration;
	skipWaiting(): Promise<void>;
	addEventListener<K extends keyof ServiceWorkerGlobalScopeEventMap>(type: K, listener: (this: ServiceWorkerGlobalScope, ev: ServiceWorkerGlobalScopeEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	removeEventListener<K extends keyof ServiceWorkerGlobalScopeEventMap>(type: K, listener: (this: ServiceWorkerGlobalScope, ev: ServiceWorkerGlobalScopeEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
	removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

//#endregion

declare var self: ServiceWorkerGlobalScope;

//#region --- installing/activating

self.addEventListener('install', _event => {
	console.log('SW#install');
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	console.log('SW#activate');
	event.waitUntil((async () => {
		// (1) enable navigation preloads!
		// (2) delete caches with each new version
		// (3) become available to all pages
		if (self.registration.navigationPreload) {
			await self.registration.navigationPreload.enable();
		}
		await caches.delete(_cacheName);
		await self.clients.claim();
	})());
});

//#endregion

//#region --- fetching/caching

const _cacheName = 'vscode-extension-resources';
const _resourcePrefix = '/vscode-remote-resource';
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
	if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
		// https://bugs.chromium.org/p/chromium/issues/detail?id=823392
		// https://stackoverflow.com/questions/48463483/what-causes-a-failed-to-execute-fetch-on-serviceworkerglobalscope-only-if#49719964
		// https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
		return new Response(undefined, { status: 504, statusText: 'Gateway Timeout (dev tools: https://bugs.chromium.org/p/chromium/issues/detail?id=823392)' });
	}
	return await event.preloadResponse || await fetch(event.request);
}

async function respondWithResource(event: FetchEvent, uri: URI): Promise<Response> {

	const cachedValue = await caches.open(_cacheName).then(cache => cache.match(event.request));
	if (cachedValue) {
		return cachedValue;
	}

	const response: Response = await event.preloadResponse || await fetch(event.request);
	if (response.headers.get('X-VSCode-Extension') === 'true') {
		await caches.open(_cacheName).then(cache => cache.put(event.request, response.clone()));
	}

	return response;
}

//#endregion
