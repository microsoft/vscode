/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import type { ITunnelDuplexStream, ITunnelMessageSocket, ITunnelSocketCloseEvent, IWebSocketConnection, IWebSocketConnectionConfig, IWebSocketDuplexStream, WebSocketConnectionCtor, WebSocketConnectionMessage } from './tunnelMessageSocket.js';

const websocketAcceptGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const headerTerminator = VSBuffer.fromString('\r\n\r\n').buffer;
const websocketConnectionConfig: IWebSocketConnectionConfig = {
	maxReceivedFrameSize: 0x100000,
	maxReceivedMessageSize: 0x800000,
	fragmentOutgoingMessages: true,
	fragmentationThreshold: 0x4000,
	webSocketVersion: 13,
	assembleFragments: true,
	disableNagleAlgorithm: true,
	closeTimeout: 5000,
};

/** Options used to establish a WebSocket connection over an existing tunnel stream. */
export interface IWebSocketOverDuplexOptions {
	/** Request path, e.g. '/agent-host/select' or '/?tkn=abc'. */
	readonly path: string;
	/** Host header value; the tunnel stream is already pointed at the right port. */
	readonly host?: string;
	/** Injected WebSocketConnection constructor from the lazily-loaded browser bundle. */
	readonly webSocketConnectionCtor: WebSocketConnectionCtor;
}

/** Opens a framed WebSocket connection over an already-connected tunnel stream. */
export async function connectWebSocketOverDuplex(
	stream: ITunnelDuplexStream,
	options: IWebSocketOverDuplexOptions,
): Promise<ITunnelMessageSocket> {
	validateRequestPath(options.path);

	const keyBytes = crypto.getRandomValues(new Uint8Array(16));
	const key = encodeBase64(VSBuffer.wrap(keyBytes));
	stream.write(createUpgradeRequest(options.path, options.host ?? 'localhost', key));

	const responseReader = new UpgradeResponseReader(stream);
	try {
		const headerEnd = await responseReader.waitForHeaders();
		const response = parseUpgradeResponse(responseReader.bytes.slice(0, headerEnd));
		if (response.status !== 101) {
			throw new Error(`WebSocket upgrade expected status 101 but received ${response.status}.`);
		}

		const expectedAccept = await createWebSocketAccept(key);
		if (!response.headers.get('sec-websocket-accept')) {
			throw new Error('WebSocket upgrade response did not include a Sec-WebSocket-Accept header.');
		}
		if (response.headers.get('sec-websocket-accept') !== expectedAccept) {
			throw new Error('WebSocket upgrade response Sec-WebSocket-Accept header did not match the expected value.');
		}
		if (responseReader.failure) {
			throw responseReader.failure;
		}

		responseReader.detach();
		const connection = new options.webSocketConnectionCtor(new WebSocketDuplexStreamAdapter(stream), [], null, true, websocketConnectionConfig);
		const socket = new TunnelMessageSocket(stream, connection);
		connection._addSocketEventListeners();
		for (const chunk of responseReader.remainingChunks(headerEnd)) {
			connection.handleSocketData(chunk);
		}
		return socket;
	} catch (error) {
		responseReader.detach();
		stream.end();
		throw error;
	}
}

function validateRequestPath(path: string): void {
	if (!path.startsWith('/') || path.includes('\r') || path.includes('\n')) {
		throw new Error('WebSocket upgrade path must start with "/" and cannot contain line breaks.');
	}
}

function createUpgradeRequest(path: string, host: string, key: string): string {
	return [
		`GET ${path} HTTP/1.1`,
		`Host: ${host}`,
		'Connection: Upgrade',
		'Upgrade: websocket',
		'Sec-WebSocket-Version: 13',
		`Sec-WebSocket-Key: ${key}`,
		'',
		'',
	].join('\r\n');
}

/** Computes the RFC 6455 `Sec-WebSocket-Accept` value for a client key. */
export async function createWebSocketAccept(key: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(key + websocketAcceptGuid));
	return encodeBase64(VSBuffer.wrap(new Uint8Array(digest)));
}

/** Adapts a tunnel duplex stream to the TCP-like socket surface required by `WebSocketConnection`. */
class WebSocketDuplexStreamAdapter implements IWebSocketDuplexStream {
	private _ended = false;
	private _destroyed = false;

	constructor(private readonly _stream: ITunnelDuplexStream) {
	}

	get remoteAddress(): string | undefined {
		return this._stream.remoteAddress;
	}

