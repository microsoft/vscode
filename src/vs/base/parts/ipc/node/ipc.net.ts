/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { Server as NetServer, Socket, createServer, createConnection } from 'net';
import { tmpdir } from 'os';
import { createDeflateRaw, ZlibOptions, InflateRaw, DeflateRaw, createInflateRaw } from 'zlib';
import { VSBuffer } from '../../../common/buffer.js';
import { onUnexpectedError } from '../../../common/errors.js';
import { Emitter, Event } from '../../../common/event.js';
import { Disposable, IDisposable } from '../../../common/lifecycle.js';
import { join } from '../../../common/path.js';
import { Platform, platform } from '../../../common/platform.js';
import { generateUuid } from '../../../common/uuid.js';
import { ClientConnectionEvent, IPCServer } from '../common/ipc.js';
import { ChunkStream, Client, ISocket, Protocol, SocketCloseEvent, SocketCloseEventType, SocketDiagnostics, SocketDiagnosticsEventType } from '../common/ipc.net.js';

/**
 * Maximum time to wait for a 'close' event to fire after the socket stream
 * ends. For unix domain sockets, the close event may not fire consistently
 * due to what appears to be a Node.js bug.
 *
 * @see https://github.com/microsoft/vscode/issues/211462#issuecomment-2155471996
 */
const socketEndTimeoutMs = 30_000;

export class NodeSocket implements ISocket {

	public readonly debugLabel: string;
	public readonly socket: Socket;
	private readonly _errorListener: (err: any) => void;
	private readonly _closeListener: (hadError: boolean) => void;
	private readonly _endListener: () => void;
	private _canWrite = true;

	public traceSocketEvent(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | any): void {
		SocketDiagnostics.traceSocketEvent(this.socket, this.debugLabel, type, data);
	}

	constructor(socket: Socket, debugLabel: string = '') {
		this.debugLabel = debugLabel;
		this.socket = socket;
		this.traceSocketEvent(SocketDiagnosticsEventType.Created, { type: 'NodeSocket' });
		this._errorListener = (err: any) => {
			this.traceSocketEvent(SocketDiagnosticsEventType.Error, { code: err?.code, message: err?.message });
			if (err) {
				if (err.code === 'EPIPE') {
					// An EPIPE exception at the wrong time can lead to a renderer process crash
					// so ignore the error since the socket will fire the close event soon anyways:
					// > https://nodejs.org/api/errors.html#errors_common_system_errors
					// > EPIPE (Broken pipe): A write on a pipe, socket, or FIFO for which there is no
					// > process to read the data. Commonly encountered at the net and http layers,
					// > indicative that the remote side of the stream being written to has been closed.
					return;
				}
				onUnexpectedError(err);
			}
		};
		this.socket.on('error', this._errorListener);

		let endTimeoutHandle: NodeJS.Timeout | undefined;
		this._closeListener = (hadError: boolean) => {
			this.traceSocketEvent(SocketDiagnosticsEventType.Close, { hadError });
			this._canWrite = false;
			if (endTimeoutHandle) {
				clearTimeout(endTimeoutHandle);
			}
		};
		this.socket.on('close', this._closeListener);

		this._endListener = () => {
			this.traceSocketEvent(SocketDiagnosticsEventType.NodeEndReceived);
			this._canWrite = false;
			endTimeoutHandle = setTimeout(() => socket.destroy(), socketEndTimeoutMs);
		};
		this.socket.on('end', this._endListener);
	}

	public dispose(): void {
		this.socket.off('error', this._errorListener);
		this.socket.off('close', this._closeListener);
		this.socket.off('end', this._endListener);
		this.socket.destroy();
	}

	public onData(_listener: (e: VSBuffer) => void): IDisposable {
		const listener = (buff: Buffer) => {
			this.traceSocketEvent(SocketDiagnosticsEventType.Read, buff);
			_listener(VSBuffer.wrap(buff));
		};
		this.socket.on('data', listener);
		return {
			dispose: () => this.socket.off('data', listener)
		};
	}

