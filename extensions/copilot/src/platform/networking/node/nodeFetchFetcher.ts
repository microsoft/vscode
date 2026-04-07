/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as stream from 'stream';
import * as undici from 'undici';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { IEnvService } from '../../env/common/envService';
import { HeadersImpl, IHeaders, ReportFetchEvent, WebSocketConnection, WebSocketConnectOptions } from '../common/fetcherService';
import { BaseFetchFetcher } from './baseFetchFetcher';

export class NodeFetchFetcher extends BaseFetchFetcher {

	static readonly ID = 'node-fetch' as const;

	constructor(
		envService: IEnvService,
		reportEvent: ReportFetchEvent = () => { },
		userAgentLibraryUpdate?: (original: string) => string,
	) {
		super(getFetch(), envService, NodeFetchFetcher.ID, reportEvent, userAgentLibraryUpdate);
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

function getFetch(): typeof globalThis.fetch {
	const fetch = (globalThis as any).__vscodePatchedFetch || globalThis.fetch;
	return function (input: string | URL | globalThis.Request, init?: RequestInit) {
		return fetch(input, { dispatcher: agent.value, ...init });
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
