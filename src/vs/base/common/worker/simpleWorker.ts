/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {transformErrorForSerialization} from 'vs/base/common/errors';
import {Disposable} from 'vs/base/common/lifecycle';
import {ErrorCallback, TPromise, ValueCallback} from 'vs/base/common/winjs.base';
import {IWorker, IWorkerFactory} from './workerClient';

const INITIALIZE = '$initialize';

interface IMessage {
	vsWorker: number;
	req?: string;
	seq?: string;
}

interface IRequestMessage extends IMessage {
	req: string;
	method: string;
	args: any[];
}

interface IReplyMessage extends IMessage {
	seq: string;
	err: any;
	res: any;
}

interface IMessageReply {
	c: ValueCallback;
	e: ErrorCallback;
}

interface IMessageHandler {
	sendMessage(msg:string): void;
	handleMessage(method:string, args:any[]): TPromise<any>;
}

class SimpleWorkerProtocol {

	private _workerId: number;
	private _lastSentReq: number;
	private _pendingReplies: { [req:string]:IMessageReply; };
	private _handler:IMessageHandler;

	constructor(handler:IMessageHandler) {
		this._workerId = -1;
		this._handler = handler;
		this._lastSentReq = 0;
		this._pendingReplies = Object.create(null);
	}

	public setWorkerId(workerId:number): void {
		this._workerId = workerId;
	}

	public sendMessage(method:string, args:any[]): TPromise<any> {
		let req = String(++this._lastSentReq);
		let reply: IMessageReply = {
			c: null,
			e: null
		};
		let result = new TPromise<any>((c, e, p) => {
			reply.c = c;
			reply.e = e;
		}, () => {
			// Cancel not supported
		});
		this._pendingReplies[req] = reply;

		this._send({
			vsWorker: this._workerId,
			req: req,
			method: method,
			args: args
		});

		return result;
	}

	public handleMessage(serializedMessage:string): void {
		let message:IMessage;
		try {
			message = JSON.parse(serializedMessage);
		} catch(e) {
			// nothing
		}
		if (!message.vsWorker) {
			return;
		}
		if (this._workerId !== -1 && message.vsWorker !== this._workerId) {
			return;
		}
		this._handleMessage(message);
	}

	private _handleMessage(msg:IMessage): void {
		if (msg.seq) {
			let replyMessage = <IReplyMessage>msg;
			if (!this._pendingReplies[replyMessage.seq]) {
				console.warn('Got reply to unknown seq');
				return;
			}

			let reply = this._pendingReplies[replyMessage.seq];
			delete this._pendingReplies[replyMessage.seq];

			if (replyMessage.err) {
				let err = replyMessage.err;
				if (replyMessage.err.$isError) {
					err = new Error();
					err.name = replyMessage.err.name;
					err.message = replyMessage.err.message;
					err.stack = replyMessage.err.stack;
				}
				reply.e(err);
				return;
			}

			reply.c(replyMessage.res);
			return;
		}

		let requestMessage = <IRequestMessage>msg;
		let req = requestMessage.req;
		let result = this._handler.handleMessage(requestMessage.method, requestMessage.args);
		result.then((r) => {
			this._send({
				vsWorker: this._workerId,
				seq: req,
				res: r,
				err: undefined
			});
		}, (e) => {
			this._send({
				vsWorker: this._workerId,
				seq: req,
				res: undefined,
				err: transformErrorForSerialization(e)
			});
		});
	}

	private _send(msg:IRequestMessage|IReplyMessage): void {
		let strMsg = JSON.stringify(msg);
		// console.log('SENDING: ' + strMsg);
		this._handler.sendMessage(strMsg);
	}
}

/**
 * Main thread side
 */
export class SimpleWorkerClient<T> extends Disposable {

	private _worker:IWorker;
	private _onModuleLoaded:TPromise<void>;
	private _protocol: SimpleWorkerProtocol;
	private _proxy: T;