	public onClose(listener: (e: SocketCloseEvent) => void): IDisposable {
		const adapter = (hadError: boolean) => {
			listener({
				type: SocketCloseEventType.NodeSocketCloseEvent,
				hadError: hadError,
				error: undefined
			});
		};
		this.socket.on('close', adapter);
		return {
			dispose: () => this.socket.off('close', adapter)
		};
	}

	public onEnd(listener: () => void): IDisposable {
		const adapter = () => {
			listener();
		};
		this.socket.on('end', adapter);
		return {
			dispose: () => this.socket.off('end', adapter)
		};
	}

	public write(buffer: VSBuffer): void {
		// return early if socket has been destroyed in the meantime
		if (this.socket.destroyed || !this._canWrite) {
			return;
		}

		// we ignore the returned value from `write` because we would have to cached the data
		// anyways and nodejs is already doing that for us:
		// > https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
		// > However, the false return value is only advisory and the writable stream will unconditionally
		// > accept and buffer chunk even if it has not been allowed to drain.
		try {
			this.traceSocketEvent(SocketDiagnosticsEventType.Write, buffer);
			this.socket.write(buffer.buffer, (err: any) => {
				if (err) {
					if (err.code === 'EPIPE') {
						// An EPIPE exception at the wrong time can lead to a renderer process crash
						// so ignore the error since the socket will fire the close event soon anyways:
						// > https://nodejs.org/api/errors.html#errors_common_system_errors
						// > EPIPE (Broken pipe): A write on a pipe, socket, or FIFO for which there is no
						// > process to read the data. Commonly encountered at the net and http layers,
						// > indicative that the remote side of the stream being written to has been closed.
						return;
					}
					onUnexpectedError(err);
				}
			});
		} catch (err) {
			if (err.code === 'EPIPE') {
				// An EPIPE exception at the wrong time can lead to a renderer process crash
				// so ignore the error since the socket will fire the close event soon anyways:
				// > https://nodejs.org/api/errors.html#errors_common_system_errors
				// > EPIPE (Broken pipe): A write on a pipe, socket, or FIFO for which there is no
				// > process to read the data. Commonly encountered at the net and http layers,
				// > indicative that the remote side of the stream being written to has been closed.
				return;
			}
			onUnexpectedError(err);
		}
	}

	public end(): void {
		this.traceSocketEvent(SocketDiagnosticsEventType.NodeEndSent);
		this.socket.end();
	}

	public drain(): Promise<void> {
		this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainBegin);
		return new Promise<void>((resolve, reject) => {
			if (this.socket.bufferSize === 0) {
				this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainEnd);
				resolve();
				return;
			}
			const finished = () => {
				this.socket.off('close', finished);
				this.socket.off('end', finished);
				this.socket.off('error', finished);
				this.socket.off('timeout', finished);
				this.socket.off('drain', finished);
				this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainEnd);
				resolve();
			};
			this.socket.on('close', finished);
			this.socket.on('end', finished);
			this.socket.on('error', finished);
			this.socket.on('timeout', finished);
			this.socket.on('drain', finished);
		});
	}
}

const enum Constants {
	MinHeaderByteSize = 2,
	/**
	 * If we need to write a large buffer, we will split it into 256KB chunks and
	 * send each chunk as a websocket message. This is to prevent that the sending
	 * side is stuck waiting for the entire buffer to be compressed before writing
	 * to the underlying socket or that the receiving side is stuck waiting for the
	 * entire message to be received before processing the bytes.
	 */
	MaxWebSocketMessageLength = 256 * 1024 // 256 KB
}

const enum ReadState {
	PeekHeader = 1,
	ReadHeader = 2,
	ReadBody = 3,
	Fin = 4
}

interface ISocketTracer {
	traceSocketEvent(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | any): void;
}

interface FrameOptions {
	compressed: boolean;
	opcode: number;
}

/**
 * See https://tools.ietf.org/html/rfc6455#section-5.2
 */
export class WebSocketNodeSocket extends Disposable implements ISocket, ISocketTracer {

