/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Socket, Server as NetServer, createConnection, createServer } from 'net';
import { Event, Emitter } from 'vs/base/common/event';
import { IMessagePassingProtocol, ClientConnectionEvent, IPCServer, IPCClient } from 'vs/base/parts/ipc/node/ipc';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateUuid } from 'vs/base/common/uuid';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TimeoutTimer } from 'vs/base/common/async';

export function generateRandomPipeName(): string {
	const randomSuffix = generateUuid();
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\vscode-ipc-${randomSuffix}-sock`;
	} else {
		// Mac/Unix: use socket file
		return join(tmpdir(), `vscode-ipc-${randomSuffix}.sock`);
	}
}

/**
 * A message has the following format:
 *
 * 		[bodyLen|message]
 * 		[header^|data^^^]
 * 		[u32be^^|buffer^]
 */

export class Protocol implements IDisposable, IMessagePassingProtocol {

	private static readonly _headerLen = 4;

	private _isDisposed: boolean;
	private _chunks: Buffer[];

	private _firstChunkTimer: TimeoutTimer;
	private _socketDataListener: (data: Buffer) => void;
	private _socketEndListener: () => void;
	private _socketCloseListener: () => void;

	private _onMessage = new Emitter<Buffer>();
	readonly onMessage: Event<Buffer> = this._onMessage.event;

	private _onClose = new Emitter<void>();
	readonly onClose: Event<void> = this._onClose.event;

	constructor(private _socket: Socket, firstDataChunk?: Buffer) {
		this._isDisposed = false;
		this._chunks = [];

		let totalLength = 0;

		const state = {
			readHead: true,
			bodyLen: -1,
		};

		const acceptChunk = (data: Buffer) => {

			this._chunks.push(data);
			totalLength += data.length;

			while (totalLength > 0) {

				if (state.readHead) {
					// expecting header -> read 5bytes for header
					// information: `bodyIsJson` and `bodyLen`
					if (totalLength >= Protocol._headerLen) {
						const all = Buffer.concat(this._chunks);

						state.bodyLen = all.readUInt32BE(0);
						state.readHead = false;

						const rest = all.slice(Protocol._headerLen);
						totalLength = rest.length;
						this._chunks = [rest];

					} else {
						break;
					}
				}

				if (!state.readHead) {
					// expecting body -> read bodyLen-bytes for
					// the actual message or wait for more data
					if (totalLength >= state.bodyLen) {

						const all = Buffer.concat(this._chunks);
						const buffer = all.slice(0, state.bodyLen);

						// ensure the getBuffer returns a valid value if invoked from the event listeners
						const rest = all.slice(state.bodyLen);
						totalLength = rest.length;
						this._chunks = [rest];

						state.bodyLen = -1;
						state.readHead = true;

						this._onMessage.fire(buffer);

						if (this._isDisposed) {
							// check if an event listener lead to our disposal
							break;
						}
					} else {
						break;
					}
				}
			}
		};

		const acceptFirstDataChunk = () => {
			if (firstDataChunk && firstDataChunk.length > 0) {
				let tmp = firstDataChunk;
				firstDataChunk = undefined;
				acceptChunk(tmp);
			}
		};

		// Make sure to always handle the firstDataChunk if no more `data` event comes in
		this._firstChunkTimer = new TimeoutTimer();
		this._firstChunkTimer.setIfNotSet(() => {
			acceptFirstDataChunk();
		}, 0);

		this._socketDataListener = (data: Buffer) => {
			acceptFirstDataChunk();
			acceptChunk(data);
		};
		_socket.on('data', this._socketDataListener);

		this._socketEndListener = () => {
			acceptFirstDataChunk();
		};
		_socket.on('end', this._socketEndListener);

		this._socketCloseListener = () => {
			this._onClose.fire();
		};
		_socket.once('close', this._socketCloseListener);
	}

	dispose(): void {
		this._isDisposed = true;
		this._firstChunkTimer.dispose();
		this._socket.removeListener('data', this._socketDataListener);
		this._socket.removeListener('end', this._socketEndListener);
		this._socket.removeListener('close', this._socketCloseListener);
	}

	end(): void {
		this._socket.end();
	}

	getBuffer(): Buffer {
		return Buffer.concat(this._chunks);
	}

	send(buffer: Buffer): void {
		const header = Buffer.allocUnsafe(Protocol._headerLen);
		header.writeUInt32BE(buffer.length, 0, true);
		this._writeSoon(header, buffer);
	}

	private _writeBuffer = new class {

		private _data: Buffer[] = [];
		private _totalLength = 0;

		add(head: Buffer, body: Buffer): boolean {
			const wasEmpty = this._totalLength === 0;
			this._data.push(head, body);
			this._totalLength += head.length + body.length;
			return wasEmpty;
		}

		take(): Buffer {
			const ret = Buffer.concat(this._data, this._totalLength);
			this._data.length = 0;
			this._totalLength = 0;
			return ret;
		}
	};

	private _writeSoon(header: Buffer, data: Buffer): void {
		if (this._writeBuffer.add(header, data)) {
			setImmediate(() => {
				// return early if socket has been destroyed in the meantime
				if (this._socket.destroyed) {
					return;
				}
				// we ignore the returned value from `write` because we would have to cached the data
				// anyways and nodejs is already doing that for us:
				// > https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
				// > However, the false return value is only advisory and the writable stream will unconditionally
				// > accept and buffer chunk even if it has not not been allowed to drain.
				this._socket.write(this._writeBuffer.take());
			});
		}
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

	constructor(private protocol: Protocol | BufferedProtocol, id: TContext) {
		super(protocol, id);
	}

	dispose(): void {
		super.dispose();
		this.protocol.end();
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

/**
 * Will ensure no messages are lost if there are no event listeners.
 */
export class BufferedProtocol implements IMessagePassingProtocol {

	private readonly _actual: Protocol;
	public readonly onMessage: Event<Buffer>;
	public readonly onClose: Event<void>;

	constructor(actual: Protocol) {
		this._actual = actual;
		this.onMessage = createBufferedEvent(this._actual.onMessage);
		this.onClose = createBufferedEvent(this._actual.onClose);
	}

	public send(buffer: Buffer): void {
		this._actual.send(buffer);
	}

	public end(): void {
		this._actual.end();
	}
}
