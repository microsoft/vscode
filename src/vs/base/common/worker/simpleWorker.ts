/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../charCode.js';
import { onUnexpectedError, transformErrorForSerialization } from '../errors.js';
import { Emitter, Event } from '../event.js';
import { Disposable, IDisposable } from '../lifecycle.js';
import { AppResourcePath, FileAccess } from '../network.js';
import { isWeb } from '../platform.js';
import * as strings from '../strings.js';
import { URI } from '../uri.js';

// ESM-comment-begin
// const isESM = false;
// ESM-comment-end
// ESM-uncomment-begin
const isESM = true;
// ESM-uncomment-end

const DEFAULT_CHANNEL = 'default';
const INITIALIZE = '$initialize';

export interface IWorker extends IDisposable {
	getId(): number;
	postMessage(message: Message, transfer: ArrayBuffer[]): void;
}

export interface IWorkerCallback {
	(message: Message): void;
}

export interface IWorkerFactory {
	create(modules: IWorkerDescriptor, callback: IWorkerCallback, onErrorCallback: (err: any) => void): IWorker;
}

export interface IWorkerDescriptor {
	readonly amdModuleId: string;
	readonly esmModuleLocation: URI | undefined;
	readonly label: string | undefined;
}

let webWorkerWarningLogged = false;
export function logOnceWebWorkerWarning(err: any): void {
	if (!isWeb) {
		// running tests
		return;
	}
	if (!webWorkerWarningLogged) {
		webWorkerWarningLogged = true;
		console.warn('Could not create web worker(s). Falling back to loading web worker code in main thread, which might cause UI freezes. Please see https://github.com/microsoft/monaco-editor#faq');
	}
	console.warn(err.message);
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
		public readonly args: any[]
	) { }
}
class ReplyMessage {
	public readonly type = MessageType.Reply;
	constructor(
		public readonly vsWorker: number,
		public readonly seq: string,
		public readonly res: any,
		public readonly err: any
	) { }
}
class SubscribeEventMessage {
	public readonly type = MessageType.SubscribeEvent;
	constructor(
		public readonly vsWorker: number,
		public readonly req: string,
		public readonly channel: string,
		public readonly eventName: string,
		public readonly arg: any
	) { }
}
class EventMessage {
	public readonly type = MessageType.Event;
	constructor(
		public readonly vsWorker: number,
		public readonly req: string,
		public readonly event: any
	) { }
}
class UnsubscribeEventMessage {
	public readonly type = MessageType.UnsubscribeEvent;
	constructor(
		public readonly vsWorker: number,
		public readonly req: string
	) { }
}
type Message = RequestMessage | ReplyMessage | SubscribeEventMessage | EventMessage | UnsubscribeEventMessage;

interface IMessageReply {
	resolve: (value?: any) => void;
	reject: (error?: any) => void;
}

interface IMessageHandler {
	sendMessage(msg: any, transfer?: ArrayBuffer[]): void;
	handleMessage(channel: string, method: string, args: any[]): Promise<any>;
	handleEvent(channel: string, eventName: string, arg: any): Event<any>;
}

class SimpleWorkerProtocol {

	private _workerId: number;
	private _lastSentReq: number;
	private _pendingReplies: { [req: string]: IMessageReply };
	private _pendingEmitters: Map<string, Emitter<any>>;
	private _pendingEvents: Map<string, IDisposable>;
	private _handler: IMessageHandler;

	constructor(handler: IMessageHandler) {
		this._workerId = -1;
		this._handler = handler;
		this._lastSentReq = 0;
		this._pendingReplies = Object.create(null);
		this._pendingEmitters = new Map<string, Emitter<any>>();
		this._pendingEvents = new Map<string, IDisposable>();
	}

	public setWorkerId(workerId: number): void {
		this._workerId = workerId;
	}

	public sendMessage(channel: string, method: string, args: any[]): Promise<any> {
		const req = String(++this._lastSentReq);
		return new Promise<any>((resolve, reject) => {
			this._pendingReplies[req] = {
				resolve: resolve,
				reject: reject
			};
			this._send(new RequestMessage(this._workerId, req, channel, method, args));
		});
	}