	public readonly socket: NodeSocket;
	private readonly _flowManager: WebSocketFlowManager;
	private readonly _incomingData: ChunkStream;
	private readonly _onData = this._register(new Emitter<VSBuffer>());
	private readonly _onClose = this._register(new Emitter<SocketCloseEvent>());
	private _isEnded: boolean = false;

	private readonly _state = {
		state: ReadState.PeekHeader,
		readLen: Constants.MinHeaderByteSize,
		fin: 0,
		compressed: false,
		firstFrameOfMessage: true,
		mask: 0,
		opcode: 0
	};

	public get permessageDeflate(): boolean {
		return this._flowManager.permessageDeflate;
	}

	public get recordedInflateBytes(): VSBuffer {
		return this._flowManager.recordedInflateBytes;
	}

	public traceSocketEvent(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | any): void {
		this.socket.traceSocketEvent(type, data);
	}

	/**
	 * Create a socket which can communicate using WebSocket frames.
	 *
	 * **NOTE**: When using the permessage-deflate WebSocket extension, if parts of inflating was done
	 *  in a different zlib instance, we need to pass all those bytes into zlib, otherwise the inflate
	 *  might hit an inflated portion referencing a distance too far back.
	 *
	 * @param socket The underlying socket
	 * @param permessageDeflate Use the permessage-deflate WebSocket extension
	 * @param inflateBytes "Seed" zlib inflate with these bytes.
	 * @param recordInflateBytes Record all bytes sent to inflate
	 */
	constructor(socket: NodeSocket, permessageDeflate: boolean, inflateBytes: VSBuffer | null, recordInflateBytes: boolean) {
		super();
		this.socket = socket;
		this.traceSocketEvent(SocketDiagnosticsEventType.Created, { type: 'WebSocketNodeSocket', permessageDeflate, inflateBytesLength: inflateBytes?.byteLength || 0, recordInflateBytes });
		this._flowManager = this._register(new WebSocketFlowManager(
			this,
			permessageDeflate,
			inflateBytes,
			recordInflateBytes,
			this._onData,
			(data, options) => this._write(data, options)
		));
		this._register(this._flowManager.onError((err) => {
			// zlib errors are fatal, since we have no idea how to recover
			console.error(err);
			onUnexpectedError(err);
			this._onClose.fire({
				type: SocketCloseEventType.NodeSocketCloseEvent,
				hadError: true,
				error: err
			});
		}));
		this._incomingData = new ChunkStream();
		this._register(this.socket.onData(data => this._acceptChunk(data)));
		this._register(this.socket.onClose(async (e) => {
			// Delay surfacing the close event until the async inflating is done
			// and all data has been emitted
			if (this._flowManager.isProcessingReadQueue()) {
				await Event.toPromise(this._flowManager.onDidFinishProcessingReadQueue);
			}
			this._onClose.fire(e);
		}));
	}

	public override dispose(): void {
		if (this._flowManager.isProcessingWriteQueue()) {
			// Wait for any outstanding writes to finish before disposing
			this._register(this._flowManager.onDidFinishProcessingWriteQueue(() => {
				this.dispose();
			}));
		} else {
			this.socket.dispose();
			super.dispose();
		}
	}

	public onData(listener: (e: VSBuffer) => void): IDisposable {
		return this._onData.event(listener);
	}

	public onClose(listener: (e: SocketCloseEvent) => void): IDisposable {
		return this._onClose.event(listener);
	}

	public onEnd(listener: () => void): IDisposable {
		return this.socket.onEnd(listener);
	}

	public write(buffer: VSBuffer): void {
		// If we write many logical messages (let's say 1000 messages of 100KB) during a single process tick, we do
		// this thing where we install a process.nextTick timer and group all of them together and we then issue a
		// single WebSocketNodeSocket.write with a 100MB buffer.
		//
		// The first problem is that the actual writing to the underlying node socket will only happen after all of
		// the 100MB have been deflated (due to waiting on zlib flush). The second problem is on the reading side,
		// where we will get a single WebSocketNodeSocket.onData event fired when all the 100MB have arrived,
		// delaying processing the 1000 received messages until all have arrived, instead of processing them as each
		// one arrives.
		//
		// We therefore split the buffer into chunks, and issue a write for each chunk.

		let start = 0;
		while (start < buffer.byteLength) {
			this._flowManager.writeMessage(buffer.slice(start, Math.min(start + Constants.MaxWebSocketMessageLength, buffer.byteLength)), { compressed: true, opcode: 0x02 /* Binary frame */ });
			start += Constants.MaxWebSocketMessageLength;
		}
	}

