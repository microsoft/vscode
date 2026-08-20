/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { TimeoutTimer } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { encodeWebSocketFrame, type IWebSocketFrame, WebSocketFrameParser, WebSocketFrameTooLargeError, WebSocketOpcode } from '../../../base/parts/ipc/common/webSocketFraming.js';
import type { ITunnelDuplexStream, ITunnelMessageSocket, ITunnelSocketCloseEvent } from './tunnelMessageSocket.js';

const websocketAcceptGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const headerTerminator = VSBuffer.fromString('\r\n\r\n').buffer;
const defaultMaxFramePayloadLength = 0x100000;
const defaultMaxMessagePayloadLength = 0x800000;
const defaultCloseTimeoutMs = 5000;
/** Options used to establish a WebSocket connection over an existing tunnel stream. */
export interface IWebSocketOverDuplexOptions {
	/** Request path, e.g. '/agent-host/select' or '/?tkn=abc'. */
	readonly path: string;
	/** Host header value; the tunnel stream is already pointed at the right port. */
	readonly host?: string;
	/** Maximum accepted frame payload length. */
	readonly maxFramePayloadLength?: number;
	/** Maximum accepted assembled message payload length. */
	readonly maxMessagePayloadLength?: number;
	/** Time to wait for the peer to complete a close handshake. */
	readonly closeTimeoutMs?: number;
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
		const socket = new TunnelMessageSocket(
			stream,
			options.maxFramePayloadLength ?? defaultMaxFramePayloadLength,
			options.maxMessagePayloadLength ?? defaultMaxMessagePayloadLength,
			options.closeTimeoutMs ?? defaultCloseTimeoutMs,
		);
		for (const chunk of responseReader.remainingChunks(headerEnd)) {
			socket.acceptChunk(chunk);
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

/** Adapts shared RFC 6455 framing to the tunnel socket contract. */
class TunnelMessageSocket extends Disposable implements ITunnelMessageSocket {
	private readonly _onDidReceiveMessage = this._register(new Emitter<string>({
		onDidAddFirstListener: () => this.flushPendingMessages(),
	}));
	readonly onDidReceiveMessage: Event<string> = this._onDidReceiveMessage.event;
	private readonly _onDidClose = this._register(new Emitter<ITunnelSocketCloseEvent>());
	readonly onDidClose: Event<ITunnelSocketCloseEvent> = this._onDidClose.event;
	private readonly _pendingMessages: string[] = [];
	private readonly _frameParser: WebSocketFrameParser;
	private _fragmentedMessage: VSBuffer[] | undefined;
	private _fragmentedMessageLength = 0;
	private _closed = false;
	private _closeSent = false;
	private _streamEnded = false;
	private _streamDestroyed = false;
	private readonly _closeTimer = this._register(new TimeoutTimer());

	constructor(
		private readonly _stream: ITunnelDuplexStream,
		maxFramePayloadLength: number,
		private readonly _maxMessagePayloadLength: number,
		private readonly _closeTimeoutMs: number,
	) {
		super();
		this._frameParser = new WebSocketFrameParser({ maxPayloadLength: maxFramePayloadLength });
		const onData = (data: Uint8Array) => this.acceptChunk(data);
		const onError = (error: Error) => this.fail(error, 1002);
		const onEnd = () => this.finishClose({});
		const onClose = () => this.finishClose({});
		this._stream.on('data', onData);
		this._stream.on('error', onError);
		this._stream.on('end', onEnd);
		this._stream.on('close', onClose);
		this._register({
			dispose: () => {
				this._stream.removeListener('data', onData);
				this._stream.removeListener('error', onError);
				this._stream.removeListener('end', onEnd);
				this._stream.removeListener('close', onClose);
			}
		});
	}

	send(data: string): void {
		if (!this._closed) {
			this.writeFrame(VSBuffer.fromString(data), WebSocketOpcode.Text);
		}
	}

	close(): void {
		if (!this._closed) {
			this.sendClose(1000, '');
			this._closeTimer.setIfNotSet(() => {
				const error = new Error(`WebSocket close handshake timed out after ${this._closeTimeoutMs}ms.`);
				this.finishClose({ error });
				this.endStream();
				this.destroyStream();
			}, this._closeTimeoutMs);
		}
	}

	override dispose(): void {
		this.close();
		this.destroyStream();
		super.dispose();
	}

	acceptChunk(data: Uint8Array): void {
		try {
			for (const frame of this._frameParser.acceptChunk(VSBuffer.wrap(data))) {
				this.acceptFrame(frame);
			}
		} catch (error) {
			if (error instanceof WebSocketFrameTooLargeError) {
				this.fail(error, 1009);
			} else {
				this.fail(new Error('Received an invalid WebSocket frame.'), 1002);
			}
		}
	}

	private acceptFrame(frame: IWebSocketFrame): void {
		if (this._closed) {
			return;
		}
		if (frame.mask !== undefined) {
			this.fail(new Error('Received a masked WebSocket frame from the server.'), 1002);
			return;
		}
		if (frame.compressed) {
			this.fail(new Error('Received an unsupported compressed WebSocket frame.'), 1002);
			return;
		}

		switch (frame.opcode) {
			case WebSocketOpcode.Text:
				if (this._fragmentedMessage) {
					this.fail(new Error('Received a WebSocket text frame before a fragmented message was complete.'), 1002);
				} else if (frame.final) {
					this.acceptText(frame.payload);
				} else {
					this._fragmentedMessage = [frame.payload];
					this._fragmentedMessageLength = frame.payload.byteLength;
					this.ensureMessageWithinLimit();
				}
				break;
			case WebSocketOpcode.Continuation:
				if (!this._fragmentedMessage) {
					this.fail(new Error('Received a WebSocket continuation frame without a preceding text frame.'), 1002);
				} else {
					this._fragmentedMessage.push(frame.payload);
					this._fragmentedMessageLength += frame.payload.byteLength;
					if (!this.ensureMessageWithinLimit()) {
						return;
					}
					if (frame.final) {
						const payload = VSBuffer.concat(this._fragmentedMessage);
						this._fragmentedMessage = undefined;
						this._fragmentedMessageLength = 0;
						this.acceptText(payload);
					}
				}
				break;
			case WebSocketOpcode.Binary:
				this.fail(new Error('Received an unsupported binary WebSocket message.'), 1003);
				break;
			case WebSocketOpcode.Ping:
				this.writeFrame(frame.payload, WebSocketOpcode.Pong);
				break;
			case WebSocketOpcode.Close:
				this.acceptClose(frame.payload);
				break;
			case WebSocketOpcode.Pong:
				break;
		}
	}

	private acceptText(payload: VSBuffer): void {
		if (payload.byteLength > this._maxMessagePayloadLength) {
			this.fail(new Error(`WebSocket message payload length ${payload.byteLength} exceeds the configured limit of ${this._maxMessagePayloadLength}.`), 1009);
			return;
		}
		let data: string;
		try {
			data = new TextDecoder('utf-8', { fatal: true }).decode(payload.buffer);
		} catch {
			this.fail(new Error('Received invalid UTF-8 WebSocket text.'), 1007);
			return;
		}
		if (this._onDidReceiveMessage.hasListeners()) {
			this._onDidReceiveMessage.fire(data);
		} else {
			this._pendingMessages.push(data);
		}
	}

	private acceptClose(payload: VSBuffer): void {
		if (payload.byteLength === 1) {
			this.fail(new Error('Received a WebSocket close frame with an invalid payload.'), 1002);
			return;
		}

		let event: ITunnelSocketCloseEvent = {};
		if (payload.byteLength >= 2) {
			const code = payload.readUInt8(0) * 2 ** 8 + payload.readUInt8(1);
			if (!isValidCloseCode(code)) {
				this.fail(new Error(`Received an invalid WebSocket close code ${code}.`), 1002);
				return;
			}
			try {
				event = {
					code,
					reason: new TextDecoder('utf-8', { fatal: true }).decode(payload.slice(2).buffer),
				};
			} catch {
				this.fail(new Error('Received invalid UTF-8 WebSocket close reason.'), 1007);
				return;
			}
		}

		if (!this._closeSent) {
			this.writeFrame(payload, WebSocketOpcode.Close);
			this._closeSent = true;
		}
		this.finishClose(event);
		this.endStream();
	}

	private flushPendingMessages(): void {
		while (this._pendingMessages.length > 0) {
			this._onDidReceiveMessage.fire(this._pendingMessages.shift()!);
		}
	}

	private finishClose(event: ITunnelSocketCloseEvent): void {
		this._closeTimer.cancel();
		if (!this._closed) {
			this._closed = true;
			this._onDidClose.fire(event);
		}
	}

	private fail(error: Error, closeCode: number): void {
		if (this._closed) {
			return;
		}
		this.sendClose(closeCode, '');
		this.finishClose({ error });
		this.endStream();
	}

	private sendClose(code: number, reason: string): void {
		if (this._closeSent) {
			return;
		}
		const reasonPayload = VSBuffer.fromString(reason);
		const payload = VSBuffer.alloc(2 + reasonPayload.byteLength);
		payload.writeUInt8(code >>> 8, 0);
		payload.writeUInt8(code, 1);
		payload.set(reasonPayload, 2);
		this.writeFrame(payload, WebSocketOpcode.Close);
		this._closeSent = true;
	}

	private ensureMessageWithinLimit(): boolean {
		if (this._fragmentedMessageLength > this._maxMessagePayloadLength) {
			this.fail(new Error(`WebSocket message payload length ${this._fragmentedMessageLength} exceeds the configured limit of ${this._maxMessagePayloadLength}.`), 1009);
			return false;
		}
		return true;
	}

	private writeFrame(payload: VSBuffer, opcode: WebSocketOpcode): void {
		if (this._closed) {
			return;
		}
		const maskBytes = crypto.getRandomValues(new Uint8Array(4));
		const mask = maskBytes[0] * 2 ** 24 + maskBytes[1] * 2 ** 16 + maskBytes[2] * 2 ** 8 + maskBytes[3];
		this._stream.write(encodeWebSocketFrame(payload, { opcode, mask }).buffer);
	}

	private endStream(): void {
		if (!this._streamEnded) {
			this._streamEnded = true;
			this._stream.end();
		}
	}

	private destroyStream(): void {
		if (!this._streamDestroyed) {
			this._streamDestroyed = true;
			this._stream.destroy();
		}
	}
}

function isValidCloseCode(code: number): boolean {
	return code === 1000 || (code >= 1001 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);
}
