/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Socket, Server as NetServer, createConnection, createServer } from 'net';
import { Event, Emitter } from 'vs/base/common/event';
import { IMessagePassingProtocol, ClientConnectionEvent, IPCServer, IPCClient } from 'vs/base/parts/ipc/node/ipc';
import { join } from 'vs/base/common/path';
import { tmpdir } from 'os';
import * as fs from 'fs';
import { generateUuid } from 'vs/base/common/uuid';
import { IDisposable } from 'vs/base/common/lifecycle';

export function generateRandomPipeName(): string {
	const randomSuffix = generateUuid();
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\vscode-ipc-${randomSuffix}-sock`;
	} else {
		// Mac/Unix: use socket file
		return join(tmpdir(), `vscode-ipc-${randomSuffix}.sock`);
	}
}

function log(fd: number, msg: string, data?: Buffer): void {
	const date = new Date();
	fs.writeSync(fd, `[${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}] ${msg}\n`);
	if (data) {
		fs.writeSync(fd, data);
		fs.writeSync(fd, `\n---------------------------------------------------------------------------------------------------------\n`);
	}
	fs.fdatasyncSync(fd);
}

const EMPTY_BUFFER = Buffer.allocUnsafe(0);

class ChunkStream {

	private _chunks: Buffer[];
	private _totalLength: number;

	public get byteLength() {
		return this._totalLength;
	}

	constructor() {
		this._chunks = [];
		this._totalLength = 0;
	}

	public acceptChunk(buff: Buffer) {
		this._chunks.push(buff);
		this._totalLength += buff.byteLength;
	}

	public read(byteCount: number): Buffer {
		if (byteCount === 0) {
			return EMPTY_BUFFER;
		}

		if (byteCount > this._totalLength) {
			throw new Error(`Cannot read so many bytes!`);
		}

		if (this._chunks[0].byteLength === byteCount) {
			// super fast path, precisely first chunk must be returned
			const result = this._chunks.shift()!;
			this._totalLength -= byteCount;
			return result;
		}

		if (this._chunks[0].byteLength > byteCount) {
			// fast path, the reading is entirely within the first chunk
			const result = this._chunks[0].slice(0, byteCount);
			this._chunks[0] = this._chunks[0].slice(byteCount);
			this._totalLength -= byteCount;
			return result;
		}

		let result = Buffer.allocUnsafe(byteCount);
		let resultOffset = 0;
		while (byteCount > 0) {
			const chunk = this._chunks[0];
			if (chunk.byteLength > byteCount) {
				// this chunk will survive
				this._chunks[0] = chunk.slice(byteCount);

				chunk.copy(result, resultOffset, 0, byteCount);
				resultOffset += byteCount;
				this._totalLength -= byteCount;
				byteCount -= byteCount;
			} else {
				// this chunk will be entirely read
				this._chunks.shift();

				chunk.copy(result, resultOffset, 0, chunk.byteLength);
				resultOffset += chunk.byteLength;
				this._totalLength -= chunk.byteLength;
				byteCount -= chunk.byteLength;
			}
		}
		return result;
	}
}

const enum ProtocolMessageType {
	None = 0,
	Regular = 1,
	Control = 2,
	Ack = 3,
	KeepAlive = 4
}

function ProtocolMessageTypeToString(type: ProtocolMessageType): string {
	switch (type) {
		case ProtocolMessageType.None: return 'None';
		case ProtocolMessageType.Regular: return 'Regular';
		case ProtocolMessageType.Control: return 'Control';
		case ProtocolMessageType.Ack: return 'Ack';
		case ProtocolMessageType.KeepAlive: return 'KeepAlive';
	}
}

export const enum ProtocolConstants {
	HeaderLength = 13,
	/**
	 * Send an Acknowledge message at most 2 seconds later...
	 */
	AcknowledgeTime = 2000, // 2 seconds
	/**
	 * If there is a message that has been unacknowledged for 10 seconds, consider the connection closed...
	 */
	AcknowledgeTimeoutTime = 10000, // 10 seconds
	/**
	 * Send at least a message every 30s for keep alive reasons.
	 */
	KeepAliveTime = 30000, // 30 seconds
	/**
	 * If there is no message received for 60 seconds, consider the connection closed...
	 */
	KeepAliveTimeoutTime = 60000, // 60 seconds
	/**
	 * If there is no reconnection within this time-frame, consider the connection permanently closed...
	 */
	ReconnectionGraceTime = 60 * 60 * 1000, // 1hr
}

class ProtocolMessage {

	public writtenTime: number;

	constructor(
		public readonly type: ProtocolMessageType,
		public readonly id: number,
		public readonly ack: number,
		public readonly data: Buffer
	) {
		this.writtenTime = 0;
	}

	public get size(): number {
		return this.data.byteLength;
	}
}

class ProtocolReader {

	private readonly _socket: Socket;
	private _isDisposed: boolean;
	private readonly _incomingData: ChunkStream;
	private readonly _socketDataListener: (data: Buffer) => void;
	public lastReadTime: number;

	private readonly _onMessage = new Emitter<ProtocolMessage>();
	public readonly onMessage: Event<ProtocolMessage> = this._onMessage.event;

	private readonly _state = {
		readHead: true,
		readLen: ProtocolConstants.HeaderLength,
		messageType: ProtocolMessageType.None,
		id: 0,
		ack: 0
	};

	constructor(socket: Socket) {
		this._socket = socket;
		this._isDisposed = false;
		this._incomingData = new ChunkStream();
		this._socketDataListener = (data: Buffer) => this.acceptChunk(data);
		this._socket.on('data', this._socketDataListener);
		this.lastReadTime = Date.now();
	}

	public acceptChunk(data: Buffer | null): void {
		if (!data || data.byteLength === 0) {
			return;
		}

		this.lastReadTime = Date.now();

		this._incomingData.acceptChunk(data);

		while (this._incomingData.byteLength >= this._state.readLen) {

			const buff = this._incomingData.read(this._state.readLen);

			if (this._state.readHead) {
				// buff is the header

				// save new state => next time will read the body
				this._state.readHead = false;
				this._state.readLen = buff.readUInt32BE(9, true);
				this._state.messageType = <ProtocolMessageType>buff.readUInt8(0, true);
				this._state.id = buff.readUInt32BE(1, true);
				this._state.ack = buff.readUInt32BE(5, true);
			} else {
				// buff is the body
				const messageType = this._state.messageType;
				const id = this._state.id;
				const ack = this._state.ack;

				// save new state => next time will read the header
				this._state.readHead = true;
				this._state.readLen = ProtocolConstants.HeaderLength;
				this._state.messageType = ProtocolMessageType.None;
				this._state.id = 0;
				this._state.ack = 0;

				this._onMessage.fire(new ProtocolMessage(messageType, id, ack, buff));

				if (this._isDisposed) {
					// check if an event listener lead to our disposal
					break;
				}
			}
		}
	}

	public readEntireBuffer(): Buffer {
		return this._incomingData.read(this._incomingData.byteLength);
	}

	public dispose(): void {
		this._isDisposed = true;
		this._socket.removeListener('data', this._socketDataListener);
	}
}

class ProtocolWriter {

	private _isDisposed: boolean;
	private readonly _socket: Socket;
	private readonly _logFile: number;
	private _data: Buffer[];
	private _totalLength: number;
	public lastWriteTime: number;

	constructor(socket: Socket, logFile: number) {
		this._isDisposed = false;
		this._socket = socket;
		this._logFile = logFile;
		this._data = [];
		this._totalLength = 0;
		this.lastWriteTime = 0;
	}

	public dispose(): void {
		this.flush();
		this._isDisposed = true;
	}

	public flush(): void {
		// flush
		this._writeNow();
	}

	public write(msg: ProtocolMessage) {
		if (this._isDisposed) {
			console.warn(`Cannot write message in a disposed ProtocolWriter`);
			console.warn(msg);
			return;
		}
		if (this._logFile) {
			log(this._logFile, `send-${ProtocolMessageTypeToString(msg.type)}-${msg.id}-${msg.ack}-`, msg.data);
		}
		msg.writtenTime = Date.now();
		this.lastWriteTime = Date.now();
		const header = Buffer.allocUnsafe(ProtocolConstants.HeaderLength);
		header.writeUInt8(msg.type, 0, true);
		header.writeUInt32BE(msg.id, 1, true);
		header.writeUInt32BE(msg.ack, 5, true);
		header.writeUInt32BE(msg.data.length, 9, true);
		this._writeSoon(header, msg.data);
	}

	private _bufferAdd(head: Buffer, body: Buffer): boolean {
		const wasEmpty = this._totalLength === 0;
		this._data.push(head, body);
		this._totalLength += head.length + body.length;
		return wasEmpty;
	}

	private _bufferTake(): Buffer {
		const ret = Buffer.concat(this._data, this._totalLength);
		this._data.length = 0;
		this._totalLength = 0;
		return ret;
	}

	private _writeSoon(header: Buffer, data: Buffer): void {
		if (this._bufferAdd(header, data)) {
			setImmediate(() => {
				this._writeNow();
			});
		}
	}

	private _writeNow(): void {
		if (this._totalLength === 0) {
			return;
		}
		// return early if socket has been destroyed in the meantime
		if (this._socket.destroyed) {
			return;
		}
		// we ignore the returned value from `write` because we would have to cached the data
		// anyways and nodejs is already doing that for us:
		// > https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
		// > However, the false return value is only advisory and the writable stream will unconditionally
		// > accept and buffer chunk even if it has not not been allowed to drain.
		this._socket.write(this._bufferTake());
	}
}

/**
 * A message has the following format:
 * ```
 *     /-------------------------------|------\
 *     |             HEADER            |      |
 *     |-------------------------------| DATA |
 *     | TYPE | ID | ACK | DATA_LENGTH |      |
 *     \-------------------------------|------/
 * ```
 * The header is 9 bytes and consists of:
 *  - TYPE is 1 byte (ProtocolMessageType) - the message type
 *  - ID is 4 bytes (u32be) - the message id (can be 0 to indicate to be ignored)
 *  - ACK is 4 bytes (u32be) - the acknowledged message id (can be 0 to indicate to be ignored)
 *  - DATA_LENGTH is 4 bytes (u32be) - the length in bytes of DATA
 *
 * Only Regular messages are counted, other messages are not counted, nor acknowledged.
 */
export class Protocol implements IDisposable, IMessagePassingProtocol {

	private _socket: Socket;
	private _socketWriter: ProtocolWriter;
	private _socketReader: ProtocolReader;

	private _socketCloseListener: () => void;

	private _onMessage = new Emitter<Buffer>();
	readonly onMessage: Event<Buffer> = this._onMessage.event;

	private _onClose = new Emitter<void>();
	readonly onClose: Event<void> = this._onClose.event;

	constructor(socket: Socket) {
		this._socket = socket;
		this._socketWriter = new ProtocolWriter(this._socket, 0);
		this._socketReader = new ProtocolReader(this._socket);

		this._socketReader.onMessage((msg) => {
			if (msg.type === ProtocolMessageType.Regular) {
				this._onMessage.fire(msg.data);
			}
		});

		this._socketCloseListener = () => {
			this._onClose.fire();
		};
		this._socket.once('close', this._socketCloseListener);
	}

	dispose(): void {
		this._socketWriter.dispose();
		this._socketReader.dispose();
		this._socket.removeListener('close', this._socketCloseListener);
	}

	getSocket(): Socket {
		return this._socket;
	}

	send(buffer: Buffer): void {
		this._socketWriter.write(new ProtocolMessage(ProtocolMessageType.Regular, 0, 0, buffer));
	}
}

export class Server extends IPCServer {

	private static toClientConnectionEvent(server: NetServer): Event<ClientConnectionEvent> {
		const onConnection = Event.fromNodeEventEmitter<Socket>(server, 'connection');

		return Event.map(onConnection, socket => ({
			protocol: new Protocol(socket),
			onDidClientDisconnect: Event.once(Event.fromNodeEventEmitter<void>(socket, 'close'))
		}));
	}

	private server: NetServer | null;

	constructor(server: NetServer) {
		super(Server.toClientConnectionEvent(server));
		this.server = server;
	}

	dispose(): void {
		super.dispose();
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}
}

export class Client<TContext = string> extends IPCClient<TContext> {

	static fromSocket<TContext = string>(socket: Socket, id: TContext): Client<TContext> {
		return new Client(new Protocol(socket), id);
	}

	get onClose(): Event<void> { return this.protocol.onClose; }

	constructor(private protocol: Protocol | PersistentProtocol, id: TContext) {
		super(protocol, id);
	}

	dispose(): void {
		super.dispose();
		const socket = this.protocol.getSocket();
		this.protocol.dispose();
		socket.end();
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

export function connect(options: { host: string, port: number }, clientId: string): Promise<Client>;
export function connect(port: number, clientId: string): Promise<Client>;
export function connect(namedPipe: string, clientId: string): Promise<Client>;
export function connect(hook: any, clientId: string): Promise<Client> {
	return new Promise<Client>((c, e) => {
		const socket = createConnection(hook, () => {
			socket.removeListener('error', e);
			c(Client.fromSocket(socket, clientId));
		});

		socket.once('error', e);
	});
}

/**
 * Will ensure no messages are lost if there are no event listeners.
 */
function createBufferedEvent<T>(source: Event<T>): Event<T> {
	let emitter: Emitter<T>;
	let hasListeners = false;
	let isDeliveringMessages = false;
	let bufferedMessages: T[] = [];

	const deliverMessages = () => {
		if (isDeliveringMessages) {
			return;
		}
		isDeliveringMessages = true;
		while (hasListeners && bufferedMessages.length > 0) {
			emitter.fire(bufferedMessages.shift()!);
		}
		isDeliveringMessages = false;
	};

	source((e: T) => {
		bufferedMessages.push(e);
		deliverMessages();
	});

	emitter = new Emitter<T>({
		onFirstListenerAdd: () => {
			hasListeners = true;
			// it is important to deliver these messages after this call, but before
			// other messages have a chance to be received (to guarantee in order delivery)
			// that's why we're using here nextTick and not other types of timeouts
			process.nextTick(deliverMessages);
		},
		onLastListenerRemove: () => {
			hasListeners = false;
		}
	});

	return emitter.event;
}

class QueueElement<T> {
	public readonly data: T;
	public next: QueueElement<T> | null;

	constructor(data: T) {
		this.data = data;
		this.next = null;
	}
}

class Queue<T> {

	private _first: QueueElement<T> | null;
	private _last: QueueElement<T> | null;

	constructor() {
		this._first = null;
		this._last = null;
	}

	public peek(): T | null {
		if (!this._first) {
			return null;
		}
		return this._first.data;
	}

	public toArray(): T[] {
		let result: T[] = [], resultLen = 0;
		let it = this._first;
		while (it) {
			result[resultLen++] = it.data;
			it = it.next;
		}
		return result;
	}

	public pop(): void {
		if (!this._first) {
			return;
		}
		if (this._first === this._last) {
			this._first = null;
			this._last = null;
			return;
		}
		this._first = this._first.next;
	}

	public push(item: T): void {
		const element = new QueueElement(item);
		if (!this._first) {
			this._first = element;
			this._last = element;
			return;
		}
		this._last!.next = element;
		this._last = element;
	}
}

/**
 * Same as Protocol, but will actually track messages and acks.
 * Moreover, it will ensure no messages are lost if there are no event listeners.
 */
export class PersistentProtocol {

	private _logFile: number;
	private _isReconnecting: boolean;

	private _outgoingUnackMsg: Queue<ProtocolMessage>;
	private _outgoingMsgId: number;
	private _outgoingAckId: number;
	private _outgoingAckTimeout: NodeJS.Timeout | null;

	private _incomingMsgId: number;
	private _incomingAckId: number;
	private _incomingMsgLastTime: number;
	private _incomingAckTimeout: NodeJS.Timeout | null;

	private _outgoingKeepAliveTimeout: NodeJS.Timeout | null;
	private _incomingKeepAliveTimeout: NodeJS.Timeout | null;

	private _socket: Socket;
	private _socketWriter: ProtocolWriter;
	private _socketReader: ProtocolReader;
	private _socketReaderListener: IDisposable;

	private readonly _socketCloseListener: () => void;
	private readonly _socketEndListener: () => void;
	private readonly _socketErrorListener: (err: any) => void;

	private _onControlMessage = new Emitter<Buffer>();
	readonly onControlMessage: Event<Buffer> = createBufferedEvent(this._onControlMessage.event);

	private _onMessage = new Emitter<Buffer>();
	readonly onMessage: Event<Buffer> = createBufferedEvent(this._onMessage.event);

	private _onClose = new Emitter<void>();
	readonly onClose: Event<void> = createBufferedEvent(this._onClose.event);

	private _onSocketClose = new Emitter<void>();
	readonly onSocketClose: Event<void> = createBufferedEvent(this._onSocketClose.event);

	private _onSocketTimeout = new Emitter<void>();
	readonly onSocketTimeout: Event<void> = createBufferedEvent(this._onSocketTimeout.event);

	public get unacknowledgedCount(): number {
		return this._outgoingMsgId - this._outgoingAckId;
	}

	constructor(socket: Socket, initialChunk: Buffer | null = null, logFileName: string | null = null) {
		this._logFile = 0;
		this._isReconnecting = false;
		if (logFileName) {
			console.log(`PersistentProtocol log file: ${logFileName}`);
			this._logFile = fs.openSync(logFileName, 'a');
		}
		this._outgoingUnackMsg = new Queue<ProtocolMessage>();
		this._outgoingMsgId = 0;
		this._outgoingAckId = 0;
		this._outgoingAckTimeout = null;

		this._incomingMsgId = 0;
		this._incomingAckId = 0;
		this._incomingMsgLastTime = 0;
		this._incomingAckTimeout = null;

		this._outgoingKeepAliveTimeout = null;
		this._incomingKeepAliveTimeout = null;

		this._socketCloseListener = () => {
			console.log(`socket triggered close event!`);
			this._onSocketClose.fire();
		};
		this._socketEndListener = () => {
			// received FIN
			this._onClose.fire();
		};
		this._socketErrorListener = (err) => {
			console.log(`socket had an error: `, err);
		};

		this._socket = socket;
		this._socketWriter = new ProtocolWriter(this._socket, this._logFile);
		this._socketReader = new ProtocolReader(this._socket);
		this._socketReaderListener = this._socketReader.onMessage(msg => this._receiveMessage(msg));
		this._socket.on('close', this._socketCloseListener);
		this._socket.on('end', this._socketEndListener);
		this._socket.on('error', this._socketErrorListener);
		if (initialChunk) {
			this._socketReader.acceptChunk(initialChunk);
		}

		this._sendKeepAliveCheck();
		this._recvKeepAliveCheck();
	}

	dispose(): void {
		if (this._outgoingAckTimeout) {
			clearTimeout(this._outgoingAckTimeout);
			this._outgoingAckTimeout = null;
		}
		if (this._incomingAckTimeout) {
			clearTimeout(this._incomingAckTimeout);
			this._incomingAckTimeout = null;
		}
		if (this._outgoingKeepAliveTimeout) {
			clearTimeout(this._outgoingKeepAliveTimeout);
			this._outgoingKeepAliveTimeout = null;
		}
		if (this._incomingKeepAliveTimeout) {
			clearTimeout(this._incomingKeepAliveTimeout);
			this._incomingKeepAliveTimeout = null;
		}
		if (this._logFile) {
			fs.closeSync(this._logFile);
		}
		this._socketWriter.dispose();
		this._socketReader.dispose();
		this._socketReaderListener.dispose();
		this._socket.removeListener('close', this._socketCloseListener);
		this._socket.removeListener('end', this._socketEndListener);
		this._socket.removeListener('error', this._socketErrorListener);
	}

	private _sendKeepAliveCheck(): void {
		if (this._outgoingKeepAliveTimeout) {
			// there will be a check in the near future
			return;
		}

		const timeSinceLastOutgoingMsg = Date.now() - this._socketWriter.lastWriteTime;
		if (timeSinceLastOutgoingMsg >= ProtocolConstants.KeepAliveTime) {
			// sufficient time has passed since last message was written,
			// and no message from our side needed to be sent in the meantime,
			// so we will send a message containing only a keep alive.
			const msg = new ProtocolMessage(ProtocolMessageType.KeepAlive, 0, 0, EMPTY_BUFFER);
			this._socketWriter.write(msg);
			this._sendKeepAliveCheck();
			return;
		}

		this._outgoingKeepAliveTimeout = setTimeout(() => {
			this._outgoingKeepAliveTimeout = null;
			this._sendKeepAliveCheck();
		}, ProtocolConstants.KeepAliveTime - timeSinceLastOutgoingMsg + 5);
	}

	private _recvKeepAliveCheck(): void {
		if (this._incomingKeepAliveTimeout) {
			// there will be a check in the near future
			return;
		}

		const timeSinceLastIncomingMsg = Date.now() - this._socketReader.lastReadTime;
		if (timeSinceLastIncomingMsg >= ProtocolConstants.KeepAliveTimeoutTime) {
			// Trash the socket
			this._onSocketTimeout.fire(undefined);
			return;
		}

		this._incomingKeepAliveTimeout = setTimeout(() => {
			this._incomingKeepAliveTimeout = null;
			this._recvKeepAliveCheck();
		}, ProtocolConstants.KeepAliveTimeoutTime - timeSinceLastIncomingMsg + 5);
	}

	public getSocket(): Socket {
		return this._socket;
	}

	public beginAcceptReconnection(socket: Socket, initialDataChunk: Buffer | null): void {
		this._isReconnecting = true;

		this._socketWriter.dispose();
		this._socketReader.dispose();
		this._socketReaderListener.dispose();
		this._socket.removeListener('close', this._socketCloseListener);
		this._socket.removeListener('end', this._socketEndListener);
		this._socket.removeListener('error', this._socketErrorListener);

		this._socket = socket;

		this._socketWriter = new ProtocolWriter(this._socket, this._logFile);
		this._socketReader = new ProtocolReader(this._socket);
		this._socketReaderListener = this._socketReader.onMessage(msg => this._receiveMessage(msg));
		this._socketReader.acceptChunk(initialDataChunk);
		this._socket.on('close', this._socketCloseListener);
		this._socket.on('end', this._socketEndListener);
		this._socket.on('error', this._socketErrorListener);
	}

	public endAcceptReconnection(): void {
		this._isReconnecting = false;

		// Send again all unacknowledged messages
		const toSend = this._outgoingUnackMsg.toArray();
		for (let i = 0, len = toSend.length; i < len; i++) {
			this._socketWriter.write(toSend[i]);
		}
		this._recvAckCheck();

		this._sendKeepAliveCheck();
		this._recvKeepAliveCheck();
	}

	private _receiveMessage(msg: ProtocolMessage): void {
		if (this._logFile) {
			log(this._logFile, `recv-${ProtocolMessageTypeToString(msg.type)}-${msg.id}-${msg.ack}-`, msg.data);
		}
		if (msg.ack > this._outgoingAckId) {
			this._outgoingAckId = msg.ack;
			do {
				const first = this._outgoingUnackMsg.peek();
				if (first && first.id <= msg.ack) {
					// this message has been confirmed, remove it
					this._outgoingUnackMsg.pop();
				} else {
					break;
				}
			} while (true);
		}

		if (msg.type === ProtocolMessageType.Regular) {
			if (msg.id > this._incomingMsgId) {
				if (msg.id !== this._incomingMsgId + 1) {
					console.error(`PROTOCOL CORRUPTION, LAST SAW MSG ${this._incomingMsgId} AND HAVE NOW RECEIVED MSG ${msg.id}`);
				}
				this._incomingMsgId = msg.id;
				this._incomingMsgLastTime = Date.now();
				this._sendAckCheck();
				this._onMessage.fire(msg.data);
			}
		} else if (msg.type === ProtocolMessageType.Control) {
			this._onControlMessage.fire(msg.data);
		}
	}

	readEntireBuffer(): Buffer {
		return this._socketReader.readEntireBuffer();
	}

	flush(): void {
		this._socketWriter.flush();
	}

	send(buffer: Buffer): void {
		const myId = ++this._outgoingMsgId;
		this._incomingAckId = this._incomingMsgId;
		const msg = new ProtocolMessage(ProtocolMessageType.Regular, myId, this._incomingAckId, buffer);
		this._outgoingUnackMsg.push(msg);
		if (!this._isReconnecting) {
			this._socketWriter.write(msg);
			this._recvAckCheck();
		}
	}

	/**
	 * Send a message which will not be part of the regular acknowledge flow.
	 * Use this for early control messages which are repeated in case of reconnection.
	 */
	sendControl(buffer: Buffer): void {
		const msg = new ProtocolMessage(ProtocolMessageType.Control, 0, 0, buffer);
		this._socketWriter.write(msg);
	}

	private _sendAckCheck(): void {
		if (this._incomingMsgId <= this._incomingAckId) {
			// nothink to acknowledge
			return;
		}

		if (this._incomingAckTimeout) {
			// there will be a check in the near future
			return;
		}

		const timeSinceLastIncomingMsg = Date.now() - this._incomingMsgLastTime;
		if (timeSinceLastIncomingMsg >= ProtocolConstants.AcknowledgeTime) {
			// sufficient time has passed since this message has been received,
			// and no message from our side needed to be sent in the meantime,
			// so we will send a message containing only an ack.
			this._sendAck();
			return;
		}

		this._incomingAckTimeout = setTimeout(() => {
			this._incomingAckTimeout = null;
			this._sendAckCheck();
		}, ProtocolConstants.AcknowledgeTime - timeSinceLastIncomingMsg + 5);
	}

	private _recvAckCheck(): void {
		if (this._outgoingMsgId <= this._outgoingAckId) {
			// everything has been acknowledged
			return;
		}

		if (this._outgoingAckTimeout) {
			// there will be a check in the near future
			return;
		}

		const oldestUnacknowledgedMsg = this._outgoingUnackMsg.peek()!;
		const timeSinceOldestUnacknowledgedMsg = Date.now() - oldestUnacknowledgedMsg.writtenTime;
		if (timeSinceOldestUnacknowledgedMsg >= ProtocolConstants.AcknowledgeTimeoutTime) {
			// Trash the socket
			this._onSocketTimeout.fire(undefined);
			return;
		}

		this._outgoingAckTimeout = setTimeout(() => {
			this._outgoingAckTimeout = null;
			this._recvAckCheck();
		}, ProtocolConstants.AcknowledgeTimeoutTime - timeSinceOldestUnacknowledgedMsg + 5);
	}

	private _sendAck(): void {
		if (this._incomingMsgId <= this._incomingAckId) {
			// nothink to acknowledge
			return;
		}

		this._incomingAckId = this._incomingMsgId;
		const msg = new ProtocolMessage(ProtocolMessageType.Ack, 0, this._incomingAckId, EMPTY_BUFFER);
		this._socketWriter.write(msg);
	}
}