	private _write(buffer: VSBuffer, { compressed, opcode }: FrameOptions): void {
		if (this._isEnded) {
			// Avoid ERR_STREAM_WRITE_AFTER_END
			return;
		}

		this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketWrite, buffer);
		let headerLen = Constants.MinHeaderByteSize;
		if (buffer.byteLength < 126) {
			headerLen += 0;
		} else if (buffer.byteLength < 2 ** 16) {
			headerLen += 2;
		} else {
			headerLen += 8;
		}
		const header = VSBuffer.alloc(headerLen);

		// The RSV1 bit indicates a compressed frame
		const compressedFlag = compressed ? 0b01000000 : 0;
		const opcodeFlag = opcode & 0b00001111;
		header.writeUInt8(0b10000000 | compressedFlag | opcodeFlag, 0);
		if (buffer.byteLength < 126) {
			header.writeUInt8(buffer.byteLength, 1);
		} else if (buffer.byteLength < 2 ** 16) {
			header.writeUInt8(126, 1);
			let offset = 1;
			header.writeUInt8((buffer.byteLength >>> 8) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 0) & 0b11111111, ++offset);
		} else {
			header.writeUInt8(127, 1);
			let offset = 1;
			header.writeUInt8(0, ++offset);
			header.writeUInt8(0, ++offset);
			header.writeUInt8(0, ++offset);
			header.writeUInt8(0, ++offset);
			header.writeUInt8((buffer.byteLength >>> 24) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 16) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 8) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 0) & 0b11111111, ++offset);
		}

		this.socket.write(VSBuffer.concat([header, buffer]));
	}

	public end(): void {
		this._isEnded = true;
		this.socket.end();
	}

	private _acceptChunk(data: VSBuffer): void {
		if (data.byteLength === 0) {
			return;
		}

		this._incomingData.acceptChunk(data);

		while (this._incomingData.byteLength >= this._state.readLen) {

			if (this._state.state === ReadState.PeekHeader) {
				// peek to see if we can read the entire header
				const peekHeader = this._incomingData.peek(this._state.readLen);
				const firstByte = peekHeader.readUInt8(0);
				const finBit = (firstByte & 0b10000000) >>> 7;
				const rsv1Bit = (firstByte & 0b01000000) >>> 6;
				const opcode = (firstByte & 0b00001111);

				const secondByte = peekHeader.readUInt8(1);
				const hasMask = (secondByte & 0b10000000) >>> 7;
				const len = (secondByte & 0b01111111);

				this._state.state = ReadState.ReadHeader;
				this._state.readLen = Constants.MinHeaderByteSize + (hasMask ? 4 : 0) + (len === 126 ? 2 : 0) + (len === 127 ? 8 : 0);
				this._state.fin = finBit;
				if (this._state.firstFrameOfMessage) {
					// if the frame is compressed, the RSV1 bit is set only for the first frame of the message
					this._state.compressed = Boolean(rsv1Bit);
				}
				this._state.firstFrameOfMessage = Boolean(finBit);
				this._state.mask = 0;
				this._state.opcode = opcode;

				this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader, { headerSize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, opcode: this._state.opcode });

			} else if (this._state.state === ReadState.ReadHeader) {
				// read entire header
				const header = this._incomingData.read(this._state.readLen);
				const secondByte = header.readUInt8(1);
				const hasMask = (secondByte & 0b10000000) >>> 7;
				let len = (secondByte & 0b01111111);

				let offset = 1;
				if (len === 126) {
					len = (
						header.readUInt8(++offset) * 2 ** 8
						+ header.readUInt8(++offset)
					);
				} else if (len === 127) {
					len = (
						header.readUInt8(++offset) * 0
						+ header.readUInt8(++offset) * 0
						+ header.readUInt8(++offset) * 0
						+ header.readUInt8(++offset) * 0
						+ header.readUInt8(++offset) * 2 ** 24
						+ header.readUInt8(++offset) * 2 ** 16
						+ header.readUInt8(++offset) * 2 ** 8
						+ header.readUInt8(++offset)
					);
				}

				let mask = 0;
				if (hasMask) {
					mask = (
						header.readUInt8(++offset) * 2 ** 24
						+ header.readUInt8(++offset) * 2 ** 16
						+ header.readUInt8(++offset) * 2 ** 8
						+ header.readUInt8(++offset)
					);
				}

				this._state.state = ReadState.ReadBody;
				this._state.readLen = len;
				this._state.mask = mask;

				this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader, { bodySize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, mask: this._state.mask, opcode: this._state.opcode });

			} else if (this._state.state === ReadState.ReadBody) {
				// read body

				const body = this._incomingData.read(this._state.readLen);
				this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketReadData, body);

				unmask(body, this._state.mask);
				this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketUnmaskedData, body);

				this._state.state = ReadState.PeekHeader;
				this._state.readLen = Constants.MinHeaderByteSize;
				this._state.mask = 0;

				if (this._state.opcode <= 0x02 /* Continuation frame or Text frame or binary frame */) {
					this._flowManager.acceptFrame(body, this._state.compressed, !!this._state.fin);
				} else if (this._state.opcode === 0x09 /* Ping frame */) {
					// Ping frames could be send by some browsers e.g. Firefox
					this._flowManager.writeMessage(body, { compressed: false, opcode: 0x0A /* Pong frame */ });
				}
			}
		}
	}

	public async drain(): Promise<void> {
		this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketDrainBegin);
		if (this._flowManager.isProcessingWriteQueue()) {
			await Event.toPromise(this._flowManager.onDidFinishProcessingWriteQueue);
		}
		await this.socket.drain();
		this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketDrainEnd);
	}
}

