/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getRandomElement } from '../../../common/arrays.js';
import { CancelablePromise, createCancelablePromise, timeout } from '../../../common/async.js';
import { VSBuffer } from '../../../common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../common/cancellation.js';
import { memoize } from '../../../common/decorators.js';
import { CancellationError, ErrorNoTelemetry } from '../../../common/errors.js';
import { Emitter, Event, EventMultiplexer, Relay } from '../../../common/event.js';
import { createSingleCallFunction } from '../../../common/functional.js';
import { DisposableStore, dispose, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import { revive } from '../../../common/marshalling.js';
import * as strings from '../../../common/strings.js';
import { isFunction, isUndefinedOrNull } from '../../../common/types.js';

/**
 * An `IChannel` is an abstraction over a collection of commands.
 * You can `call` several commands on a channel, each taking at
 * most one single argument. A `call` always returns a promise
 * with at most one single return value.
 */
export interface IChannel {
	call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T>;
	listen<T>(event: string, arg?: any): Event<T>;
}

/**
 * An `IServerChannel` is the counter part to `IChannel`,
 * on the server-side. You should implement this interface
 * if you'd like to handle remote promises or events.
 */
export interface IServerChannel<TContext = string> {
	call<T>(ctx: TContext, command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T>;
	listen<T>(ctx: TContext, event: string, arg?: any): Event<T>;
}

const enum RequestType {
	Promise = 100,
	PromiseCancel = 101,
	EventListen = 102,
	EventDispose = 103
}

function requestTypeToStr(type: RequestType): string {
	switch (type) {
		case RequestType.Promise:
			return 'req';
		case RequestType.PromiseCancel:
			return 'cancel';
		case RequestType.EventListen:
			return 'subscribe';
		case RequestType.EventDispose:
			return 'unsubscribe';
	}
}

type IRawPromiseRequest = { type: RequestType.Promise; id: number; channelName: string; name: string; arg: any };
type IRawPromiseCancelRequest = { type: RequestType.PromiseCancel; id: number };
type IRawEventListenRequest = { type: RequestType.EventListen; id: number; channelName: string; name: string; arg: any };
type IRawEventDisposeRequest = { type: RequestType.EventDispose; id: number };
type IRawRequest = IRawPromiseRequest | IRawPromiseCancelRequest | IRawEventListenRequest | IRawEventDisposeRequest;

const enum ResponseType {
	Initialize = 200,
	PromiseSuccess = 201,
	PromiseError = 202,
	PromiseErrorObj = 203,
	EventFire = 204
}

function responseTypeToStr(type: ResponseType): string {
	switch (type) {
		case ResponseType.Initialize:
			return `init`;
		case ResponseType.PromiseSuccess:
			return `reply:`;
		case ResponseType.PromiseError:
		case ResponseType.PromiseErrorObj:
			return `replyErr:`;
		case ResponseType.EventFire:
			return `event:`;
	}
}

type IRawInitializeResponse = { type: ResponseType.Initialize };
type IRawPromiseSuccessResponse = { type: ResponseType.PromiseSuccess; id: number; data: any };
type IRawPromiseErrorResponse = { type: ResponseType.PromiseError; id: number; data: { message: string; name: string; stack: string[] | undefined } };
type IRawPromiseErrorObjResponse = { type: ResponseType.PromiseErrorObj; id: number; data: any };
type IRawEventFireResponse = { type: ResponseType.EventFire; id: number; data: any };
type IRawResponse = IRawInitializeResponse | IRawPromiseSuccessResponse | IRawPromiseErrorResponse | IRawPromiseErrorObjResponse | IRawEventFireResponse;

interface IHandler {
	(response: IRawResponse): void;
}

export interface IMessagePassingProtocol {
	send(buffer: VSBuffer): void;
	onMessage: Event<VSBuffer>;
	/**
	 * Wait for the write buffer (if applicable) to become empty.
	 */
	drain?(): Promise<void>;
}

enum State {
	Uninitialized,
	Idle
}

/**
 * An `IChannelServer` hosts a collection of channels. You are
 * able to register channels onto it, provided a channel name.
 */
export interface IChannelServer<TContext = string> {
	registerChannel(channelName: string, channel: IServerChannel<TContext>): void;
}

/**
 * An `IChannelClient` has access to a collection of channels. You
 * are able to get those channels, given their channel name.
 */
export interface IChannelClient {
	getChannel<T extends IChannel>(channelName: string): T;
}

export interface Client<TContext> {
	readonly ctx: TContext;
}

export interface IConnectionHub<TContext> {
	readonly connections: Connection<TContext>[];
	readonly onDidAddConnection: Event<Connection<TContext>>;
	readonly onDidRemoveConnection: Event<Connection<TContext>>;
}

/**
 * An `IClientRouter` is responsible for routing calls to specific
 * channels, in scenarios in which there are multiple possible
 * channels (each from a separate client) to pick from.
 */
export interface IClientRouter<TContext = string> {
	routeCall(hub: IConnectionHub<TContext>, command: string, arg?: any, cancellationToken?: CancellationToken): Promise<Client<TContext>>;
	routeEvent(hub: IConnectionHub<TContext>, event: string, arg?: any): Promise<Client<TContext>>;
}

/**
 * Similar to the `IChannelClient`, you can get channels from this
 * collection of channels. The difference being that in the
 * `IRoutingChannelClient`, there are multiple clients providing
 * the same channel. You'll need to pass in an `IClientRouter` in
 * order to pick the right one.
 */
export interface IRoutingChannelClient<TContext = string> {
	getChannel<T extends IChannel>(channelName: string, router?: IClientRouter<TContext>): T;
}

interface IReader {
	read(bytes: number): VSBuffer;
}

interface IWriter {
	write(buffer: VSBuffer): void;
}


/**
 * @see https://en.wikipedia.org/wiki/Variable-length_quantity
 */
function readIntVQL(reader: IReader) {
	let value = 0;
	for (let n = 0; ; n += 7) {
		const next = reader.read(1);
		value |= (next.buffer[0] & 0b01111111) << n;
		if (!(next.buffer[0] & 0b10000000)) {
			return value;
		}
	}
}

const vqlZero = createOneByteBuffer(0);

/**
 * @see https://en.wikipedia.org/wiki/Variable-length_quantity
 */
function writeInt32VQL(writer: IWriter, value: number) {
	if (value === 0) {
		writer.write(vqlZero);
		return;
	}

	let len = 0;
	for (let v2 = value; v2 !== 0; v2 = v2 >>> 7) {
		len++;
	}

	const scratch = VSBuffer.alloc(len);
	for (let i = 0; value !== 0; i++) {
		scratch.buffer[i] = value & 0b01111111;
		value = value >>> 7;
		if (value > 0) {
			scratch.buffer[i] |= 0b10000000;
		}
	}

	writer.write(scratch);
}

export class BufferReader implements IReader {

	private pos = 0;

	constructor(private buffer: VSBuffer) { }

	read(bytes: number): VSBuffer {
		const result = this.buffer.slice(this.pos, this.pos + bytes);
		this.pos += result.byteLength;
		return result;
	}
}

export class BufferWriter implements IWriter {

	private buffers: VSBuffer[] = [];

	get buffer(): VSBuffer {
		return VSBuffer.concat(this.buffers);
	}

	write(buffer: VSBuffer): void {
		this.buffers.push(buffer);
	}
}

enum DataType {
	Undefined = 0,
	String = 1,
	Buffer = 2,
	VSBuffer = 3,
	Array = 4,
	Object = 5,
	Int = 6
}

function createOneByteBuffer(value: number): VSBuffer {
	const result = VSBuffer.alloc(1);
	result.writeUInt8(value, 0);
	return result;
}

const BufferPresets = {
	Undefined: createOneByteBuffer(DataType.Undefined),
	String: createOneByteBuffer(DataType.String),
	Buffer: createOneByteBuffer(DataType.Buffer),
	VSBuffer: createOneByteBuffer(DataType.VSBuffer),
	Array: createOneByteBuffer(DataType.Array),
	Object: createOneByteBuffer(DataType.Object),
	Uint: createOneByteBuffer(DataType.Int),
};

export function serialize(writer: IWriter, data: any): void {
	if (typeof data === 'undefined') {
		writer.write(BufferPresets.Undefined);
	} else if (typeof data === 'string') {
		const buffer = VSBuffer.fromString(data);
		writer.write(BufferPresets.String);
		writeInt32VQL(writer, buffer.byteLength);
		writer.write(buffer);
	} else if (VSBuffer.isNativeBuffer(data)) {
		const buffer = VSBuffer.wrap(data);
		writer.write(BufferPresets.Buffer);
		writeInt32VQL(writer, buffer.byteLength);
		writer.write(buffer);
	} else if (data instanceof VSBuffer) {
		writer.write(BufferPresets.VSBuffer);
		writeInt32VQL(writer, data.byteLength);
		writer.write(data);
	} else if (Array.isArray(data)) {
		writer.write(BufferPresets.Array);
		writeInt32VQL(writer, data.length);

		for (const el of data) {
			serialize(writer, el);
		}
	} else if (typeof data === 'number' && (data | 0) === data) {
		// write a vql if it's a number that we can do bitwise operations on
		writer.write(BufferPresets.Uint);
		writeInt32VQL(writer, data);
	} else {
		const buffer = VSBuffer.fromString(JSON.stringify(data));
		writer.write(BufferPresets.Object);
		writeInt32VQL(writer, buffer.byteLength);
		writer.write(buffer);
	}
}

export function deserialize(reader: IReader): any {
	const type = reader.read(1).readUInt8(0);

	switch (type) {
		case DataType.Undefined: return undefined;
		case DataType.String: return reader.read(readIntVQL(reader)).toString();
		case DataType.Buffer: return reader.read(readIntVQL(reader)).buffer;
		case DataType.VSBuffer: return reader.read(readIntVQL(reader));
		case DataType.Array: {
			const length = readIntVQL(reader);
			const result: any[] = [];

			for (let i = 0; i < length; i++) {
				result.push(deserialize(reader));
			}

			return result;
		}
		case DataType.Object: return JSON.parse(reader.read(readIntVQL(reader)).toString());
		case DataType.Int: return readIntVQL(reader);
	}
}

interface PendingRequest {
	request: IRawPromiseRequest | IRawEventListenRequest;
	timeoutTimer: Timeout;
}

export class ChannelServer<TContext = string> implements IChannelServer<TContext>, IDisposable {

	private channels = new Map<string, IServerChannel<TContext>>();
	private activeRequests = new Map<number, IDisposable>();
	private protocolListener: IDisposable | null;

	// Requests might come in for channels which are not yet registered.
	// They will timeout after `timeoutDelay`.
	private pendingRequests = new Map<string, PendingRequest[]>();

	constructor(private protocol: IMessagePassingProtocol, private ctx: TContext, private logger: IIPCLogger | null = null, private timeoutDelay: number = 1000) {
		this.protocolListener = this.protocol.onMessage(msg => this.onRawMessage(msg));
		this.sendResponse({ type: ResponseType.Initialize });
	}

	registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
		this.channels.set(channelName, channel);

		// https://github.com/microsoft/vscode/issues/72531
		setTimeout(() => this.flushPendingRequests(channelName), 0);
	}

	private sendResponse(response: IRawResponse): void {
		switch (response.type) {
			case ResponseType.Initialize: {
				const msgLength = this.send([response.type]);
				this.logger?.logOutgoing(msgLength, 0, RequestInitiator.OtherSide, responseTypeToStr(response.type));
				return;
			}

			case ResponseType.PromiseSuccess:
			case ResponseType.PromiseError:
			case ResponseType.EventFire:
			case ResponseType.PromiseErrorObj: {
				const msgLength = this.send([response.type, response.id], response.data);
				this.logger?.logOutgoing(msgLength, response.id, RequestInitiator.OtherSide, responseTypeToStr(response.type), response.data);
				return;
			}
		}
	}

	private send(header: unknown, body: any = undefined): number {
		const writer = new BufferWriter();
		serialize(writer, header);
		serialize(writer, body);
		return this.sendBuffer(writer.buffer);
	}

	private sendBuffer(message: VSBuffer): number {
		try {
			this.protocol.send(message);
			return message.byteLength;
		} catch (err) {
			// noop
			return 0;
		}
	}

	private onRawMessage(message: VSBuffer): void {
		const reader = new BufferReader(message);
		const header = deserialize(reader);
		const body = deserialize(reader);
		const type = header[0] as RequestType;

		switch (type) {
			case RequestType.Promise:
				this.logger?.logIncoming(message.byteLength, header[1], RequestInitiator.OtherSide, `${requestTypeToStr(type)}: ${header[2]}.${header[3]}`, body);
				return this.onPromise({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
			case RequestType.EventListen:
				this.logger?.logIncoming(message.byteLength, header[1], RequestInitiator.OtherSide, `${requestTypeToStr(type)}: ${header[2]}.${header[3]}`, body);
				return this.onEventListen({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
			case RequestType.PromiseCancel:
				this.logger?.logIncoming(message.byteLength, header[1], RequestInitiator.OtherSide, `${requestTypeToStr(type)}`);
				return this.disposeActiveRequest({ type, id: header[1] });
			case RequestType.EventDispose:
				this.logger?.logIncoming(message.byteLength, header[1], RequestInitiator.OtherSide, `${requestTypeToStr(type)}`);
				return this.disposeActiveRequest({ type, id: header[1] });
		}
	}

	private onPromise(request: IRawPromiseRequest): void {
		const channel = this.channels.get(request.channelName);

		if (!channel) {
			this.collectPendingRequest(request);
			return;
		}

		const cancellationTokenSource = new CancellationTokenSource();
		let promise: Promise<any>;

		try {
			promise = channel.call(this.ctx, request.name, request.arg, cancellationTokenSource.token);
		} catch (err) {
			promise = Promise.reject(err);
		}

		const id = request.id;

		promise.then(data => {
			this.sendResponse({ id, data, type: ResponseType.PromiseSuccess });
		}, err => {
			if (err instanceof Error) {
				this.sendResponse({
					id, data: {
						message: err.message,
						name: err.name,
						stack: err.stack ? err.stack.split('\n') : undefined
					}, type: ResponseType.PromiseError
				});
			} else {
				this.sendResponse({ id, data: err, type: ResponseType.PromiseErrorObj });
			}
		}).finally(() => {
			disposable.dispose();
			this.activeRequests.delete(request.id);
		});

		const disposable = toDisposable(() => cancellationTokenSource.cancel());
		this.activeRequests.set(request.id, disposable);
	}

	private onEventListen(request: IRawEventListenRequest): void {
		const channel = this.channels.get(request.channelName);

		if (!channel) {
			this.collectPendingRequest(request);
			return;
		}

		const id = request.id;
		const event = channel.listen(this.ctx, request.name, request.arg);
		const disposable = event(data => this.sendResponse({ id, data, type: ResponseType.EventFire }));

		this.activeRequests.set(request.id, disposable);
	}

	private disposeActiveRequest(request: IRawRequest): void {
		const disposable = this.activeRequests.get(request.id);

		if (disposable) {
			disposable.dispose();
			this.activeRequests.delete(request.id);
		}
	}

	private collectPendingRequest(request: IRawPromiseRequest | IRawEventListenRequest): void {
		let pendingRequests = this.pendingRequests.get(request.channelName);

		if (!pendingRequests) {
			pendingRequests = [];
			this.pendingRequests.set(request.channelName, pendingRequests);
		}

		const timer = setTimeout(() => {
			console.error(`Unknown channel: ${request.channelName}`);

			if (request.type === RequestType.Promise) {
				this.sendResponse({
					id: request.id,
					data: { name: 'Unknown channel', message: `Channel name '${request.channelName}' timed out after ${this.timeoutDelay}ms`, stack: undefined },
					type: ResponseType.PromiseError
				});
			}
		}, this.timeoutDelay);

		pendingRequests.push({ request, timeoutTimer: timer });
	}

	private flushPendingRequests(channelName: string): void {
		const requests = this.pendingRequests.get(channelName);

		if (requests) {
			for (const request of requests) {
				clearTimeout(request.timeoutTimer);

				switch (request.request.type) {
					case RequestType.Promise: this.onPromise(request.request); break;
					case RequestType.EventListen: this.onEventListen(request.request); break;
				}
			}

			this.pendingRequests.delete(channelName);
		}
	}

	public dispose(): void {
		if (this.protocolListener) {
			this.protocolListener.dispose();
			this.protocolListener = null;
		}
		dispose(this.activeRequests.values());
		this.activeRequests.clear();
	}
}

export const enum RequestInitiator {
	LocalSide = 0,
	OtherSide = 1
}

export interface IIPCLogger {
	logIncoming(msgLength: number, requestId: number, initiator: RequestInitiator, str: string, data?: any): void;
	logOutgoing(msgLength: number, requestId: number, initiator: RequestInitiator, str: string, data?: any): void;
}

export class ChannelClient implements IChannelClient, IDisposable {

	private isDisposed: boolean = false;
	private state: State = State.Uninitialized;
	private activeRequests = new Set<IDisposable>();
	private handlers = new Map<number, IHandler>();
	private lastRequestId: number = 0;
	private protocolListener: IDisposable | null;
	private logger: IIPCLogger | null;

	private readonly _onDidInitialize = new Emitter<void>();
	readonly onDidInitialize = this._onDidInitialize.event;

	constructor(private protocol: IMessagePassingProtocol, logger: IIPCLogger | null = null) {
		this.protocolListener = this.protocol.onMessage(msg => this.onBuffer(msg));
		this.logger = logger;
	}

	getChannel<T extends IChannel>(channelName: string): T {
		const that = this;

		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		return {
			call(command: string, arg?: any, cancellationToken?: CancellationToken) {
				if (that.isDisposed) {
					return Promise.reject(new CancellationError());
				}
				return that.requestPromise(channelName, command, arg, cancellationToken);
			},
			listen(event: string, arg: any) {
				if (that.isDisposed) {
					return Event.None;
				}
				return that.requestEvent(channelName, event, arg);
			}
		} as T;
	}

	private requestPromise(channelName: string, name: string, arg?: any, cancellationToken = CancellationToken.None): Promise<unknown> {
		const id = this.lastRequestId++;
		const type = RequestType.Promise;
		const request: IRawRequest = { id, type, channelName, name, arg };

		if (cancellationToken.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}

		let disposable: IDisposable;
		let disposableWithRequestCancel: IDisposable;

		const result = new Promise((c, e) => {
			if (cancellationToken.isCancellationRequested) {
				return e(new CancellationError());
			}

			const doRequest = () => {
				const handler: IHandler = response => {
					switch (response.type) {
						case ResponseType.PromiseSuccess:
							this.handlers.delete(id);
							c(response.data);
							break;

						case ResponseType.PromiseError: {
							this.handlers.delete(id);
							const error = new Error(response.data.message);
							(<any>error).stack = Array.isArray(response.data.stack) ? response.data.stack.join('\n') : response.data.stack;
							error.name = response.data.name;
							e(error);
							break;
						}
						case ResponseType.PromiseErrorObj:
							this.handlers.delete(id);
							e(response.data);
							break;
					}
				};

				this.handlers.set(id, handler);
				this.sendRequest(request);
			};

			let uninitializedPromise: CancelablePromise<void> | null = null;
			if (this.state === State.Idle) {
				doRequest();
			} else {
				uninitializedPromise = createCancelablePromise(_ => this.whenInitialized());
				uninitializedPromise.then(() => {
					uninitializedPromise = null;
					doRequest();
				});
			}

			const cancel = () => {
				if (uninitializedPromise) {
					uninitializedPromise.cancel();
					uninitializedPromise = null;
				} else {
					this.sendRequest({ id, type: RequestType.PromiseCancel });
				}

				e(new CancellationError());
			};

			disposable = cancellationToken.onCancellationRequested(cancel);
			disposableWithRequestCancel = {
				dispose: createSingleCallFunction(() => {
					cancel();
					disposable.dispose();
				})
			};

			this.activeRequests.add(disposableWithRequestCancel);
		});

		return result.finally(() => {
			disposable?.dispose(); // Seen as undefined in tests.
			this.activeRequests.delete(disposableWithRequestCancel);
		});
	}

	private requestEvent(channelName: string, name: string, arg?: any): Event<any> {
		const id = this.lastRequestId++;
		const type = RequestType.EventListen;
		const request: IRawRequest = { id, type, channelName, name, arg };

		let uninitializedPromise: CancelablePromise<void> | null = null;

		const emitter = new Emitter<any>({
			onWillAddFirstListener: () => {
				const doRequest = () => {
					this.activeRequests.add(emitter);
					this.sendRequest(request);
				};
				if (this.state === State.Idle) {
					doRequest();
				} else {
					uninitializedPromise = createCancelablePromise(_ => this.whenInitialized());
					uninitializedPromise.then(() => {
						uninitializedPromise = null;
						doRequest();
					});
				}
			},
			onDidRemoveLastListener: () => {
				if (uninitializedPromise) {
					uninitializedPromise.cancel();
					uninitializedPromise = null;
				} else {
					this.activeRequests.delete(emitter);
					this.sendRequest({ id, type: RequestType.EventDispose });
				}
			}
		});

		const handler: IHandler = (res: IRawResponse) => emitter.fire((res as IRawEventFireResponse).data);
		this.handlers.set(id, handler);

		return emitter.event;
	}

	private sendRequest(request: IRawRequest): void {
		switch (request.type) {
			case RequestType.Promise:
			case RequestType.EventListen: {
				const msgLength = this.send([request.type, request.id, request.channelName, request.name], request.arg);
				this.logger?.logOutgoing(msgLength, request.id, RequestInitiator.LocalSide, `${requestTypeToStr(request.type)}: ${request.channelName}.${request.name}`, request.arg);
				return;
			}

			case RequestType.PromiseCancel:
			case RequestType.EventDispose: {
				const msgLength = this.send([request.type, request.id]);
				this.logger?.logOutgoing(msgLength, request.id, RequestInitiator.LocalSide, requestTypeToStr(request.type));
				return;
			}
		}
	}

	private send(header: unknown, body: any = undefined): number {
		const writer = new BufferWriter();
		serialize(writer, header);
		serialize(writer, body);
		return this.sendBuffer(writer.buffer);
	}

	private sendBuffer(message: VSBuffer): number {
		try {
			this.protocol.send(message);
			return message.byteLength;
		} catch (err) {
			// noop
			return 0;
		}
	}

	private onBuffer(message: VSBuffer): void {
		const reader = new BufferReader(message);
		const header = deserialize(reader);
		const body = deserialize(reader);
		const type: ResponseType = header[0];

		switch (type) {
			case ResponseType.Initialize:
				this.logger?.logIncoming(message.byteLength, 0, RequestInitiator.LocalSide, responseTypeToStr(type));
				return this.onResponse({ type: header[0] });

			case ResponseType.PromiseSuccess:
			case ResponseType.PromiseError:
			case ResponseType.EventFire:
			case ResponseType.PromiseErrorObj:
				this.logger?.logIncoming(message.byteLength, header[1], RequestInitiator.LocalSide, responseTypeToStr(type), body);
				return this.onResponse({ type: header[0], id: header[1], data: body });
		}
	}

	private onResponse(response: IRawResponse): void {
		if (response.type === ResponseType.Initialize) {
			this.state = State.Idle;
			this._onDidInitialize.fire();
			return;
		}

		const handler = this.handlers.get(response.id);

		handler?.(response);
	}

	@memoize
	get onDidInitializePromise(): Promise<void> {
		return Event.toPromise(this.onDidInitialize);
	}

	private whenInitialized(): Promise<void> {
		if (this.state === State.Idle) {
			return Promise.resolve();
		} else {
			return this.onDidInitializePromise;
		}
	}

	dispose(): void {
		this.isDisposed = true;
		if (this.protocolListener) {
			this.protocolListener.dispose();
			this.protocolListener = null;
		}
		dispose(this.activeRequests.values());
		this.activeRequests.clear();
	}
}

export interface ClientConnectionEvent {
	protocol: IMessagePassingProtocol;
	onDidClientDisconnect: Event<void>;
}

interface Connection<TContext> extends Client<TContext> {
	readonly channelServer: ChannelServer<TContext>;
	readonly channelClient: ChannelClient;
}

/**
 * An `IPCServer` is both a channel server and a routing channel
 * client.
 *
 * As the owner of a protocol, you should extend both this
 * and the `IPCClient` classes to get IPC implementations
 * for your protocol.
 */
export class IPCServer<TContext = string> implements IChannelServer<TContext>, IRoutingChannelClient<TContext>, IConnectionHub<TContext>, IDisposable {

	private channels = new Map<string, IServerChannel<TContext>>();
	private _connections = new Set<Connection<TContext>>();

	private readonly _onDidAddConnection = new Emitter<Connection<TContext>>();
	readonly onDidAddConnection: Event<Connection<TContext>> = this._onDidAddConnection.event;

	private readonly _onDidRemoveConnection = new Emitter<Connection<TContext>>();
	readonly onDidRemoveConnection: Event<Connection<TContext>> = this._onDidRemoveConnection.event;

	private readonly disposables = new DisposableStore();

	get connections(): Connection<TContext>[] {
		const result: Connection<TContext>[] = [];
		this._connections.forEach(ctx => result.push(ctx));
		return result;
	}

	constructor(onDidClientConnect: Event<ClientConnectionEvent>, ipcLogger?: IIPCLogger | null, timeoutDelay?: number) {
		this.disposables.add(onDidClientConnect(({ protocol, onDidClientDisconnect }) => {
			const onFirstMessage = Event.once(protocol.onMessage);

			this.disposables.add(onFirstMessage(msg => {
				const reader = new BufferReader(msg);
				const ctx = deserialize(reader) as TContext;

				const channelServer = new ChannelServer(protocol, ctx, ipcLogger, timeoutDelay);
				const channelClient = new ChannelClient(protocol, ipcLogger);

				this.channels.forEach((channel, name) => channelServer.registerChannel(name, channel));

				const connection: Connection<TContext> = { channelServer, channelClient, ctx };
				this._connections.add(connection);
				this._onDidAddConnection.fire(connection);

				this.disposables.add(onDidClientDisconnect(() => {
					channelServer.dispose();
					channelClient.dispose();
					this._connections.delete(connection);
					this._onDidRemoveConnection.fire(connection);
				}));
			}));
		}));
	}

	/**
	 * Get a channel from a remote client. When passed a router,
	 * one can specify which client it wants to call and listen to/from.
	 * Otherwise, when calling without a router, a random client will
	 * be selected and when listening without a router, every client
	 * will be listened to.
	 */
	getChannel<T extends IChannel>(channelName: string, router: IClientRouter<TContext>): T;
	getChannel<T extends IChannel>(channelName: string, clientFilter: (client: Client<TContext>) => boolean): T;
	getChannel<T extends IChannel>(channelName: string, routerOrClientFilter: IClientRouter<TContext> | ((client: Client<TContext>) => boolean)): T {
		const that = this;

		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		return {
			call(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T> {
				let connectionPromise: Promise<Client<TContext>>;

				if (isFunction(routerOrClientFilter)) {
					// when no router is provided, we go random client picking
					const connection = getRandomElement(that.connections.filter(routerOrClientFilter));

					connectionPromise = connection
						// if we found a client, let's call on it
						? Promise.resolve(connection)
						// else, let's wait for a client to come along
						: Event.toPromise(Event.filter(that.onDidAddConnection, routerOrClientFilter));
				} else {
					connectionPromise = routerOrClientFilter.routeCall(that, command, arg);
				}

				const channelPromise = connectionPromise
					.then(connection => (connection as Connection<TContext>).channelClient.getChannel(channelName));

				return getDelayedChannel(channelPromise)
					.call(command, arg, cancellationToken);
			},
			listen(event: string, arg: any): Event<T> {
				if (isFunction(routerOrClientFilter)) {
					return that.getMulticastEvent(channelName, routerOrClientFilter, event, arg);
				}

				const channelPromise = routerOrClientFilter.routeEvent(that, event, arg)
					.then(connection => (connection as Connection<TContext>).channelClient.getChannel(channelName));

				return getDelayedChannel(channelPromise)
					.listen(event, arg);
			}
		} as T;
	}

	private getMulticastEvent<T extends IChannel>(channelName: string, clientFilter: (client: Client<TContext>) => boolean, eventName: string, arg: any): Event<T> {
		const that = this;
		let disposables: DisposableStore | undefined;

		// Create an emitter which hooks up to all clients
		// as soon as first listener is added. It also
		// disconnects from all clients as soon as the last listener
		// is removed.
		const emitter = new Emitter<T>({
			onWillAddFirstListener: () => {
				disposables = new DisposableStore();

				// The event multiplexer is useful since the active
				// client list is dynamic. We need to hook up and disconnection
				// to/from clients as they come and go.
				const eventMultiplexer = new EventMultiplexer<T>();
				const map = new Map<Connection<TContext>, IDisposable>();

				const onDidAddConnection = (connection: Connection<TContext>) => {
					const channel = connection.channelClient.getChannel(channelName);
					const event = channel.listen<T>(eventName, arg);
					const disposable = eventMultiplexer.add(event);

					map.set(connection, disposable);
				};

				const onDidRemoveConnection = (connection: Connection<TContext>) => {
					const disposable = map.get(connection);

					if (!disposable) {
						return;
					}

					disposable.dispose();
					map.delete(connection);
				};

				that.connections.filter(clientFilter).forEach(onDidAddConnection);
				Event.filter(that.onDidAddConnection, clientFilter)(onDidAddConnection, undefined, disposables);
				that.onDidRemoveConnection(onDidRemoveConnection, undefined, disposables);
				eventMultiplexer.event(emitter.fire, emitter, disposables);

				disposables.add(eventMultiplexer);
			},
			onDidRemoveLastListener: () => {
				disposables?.dispose();
				disposables = undefined;
			}
		});
		that.disposables.add(emitter);

		return emitter.event;
	}

	registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
		this.channels.set(channelName, channel);

		for (const connection of this._connections) {
			connection.channelServer.registerChannel(channelName, channel);
		}
	}

	dispose(): void {
		this.disposables.dispose();

		for (const connection of this._connections) {
			connection.channelClient.dispose();
			connection.channelServer.dispose();
		}

		this._connections.clear();
		this.channels.clear();
		this._onDidAddConnection.dispose();
		this._onDidRemoveConnection.dispose();
	}
}

/**
 * An `IPCClient` is both a channel client and a channel server.
 *
 * As the owner of a protocol, you should extend both this
 * and the `IPCServer` classes to get IPC implementations
 * for your protocol.
 */
export class IPCClient<TContext = string> implements IChannelClient, IChannelServer<TContext>, IDisposable {

	private channelClient: ChannelClient;
	private channelServer: ChannelServer<TContext>;

	constructor(protocol: IMessagePassingProtocol, ctx: TContext, ipcLogger: IIPCLogger | null = null) {
		const writer = new BufferWriter();
		serialize(writer, ctx);
		protocol.send(writer.buffer);

		this.channelClient = new ChannelClient(protocol, ipcLogger);
		this.channelServer = new ChannelServer(protocol, ctx, ipcLogger);
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return this.channelClient.getChannel(channelName) as T;
	}

	registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
		this.channelServer.registerChannel(channelName, channel);
	}

	dispose(): void {
		this.channelClient.dispose();
		this.channelServer.dispose();
	}
}

export function getDelayedChannel<T extends IChannel>(promise: Promise<T>): T {
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	return {
		call(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T> {
			return promise.then(c => c.call<T>(command, arg, cancellationToken));
		},

		listen<T>(event: string, arg?: any): Event<T> {
			const relay = new Relay<any>();
			promise.then(c => relay.input = c.listen(event, arg));
			return relay.event;
		}
	} as T;
}

export function getNextTickChannel<T extends IChannel>(channel: T): T {
	let didTick = false;

	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	return {
		call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T> {
			if (didTick) {
				return channel.call(command, arg, cancellationToken);
			}

			return timeout(0)
				.then(() => didTick = true)
				.then(() => channel.call<T>(command, arg, cancellationToken));
		},
		listen<T>(event: string, arg?: any): Event<T> {
			if (didTick) {
				return channel.listen<T>(event, arg);
			}

			const relay = new Relay<T>();

			timeout(0)
				.then(() => didTick = true)
				.then(() => relay.input = channel.listen<T>(event, arg));

			return relay.event;
		}
	} as T;
}

export class StaticRouter<TContext = string> implements IClientRouter<TContext> {

	constructor(private fn: (ctx: TContext) => boolean | Promise<boolean>) { }

	routeCall(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
		return this.route(hub);
	}

	routeEvent(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
		return this.route(hub);
	}

	private async route(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
		for (const connection of hub.connections) {
			if (await Promise.resolve(this.fn(connection.ctx))) {
				return Promise.resolve(connection);
			}
		}

		await Event.toPromise(hub.onDidAddConnection);
		return await this.route(hub);
	}
}

/**
 * Use ProxyChannels to automatically wrapping and unwrapping
 * services to/from IPC channels, instead of manually wrapping
 * each service method and event.
 *
 * Restrictions:
 * - If marshalling is enabled, only `URI` and `RegExp` is converted
 *   automatically for you
 * - Events must follow the naming convention `onUpperCase`
 * - `CancellationToken` is currently not supported
 * - If a context is provided, you can use `AddFirstParameterToFunctions`
 *   utility to signal this in the receiving side type
 */
export namespace ProxyChannel {

	export interface IProxyOptions {

		/**
		 * Disables automatic marshalling of `URI`.
		 * If marshalling is disabled, `UriComponents`
		 * must be used instead.
		 */
		disableMarshalling?: boolean;
	}

	export interface ICreateServiceChannelOptions extends IProxyOptions { }

	export function fromService<TContext>(service: unknown, disposables: DisposableStore, options?: ICreateServiceChannelOptions): IServerChannel<TContext> {
		const handler = service as { [key: string]: unknown };
		const disableMarshalling = options && options.disableMarshalling;

		// Buffer any event that should be supported by
		// iterating over all property keys and finding them
		// However, this will not work for services that
		// are lazy and use a Proxy within. For that we
		// still need to check later (see below).
		const mapEventNameToEvent = new Map<string, Event<unknown>>();
		for (const key in handler) {
			if (propertyIsEvent(key)) {
				mapEventNameToEvent.set(key, Event.buffer(handler[key] as Event<unknown>, true, undefined, disposables));
			}
		}

		return new class implements IServerChannel {

			listen<T>(_: unknown, event: string, arg: any): Event<T> {
				const eventImpl = mapEventNameToEvent.get(event);
				if (eventImpl) {
					return eventImpl as Event<T>;
				}

				const target = handler[event];
				if (typeof target === 'function') {
					if (propertyIsDynamicEvent(event)) {
						return target.call(handler, arg);
					}

					if (propertyIsEvent(event)) {
						mapEventNameToEvent.set(event, Event.buffer(handler[event] as Event<unknown>, true, undefined, disposables));

						return mapEventNameToEvent.get(event) as Event<T>;
					}
				}

				throw new ErrorNoTelemetry(`Event not found: ${event}`);
			}

			call(_: unknown, command: string, args?: any[]): Promise<any> {
				const target = handler[command];
				if (typeof target === 'function') {

					// Revive unless marshalling disabled
					if (!disableMarshalling && Array.isArray(args)) {
						for (let i = 0; i < args.length; i++) {
							args[i] = revive(args[i]);
						}
					}

					let res = target.apply(handler, args);
					if (!(res instanceof Promise)) {
						res = Promise.resolve(res);
					}
					return res;
				}

				throw new ErrorNoTelemetry(`Method not found: ${command}`);
			}
		};
	}

	export interface ICreateProxyServiceOptions extends IProxyOptions {

		/**
		 * If provided, will add the value of `context`
		 * to each method call to the target.
		 */
		context?: unknown;

		/**
		 * If provided, will not proxy any of the properties
		 * that are part of the Map but rather return that value.
		 */
		properties?: Map<string, unknown>;
	}

	export function toService<T extends object>(channel: IChannel, options?: ICreateProxyServiceOptions): T {
		const disableMarshalling = options && options.disableMarshalling;

		return new Proxy({}, {
			get(_target: T, propKey: PropertyKey) {
				if (typeof propKey === 'string') {

					// Check for predefined values
					if (options?.properties?.has(propKey)) {
						return options.properties.get(propKey);
					}

					// Dynamic Event
					if (propertyIsDynamicEvent(propKey)) {
						return function (arg: unknown) {
							return channel.listen(propKey, arg);
						};
					}

					// Event
					if (propertyIsEvent(propKey)) {
						return channel.listen(propKey);
					}

					// Function
					return async function (...args: any[]) {

						// Add context if any
						let methodArgs: any[];
						if (options && !isUndefinedOrNull(options.context)) {
							methodArgs = [options.context, ...args];
						} else {
							methodArgs = args;
						}

						const result = await channel.call(propKey, methodArgs);

						// Revive unless marshalling disabled
						if (!disableMarshalling) {
							return revive(result);
						}

						return result;
					};
				}

				throw new ErrorNoTelemetry(`Property not found: ${String(propKey)}`);
			}
		}) as T;
	}

	function propertyIsEvent(name: string): boolean {
		// Assume a property is an event if it has a form of "onSomething"
		return name[0] === 'o' && name[1] === 'n' && strings.isUpperAsciiLetter(name.charCodeAt(2));
	}

	function propertyIsDynamicEvent(name: string): boolean {
		// Assume a property is a dynamic event (a method that returns an event) if it has a form of "onDynamicSomething"
		return /^onDynamic/.test(name) && strings.isUpperAsciiLetter(name.charCodeAt(9));
	}
}

const colorTables = [
	['#2977B1', '#FC802D', '#34A13A', '#D3282F', '#9366BA'],
	['#8B564C', '#E177C0', '#7F7F7F', '#BBBE3D', '#2EBECD']
];

function prettyWithoutArrays(data: unknown): any {
	if (Array.isArray(data)) {
		return data;
	}
	if (data && typeof data === 'object' && typeof data.toString === 'function') {
		const result = data.toString();
		if (result !== '[object Object]') {
			return result;
		}
	}
	return data;
}

function pretty(data: unknown): any {
	if (Array.isArray(data)) {
		return data.map(prettyWithoutArrays);
	}
	return prettyWithoutArrays(data);
}

function logWithColors(direction: string, totalLength: number, msgLength: number, req: number, initiator: RequestInitiator, str: string, data: any): void {
	data = pretty(data);

	const colorTable = colorTables[initiator];
	const color = colorTable[req % colorTable.length];
	let args = [`%c[${direction}]%c[${String(totalLength).padStart(7, ' ')}]%c[len: ${String(msgLength).padStart(5, ' ')}]%c${String(req).padStart(5, ' ')} - ${str}`, 'color: darkgreen', 'color: grey', 'color: grey', `color: ${color}`];
	if (/\($/.test(str)) {
		args = args.concat(data);
		args.push(')');
	} else {
		args.push(data);
	}
	console.log.apply(console, args as [string, ...string[]]);
}

export class IPCLogger implements IIPCLogger {
	private _totalIncoming = 0;
	private _totalOutgoing = 0;

	constructor(
		private readonly _outgoingPrefix: string,
		private readonly _incomingPrefix: string,
	) { }

	public logOutgoing(msgLength: number, requestId: number, initiator: RequestInitiator, str: string, data?: any): void {
		this._totalOutgoing += msgLength;
		logWithColors(this._outgoingPrefix, this._totalOutgoing, msgLength, requestId, initiator, str, data);
	}

	public logIncoming(msgLength: number, requestId: number, initiator: RequestInitiator, str: string, data?: any): void {
		this._totalIncoming += msgLength;
		logWithColors(this._incomingPrefix, this._totalIncoming, msgLength, requestId, initiator, str, data);
	}
}
