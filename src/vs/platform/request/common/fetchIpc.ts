/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { createFetchRequest, IFetchService, validateFetchUrl } from './fetch.js';

interface IFetchRequest {
	readonly id: string;
	readonly url: string;
	readonly method: string;
	readonly headers: [string, string][];
	readonly body?: VSBuffer;
	readonly cache: RequestCache;
}

type FetchResponseEvent = {
	readonly type: 'headers';
	readonly url: string;
	readonly status: number;
	readonly statusText: string;
	readonly headers: [string, string][];
	readonly hasBody: boolean;
} | {
	readonly type: 'error';
	readonly message: string;
};

const maximumChunkBytes = 64 * 1024;

class FetchOperation extends Disposable {

	private readonly controller = new AbortController();
	private readonly responseEmitter = this._register(new Emitter<FetchResponseEvent>({
		onDidAddFirstListener: () => void this.start(),
		onDidRemoveLastListener: () => this.dispose(),
	}));
	readonly onResponse = this.responseEmitter.event;

	private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	private pendingChunk: Uint8Array | undefined;
	private reading = false;
	private disposed = false;

	constructor(
		readonly context: string,
		private readonly request: IFetchRequest,
		private readonly fetchImpl: typeof globalThis.fetch,
		private readonly logService: ILogService,
		private readonly onDispose: () => void,
	) {
		super();
	}

	private async start(): Promise<void> {
		try {
			validateFetchUrl(this.request.url);
			const response = await this.fetchImpl(this.request.url, {
				method: this.request.method,
				headers: this.request.headers,
				body: this.request.body ? new Uint8Array(this.request.body.buffer) : undefined,
				cache: this.request.cache,
				redirect: 'manual',
				credentials: 'omit',
				signal: this.controller.signal,
			});
			this.reader = response.body?.getReader();
			if (this.disposed) {
				this.cancelBody();
				return;
			}
			this.responseEmitter.fire({
				type: 'headers',
				url: response.url,
				status: response.status,
				statusText: response.statusText,
				headers: [...response.headers],
				hasBody: !!response.body,
			});
		} catch (error) {
			if (!this.disposed) {
				const message = fetchErrorMessage(error);
				this.logService.debug(message);
				this.responseEmitter.fire({ type: 'error', message });
				this.dispose();
			}
		}
	}

	async read(): Promise<VSBuffer | undefined> {
		if (this.disposed || !this.reader || this.reading) {
			throw new Error('Fetch body is not available for reading');
		}
		this.reading = true;
		try {
			while (!this.pendingChunk?.byteLength) {
				const chunk = await this.reader.read();
				if (chunk.done) {
					return undefined;
				}
				this.pendingChunk = chunk.value;
			}
			const chunk = this.pendingChunk.subarray(0, maximumChunkBytes);
			this.pendingChunk = this.pendingChunk.subarray(chunk.byteLength);
			return VSBuffer.wrap(chunk);
		} catch (error) {
			if (this.disposed) {
				throw new Error('Fetch was cancelled');
			}
			this.reader?.releaseLock();
			this.reader = undefined;
			const message = fetchErrorMessage(error);
			this.logService.debug(message);
			this.responseEmitter.fire({ type: 'error', message });
			this.dispose();
			throw new Error(message);
		} finally {
			this.reading = false;
		}
	}

	private cancelBody(): void {
		if (this.reader) {
			void this.reader.cancel().catch(error => this.logService.debug(fetchErrorMessage(error)));
			this.reader.releaseLock();
			this.reader = undefined;
		}
		this.pendingChunk = undefined;
	}

	override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.responseEmitter.fire({ type: 'error', message: 'Fetch was cancelled' });
		this.controller.abort();
		this.cancelBody();
		super.dispose();
		this.onDispose();
	}
}

/** The response subscription owns the request, including its body and IPC disconnect cleanup. */
export class FetchChannel extends Disposable implements IServerChannel {

	private readonly requests = this._register(new DisposableMap<string, FetchOperation>());

	constructor(
		private readonly fetchImpl: typeof globalThis.fetch,
		private readonly logService: ILogService,
	) {
		super();
	}

	listen<T>(context: string, event: string, request: IFetchRequest): Event<T> {
		if (event !== 'request' || this._store.isDisposed || this.requests.has(request.id)) {
			throw new Error('Invalid fetch subscription');
		}
		const operation = new FetchOperation(context, request, this.fetchImpl, this.logService, () => this.requests.deleteAndLeak(request.id));
		this.requests.set(request.id, operation);
		return operation.onResponse as Event<T>;
	}

	async call<T>(context: string, command: string, id: string): Promise<T> {
		const operation = this.requests.get(id);
		if (command !== 'read' || !operation || operation.context !== context) {
			throw new Error('Invalid fetch body read');
		}
		return await operation.read() as T;
	}
}

export class FetchChannelClient implements IFetchService {

	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		const request = createFetchRequest(input, init);
		request.signal.throwIfAborted();
		const body = request.body ? VSBuffer.wrap(new Uint8Array(await request.arrayBuffer())) : undefined;
		request.signal.throwIfAborted();
		const id = generateUuid();
		return new Promise<Response>((resolve, reject) => {
			const lifetime = new DisposableStore();
			const cancellation = lifetime.add(new CancellationTokenSource());
			let finished = false;
			let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
			const finish = () => {
				if (!finished) {
					finished = true;
					cancellation.cancel();
					lifetime.dispose();
				}
			};
			const fail = (error: Error) => {
				if (!finished) {
					bodyController?.error(error);
					reject(error);
					finish();
				}
			};
			lifetime.add(Event.once(Event.fromDOMEventEmitter(request.signal, 'abort'))(() => fail(request.signal.reason)));
			const onResponse = (event: FetchResponseEvent) => {
				if (finished) {
					return;
				}
				if (event.type === 'error') {
					fail(new Error(event.message));
					return;
				}
				try {
					const stream = event.hasBody ? new ReadableStream<Uint8Array>({
						start: controller => { bodyController = controller; },
						pull: async controller => {
							try {
								const chunk = await this.channel.call<VSBuffer | undefined>('read', id, cancellation.token);
								if (!finished) {
									if (chunk) {
										controller.enqueue(chunk.buffer);
									} else {
										controller.close();
										finish();
									}
								}
							} catch (error) {
								fail(error);
							}
						},
						cancel: () => finish(),
					}, { highWaterMark: 0 }) : null;
					const response = new Response(stream, { status: event.status, statusText: event.statusText, headers: event.headers });
					Object.defineProperty(response, 'url', { value: event.url });
					resolve(response);
					if (!stream) {
						finish();
					}
				} catch {
					fail(new Error('Invalid fetch response'));
				}
			};
			try {
				lifetime.add(this.channel.listen<FetchResponseEvent>('request', {
					id,
					url: request.url,
					method: request.method,
					headers: [...request.headers],
					body,
					cache: request.cache,
				} satisfies IFetchRequest)(onResponse));
			} catch {
				fail(new Error('Fetch connection failed'));
			}
		});
	}
}

function fetchErrorMessage(error: unknown): string {
	for (let depth = 0; depth < 8 && error && typeof error === 'object'; depth++) {
		const code = Reflect.get(error, 'code');
		if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) {
			return `Network fetch failed (${code})`;
		}
		const chromiumCode = error instanceof Error ? /\bnet::(?<code>ERR_[A-Z_]+)\b/.exec(error.message)?.groups?.code : undefined;
		if (chromiumCode) {
			return `Network fetch failed (${chromiumCode})`;
		}
		error = Reflect.get(error, 'cause');
	}
	return 'Network fetch failed (unknown)';
}