	on(event: 'data', listener: (chunk: Uint8Array) => void): void;
	on(event: 'error', listener: (err: Error) => void): void;
	on(event: 'close', listener: (hadError?: boolean) => void): void;
	on(event: 'end' | 'drain' | 'pause' | 'resume', listener: () => void): void;
	on(event: 'data' | 'error' | 'end' | 'close' | 'drain' | 'pause' | 'resume', listener: ((chunk: Uint8Array) => void) | ((err: Error) => void) | ((hadError?: boolean) => void) | (() => void)): void {
		switch (event) {
			case 'data':
				this._stream.on(event, listener as (chunk: Uint8Array) => void);
				break;
			case 'error':
				this._stream.on(event, listener as (err: Error) => void);
				break;
			case 'close':
				this._stream.on(event, listener as (hadError?: boolean) => void);
				break;
			default:
				this._stream.on(event, listener as () => void);
		}
	}

	removeListener(event: 'data', listener: (chunk: Uint8Array) => void): void;
	removeListener(event: 'error', listener: (err: Error) => void): void;
	removeListener(event: 'close', listener: (hadError?: boolean) => void): void;
	removeListener(event: 'end' | 'drain' | 'pause' | 'resume', listener: () => void): void;
	removeListener(event: 'data' | 'error' | 'end' | 'close' | 'drain' | 'pause' | 'resume', listener: ((chunk: Uint8Array) => void) | ((err: Error) => void) | ((hadError?: boolean) => void) | (() => void)): void {
		switch (event) {
			case 'data':
				this._stream.removeListener(event, listener as (chunk: Uint8Array) => void);
				break;
			case 'error':
				this._stream.removeListener(event, listener as (err: Error) => void);
				break;
			case 'close':
				this._stream.removeListener(event, listener as (hadError?: boolean) => void);
				break;
			default:
				this._stream.removeListener(event, listener as () => void);
		}
	}

	removeAllListeners(event: 'error'): void {
		this._stream.removeAllListeners(event);
	}

	write(chunk: Uint8Array | string, callback?: (error?: Error) => void): boolean {
		const written = this._stream.write(chunk);
		callback?.();
		return written;
	}

	end(): void {
		if (!this._ended) {
			this._ended = true;
			this._stream.end();
		}
	}

	destroy(): void {
		if (!this._destroyed) {
			this._destroyed = true;
			this._stream.destroy();
		}
	}

	pause(): void {
		this._stream.pause();
	}

	resume(): void {
		this._stream.resume();
	}

	setNoDelay(_enable: boolean): void {
	}

	setTimeout(_timeout: number): void {
	}

	setKeepAlive(_enable: boolean, _initialDelay?: number): void {
	}
}

/** A parsed HTTP WebSocket upgrade response. */
interface IUpgradeResponse {
	readonly status: number;
	readonly headers: Map<string, string>;
}

function parseUpgradeResponse(headerBytes: Uint8Array): IUpgradeResponse {
	const lines = VSBuffer.wrap(headerBytes).toString().split('\r\n');
	const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})(?:\s|$)/.exec(lines[0]);
	if (!statusMatch) {
		throw new Error('WebSocket upgrade response did not contain a valid HTTP status line.');
	}

	const headers = new Map<string, string>();
	for (const line of lines.slice(1)) {
		if (!line) {
			continue;
		}
		const separator = line.indexOf(':');
		if (separator <= 0) {
			throw new Error(`WebSocket upgrade response contained an invalid header: ${line}`);
		}
		headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
	}
	return { status: Number(statusMatch[1]), headers };
}

/** Buffers an HTTP upgrade response while preserving original frame chunks. */
class UpgradeResponseReader {
	private _bytes = new Uint8Array(0);
	private readonly _chunks: Uint8Array[] = [];
	private _headerEnd: number | undefined;
	private _settled = false;
	private _failure: Error | undefined;
	private readonly _onData = (chunk: Uint8Array) => this.acceptData(chunk);
	private readonly _onError = (error: Error) => this.reject(error);
	private readonly _onEnd = () => this.reject(new Error('Tunnel stream ended before the WebSocket upgrade response was received.'));
	private readonly _onClose = () => this.reject(new Error('Tunnel stream closed before the WebSocket upgrade response was received.'));
	private _resolve: ((headerEnd: number) => void) | undefined;
	private _reject: ((error: Error) => void) | undefined;

	constructor(private readonly _stream: ITunnelDuplexStream) {
		this._stream.on('data', this._onData);
		this._stream.on('error', this._onError);
		this._stream.on('end', this._onEnd);
		this._stream.on('close', this._onClose);
	}