class WebSocketFlowManager extends Disposable {

	private readonly _onError = this._register(new Emitter<Error>());
	public readonly onError = this._onError.event;

	private readonly _zlibInflateStream: ZlibInflateStream | null;
	private readonly _zlibDeflateStream: ZlibDeflateStream | null;
	private readonly _writeQueue: { data: VSBuffer; options: FrameOptions }[] = [];
	private readonly _readQueue: { data: VSBuffer; isCompressed: boolean; isLastFrameOfMessage: boolean }[] = [];

	private readonly _onDidFinishProcessingReadQueue = this._register(new Emitter<void>());
	public readonly onDidFinishProcessingReadQueue = this._onDidFinishProcessingReadQueue.event;

	private readonly _onDidFinishProcessingWriteQueue = this._register(new Emitter<void>());
	public readonly onDidFinishProcessingWriteQueue = this._onDidFinishProcessingWriteQueue.event;

	public get permessageDeflate(): boolean {
		return Boolean(this._zlibInflateStream && this._zlibDeflateStream);
	}

	public get recordedInflateBytes(): VSBuffer {
		if (this._zlibInflateStream) {
			return this._zlibInflateStream.recordedInflateBytes;
		}
		return VSBuffer.alloc(0);
	}

	constructor(
		private readonly _tracer: ISocketTracer,
		permessageDeflate: boolean,
		inflateBytes: VSBuffer | null,
		recordInflateBytes: boolean,
		private readonly _onData: Emitter<VSBuffer>,
		private readonly _writeFn: (data: VSBuffer, options: FrameOptions) => void
	) {
		super();
		if (permessageDeflate) {
			// See https://tools.ietf.org/html/rfc7692#page-16
			// To simplify our logic, we don't negotiate the window size
			// and simply dedicate (2^15) / 32kb per web socket
			this._zlibInflateStream = this._register(new ZlibInflateStream(this._tracer, recordInflateBytes, inflateBytes, { windowBits: 15 }));
			this._zlibDeflateStream = this._register(new ZlibDeflateStream(this._tracer, { windowBits: 15 }));
			this._register(this._zlibInflateStream.onError((err) => this._onError.fire(err)));
			this._register(this._zlibDeflateStream.onError((err) => this._onError.fire(err)));
		} else {
			this._zlibInflateStream = null;
			this._zlibDeflateStream = null;
		}
	}

