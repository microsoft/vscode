/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../charCode.js';
import { onUnexpectedError, SerializedError, transformErrorForSerialization } from '../errors.js';
import { Emitter, Event } from '../event.js';
import { Disposable, IDisposable } from '../lifecycle.js';
import { isWeb } from '../platform.js';
import * as strings from '../strings.js';

const DEFAULT_CHANNEL = 'default';
const INITIALIZE = '$initialize';

export interface IWebWorker extends IDisposable {
	getId(): number;
	readonly onMessage: Event<Message>;
	readonly onError: Event<unknown>;
	postMessage(message: Message, transfer: ArrayBuffer[]): void;
}

let webWorkerWarningLogged = false;
export function logOnceWebWorkerWarning(err: unknown): void {
	if (!isWeb) {
		// running tests
		return;
	}
	if (!webWorkerWarningLogged) {
		webWorkerWarningLogged = true;
		console.warn('Could not create web worker(s). Falling back to loading web worker code in main thread, which might cause UI freezes. Please see https://github.com/microsoft/monaco-editor#faq');
	}
	console.warn((err as Error).message);
}

const enum MessageType {
	Request,
	Reply,
	SubscribeEvent,
	Event,
	UnsubscribeEvent
}
class RequestMessage {
	public readonly type = MessageType.Request;
	constructor(
		public readonly vsWorker: number,
		public readonly req: string,
		public readonly channel: string,
		public readonly method: string,
		public readonly args: unknown[]
	) { }
}
class ReplyMessage {
	public readonly type = MessageType.Reply;
	constructor(
		public readonly vsWorker: number,
		public readonly seq: string,
		public readonly res: unknown,
		public readonly err: unknown | SerializedError
	) { }
}
class SubscribeEventMessage {
	public readonly type = MessageType.SubscribeEvent;
	constructor(
		public readonly vsWorker: number,
		public readonly req: string,
		public readonly channel: string,
		public readonly eventName: string,
		public readonly arg: unknown
	) { }
}
class EventMessage {
	public readonly type = MessageType.Event;
	constructor(
		public readonly vsWorker: number,
		public readonly req: string,
		public readonly event: unknown
	) { }
}
class UnsubscribeEventMessage {
	public readonly type = MessageType.UnsubscribeEvent;
	constructor(
		public readonly vsWorker: number,
		public readonly req: string
	) { }
}
export type Message = RequestMessage | ReplyMessage | SubscribeEventMessage | EventMessage | UnsubscribeEventMessage;

interface IMessageReply {
	resolve: (value?: unknown) => void;
	reject: (error?: unknown) => void;
}

interface IMessageHandler {
	sendMessage(msg: unknown, transfer?: ArrayBuffer[]): void;
	handleMessage(channel: string, method: string, args: unknown[]): Promise<unknown>;
	handleEvent(channel: string, eventName: string, arg: unknown): Event<unknown>;
}

class WebWorkerProtocol {

	private _workerId: number;
	private _lastSentReq: number;
	private _pendingReplies: { [req: string]: IMessageReply };
	private _pendingEmitters: Map<string, Emitter<unknown>>;
	private _pendingEvents: Map<string, IDisposable>;
	private _handler: IMessageHandler;

	constructor(handler: IMessageHandler) {
		this._workerId = -1;
		this._handler = handler;
		this._lastSentReq = 0;
		this._pendingReplies = Object.create(null);
		this._pendingEmitters = new Map<string, Emitter<unknown>>();
		this._pendingEvents = new Map<string, IDisposable>();
	}

	public setWorkerId(workerId: number): void {
		this._workerId = workerId;
	}

	public async sendMessage(channel: string, method: string, args: unknown[]): Promise<unknown> {
		const req = String(++this._lastSentReq);
		return new Promise<unknown>((resolve, reject) => {
			this._pendingReplies[req] = {
				resolve: resolve,
				reject: reject
			};
			this._send(new RequestMessage(this._workerId, req, channel, method, args));
		});
	}

	public listen(channel: string, eventName: string, arg: unknown): Event<unknown> {
		let req: string | null = null;
		const emitter = new Emitter<unknown>({
			onWillAddFirstListener: () => {
				req = String(++this._lastSentReq);
				this._pendingEmitters.set(req, emitter);
				this._send(new SubscribeEventMessage(this._workerId, req, channel, eventName, arg));
			},
			onDidRemoveLastListener: () => {
				this._pendingEmitters.delete(req!);
				this._send(new UnsubscribeEventMessage(this._workerId, req!));
				req = null;
			}
		});
		return emitter.event;
	}