	public listen(channel: string, eventName: string, arg: any): Event<any> {
		let req: string | null = null;
		const emitter = new Emitter<any>({
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

	public handleMessage(message: Message): void {
		if (!message || !message.vsWorker) {
			return;
		}
		if (this._workerId !== -1 && message.vsWorker !== this._workerId) {
			return;
		}
		this._handleMessage(message);
	}

	public createProxyToRemoteChannel<T extends object>(channel: string, sendMessageBarrier?: () => Promise<void>): T {
		const handler = {
			get: (target: any, name: PropertyKey) => {
				if (typeof name === 'string' && !target[name]) {
					if (propertyIsDynamicEvent(name)) { // onDynamic...
						target[name] = (arg: any): Event<any> => {
							return this.listen(channel, name, arg);
						};
					} else if (propertyIsEvent(name)) { // on...
						target[name] = this.listen(channel, name, undefined);
					} else if (name.charCodeAt(0) === CharCode.DollarSign) { // $...
						target[name] = async (...myArgs: any[]) => {
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
			if (replyMessage.err.$isError) {
				err = new Error();
				err.name = replyMessage.err.name;
				err.message = replyMessage.err.message;
				err.stack = replyMessage.err.stack;
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
				if (msg.args[i] instanceof ArrayBuffer) {
					transfer.push(msg.args[i]);
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

export interface IWorkerClient<W> {
	proxy: Proxied<W>;
	dispose(): void;
	setChannel<T extends object>(channel: string, handler: T): void;
	getChannel<T extends object>(channel: string): Proxied<T>;
}

export interface IWorkerServer {
	setChannel<T extends object>(channel: string, handler: T): void;
	getChannel<T extends object>(channel: string): Proxied<T>;
}

/**
 * Main thread side
 */
export class SimpleWorkerClient<W extends object> extends Disposable implements IWorkerClient<W> {

	private readonly _worker: IWorker;
	private readonly _onModuleLoaded: Promise<void>;
	private readonly _protocol: SimpleWorkerProtocol;
	public readonly proxy: Proxied<W>;
	private readonly _localChannels: Map<string, object> = new Map();
	private readonly _remoteChannels: Map<string, object> = new Map();

	constructor(
		workerFactory: IWorkerFactory,
		workerDescriptor: IWorkerDescriptor,
	) {
		super();

		this._worker = this._register(workerFactory.create(
			{
				amdModuleId: 'vs/base/common/worker/simpleWorker',
				esmModuleLocation: workerDescriptor.esmModuleLocation,
				label: workerDescriptor.label
			},
			(msg: Message) => {
				this._protocol.handleMessage(msg);
			},
			(err: any) => {
				// in Firefox, web workers fail lazily :(
				// we will reject the proxy
				onUnexpectedError(err);
			}
		));

		this._protocol = new SimpleWorkerProtocol({
			sendMessage: (msg: any, transfer: ArrayBuffer[]): void => {
				this._worker.postMessage(msg, transfer);
			},
			handleMessage: (channel: string, method: string, args: any[]): Promise<any> => {
				return this._handleMessage(channel, method, args);
			},
			handleEvent: (channel: string, eventName: string, arg: any): Event<any> => {
				return this._handleEvent(channel, eventName, arg);
			}
		});
		this._protocol.setWorkerId(this._worker.getId());

		// Gather loader configuration
		let loaderConfiguration: any = null;

		const globalRequire: { getConfig?(): object } | undefined = (globalThis as any).require;
		if (typeof globalRequire !== 'undefined' && typeof globalRequire.getConfig === 'function') {
			// Get the configuration from the Monaco AMD Loader
			loaderConfiguration = globalRequire.getConfig();
		} else if (typeof (globalThis as any).requirejs !== 'undefined') {
			// Get the configuration from requirejs
			loaderConfiguration = (globalThis as any).requirejs.s.contexts._.config;
		}

		// Send initialize message
		this._onModuleLoaded = this._protocol.sendMessage(DEFAULT_CHANNEL, INITIALIZE, [
			this._worker.getId(),
			JSON.parse(JSON.stringify(loaderConfiguration)),
			workerDescriptor.amdModuleId,
		]);

		this.proxy = this._protocol.createProxyToRemoteChannel(DEFAULT_CHANNEL, async () => { await this._onModuleLoaded; });
		this._onModuleLoaded.catch((e) => {
			this._onError('Worker failed to load ' + workerDescriptor.amdModuleId, e);
		});
	}

	private _handleMessage(channelName: string, method: string, args: any[]): Promise<any> {
		const channel: object | undefined = this._localChannels.get(channelName);
		if (!channel) {
			return Promise.reject(new Error(`Missing channel ${channelName} on main thread`));
		}
		if (typeof (channel as any)[method] !== 'function') {
			return Promise.reject(new Error(`Missing method ${method} on main thread channel ${channelName}`));
		}

		try {
			return Promise.resolve((channel as any)[method].apply(channel, args));
		} catch (e) {
			return Promise.reject(e);
		}
	}

	private _handleEvent(channelName: string, eventName: string, arg: any): Event<any> {
		const channel: object | undefined = this._localChannels.get(channelName);
		if (!channel) {
			throw new Error(`Missing channel ${channelName} on main thread`);
		}
		if (propertyIsDynamicEvent(eventName)) {
			const event = (channel as any)[eventName].call(channel, arg);
			if (typeof event !== 'function') {
				throw new Error(`Missing dynamic event ${eventName} on main thread channel ${channelName}.`);
			}
			return event;
		}
		if (propertyIsEvent(eventName)) {
			const event = (channel as any)[eventName];
			if (typeof event !== 'function') {
				throw new Error(`Missing event ${eventName} on main thread channel ${channelName}.`);
			}
			return event;
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

	private _onError(message: string, error?: any): void {
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

export interface IRequestHandler {
	_requestHandlerBrand: any;
	[prop: string]: any;
}

export interface IRequestHandlerFactory {
	(workerServer: IWorkerServer): IRequestHandler;
}

/**
 * Worker side
 */
export class SimpleWorkerServer implements IWorkerServer {

	private _requestHandlerFactory: IRequestHandlerFactory | null;
	private _requestHandler: IRequestHandler | null;
	private _protocol: SimpleWorkerProtocol;
	private readonly _localChannels: Map<string, object> = new Map();
	private readonly _remoteChannels: Map<string, object> = new Map();

	constructor(postMessage: (msg: Message, transfer?: ArrayBuffer[]) => void, requestHandlerFactory: IRequestHandlerFactory | null) {
		this._requestHandlerFactory = requestHandlerFactory;
		this._requestHandler = null;
		this._protocol = new SimpleWorkerProtocol({
			sendMessage: (msg: any, transfer: ArrayBuffer[]): void => {
				postMessage(msg, transfer);
			},
			handleMessage: (channel: string, method: string, args: any[]): Promise<any> => this._handleMessage(channel, method, args),
			handleEvent: (channel: string, eventName: string, arg: any): Event<any> => this._handleEvent(channel, eventName, arg)
		});
	}

	public onmessage(msg: any): void {
		this._protocol.handleMessage(msg);
	}

	private _handleMessage(channel: string, method: string, args: any[]): Promise<any> {
		if (channel === DEFAULT_CHANNEL && method === INITIALIZE) {
			return this.initialize(<number>args[0], <any>args[1], <string>args[2]);
		}

		const requestHandler: object | null | undefined = (channel === DEFAULT_CHANNEL ? this._requestHandler : this._localChannels.get(channel));
		if (!requestHandler) {
			return Promise.reject(new Error(`Missing channel ${channel} on worker thread`));
		}
		if (typeof (requestHandler as any)[method] !== 'function') {
			return Promise.reject(new Error(`Missing method ${method} on worker thread channel ${channel}`));
		}

		try {
			return Promise.resolve((requestHandler as any)[method].apply(requestHandler, args));
		} catch (e) {
			return Promise.reject(e);
		}
	}

	private _handleEvent(channel: string, eventName: string, arg: any): Event<any> {
		const requestHandler: object | null | undefined = (channel === DEFAULT_CHANNEL ? this._requestHandler : this._localChannels.get(channel));
		if (!requestHandler) {
			throw new Error(`Missing channel ${channel} on worker thread`);
		}
		if (propertyIsDynamicEvent(eventName)) {
			const event = (requestHandler as any)[eventName].call(requestHandler, arg);
			if (typeof event !== 'function') {
				throw new Error(`Missing dynamic event ${eventName} on request handler.`);
			}
			return event;
		}
		if (propertyIsEvent(eventName)) {
			const event = (requestHandler as any)[eventName];
			if (typeof event !== 'function') {
				throw new Error(`Missing event ${eventName} on request handler.`);
			}
			return event;
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

	private async initialize(workerId: number, loaderConfig: any, moduleId: string): Promise<void> {
		this._protocol.setWorkerId(workerId);

		if (this._requestHandlerFactory) {
			// static request handler
			this._requestHandler = this._requestHandlerFactory(this);
			return;
		}

		if (loaderConfig) {
			// Remove 'baseUrl', handling it is beyond scope for now
			if (typeof loaderConfig.baseUrl !== 'undefined') {
				delete loaderConfig['baseUrl'];
			}
			if (typeof loaderConfig.paths !== 'undefined') {
				if (typeof loaderConfig.paths.vs !== 'undefined') {
					delete loaderConfig.paths['vs'];
				}
			}
			if (typeof loaderConfig.trustedTypesPolicy !== 'undefined') {
				// don't use, it has been destroyed during serialize
				delete loaderConfig['trustedTypesPolicy'];
			}

			// Since this is in a web worker, enable catching errors
			loaderConfig.catchError = true;
			globalThis.require.config(loaderConfig);
		}

		if (isESM) {
			const url = FileAccess.asBrowserUri(`${moduleId}.js` as AppResourcePath).toString(true);
			return import(`${url}`).then((module: { create: IRequestHandlerFactory }) => {
				this._requestHandler = module.create(this);

				if (!this._requestHandler) {
					throw new Error(`No RequestHandler!`);
				}
			});
		}

		return new Promise<void>((resolve, reject) => {
			// Use the global require to be sure to get the global config

			// ESM-comment-begin
			// const req = (globalThis.require || require);
			// ESM-comment-end
			// ESM-uncomment-begin
			const req = globalThis.require;
			// ESM-uncomment-end

			req([moduleId], (module: { create: IRequestHandlerFactory }) => {
				this._requestHandler = module.create(this);

				if (!this._requestHandler) {
					reject(new Error(`No RequestHandler!`));
					return;
				}

				resolve();
			}, reject);
		});
	}
}

/**
 * Defines the worker entry point. Must be exported and named `create`.
 * @skipMangle
 */
export function create(postMessage: (msg: Message, transfer?: ArrayBuffer[]) => void): SimpleWorkerServer {
	return new SimpleWorkerServer(postMessage, null);
}