	public writeMessage(data: VSBuffer, options: FrameOptions): void {
		this._writeQueue.push({ data, options });
		this._processWriteQueue();
	}

	private _isProcessingWriteQueue = false;
	private async _processWriteQueue(): Promise<void> {
		if (this._isProcessingWriteQueue) {
			return;
		}
		this._isProcessingWriteQueue = true;
		while (this._writeQueue.length > 0) {
			const { data, options } = this._writeQueue.shift()!;
			if (this._zlibDeflateStream && options.compressed) {
				const compressedData = await this._deflateMessage(this._zlibDeflateStream, data);
				this._writeFn(compressedData, options);
			} else {
				this._writeFn(data, { ...options, compressed: false });
			}
		}
		this._isProcessingWriteQueue = false;
		this._onDidFinishProcessingWriteQueue.fire();
	}

	public isProcessingWriteQueue(): boolean {
		return (this._isProcessingWriteQueue);
	}

	/**
	 * Subsequent calls should wait for the previous `_deflateBuffer` call to complete.
	 */
	private _deflateMessage(zlibDeflateStream: ZlibDeflateStream, buffer: VSBuffer): Promise<VSBuffer> {
		return new Promise<VSBuffer>((resolve, reject) => {
			zlibDeflateStream.write(buffer);
			zlibDeflateStream.flush(data => resolve(data));
		});
	}

	public acceptFrame(data: VSBuffer, isCompressed: boolean, isLastFrameOfMessage: boolean): void {
		this._readQueue.push({ data, isCompressed, isLastFrameOfMessage });
		this._processReadQueue();
	}

	private _isProcessingReadQueue = false;
	private async _processReadQueue(): Promise<void> {
		if (this._isProcessingReadQueue) {
			return;
		}
		this._isProcessingReadQueue = true;
		while (this._readQueue.length > 0) {
			const frameInfo = this._readQueue.shift()!;
			if (this._zlibInflateStream && frameInfo.isCompressed) {
				// See https://datatracker.ietf.org/doc/html/rfc7692#section-9.2
				// Even if permessageDeflate is negotiated, it is possible
				// that the other side might decide to send uncompressed messages
				// So only decompress messages that have the RSV 1 bit set
				const data = await this._inflateFrame(this._zlibInflateStream, frameInfo.data, frameInfo.isLastFrameOfMessage);
				this._onData.fire(data);
			} else {
				this._onData.fire(frameInfo.data);
			}
		}
		this._isProcessingReadQueue = false;
		this._onDidFinishProcessingReadQueue.fire();
	}

	public isProcessingReadQueue(): boolean {
		return (this._isProcessingReadQueue);
	}

	/**
	 * Subsequent calls should wait for the previous `transformRead` call to complete.
	 */
	private _inflateFrame(zlibInflateStream: ZlibInflateStream, buffer: VSBuffer, isLastFrameOfMessage: boolean): Promise<VSBuffer> {
		return new Promise<VSBuffer>((resolve, reject) => {
			// See https://tools.ietf.org/html/rfc7692#section-7.2.2
			zlibInflateStream.write(buffer);
			if (isLastFrameOfMessage) {
				zlibInflateStream.write(VSBuffer.fromByteArray([0x00, 0x00, 0xff, 0xff]));
			}
			zlibInflateStream.flush(data => resolve(data));
		});
	}
}

class ZlibInflateStream extends Disposable {

	private readonly _onError = this._register(new Emitter<Error>());
	public readonly onError = this._onError.event;

	private readonly _zlibInflate: InflateRaw;
	private readonly _recordedInflateBytes: VSBuffer[] = [];
	private readonly _pendingInflateData: VSBuffer[] = [];