	public handleMessage(message: unknown): void {
		if (!message || !(message as Message).vsWorker) {
			return;
		}
		if (this._workerId !== -1 && (message as Message).vsWorker !== this._workerId) {
			return;
		}
		this._handleMessage(message as Message);
	}

	public createProxyToRemoteChannel<T extends object>(channel: string, sendMessageBarrier?: () => Promise<void>): T {
		const handler = {
			get: (target: Record<PropertyKey, unknown>, name: PropertyKey) => {
				if (typeof name === 'string' && !target[name]) {
					if (propertyIsDynamicEvent(name)) { // onDynamic...
						target[name] = (arg: unknown): Event<unknown> => {
							return this.listen(channel, name, arg);
						};
					} else if (propertyIsEvent(name)) { // on...
						target[name] = this.listen(channel, name, undefined);
					} else if (name.charCodeAt(0) === CharCode.DollarSign) { // $...
						target[name] = async (...myArgs: unknown[]) => {
							await sendMessageBarrier?.();
							return this.sendMessage(channel, name, myArgs);
						};
					}
				}
				return target[name];
			}
		};
		return new Proxy(Object.create(null), handler);
	}

	private _handleMessage(msg: Message): void {
		switch (msg.type) {
			case MessageType.Reply:
				return this._handleReplyMessage(msg);
			case MessageType.Request:
				return this._handleRequestMessage(msg);
			case MessageType.SubscribeEvent:
				return this._handleSubscribeEventMessage(msg);
			case MessageType.Event:
				return this._handleEventMessage(msg);
			case MessageType.UnsubscribeEvent:
				return this._handleUnsubscribeEventMessage(msg);
		}
	}

	private _handleReplyMessage(replyMessage: ReplyMessage): void {
		if (!this._pendingReplies[replyMessage.seq]) {
			console.warn('Got reply to unknown seq');
			return;
		}

		const reply = this._pendingReplies[replyMessage.seq];
		delete this._pendingReplies[replyMessage.seq];

		if (replyMessage.err) {
			let err = replyMessage.err;
			if ((replyMessage.err as SerializedError).$isError) {
				const newErr = new Error();
				newErr.name = (replyMessage.err as SerializedError).name;
				newErr.message = (replyMessage.err as SerializedError).message;
				newErr.stack = (replyMessage.err as SerializedError).stack;
				err = newErr;
			}
			reply.reject(err);
			return;
		}

		reply.resolve(replyMessage.res);
	}

	private _handleRequestMessage(requestMessage: RequestMessage): void {
		const req = requestMessage.req;
		const result = this._handler.handleMessage(requestMessage.channel, requestMessage.method, requestMessage.args);
		result.then((r) => {
			this._send(new ReplyMessage(this._workerId, req, r, undefined));
		}, (e) => {
			if (e.detail instanceof Error) {
				// Loading errors have a detail property that points to the actual error
				e.detail = transformErrorForSerialization(e.detail);
			}
			this._send(new ReplyMessage(this._workerId, req, undefined, transformErrorForSerialization(e)));
		});
	}

	private _handleSubscribeEventMessage(msg: SubscribeEventMessage): void {
		const req = msg.req;
		const disposable = this._handler.handleEvent(msg.channel, msg.eventName, msg.arg)((event) => {
			this._send(new EventMessage(this._workerId, req, event));
		});
		this._pendingEvents.set(req, disposable);
	}

	private _handleEventMessage(msg: EventMessage): void {
		if (!this._pendingEmitters.has(msg.req)) {
			console.warn('Got event for unknown req');
			return;
		}
		this._pendingEmitters.get(msg.req)!.fire(msg.event);
	}

	private _handleUnsubscribeEventMessage(msg: UnsubscribeEventMessage): void {
		if (!this._pendingEvents.has(msg.req)) {
			console.warn('Got unsubscribe for unknown req');
			return;
		}
		this._pendingEvents.get(msg.req)!.dispose();
		this._pendingEvents.delete(msg.req);
	}

	private _send(msg: Message): void {
		const transfer: ArrayBuffer[] = [];
		if (msg.type === MessageType.Request) {
			for (let i = 0; i < msg.args.length; i++) {
				const arg = msg.args[i];
				if (arg instanceof ArrayBuffer) {
					transfer.push(arg);
				}
			}
		} else if (msg.type === MessageType.Reply) {
			if (msg.res instanceof ArrayBuffer) {
				transfer.push(msg.res);
			}
		}
		this._handler.sendMessage(msg, transfer);
	}
}