	get bytes(): Uint8Array {
		return this._bytes;
	}

	get failure(): Error | undefined {
		return this._failure;
	}

	waitForHeaders(): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			this._resolve = resolve;
			this._reject = reject;
			if (this._headerEnd !== undefined) {
				resolve(this._headerEnd);
			}
		});
	}

	detach(): void {
		this._stream.removeListener('data', this._onData);
		this._stream.removeListener('error', this._onError);
		this._stream.removeListener('end', this._onEnd);
		this._stream.removeListener('close', this._onClose);
	}

	remainingChunks(offset: number): Uint8Array[] {
		const remainingChunks: Uint8Array[] = [];
		for (const chunk of this._chunks) {
			if (offset >= chunk.byteLength) {
				offset -= chunk.byteLength;
			} else {
				remainingChunks.push(chunk.slice(offset));
				offset = 0;
			}
		}
		return remainingChunks;
	}

	private acceptData(chunk: Uint8Array): void {
		this._chunks.push(chunk);
		const bytes = new Uint8Array(this._bytes.byteLength + chunk.byteLength);
		bytes.set(this._bytes);
		bytes.set(chunk, this._bytes.byteLength);
		this._bytes = bytes;

		if (this._headerEnd === undefined) {
			const terminatorOffset = findSequence(this._bytes, headerTerminator);
			if (terminatorOffset !== -1) {
				this._headerEnd = terminatorOffset + headerTerminator.byteLength;
				this._settled = true;
				this._resolve?.(this._headerEnd);
			}
		}
	}

	private reject(error: Error): void {
		this._failure = error;
		if (!this._settled) {
			this._settled = true;
			this._reject?.(error);
		}
	}
}

function findSequence(bytes: Uint8Array, sequence: Uint8Array): number {
	for (let offset = 0; offset <= bytes.byteLength - sequence.byteLength; offset++) {
		let matches = true;
		for (let index = 0; index < sequence.byteLength; index++) {
			if (bytes[offset + index] !== sequence[index]) {
				matches = false;
				break;
			}
		}
		if (matches) {
			return offset;
		}
	}
	return -1;
}

/** Adapts the bundled WebSocket framing implementation to the tunnel socket contract. */
class TunnelMessageSocket extends Disposable implements ITunnelMessageSocket {
	private readonly _onDidReceiveMessage = this._register(new Emitter<string>({
		onDidAddFirstListener: () => this.flushPendingMessages(),
	}));
	readonly onDidReceiveMessage: Event<string> = this._onDidReceiveMessage.event;
	private readonly _onDidClose = this._register(new Emitter<ITunnelSocketCloseEvent>());
	readonly onDidClose: Event<ITunnelSocketCloseEvent> = this._onDidClose.event;
	private readonly _pendingMessages: string[] = [];
	private _closed = false;

	constructor(
		private readonly _stream: ITunnelDuplexStream,
		private readonly _connection: IWebSocketConnection,
	) {
		super();
		const onMessage = (message: WebSocketConnectionMessage) => this.acceptMessage(message);
		const onClose = (code: number, reason: string) => this.finishClose({ code, reason });
		const onError = (error: Error) => this.finishClose({ error });
		this._connection.on('message', onMessage);
		this._connection.on('close', onClose);
		this._connection.on('error', onError);
		this._register(toDisposable(() => this._connection.removeListener('message', onMessage)));
		this._register(toDisposable(() => this._connection.removeListener('close', onClose)));
		this._register(toDisposable(() => this._connection.removeListener('error', onError)));
	}

	send(data: string): void {
		this._connection.send(data);
	}

	close(): void {
		this._connection.close();
	}

	override dispose(): void {
		this._connection.close();
		this._stream.destroy();
		super.dispose();
	}

	private acceptMessage(message: WebSocketConnectionMessage): void {
		const data = message.type === 'utf8' ? message.utf8Data : new TextDecoder().decode(message.binaryData);
		if (this._onDidReceiveMessage.hasListeners()) {
			this._onDidReceiveMessage.fire(data);
		} else {
			this._pendingMessages.push(data);
		}
	}

	private flushPendingMessages(): void {
		while (this._pendingMessages.length > 0) {
			this._onDidReceiveMessage.fire(this._pendingMessages.shift()!);
		}
	}

	private finishClose(event: ITunnelSocketCloseEvent): void {
		if (!this._closed) {
			this._closed = true;
			this._onDidClose.fire(event);
		}
	}
}