	public get recordedInflateBytes(): VSBuffer {
		if (this._recordInflateBytes) {
			return VSBuffer.concat(this._recordedInflateBytes);
		}
		return VSBuffer.alloc(0);
	}

	constructor(
		private readonly _tracer: ISocketTracer,
		private readonly _recordInflateBytes: boolean,
		inflateBytes: VSBuffer | null,
		options: ZlibOptions
	) {
		super();
		this._zlibInflate = createInflateRaw(options);
		this._zlibInflate.on('error', (err) => {
			this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateError, { message: err?.message, code: (<any>err)?.code });
			this._onError.fire(err);
		});
		this._zlibInflate.on('data', (data: Buffer) => {
			this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateData, data);
			this._pendingInflateData.push(VSBuffer.wrap(data));
		});
		if (inflateBytes) {
			this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateInitialWrite, inflateBytes.buffer);
			this._zlibInflate.write(inflateBytes.buffer);
			this._zlibInflate.flush(() => {
				this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateInitialFlushFired);
				this._pendingInflateData.length = 0;
			});
		}
	}

	public write(buffer: VSBuffer): void {
		if (this._recordInflateBytes) {
			this._recordedInflateBytes.push(buffer.clone());
		}
		this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateWrite, buffer);
		this._zlibInflate.write(buffer.buffer);
	}

	public flush(callback: (data: VSBuffer) => void): void {
		this._zlibInflate.flush(() => {
			this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateFlushFired);
			const data = VSBuffer.concat(this._pendingInflateData);
			this._pendingInflateData.length = 0;
			callback(data);
		});
	}
}

class ZlibDeflateStream extends Disposable {

	private readonly _onError = this._register(new Emitter<Error>());
	public readonly onError = this._onError.event;

	private readonly _zlibDeflate: DeflateRaw;
	private readonly _pendingDeflateData: VSBuffer[] = [];

	constructor(
		private readonly _tracer: ISocketTracer,
		options: ZlibOptions
	) {
		super();

		this._zlibDeflate = createDeflateRaw({
			windowBits: 15
		});
		this._zlibDeflate.on('error', (err) => {
			this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateError, { message: err?.message, code: (<any>err)?.code });
			this._onError.fire(err);
		});
		this._zlibDeflate.on('data', (data: Buffer) => {
			this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateData, data);
			this._pendingDeflateData.push(VSBuffer.wrap(data));
		});
	}

	public write(buffer: VSBuffer): void {
		this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateWrite, buffer.buffer);
		this._zlibDeflate.write(<Buffer>buffer.buffer);
	}

	public flush(callback: (data: VSBuffer) => void): void {
		// See https://zlib.net/manual.html#Constants
		this._zlibDeflate.flush(/*Z_SYNC_FLUSH*/2, () => {
			this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateFlushFired);

			let data = VSBuffer.concat(this._pendingDeflateData);
			this._pendingDeflateData.length = 0;

			// See https://tools.ietf.org/html/rfc7692#section-7.2.1
			data = data.slice(0, data.byteLength - 4);

			callback(data);
		});
	}
}

function unmask(buffer: VSBuffer, mask: number): void {
	if (mask === 0) {
		return;
	}
	const cnt = buffer.byteLength >>> 2;
	for (let i = 0; i < cnt; i++) {
		const v = buffer.readUInt32BE(i * 4);
		buffer.writeUInt32BE(v ^ mask, i * 4);
	}
	const offset = cnt * 4;
	const bytesLeft = buffer.byteLength - offset;
	const m3 = (mask >>> 24) & 0b11111111;
	const m2 = (mask >>> 16) & 0b11111111;
	const m1 = (mask >>> 8) & 0b11111111;
	if (bytesLeft >= 1) {
		buffer.writeUInt8(buffer.readUInt8(offset) ^ m3, offset);
	}
	if (bytesLeft >= 2) {
		buffer.writeUInt8(buffer.readUInt8(offset + 1) ^ m2, offset + 1);
	}
	if (bytesLeft >= 3) {
		buffer.writeUInt8(buffer.readUInt8(offset + 2) ^ m1, offset + 2);
	}
}

