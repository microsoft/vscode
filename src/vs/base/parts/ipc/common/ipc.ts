/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter, Relay } from 'vs/base/common/event';
import { IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { CancelablePromise, createCancelablePromise, timeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import * as errors from 'vs/base/common/errors';
import { IServerChannel, IChannel } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';

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


export const enum RequestType {
	Promise = 100,
	PromiseCancel = 101,
	EventListen = 102,
	EventDispose = 103
}

type IRawPromiseRequest = { type: RequestType.Promise; id: number; channelName: string; name: string; arg: any; };
type IRawPromiseCancelRequest = { type: RequestType.PromiseCancel, id: number };
type IRawEventListenRequest = { type: RequestType.EventListen; id: number; channelName: string; name: string; arg: any; };
type IRawEventDisposeRequest = { type: RequestType.EventDispose, id: number };
type IRawRequest = IRawPromiseRequest | IRawPromiseCancelRequest | IRawEventListenRequest | IRawEventDisposeRequest;

export const enum ResponseType {
	Initialize = 200,
	PromiseSuccess = 201,
	PromiseError = 202,
	PromiseErrorObj = 203,
	EventFire = 204
}

type IRawInitializeResponse = { type: ResponseType.Initialize };
type IRawPromiseSuccessResponse = { type: ResponseType.PromiseSuccess; id: number; data: any };
type IRawPromiseErrorResponse = { type: ResponseType.PromiseError; id: number; data: { message: string, name: string, stack: string[] | undefined } };
type IRawPromiseErrorObjResponse = { type: ResponseType.PromiseErrorObj; id: number; data: any };
type IRawEventFireResponse = { type: ResponseType.EventFire; id: number; data: any };
type IRawResponse = IRawInitializeResponse | IRawPromiseSuccessResponse | IRawPromiseErrorResponse | IRawPromiseErrorObjResponse | IRawEventFireResponse;

interface IHandler {
	(response: IRawResponse): void;
}

export interface IMessagePassingProtocol {
	send(buffer: VSBuffer): void;
	onMessage: Event<VSBuffer>;
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
	readonly onDidChangeConnections: Event<Connection<TContext>>;
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
	getChannel<T extends IChannel>(channelName: string, router: IClientRouter<TContext>): T;
}

interface IReader {
	read(bytes: number): VSBuffer;
}

interface IWriter {
	write(buffer: VSBuffer): void;
}

class BufferReader implements IReader {

	private pos = 0;

	constructor(private buffer: VSBuffer) { }

	read(bytes: number): VSBuffer {
		const result = this.buffer.slice(this.pos, this.pos + bytes);
		this.pos += result.byteLength;
		return result;
	}
}

class BufferWriter implements IWriter {

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
	Object = 5
}

function createSizeBuffer(size: number): VSBuffer {
	const result = VSBuffer.alloc(4);
	result.writeUInt32BE(size, 0);
	return result;
}

function readSizeBuffer(reader: IReader): number {
	return reader.read(4).readUInt32BE(0);
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
};

declare var Buffer: any;
const hasBuffer = (typeof Buffer !== 'undefined');

function serialize(writer: IWriter, data: any): void {
	if (typeof data === 'undefined') {
		writer.write(BufferPresets.Undefined);
	} else if (typeof data === 'string') {
		const buffer = VSBuffer.fromString(data);
		writer.write(BufferPresets.String);
		writer.write(createSizeBuffer(buffer.byteLength));
		writer.write(buffer);
	} else if (hasBuffer && Buffer.isBuffer(data)) {
		const buffer = VSBuffer.wrap(data);
		writer.write(BufferPresets.Buffer);
		writer.write(createSizeBuffer(buffer.byteLength));
		writer.write(buffer);
	} else if (data instanceof VSBuffer) {
		writer.write(BufferPresets.VSBuffer);
		writer.write(createSizeBuffer(data.byteLength));
		writer.write(data);
	} else if (Array.isArray(data)) {
		writer.write(BufferPresets.Array);
		writer.write(createSizeBuffer(data.length));

		for (const el of data) {
			serialize(writer, el);
		}
	} else {
		const buffer = VSBuffer.fromString(JSON.stringify(data));
		writer.write(BufferPresets.Object);
		writer.write(createSizeBuffer(buffer.byteLength));
		writer.write(buffer);
	}
}

function deserialize(reader: IReader): any {
	const type = reader.read(1).readUInt8(0);

	switch (type) {
		case DataType.Undefined: return undefined;
		case DataType.String: return reader.read(readSizeBuffer(reader)).toString();
		case DataType.Buffer: return reader.read(readSizeBuffer(reader)).buffer;
		case DataType.VSBuffer: return reader.read(readSizeBuffer(reader));
		case DataType.Array: {
			const length = readSizeBuffer(reader);
			const result: any[] = [];

			for (let i = 0; i < length; i++) {
				result.push(deserialize(reader));
			}

			return result;
		}
		case DataType.Object: return JSON.parse(reader.read(readSizeBuffer(reader)).toString());
	}
}

interface PendingRequest {
	request: IRawPromiseRequest | IRawEventListenRequest;
	timeoutTimer: any;
}

export class ChannelServer<TContext = string> implements IChannelServer<TContext>, IDisposable {

	private channels = new Map<string, IServerChannel<TContext>>();
	private activeRequests = new Map<number, IDisposable>();
	private protocolListener: IDisposable | null;

	// Requests might come in for channels which are not yet registered.
	// They will timeout after `timeoutDelay`.
	private pendingRequests = new Map<string, PendingRequest[]>();

	constructor(private protocol: IMessagePassingProtocol, private ctx: TContext, private timeoutDelay: number = 1000) {
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
			case ResponseType.Initialize:
				return this.send([response.type]);

			case ResponseType.PromiseSuccess:
			case ResponseType.PromiseError:
			case ResponseType.EventFire:
			case ResponseType.PromiseErrorObj:
				return this.send([response.type, response.id], response.data);
		}
	}

	private send(header: any, body: any = undefined): void {
		const writer = new BufferWriter();
		serialize(writer, header);
		serialize(writer, body);
		this.sendBuffer(writer.buffer);
	}

	private sendBuffer(message: VSBuffer): void {
		try {
			this.protocol.send(message);
		} catch (err) {
			// noop
		}
	}

	private onRawMessage(message: VSBuffer): void {
		const reader = new BufferReader(message);
		const header = deserialize(reader);
		const body = deserialize(reader);
		const type = header[0] as RequestType;

		switch (type) {
			case RequestType.Promise:
				return this.onPromise({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
			case RequestType.EventListen:
				return this.onEventListen({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
			case RequestType.PromiseCancel:
				return this.disposeActiveRequest({ type, id: header[1] });
			case RequestType.EventDispose:
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
			this.sendResponse(<IRawResponse>{ id, data, type: ResponseType.PromiseSuccess });
			this.activeRequests.delete(request.id);
		}, err => {
			if (err instanceof Error) {
				this.sendResponse(<IRawResponse>{
					id, data: {
						message: err.message,
						name: err.name,
						stack: err.stack ? (err.stack.split ? err.stack.split('\n') : err.stack) : undefined
					}, type: ResponseType.PromiseError
				});
			} else {
				this.sendResponse(<IRawResponse>{ id, data: err, type: ResponseType.PromiseErrorObj });
			}

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
		const disposable = event(data => this.sendResponse(<IRawResponse>{ id, data, type: ResponseType.EventFire }));

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
				this.sendResponse(<IRawResponse>{
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
		this.activeRequests.forEach(d => d.dispose());
		this.activeRequests.clear();
	}
}

export class ChannelClient implements IChannelClient, IDisposable {

	private state: State = State.Uninitialized;
	private activeRequests = new Set<IDisposable>();
	private handlers = new Map<number, IHandler>();
	private lastRequestId: number = 0;
	private protocolListener: IDisposable | null;

	private _onDidInitialize = new Emitter<void>();
	readonly onDidInitialize = this._onDidInitialize.event;

	constructor(private protocol: IMessagePassingProtocol) {
		this.protocolListener = this.protocol.onMessage(msg => this.onBuffer(msg));
	}

	getChannel<T extends IChannel>(channelName: string): T {
		const that = this;

		return {
			call(command: string, arg?: any, cancellationToken?: CancellationToken) {
				return that.requestPromise(channelName, command, arg, cancellationToken);
			},
			listen(event: string, arg: any) {
				return that.requestEvent(channelName, event, arg);
			}
		} as T;
	}

	private requestPromise(channelName: string, name: string, arg?: any, cancellationToken = CancellationToken.None): Promise<any> {
		const id = this.lastRequestId++;
		const type = RequestType.Promise;
		const request: IRawRequest = { id, type, channelName, name, arg };

		if (cancellationToken.isCancellationRequested) {
			return Promise.reject(errors.canceled());
		}

		let disposable: IDisposable;

		const result = new Promise((c, e) => {
			if (cancellationToken.isCancellationRequested) {
				return e(errors.canceled());
			}

			let uninitializedPromise: CancelablePromise<void> | null = createCancelablePromise(_ => this.whenInitialized());
			uninitializedPromise.then(() => {
				uninitializedPromise = null;

				const handler: IHandler = response => {
					switch (response.type) {
						case ResponseType.PromiseSuccess:
							this.handlers.delete(id);
							c(response.data);
							break;

						case ResponseType.PromiseError:
							this.handlers.delete(id);
							const error = new Error(response.data.message);
							(<any>error).stack = response.data.stack;
							error.name = response.data.name;
							e(error);
							break;

						case ResponseType.PromiseErrorObj:
							this.handlers.delete(id);
							e(response.data);
							break;
					}
				};

				this.handlers.set(id, handler);
				this.sendRequest(request);
			});

			const cancel = () => {
				if (uninitializedPromise) {
					uninitializedPromise.cancel();
					uninitializedPromise = null;
				} else {
					this.sendRequest({ id, type: RequestType.PromiseCancel });
				}

				e(errors.canceled());
			};

			const cancellationTokenListener = cancellationToken.onCancellationRequested(cancel);
			disposable = combinedDisposable(toDisposable(cancel), cancellationTokenListener);
			this.activeRequests.add(disposable);
		});

		return result.finally(() => this.activeRequests.delete(disposable));
	}

	private requestEvent(channelName: string, name: string, arg?: any): Event<any> {
		const id = this.lastRequestId++;
		const type = RequestType.EventListen;
		const request: IRawRequest = { id, type, channelName, name, arg };

		let uninitializedPromise: CancelablePromise<void> | null = null;

		const emitter = new Emitter<any>({
			onFirstListenerAdd: () => {
				uninitializedPromise = createCancelablePromise(_ => this.whenInitialized());
				uninitializedPromise.then(() => {
					uninitializedPromise = null;
					this.activeRequests.add(emitter);
					this.sendRequest(request);
				});
			},
			onLastListenerRemove: () => {
				if (uninitializedPromise) {
					uninitializedPromise.cancel();
					uninitializedPromise = null;
				} else {
					this.activeRequests.delete(emitter);
					this.sendRequest({ id, type: RequestType.EventDispose });
				}
			}
		});

		const handler: IHandler = (res: IRawEventFireResponse) => emitter.fire(res.data);
		this.handlers.set(id, handler);

		return emitter.event;
	}

	private sendRequest(request: IRawRequest): void {
		switch (request.type) {
			case RequestType.Promise:
			case RequestType.EventListen:
				return this.send([request.type, request.id, request.channelName, request.name], request.arg);

			case RequestType.PromiseCancel:
			case RequestType.EventDispose:
				return this.send([request.type, request.id]);
		}
	}

	private send(header: any, body: any = undefined): void {
		const writer = new BufferWriter();
		serialize(writer, header);
		serialize(writer, body);
		this.sendBuffer(writer.buffer);
	}

	private sendBuffer(message: VSBuffer): void {
		try {
			this.protocol.send(message);
		} catch (err) {
			// noop
		}
	}

	private onBuffer(message: VSBuffer): void {
		const reader = new BufferReader(message);
		const header = deserialize(reader);
		const body = deserialize(reader);
		const type: ResponseType = header[0];

		switch (type) {
			case ResponseType.Initialize:
				return this.onResponse({ type: header[0] });

			case ResponseType.PromiseSuccess:
			case ResponseType.PromiseError:
			case ResponseType.EventFire:
			case ResponseType.PromiseErrorObj:
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

		if (handler) {
			handler(response);
		}
	}

	private whenInitialized(): Promise<void> {
		if (this.state === State.Idle) {
			return Promise.resolve();
		} else {
			return Event.toPromise(this.onDidInitialize);
		}
	}

	dispose(): void {
		if (this.protocolListener) {
			this.protocolListener.dispose();
			this.protocolListener = null;
		}
		this.activeRequests.forEach(p => p.dispose());
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

	private _onDidChangeConnections = new Emitter<Connection<TContext>>();
	readonly onDidChangeConnections: Event<Connection<TContext>> = this._onDidChangeConnections.event;

	get connections(): Connection<TContext>[] {
		const result: Connection<TContext>[] = [];
		this._connections.forEach(ctx => result.push(ctx));
		return result;
	}

	constructor(onDidClientConnect: Event<ClientConnectionEvent>) {
		onDidClientConnect(({ protocol, onDidClientDisconnect }) => {
			const onFirstMessage = Event.once(protocol.onMessage);

			onFirstMessage(msg => {
				const reader = new BufferReader(msg);
				const ctx = deserialize(reader) as TContext;

				const channelServer = new ChannelServer(protocol, ctx);
				const channelClient = new ChannelClient(protocol);

				this.channels.forEach((channel, name) => channelServer.registerChannel(name, channel));

				const connection: Connection<TContext> = { channelServer, channelClient, ctx };
				this._connections.add(connection);
				this._onDidChangeConnections.fire(connection);

				onDidClientDisconnect(() => {
					channelServer.dispose();
					channelClient.dispose();
					this._connections.delete(connection);
				});
			});
		});
	}

	getChannel<T extends IChannel>(channelName: string, router: IClientRouter<TContext>): T {
		const that = this;

		return {
			call(command: string, arg?: any, cancellationToken?: CancellationToken) {
				const channelPromise = router.routeCall(that, command, arg)
					.then(connection => (connection as Connection<TContext>).channelClient.getChannel(channelName));

				return getDelayedChannel(channelPromise)
					.call(command, arg, cancellationToken);
			},
			listen(event: string, arg: any) {
				const channelPromise = router.routeEvent(that, event, arg)
					.then(connection => (connection as Connection<TContext>).channelClient.getChannel(channelName));

				return getDelayedChannel(channelPromise)
					.listen(event, arg);
			}
		} as T;
	}

	registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
		this.channels.set(channelName, channel);

		this._connections.forEach(connection => {
			connection.channelServer.registerChannel(channelName, channel);
		});
	}

	dispose(): void {
		this.channels.clear();
		this._connections.clear();
		this._onDidChangeConnections.dispose();
	}
}

/**
 * An `IPCClient` is both a channel client and a channel server.
 *
 * As the owner of a protocol, you should extend both this
 * and the `IPCClient` classes to get IPC implementations
 * for your protocol.
 */
export class IPCClient<TContext = string> implements IChannelClient, IChannelServer<TContext>, IDisposable {

	private channelClient: ChannelClient;
	private channelServer: ChannelServer<TContext>;

	constructor(protocol: IMessagePassingProtocol, ctx: TContext) {
		const writer = new BufferWriter();
		serialize(writer, ctx);
		protocol.send(writer.buffer);

		this.channelClient = new ChannelClient(protocol);
		this.channelServer = new ChannelServer(protocol, ctx);
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

		await Event.toPromise(hub.onDidChangeConnections);
		return await this.route(hub);
	}
}