type ProxiedMethodName = (`$${string}` | `on${string}`);

export type Proxied<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R
	? (
		K extends ProxiedMethodName
		? (...args: A) => Promise<Awaited<R>>
		: never
	)
	: never
};

export interface IWebWorkerClient<TProxy> {
	proxy: Proxied<TProxy>;
	dispose(): void;
	setChannel<T extends object>(channel: string, handler: T): void;
	getChannel<T extends object>(channel: string): Proxied<T>;
}

export interface IWebWorkerServer {
	setChannel<T extends object>(channel: string, handler: T): void;
	getChannel<T extends object>(channel: string): Proxied<T>;
}

/**
 * Main thread side
 */
export class WebWorkerClient<W extends object> extends Disposable implements IWebWorkerClient<W> {

	private readonly _worker: IWebWorker;
	private readonly _onModuleLoaded: Promise<void>;
	private readonly _protocol: WebWorkerProtocol;
	public readonly proxy: Proxied<W>;
	private readonly _localChannels: Map<string, object> = new Map();
	private readonly _remoteChannels: Map<string, object> = new Map();

	constructor(
		worker: IWebWorker
	) {
		super();

		this._worker = this._register(worker);
		this._register(this._worker.onMessage((msg) => {
			this._protocol.handleMessage(msg);
		}));
		this._register(this._worker.onError((err) => {
			logOnceWebWorkerWarning(err);
			onUnexpectedError(err);
		}));

		this._protocol = new WebWorkerProtocol({
			sendMessage: (msg: Message, transfer: ArrayBuffer[]): void => {
				this._worker.postMessage(msg, transfer);
			},
			handleMessage: (channel: string, method: string, args: unknown[]): Promise<unknown> => {
				return this._handleMessage(channel, method, args);
			},
			handleEvent: (channel: string, eventName: string, arg: unknown): Event<unknown> => {
				return this._handleEvent(channel, eventName, arg);
			}
		});
		this._protocol.setWorkerId(this._worker.getId());

		// Send initialize message
		this._onModuleLoaded = this._protocol.sendMessage(DEFAULT_CHANNEL, INITIALIZE, [
			this._worker.getId(),
		]).then(() => { });

		this.proxy = this._protocol.createProxyToRemoteChannel(DEFAULT_CHANNEL, async () => { await this._onModuleLoaded; });
		this._onModuleLoaded.catch((e) => {
			this._onError('Worker failed to load ', e);
		});
	}

	private _handleMessage(channelName: string, method: string, args: unknown[]): Promise<unknown> {
		const channel: object | undefined = this._localChannels.get(channelName);
		if (!channel) {
			return Promise.reject(new Error(`Missing channel ${channelName} on main thread`));
		}

		const fn = (channel as Record<string, unknown>)[method];
		if (typeof fn !== 'function') {
			return Promise.reject(new Error(`Missing method ${method} on main thread channel ${channelName}`));
		}

		try {
			return Promise.resolve(fn.apply(channel, args));
		} catch (e) {
			return Promise.reject(e);
		}
	}

	private _handleEvent(channelName: string, eventName: string, arg: unknown): Event<unknown> {
		const channel: object | undefined = this._localChannels.get(channelName);
		if (!channel) {
			throw new Error(`Missing channel ${channelName} on main thread`);
		}
		if (propertyIsDynamicEvent(eventName)) {
			const fn = (channel as Record<string, unknown>)[eventName];
			if (typeof fn !== 'function') {
				throw new Error(`Missing dynamic event ${eventName} on main thread channel ${channelName}.`);
			}
			const event = fn.call(channel, arg);
			if (typeof event !== 'function') {
				throw new Error(`Missing dynamic event ${eventName} on main thread channel ${channelName}.`);
			}
			return event;
		}
		if (propertyIsEvent(eventName)) {
			const event = (channel as Record<string, unknown>)[eventName];
			if (typeof event !== 'function') {
				throw new Error(`Missing event ${eventName} on main thread channel ${channelName}.`);
			}
			return event as Event<unknown>;
		}
		throw new Error(`Malformed event name ${eventName}`);
	}

	public setChannel<T extends object>(channel: string, handler: T): void {
		this._localChannels.set(channel, handler);
	}

	public getChannel<T extends object>(channel: string): Proxied<T> {
		if (!this._remoteChannels.has(channel)) {
			const inst = this._protocol.createProxyToRemoteChannel(channel, async () => { await this._onModuleLoaded; });
			this._remoteChannels.set(channel, inst);
		}
		return this._remoteChannels.get(channel) as Proxied<T>;
	}