// Read this before there's any chance it is overwritten
// Related to https://github.com/microsoft/vscode/issues/30624
export const XDG_RUNTIME_DIR = <string | undefined>process.env['XDG_RUNTIME_DIR'];

const safeIpcPathLengths: { [platform: number]: number } = {
	[Platform.Linux]: 107,
	[Platform.Mac]: 103
};

export function createRandomIPCHandle(): string {
	const randomSuffix = generateUuid();

	// Windows: use named pipe
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\vscode-ipc-${randomSuffix}-sock`;
	}

	// Mac & Unix: Use socket file
	// Unix: Prefer XDG_RUNTIME_DIR over user data path
	const basePath = process.platform !== 'darwin' && XDG_RUNTIME_DIR ? XDG_RUNTIME_DIR : tmpdir();
	const result = join(basePath, `vscode-ipc-${randomSuffix}.sock`);

	// Validate length
	validateIPCHandleLength(result);

	return result;
}

export function createStaticIPCHandle(directoryPath: string, type: string, version: string): string {
	const scope = createHash('sha256').update(directoryPath).digest('hex');
	const scopeForSocket = scope.substr(0, 8);

	// Windows: use named pipe
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\${scopeForSocket}-${version}-${type}-sock`;
	}

	// Mac & Unix: Use socket file
	// Unix: Prefer XDG_RUNTIME_DIR over user data path, unless portable
	// Trim the version and type values for the socket to prevent too large
	// file names causing issues: https://unix.stackexchange.com/q/367008

	const versionForSocket = version.substr(0, 4);
	const typeForSocket = type.substr(0, 6);

	let result: string;
	if (process.platform !== 'darwin' && XDG_RUNTIME_DIR && !process.env['VSCODE_PORTABLE']) {
		result = join(XDG_RUNTIME_DIR, `vscode-${scopeForSocket}-${versionForSocket}-${typeForSocket}.sock`);
	} else {
		result = join(directoryPath, `${versionForSocket}-${typeForSocket}.sock`);
	}

	// Validate length
	validateIPCHandleLength(result);

	return result;
}

function validateIPCHandleLength(handle: string): void {
	const limit = safeIpcPathLengths[platform];
	if (typeof limit === 'number' && handle.length >= limit) {
		// https://nodejs.org/api/net.html#net_identifying_paths_for_ipc_connections
		console.warn(`WARNING: IPC handle "${handle}" is longer than ${limit} chars, try a shorter --user-data-dir`);
	}
}

export class Server extends IPCServer {

	private static toClientConnectionEvent(server: NetServer): Event<ClientConnectionEvent> {
		const onConnection = Event.fromNodeEventEmitter<Socket>(server, 'connection');

		return Event.map(onConnection, socket => ({
			protocol: new Protocol(new NodeSocket(socket, 'ipc-server-connection')),
			onDidClientDisconnect: Event.once(Event.fromNodeEventEmitter<void>(socket, 'close'))
		}));
	}

	private server: NetServer | null;

	constructor(server: NetServer) {
		super(Server.toClientConnectionEvent(server));
		this.server = server;
	}

	override dispose(): void {
		super.dispose();
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}
}

export function serve(port: number): Promise<Server>;
export function serve(namedPipe: string): Promise<Server>;
export function serve(hook: any): Promise<Server> {
	return new Promise<Server>((c, e) => {
		const server = createServer();

		server.on('error', e);
		server.listen(hook, () => {
			server.removeListener('error', e);
			c(new Server(server));
		});
	});
}

export function connect(options: { host: string; port: number }, clientId: string): Promise<Client>;
export function connect(port: number, clientId: string): Promise<Client>;
export function connect(namedPipe: string, clientId: string): Promise<Client>;
export function connect(hook: any, clientId: string): Promise<Client> {
	return new Promise<Client>((c, e) => {
		const socket = createConnection(hook, () => {
			socket.removeListener('error', e);
			c(Client.fromSocket(new NodeSocket(socket, `ipc-client${clientId}`), clientId));
		});

		socket.once('error', e);
	});
}
