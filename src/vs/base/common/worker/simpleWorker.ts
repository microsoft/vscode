/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { transformErrorForSerialization } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { getAllMethodNames } from 'vs/base/common/objects';
import { isWeb } from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';

const INITIALIZE = '$initialize';

export interface IWorker extends IDisposable {
	getId(): number;
	postMessage(message: Message, transfer: ArrayBuffer[]): void;
}

export interface IWorkerCallback {
	(message: Message): void;
}

export interface IWorkerFactory {
	create(moduleId: string, callback: IWorkerCallback, onErrorCallback: (err: any) => void): IWorker;
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
	handleMessage(method: string, args: any[]): Promise<any>;
	handleEvent(eventName: string, arg: any): Event<any>;
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

	public sendMessage(method: string, args: any[]): Promise<any> {
		const req = String(++this._lastSentReq);
		return new Promise<any>((resolve, reject) => {
			this._pendingReplies[req] = {
				resolve: resolve,
				reject: reject
			};
			this._send(new RequestMessage(this._workerId, req, method, args));
		});
	}

	public listen(eventName: string, arg: any): Event<any> {
		let req: string | null = null;
		const emitter = new Emitter<any>({
			onWillAddFirstListener: () => {
				req = String(++this._lastSentReq);
				this._pendingEmitters.set(req, emitter);
				this._send(new SubscribeEventMessage(this._workerId, req, eventName, arg));
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
		const result = this._handler.handleMessage(requestMessage.method, requestMessage.args);
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
		const disposable = this._handler.handleEvent(msg.eventName, msg.arg)((event) => {
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

export interface IWorkerClient<W> {
	getProxyObject(): Promise<W>;
	dispose(): void;
}

/**
 * Main thread side
 */
export class SimpleWorkerClient<W extends object, H extends object> extends Disposable implements IWorkerClient<W> {

	private readonly _worker: IWorker;
	private readonly _onModuleLoaded: Promise<string[]>;
	private readonly _protocol: SimpleWorkerProtocol;
	private readonly _lazyProxy: Promise<W>;

	constructor(workerFactory: IWorkerFactory, moduleId: string, host: H) {
		super();

		let lazyProxyReject: ((err: any) => void) | null = null;

		this._worker = this._register(workerFactory.create(
			'vs/base/common/worker/simpleWorker',
			(msg: Message) => {
				this._protocol.handleMessage(msg);
			},
			(err: any) => {
				// in Firefox, web workers fail lazily :(
				// we will reject the proxy
				lazyProxyReject?.(err);
			}
		));

		this._protocol = new SimpleWorkerProtocol({
			sendMessage: (msg: any, transfer: ArrayBuffer[]): void => {
				this._worker.postMessage(msg, transfer);
			},
			handleMessage: (method: string, args: any[]): Promise<any> => {
				if (typeof (host as any)[method] !== 'function') {
					return Promise.reject(new Error('Missing method ' + method + ' on main thread host.'));
				}

				try {
					return Promise.resolve((host as any)[method].apply(host, args));
				} catch (e) {
					return Promise.reject(e);
				}
			},
			handleEvent: (eventName: string, arg: any): Event<any> => {
				if (propertyIsDynamicEvent(eventName)) {
					const event = (host as any)[eventName].call(host, arg);
					if (typeof event !== 'function') {
						throw new Error(`Missing dynamic event ${eventName} on main thread host.`);
					}
					return event;
				}
				if (propertyIsEvent(eventName)) {
					const event = (host as any)[eventName];
					if (typeof event !== 'function') {
						throw new Error(`Missing event ${eventName} on main thread host.`);
					}
					return event;
				}
				throw new Error(`Malformed event name ${eventName}`);
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

		const hostMethods = getAllMethodNames(host);

		// Send initialize message
		this._onModuleLoaded = this._protocol.sendMessage(INITIALIZE, [
			this._worker.getId(),
			JSON.parse(JSON.stringify(loaderConfiguration)),
			moduleId,
			hostMethods,
		]);

		// Create proxy to loaded code
		const proxyMethodRequest = (method: string, args: any[]): Promise<any> => {
			return this._request(method, args);
		};
		const proxyListen = (eventName: string, arg: any): Event<any> => {
			return this._protocol.listen(eventName, arg);
		};

		this._lazyProxy = new Promise<W>((resolve, reject) => {
			lazyProxyReject = reject;
			this._onModuleLoaded.then((availableMethods: string[]) => {
				resolve(createProxyObject<W>(availableMethods, proxyMethodRequest, proxyListen));
			}, (e) => {
				reject(e);
				this._onError('Worker failed to load ' + moduleId, e);
			});
		});
	}

	public getProxyObject(): Promise<W> {
		return this._lazyProxy;
	}

	private _request(method: string, args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			this._onModuleLoaded.then(() => {
				this._protocol.sendMessage(method, args).then(resolve, reject);
			}, reject);
		});
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

function createProxyObject<T extends object>(
	methodNames: string[],
	invoke: (method: string, args: unknown[]) => unknown,
	proxyListen: (eventName: string, arg: any) => Event<any>
): T {
	const createProxyMethod = (method: string): () => unknown => {
		return function () {
			const args = Array.prototype.slice.call(arguments, 0);
			return invoke(method, args);
		};
	};
	const createProxyDynamicEvent = (eventName: string): (arg: any) => Event<any> => {
		return function (arg) {
			return proxyListen(eventName, arg);
		};
	};

	const result = {} as T;
	for (const methodName of methodNames) {
		if (propertyIsDynamicEvent(methodName)) {
			(<any>result)[methodName] = createProxyDynamicEvent(methodName);
			continue;
		}
		if (propertyIsEvent(methodName)) {
			(<any>result)[methodName] = proxyListen(methodName, undefined);
			continue;
		}
		(<any>result)[methodName] = createProxyMethod(methodName);
	}
	return result;
}

export interface IRequestHandler {
	_requestHandlerBrand: any;
	[prop: string]: any;
}

export interface IRequestHandlerFactory<H> {
	(host: H): IRequestHandler;
}

/**
 * Worker side
 */
export class SimpleWorkerServer<H extends object> {

	private _requestHandlerFactory: IRequestHandlerFactory<H> | null;
	private _requestHandler: IRequestHandler | null;
	private _protocol: SimpleWorkerProtocol;

	constructor(postMessage: (msg: Message, transfer?: ArrayBuffer[]) => void, requestHandlerFactory: IRequestHandlerFactory<H> | null) {
		this._requestHandlerFactory = requestHandlerFactory;
		this._requestHandler = null;
		this._protocol = new SimpleWorkerProtocol({
			sendMessage: (msg: any, transfer: ArrayBuffer[]): void => {
				postMessage(msg, transfer);
			},
			handleMessage: (method: string, args: any[]): Promise<any> => this._handleMessage(method, args),
			handleEvent: (eventName: string, arg: any): Event<any> => this._handleEvent(eventName, arg)
		});
	}

	public onmessage(msg: any): void {
		this._protocol.handleMessage(msg);
	}

	private _handleMessage(method: string, args: any[]): Promise<any> {
		if (method === INITIALIZE) {
			return this.initialize(<number>args[0], <any>args[1], <string>args[2], <string[]>args[3]);
		}

		if (!this._requestHandler || typeof this._requestHandler[method] !== 'function') {
			return Promise.reject(new Error('Missing requestHandler or method: ' + method));
		}

		try {
			return Promise.resolve(this._requestHandler[method].apply(this._requestHandler, args));
		} catch (e) {
			return Promise.reject(e);
		}
	}

	private _handleEvent(eventName: string, arg: any): Event<any> {
		if (!this._requestHandler) {
			throw new Error(`Missing requestHandler`);
		}
		if (propertyIsDynamicEvent(eventName)) {
			const event = (this._requestHandler as any)[eventName].call(this._requestHandler, arg);
			if (typeof event !== 'function') {
				throw new Error(`Missing dynamic event ${eventName} on request handler.`);
			}
			return event;
		}
		if (propertyIsEvent(eventName)) {
			const event = (this._requestHandler as any)[eventName];
			if (typeof event !== 'function') {
				throw new Error(`Missing event ${eventName} on request handler.`);
			}
			return event;
		}
		throw new Error(`Malformed event name ${eventName}`);
	}

	private initialize(workerId: number, loaderConfig: any, moduleId: string, hostMethods: string[]): Promise<string[]> {
		this._protocol.setWorkerId(workerId);

		const proxyMethodRequest = (method: string, args: any[]): Promise<any> => {
			return this._protocol.sendMessage(method, args);
		};
		const proxyListen = (eventName: string, arg: any): Event<any> => {
			return this._protocol.listen(eventName, arg);
		};

		const hostProxy = createProxyObject<H>(hostMethods, proxyMethodRequest, proxyListen);

		if (this._requestHandlerFactory) {
			// static request handler
			this._requestHandler = this._requestHandlerFactory(hostProxy);
			return Promise.resolve(getAllMethodNames(this._requestHandler));
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
			if (typeof loaderConfig.trustedTypesPolicy !== undefined) {
				// don't use, it has been destroyed during serialize
				delete loaderConfig['trustedTypesPolicy'];
			}

			// Since this is in a web worker, enable catching errors
			loaderConfig.catchError = true;
			globalThis.require.config(loaderConfig);
		}

		return new Promise<string[]>((resolve, reject) => {
			// Use the global require to be sure to get the global config

			// ESM-comment-begin
			const req = (globalThis.require || require);
			// ESM-comment-end
			// ESM-uncomment-begin
			// const req = globalThis.require;
			// ESM-uncomment-end

			req([moduleId], (module: { create: IRequestHandlerFactory<H> }) => {
				this._requestHandler = module.create(hostProxy);

				if (!this._requestHandler) {
					reject(new Error(`No RequestHandler!`));
					return;
				}

				resolve(getAllMethodNames(this._requestHandler));
			}, reject);
		});
	}
}

/**
 * Called on the worker side
 * @skipMangle
 */
export function create(postMessage: (msg: Message, transfer?: ArrayBuffer[]) => void): SimpleWorkerServer<any> {
	return new SimpleWorkerServer(postMessage, null);
}
