/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as stream from 'stream';
import * as undici from 'undici';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { IEnvService } from '../../env/common/envService';
import { HeadersImpl, IHeaders, ReportFetchEvent, WebSocketConnection, WebSocketConnectOptions } from '../common/fetcherService';
import { BaseFetchFetcher, FetchImpl } from './baseFetchFetcher';
import { taggedCacheInterceptor } from './taggedCacheInterceptor';

type CacheInterceptorOptions = NonNullable<Parameters<typeof undici.interceptors.cache>[0]>;
type CacheStore = NonNullable<CacheInterceptorOptions['store']>;

type FetchPatchFactory = (options?: {
	interceptors?: readonly undici.Dispatcher.DispatcherComposeInterceptor[];
}) => typeof globalThis.fetch;

export type NodeFetchCacheMode = 'off' | 'memory' | 'persistent';

export interface NodeFetchCacheOptions {
	readonly mode: NodeFetchCacheMode;
	readonly storeLocation?: string;
}

export class NodeFetchFetcher extends BaseFetchFetcher {

	static readonly ID = 'node-fetch' as const;

	constructor(
		envService: IEnvService,
		reportEvent: ReportFetchEvent = () => { },
		userAgentLibraryUpdate?: (original: string) => string,
		cacheOptions: NodeFetchCacheOptions = { mode: 'memory' },
	) {
		// Caching requires the host-provided fetch-patch factory so cached requests
		// still go through the proxy/CA-injection patch. On older hosts that lack
		// the factory, caching is silently disabled.
		const factory = (globalThis as any).__vscodeCreateFetchPatch as FetchPatchFactory | undefined;
		const interceptor = cacheOptions.mode !== 'off' && factory ? createCacheInterceptor(cacheOptions) : undefined;
		super(getFetch(interceptor, factory), envService, NodeFetchFetcher.ID, reportEvent, userAgentLibraryUpdate);
	}

	getUserAgentLibrary(): string {
		return NodeFetchFetcher.ID;
	}

	isInternetDisconnectedError(_e: any): boolean {
		return false;
	}
	isFetcherError(e: any): boolean {
		const code = e?.code || e?.cause?.code;
		return code && ['EADDRINUSE', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT'].includes(code);
	}
}

function createCacheInterceptor(options: NodeFetchCacheOptions): undici.Dispatcher.DispatcherComposeInterceptor | undefined {
	const store = createCacheStore(options);
	if (!store) {
		return undefined;
	}
	return taggedCacheInterceptor({ store, type: 'private' });
}

function createCacheStore(options: NodeFetchCacheOptions): CacheStore | undefined {
	if (options.mode === 'persistent') {
		const SqliteCacheStore = (undici as unknown as { cacheStores?: { SqliteCacheStore?: new (init?: object) => CacheStore } }).cacheStores?.SqliteCacheStore;
		if (SqliteCacheStore && options.storeLocation) {
			try {
				return new SqliteCacheStore({
					location: options.storeLocation,
					maxCount: 5000,
					maxEntrySize: 5 * 1024 * 1024,
				});
			} catch {
			}
		}
	}
	const MemoryCacheStore = (undici as unknown as { cacheStores?: { MemoryCacheStore?: new (init?: object) => CacheStore } }).cacheStores?.MemoryCacheStore;
	if (!MemoryCacheStore) {
		return undefined;
	}
	return new MemoryCacheStore({ maxCount: 1000, maxEntrySize: 5 * 1024 * 1024 });
}

function getFetch(cacheInterceptor: undici.Dispatcher.DispatcherComposeInterceptor | undefined, createFetchPatch: FetchPatchFactory | undefined): FetchImpl {
	const defaultFetch = (globalThis as any).__vscodePatchedFetch || globalThis.fetch;
	const cachedFetch = cacheInterceptor && createFetchPatch ? createFetchPatch({ interceptors: [cacheInterceptor] }) : undefined;
	return function (input, init, useCache) {
		if (useCache && cachedFetch) {
			return cachedFetch(input, init);
		}
		const dispatcher = (init as { dispatcher?: undici.Dispatcher } | undefined)?.dispatcher ?? agent.value;
		return defaultFetch(input, { ...init, dispatcher });
	};
}

// Cache agent to reuse connections.
const agent = new Lazy(() => new undici.Agent({ allowH2: true }));

export function createWebSocket(url: string, options?: WebSocketConnectOptions): WebSocketConnection {
	const wsAgent = new undici.Agent();
	const originalDispatch = wsAgent.dispatch;
	let responseHeaders: IHeaders = new HeadersImpl({});
	let responseStatusCode: number | undefined;
	let responseStatusText: string | undefined;
	wsAgent.dispatch = function (dispatchOptions: undici.Dispatcher.DispatchOptions, handler: undici.Dispatcher.DispatchHandler): boolean {
		const wrappedHandler: undici.Dispatcher.DispatchHandler = {
			...handler,
			onUpgrade(statusCode: number, rawHeaders: Buffer[] | string[] | null, socket: stream.Duplex) {
				responseStatusCode = statusCode;
				if (rawHeaders) {
					responseHeaders = HeadersImpl.fromMap(parseRawHeaders(rawHeaders));
				}
				return handler.onUpgrade?.(statusCode, rawHeaders, socket);
			},
			onHeaders(statusCode: number, rawHeaders: Buffer[], resume: () => void, statusText: string) {
				responseStatusCode = statusCode;
				responseStatusText = statusText;
				if (rawHeaders) {
					responseHeaders = HeadersImpl.fromMap(parseRawHeaders(rawHeaders));
				}
				return handler.onHeaders?.(statusCode, rawHeaders, resume, statusText) ?? true;
			},
		};
		return originalDispatch.call(this, dispatchOptions, wrappedHandler);
	};

	const webSocket = new WebSocket(url, {
		headers: options?.headers,
		dispatcher: wsAgent as any,
	});

	webSocket.addEventListener('close', () => {
		wsAgent.destroy().catch(() => { });
	});

	return {
		webSocket,
		get responseHeaders() {
			const wsResponseHeaders = (webSocket as { responseHeaders?: Record<string, string | string[] | undefined> }).responseHeaders;
			return wsResponseHeaders ? new HeadersImpl(wsResponseHeaders) : responseHeaders;
		},
		get responseStatusCode() {
			return (webSocket as { responseStatusCode?: number }).responseStatusCode ?? responseStatusCode;
		},
		get responseStatusText() {
			return (webSocket as { responseStatusText?: string }).responseStatusText ?? responseStatusText;
		},
		get networkError() {
			return (webSocket as { networkError?: Error }).networkError ?? undefined;
		}
	};
}

function parseRawHeaders(rawHeaders: readonly (Buffer | string)[]): Map<string, string> {
	const headers = new Map<string, string>();
	for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
		const name = rawHeaders[i].toString().toLowerCase();
		const value = rawHeaders[i + 1].toString();
		const existing = headers.get(name);
		headers.set(name, existing !== undefined ? `${existing}, ${value}` : value);
	}
	return headers;
}
