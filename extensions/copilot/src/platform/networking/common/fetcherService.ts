/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';

export const IFetcherService = createServiceIdentifier<IFetcherService>('IFetcherService');

/** Use as the callSite value to suppress fetch telemetry for a request (e.g. from the telemetry service itself). */
export const NO_FETCH_TELEMETRY = 'NO_FETCH_TELEMETRY';

export interface IFetcherService {
	readonly _serviceBrand: undefined;
	readonly onDidFetch: Event<FetchEvent>;
	readonly onDidCompleteFetch: Event<FetchTelemetryEvent>;
	getUserAgentLibrary(): string;
	fetch(url: string, options: FetchOptions): Promise<Response>;
	createWebSocket(url: string, options?: WebSocketConnectOptions): WebSocketConnection;
	disconnectAll(): Promise<unknown>;
	makeAbortController(): IAbortController;
	isAbortError(e: any): boolean;
	isInternetDisconnectedError(e: any): boolean;
	isFetcherError(e: any): boolean;
	isNetworkProcessCrashedError(e: any): boolean;
	getUserMessageForFetcherError(err: any): string;
	fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]>;
}

export type FetchEvent = {
	internalId: string;
	timestamp: number;
	outcome: 'success';
	phase: 'requestResponse';
	fetcher: FetcherId;
	hostname: string;
	statusCode: number;
} | {
	internalId: string;
	timestamp: number;
	outcome: 'success';
	phase: 'responseStreaming';
	fetcher: FetcherId;
	hostname: string;
	bytesReceived: number;
} | {
	internalId: string;
	timestamp: number;
	outcome: 'error' | 'cancel';
	phase: 'requestResponse';
	fetcher: FetcherId;
	hostname: string;
	reason: any;
} | {
	internalId: string;
	timestamp: number;
	outcome: 'error' | 'cancel';
	phase: 'responseStreaming';
	fetcher: FetcherId;
	hostname: string;
	reason: any;
	bytesReceived: number;
};

export type ReportFetchEvent = (outcome: FetchEvent) => void;

export interface FetchTelemetryEvent {
	callSite: string;
	hostname: string;
	latencyMs: number;
	statusCode: number | undefined;
	success: boolean;
}

/** A basic version of http://developer.mozilla.org/en-US/docs/Web/API/Response */
export class Response {
	ok = this.status >= 200 && this.status < 300;
	readonly body: DestroyableStream<Uint8Array>;
	private _bytesReceived = 0;

	get bytesReceived(): number {
		return this._bytesReceived;
	}

	constructor(
		readonly status: number,
		readonly statusText: string,
		readonly headers: IHeaders,
		body: ReadableStream<Uint8Array> | null,
		readonly fetcher: FetcherId,
		private readonly _reportEvent: ReportFetchEvent,
		private readonly _internalId: string,
		private readonly _hostname: string,
	) {
		const transformer = {
			transform: (chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) => {
				this._bytesReceived += chunk.length;
				controller.enqueue(chunk);
			},
			flush: () => {
				this._reportEvent({ internalId: this._internalId, timestamp: Date.now(), outcome: 'success', phase: 'responseStreaming', fetcher: this.fetcher, hostname: this._hostname, bytesReceived: this._bytesReceived });
			},
			cancel: (reason: any) => {
				const outcome = reason && !isAbortError(reason) ? 'error' as const : 'cancel' as const;
				this._reportEvent({ internalId: this._internalId, timestamp: Date.now(), outcome, phase: 'responseStreaming', fetcher: this.fetcher, hostname: this._hostname, reason, bytesReceived: this._bytesReceived });
			}
		};
		const countingStream = new TransformStream<Uint8Array, Uint8Array>(transformer);
		const inputStream = body ?? new ReadableStream({ start(c) { c.close(); } });
		this.body = new DestroyableStream(inputStream.pipeThrough(countingStream));
	}

	static fromText(status: number, statusText: string, headers: IHeaders, body: string, fetcher: FetcherId): Response {
		return new Response(
			status,
			statusText,
			headers,
			new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(body));
					controller.close();
				}
			}),
			fetcher,
			() => { },
			'in-memory',
			'in-memory',
		);
	}

	async text(): Promise<string> {
		const chunks: Uint8Array[] = [];
		for await (const chunk of this.body) {
			chunks.push(chunk);
		}
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		const result = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return new TextDecoder().decode(result);
	}

	async json(): Promise<any> {
		return JSON.parse(await this.text());
	}
}

export type FetcherId = 'electron-fetch' | 'node-fetch' | 'node-http' | 'test-stub' | 'helix-fetch';