	private _onError(message: string, error?: unknown): void {
		console.error(message);
		console.info(error);
	}
}

function propertyIsEvent(name: string): boolean {
	// Assume a property is an event if it has a form of "onSomething"
	return name[0] === 'o' && name[1] === 'n' && strings.isUpperAsciiLetter(name.charCodeAt(2));
}

function propertyIsDynamicEvent(name: string): boolean {
	// Assume a property is a dynamic event (a method that returns an event) if it has a form of "onDynamicSomething"
	return /^onDynamic/.test(name) && strings.isUpperAsciiLetter(name.charCodeAt(9));
}

export interface IWebWorkerServerRequestHandler {
	_requestHandlerBrand: void;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[prop: string]: any;
}

export interface IWebWorkerServerRequestHandlerFactory<T extends IWebWorkerServerRequestHandler> {
	(workerServer: IWebWorkerServer): T;
}

/**
 * Worker side
 */
export class WebWorkerServer<T extends IWebWorkerServerRequestHandler> implements IWebWorkerServer {

	public readonly requestHandler: T;
	private _protocol: WebWorkerProtocol;
	private readonly _localChannels: Map<string, object> = new Map();
	private readonly _remoteChannels: Map<string, object> = new Map();

	constructor(postMessage: (msg: Message, transfer?: ArrayBuffer[]) => void, requestHandlerFactory: IWebWorkerServerRequestHandlerFactory<T>) {
		this._protocol = new WebWorkerProtocol({
			sendMessage: (msg: Message, transfer: ArrayBuffer[]): void => {
				postMessage(msg, transfer);
			},
			handleMessage: (channel: string, method: string, args: unknown[]): Promise<unknown> => this._handleMessage(channel, method, args),
			handleEvent: (channel: string, eventName: string, arg: unknown): Event<unknown> => this._handleEvent(channel, eventName, arg)
		});
		this.requestHandler = requestHandlerFactory(this);
	}

	public onmessage(msg: unknown): void {
		this._protocol.handleMessage(msg);
	}

	private _handleMessage(channel: string, method: string, args: unknown[]): Promise<unknown> {
		if (channel === DEFAULT_CHANNEL && method === INITIALIZE) {
			return this.initialize(<number>args[0]);
		}

		const requestHandler: object | null | undefined = (channel === DEFAULT_CHANNEL ? this.requestHandler : this._localChannels.get(channel));
		if (!requestHandler) {
			return Promise.reject(new Error(`Missing channel ${channel} on worker thread`));
		}

		const fn = (requestHandler as Record<string, unknown>)[method];
		if (typeof fn !== 'function') {
			return Promise.reject(new Error(`Missing method ${method} on worker thread channel ${channel}`));
		}

		try {
			return Promise.resolve(fn.apply(requestHandler, args));
		} catch (e) {
			return Promise.reject(e);
		}
	}

	private _handleEvent(channel: string, eventName: string, arg: unknown): Event<unknown> {
		const requestHandler: object | null | undefined = (channel === DEFAULT_CHANNEL ? this.requestHandler : this._localChannels.get(channel));
		if (!requestHandler) {
			throw new Error(`Missing channel ${channel} on worker thread`);
		}
		if (propertyIsDynamicEvent(eventName)) {
			const fn = (requestHandler as Record<string, unknown>)[eventName];
			if (typeof fn !== 'function') {
				throw new Error(`Missing dynamic event ${eventName} on request handler.`);
			}

			const event = fn.call(requestHandler, arg);
			if (typeof event !== 'function') {
				throw new Error(`Missing dynamic event ${eventName} on request handler.`);
			}
			return event;
		}
		if (propertyIsEvent(eventName)) {
			const event = (requestHandler as Record<string, unknown>)[eventName];
			if (typeof event !== 'function') {
				throw new Error(`Missing event ${eventName} on request handler.`);
			}
			return event as Event<unknown>;
		}
		throw new Error(`Malformed event name ${eventName}`);
	}

	public setChannel<T extends object>(channel: string, handler: T): void {
		this._localChannels.set(channel, handler);
	}

	public getChannel<T extends object>(channel: string): Proxied<T> {
		if (!this._remoteChannels.has(channel)) {
			const inst = this._protocol.createProxyToRemoteChannel(channel);
			this._remoteChannels.set(channel, inst);
		}
		return this._remoteChannels.get(channel) as Proxied<T>;
	}

	private async initialize(workerId: number): Promise<void> {
		this._protocol.setWorkerId(workerId);
	}
}