	constructor(workerFactory:IWorkerFactory, moduleId:string, ctor:any) {
		super();
		this._worker = this._register(workerFactory.create('vs/base/common/worker/simpleWorker', (msg:string) => {
			this._protocol.handleMessage(msg);
		}));

		this._protocol = new SimpleWorkerProtocol({
			sendMessage: (msg:string): void => {
				this._worker.postMessage(msg);
			},
			handleMessage: (method:string, args:any[]): TPromise<any> => {
				// Intentionally not supporting worker -> main requests
				return TPromise.as(null);
			}
		});
		this._protocol.setWorkerId(this._worker.getId());

		// Gather loader configuration
		let loaderConfiguration:any = null;
		let globalRequire = (<any>window).require;
		if (typeof globalRequire.getConfig === 'function') {
			// Get the configuration from the Monaco AMD Loader
			loaderConfiguration = globalRequire.getConfig();
		} else if (typeof (<any>window).requirejs !== 'undefined') {
			// Get the configuration from requirejs
			loaderConfiguration = (<any>window).requirejs.s.contexts._.config;
		}

		// Send initialize message
		this._onModuleLoaded = this._protocol.sendMessage(INITIALIZE, [
			this._worker.getId(),
			moduleId,
			loaderConfiguration
		]);
		this._onModuleLoaded.then(null, (e) => this._onError('Worker failed to load ' + moduleId, e));

		// Create proxy to loaded code
		let proxyMethodRequest = (method:string, args:any[]):TPromise<any> => {
			return this._request(method, args);
		};

		let createProxyMethod = (method:string, proxyMethodRequest:(method:string, args:any[])=>TPromise<any>): Function => {
			return function () {
				let args = Array.prototype.slice.call(arguments, 0);
				return proxyMethodRequest(method, args);
			};
		};

		this._proxy = <T><any>{};
		for (let prop in ctor.prototype) {
			if (ctor.prototype.hasOwnProperty(prop)) {
				if (typeof ctor.prototype[prop] === 'function') {
					this._proxy[prop] = createProxyMethod(prop, proxyMethodRequest);
				}
			}
		}
	}

	public get(): T {
		return this._proxy;
	}

	private _request(method:string, args:any[]): TPromise<any> {
		return new TPromise<any>((c, e, p) => {
			this._onModuleLoaded.then(() => {
				this._protocol.sendMessage(method, args).then(c, e);
			}, e);
		}, () => {
			// Cancel intentionally not supported
		});
	}

	private _onError(message:string, error?:any): void {
		console.error(message);
		console.info(error);
	}
}

export interface IRequestHandler {
	_requestHandlerTrait: any;
}

/**
 * Worker side
 */
export class SimpleWorkerServer {

	private _protocol: SimpleWorkerProtocol;
	private _requestHandler: IRequestHandler;

	constructor(postSerializedMessage:(msg:string)=>void) {
		this._protocol = new SimpleWorkerProtocol({
			sendMessage: (msg:string): void => {
				postSerializedMessage(msg);
			},
			handleMessage: (method:string, args:any[]): TPromise<any> => this._handleMessage(method, args)
		});
	}

	public onmessage(msg:string): void {
		this._protocol.handleMessage(msg);
	}

	private _handleMessage(method: string, args:any[]): TPromise<any> {
		if (method === INITIALIZE) {
			return this.initialize(<number>args[0], <string>args[1], <any>args[2]);
		}

		if (!this._requestHandler || typeof this._requestHandler[method] !== 'function') {
			return TPromise.wrapError(new Error('Missing requestHandler or method: ' + method));
		}

		try {
			return TPromise.as(this._requestHandler[method].apply(this._requestHandler, args));
		} catch (e) {
			return TPromise.wrapError(e);
		}
	}

	private initialize(workerId: number, moduleId: string, loaderConfig:any): TPromise<any> {
		this._protocol.setWorkerId(workerId);

		// TODO@Alex: share this code with workerServer
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
			let nlsConfig = loaderConfig['vs/nls'];
			// We need to have pseudo translation
			if (nlsConfig && nlsConfig.pseudo) {
				require(['vs/nls'], function(nlsPlugin) {
					nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
				});
			}

			// Since this is in a web worker, enable catching errors
			loaderConfig.catchError = true;
			(<any>self).require.config(loaderConfig);
		}

		let cc: ValueCallback;
		let ee: ErrorCallback;
		let r = new TPromise<any>((c, e, p) => {
			cc = c;
			ee = e;
		});

		require([moduleId], (...result:any[]) => {
			let handlerModule = result[0];
			this._requestHandler = handlerModule.create();
			cc(null);
		}, ee);

		return r;
	}
}

/**
 * Called on the worker side
 */
export function create(postMessage:(msg:string)=>void): SimpleWorkerServer {
	return new SimpleWorkerServer(postMessage);
}