/** These are the options we currently use, for ease of reference. */
export interface FetchOptions {
	/** Identifies the call site for telemetry tracking. Use {@link NO_FETCH_TELEMETRY} to suppress. */
	callSite: string;
	headers?: { [name: string]: string };
	body?: string;
	timeout?: number;
	/**
	 * If `json` is provided, it will be stringified using `JSON.stringify` and sent as the body with
	 * the `Content-Type` header set to `application/json`.
	 */
	json?: unknown;
	method?: 'GET' | 'POST' | 'PUT';
	signal?: IAbortSignal;
	retryFallbacks?: boolean;
	expectJSON?: boolean;
	useFetcher?: FetcherId;
	suppressIntegrationId?: boolean;
}

export interface PaginationOptions<T> extends FetchOptions {
	pageSize?: number;
	startPage?: number;
	getItemsFromResponse: (data: any) => T[];
	buildUrl: (baseUrl: string, pageSize: number, page: number) => string;
}

export interface WebSocketConnectOptions {
	headers?: { [name: string]: string };
}

export interface WebSocketConnection {
	readonly webSocket: WebSocket;
	readonly responseHeaders: IHeaders;
	readonly responseStatusCode: number | undefined;
	readonly responseStatusText: string | undefined;
	readonly networkError: Error | undefined;
}

export interface IAbortSignal {
	readonly aborted: boolean;
	addEventListener(type: 'abort', listener: (this: AbortSignal) => void): void;
	removeEventListener(type: 'abort', listener: (this: AbortSignal) => void): void;
}

export interface IAbortController {
	readonly signal: IAbortSignal;
	abort(): void;
}

export interface IHeaders extends Iterable<[string, string]> {
	get(name: string): string | null;
}

export class HeadersImpl implements IHeaders {
	constructor(private readonly _record: Readonly<Record<string, string | string[] | undefined>>) { }

	static fromMap(map: ReadonlyMap<string, string>): HeadersImpl {
		return new HeadersImpl(Object.fromEntries(map));
	}

	get(name: string): string | null {
		const result = this._record[name];
		return Array.isArray(result) ? result[0] : result ?? null;
	}

	[Symbol.iterator](): Iterator<[string, string]> {
		const keys = Object.keys(this._record);
		let index = 0;
		return {
			next: (): IteratorResult<[string, string]> => {
				if (index >= keys.length) {
					return { done: true, value: undefined };
				}
				const key = keys[index++];
				return { done: false, value: [key, this.get(key)!] };
			}
		};
	}
}

/**
 * Wraps a ReadableStream to allow cancellation even while a `for await` loop
 * holds the stream locked. Use `destroy()` to safely cancel from an external
 * callback (e.g., `onReturn`) - it cancels through the reader if locked.
 *
 * When `pipeThrough()` is called, destroy() will forward to the piped stream.
 */
export class DestroyableStream<T> implements AsyncIterable<T> {
	private reader: ReadableStreamDefaultReader<T> | undefined;
	private pipedHead: DestroyableStream<unknown> | undefined;

	constructor(private readonly stream: ReadableStream<T>) { }

	/**
	 * Returns the underlying ReadableStream for APIs that require it
	 * (e.g., Readable.fromWeb). Use with caution as operations on the
	 * returned stream bypass the DestroyableStream's reader tracking.
	 */
	toReadableStream(): ReadableStream<T> {
		return this.stream;
	}

	/**
	 * Pipes this stream through a transform stream.
	 * Returns a new DestroyableStream wrapping the transformed stream.
	 * Calling destroy() on this stream will forward to the piped stream.
	 */
	pipeThrough<U>(transform: { readable: ReadableStream<U>; writable: WritableStream<T> }): DestroyableStream<U> {
		const piped = new DestroyableStream(this.stream.pipeThrough(transform));
		this.pipedHead = piped;
		return piped;
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
		this.reader = this.stream.getReader();
		try {
			while (true) {
				const { done, value } = await this.reader.read();
				if (done) {
					break;
				}
				yield value;
			}
		} finally {
			this.reader.releaseLock();
			this.reader = undefined;
		}
	}

	destroy(): Promise<void> {
		// Forward to piped stream if pipeThrough was called
		if (this.pipedHead) {
			return this.pipedHead.destroy();
		}
		if (this.reader) {
			// Cancels the underlying stream and releases the lock
			return this.reader.cancel();
		} else {
			// If stream was consumed and unlocked, cancel() is a no-op
			return this.stream.cancel();
		}
	}
}

export async function jsonVerboseError(resp: Response) {
	const text = await resp.text();
	try {
		return JSON.parse(text);
	} catch (err) {
		const lines = text.split('\n');
		const errText = lines.length > 50 ? [...lines.slice(0, 25), '[...]', ...lines.slice(lines.length - 25)].join('\n') : text;
		err.message = `${err.message}. Response: ${errText}`;
		throw err;
	}
}

export function isAbortError(e: any): boolean {
	// see https://github.com/nodejs/node/issues/38361#issuecomment-1683839467
	return e && e.name === 'AbortError';
}

export function safeGetHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return 'unknown';
	}
}
