/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {setUnexpectedErrorHandler, transformErrorForSerialization} from 'vs/base/common/errors';
import {parse, stringify} from 'vs/base/common/marshalling';
import {IRemoteCom} from 'vs/base/common/remote';
import {TPromise} from 'vs/base/common/winjs.base';
import * as workerProtocol from 'vs/base/common/worker/workerProtocol';

interface IReplyCallbacks {
	c: (value:any)=>void;
	e: (err:any)=>void;
	p: (progress:any)=>void;
}

export class WorkerServer {

	private _postSerializedMessage:(msg:string)=>void;
	private _workerId:number;
	private _requestHandler:any;
	private _lastReq: number;
	private _awaitedReplies: { [req:string]: IReplyCallbacks; };
	private _remoteCom: workerProtocol.RemoteCom;

	constructor(postSerializedMessage:(msg:string)=>void) {
		this._postSerializedMessage = postSerializedMessage;
		this._workerId = 0;
		this._requestHandler = null;
		this._lastReq = 0;
		this._awaitedReplies = {};
		this._bindConsole();

		this._remoteCom = new workerProtocol.RemoteCom(this);
	}

	public getRemoteCom(): IRemoteCom {
		return this._remoteCom;
	}

	private _bindConsole(): void {
		(<any> self).console = {
			log: this._sendPrintMessage.bind(this, workerProtocol.PrintType.LOG),
			debug: this._sendPrintMessage.bind(this, workerProtocol.PrintType.DEBUG),
			info: this._sendPrintMessage.bind(this, workerProtocol.PrintType.INFO),
			warn: this._sendPrintMessage.bind(this, workerProtocol.PrintType.WARN),
			error: this._sendPrintMessage.bind(this, workerProtocol.PrintType.ERROR)
		};
		setUnexpectedErrorHandler((e) => {
			self.console.error(e);
		});
	}

	private _sendPrintMessage(level:string, ...objects:any[]): void {
		var transformedObjects = objects.map((obj) => (obj instanceof Error) ? transformErrorForSerialization(obj) : obj);
		var msg:workerProtocol.IServerPrintMessage = {
			monacoWorker: true,
			from: this._workerId,
			req: '0',
			type: workerProtocol.MessageType.PRINT,
			level: level,
			payload: (transformedObjects.length === 1 ? transformedObjects[0] : transformedObjects)
		};
		this._postMessage(msg);
	}

	private _sendReply(msgId:number, action:string, payload:any): void {
		var msg:workerProtocol.IServerReplyMessage = {
			monacoWorker: true,
			from: this._workerId,
			req: '0',
			id: msgId,
			type: workerProtocol.MessageType.REPLY,
			action: action,
			payload: (payload instanceof Error) ? transformErrorForSerialization(payload) : payload
		};
		this._postMessage(msg);
	}

	public request(requestName:string, payload:any): TPromise<any> {
		if (requestName.charAt(0) === '$') {
			throw new Error('Illegal requestName: ' + requestName);
		}

		var req = String(++this._lastReq);

		var msg:workerProtocol.IServerMessage = {
			monacoWorker: true,
			from: this._workerId,
			req: req,
			type: requestName,
			payload: payload
		};

		var reply: IReplyCallbacks = {
			c: null,
			e: null,
			p: null
		};

		var r = new TPromise<any>((c, e, p) => {
			reply.c = c;
			reply.e = e;
			reply.p = p;
		});

		this._awaitedReplies[req] = reply;

		this._postMessage(msg);

		return r;
	}

	public loadModule(moduleId:string, callback:Function, errorback:(err:any)=>void): void {
		require([moduleId], (...result:any[]) => {
			callback(result[0]);
		}, errorback);
	}

	public onmessage(msg:string): void {
		this._onmessage(parse(msg));
	}

	private _postMessage(msg:workerProtocol.IServerMessage): void {
		this._postSerializedMessage(stringify(msg));
	}

	private _onmessage(msg:workerProtocol.IClientMessage): void {

		if (msg.type === workerProtocol.MessageType.REPLY) {
			// this message is a reply to a request we've made to the main thread previously

			var typedMsg = <workerProtocol.IClientReplyMessage>msg;

			if (!typedMsg.seq || !this._awaitedReplies.hasOwnProperty(typedMsg.seq)) {
				console.error('Worker received unexpected reply from main thread', msg);
				return;
			}

			var reply = this._awaitedReplies[typedMsg.seq];
			delete this._awaitedReplies[typedMsg.seq];

			if (typedMsg.err) {
				reply.e(typedMsg.err);
			} else {
				reply.c(typedMsg.payload);
			}

			return;
		}

		var c = this._sendReply.bind(this, msg.id, workerProtocol.ReplyType.COMPLETE);
		var e = this._sendReply.bind(this, msg.id, workerProtocol.ReplyType.ERROR);
		var p = this._sendReply.bind(this, msg.id, workerProtocol.ReplyType.PROGRESS);

		switch(msg.type) {
			case workerProtocol.MessageType.INITIALIZE:
				this._workerId = msg.payload.id;

				var loaderConfig = msg.payload.loaderConfiguration;
				// TODO@Alex: share this code with simpleWorker
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

				var MonacoEnvironment = msg.payload.MonacoEnvironment;
				if (MonacoEnvironment) {
					(<any>self).MonacoEnvironment = MonacoEnvironment;
				}

				this.loadModule(msg.payload.moduleId, (handlerModule:any) => {
					this._requestHandler = handlerModule.value;
					c();
				}, e);
				break;

			default:
				this._handleMessage(msg, c, e, p);
				break;
		}
	}

	private _handleMessage(msg:workerProtocol.IClientMessage, c:(value:any)=>void, e:(err:any)=>void, p:(progress:any)=>void): void {

		if (msg.type === '_proxyObj') {
			this._remoteCom.handleMessage(msg.payload).then(c, e, p);
			return;
		}

		if (!this._requestHandler) {
			e('Request handler not loaded');
			return;
		}

		if ((msg.type in this._requestHandler) && (typeof this._requestHandler[msg.type] === 'function')) {
			// var now = (new Date()).getTime();
			try {
				this._requestHandler[msg.type].call(this._requestHandler, this, c, e, p, msg.payload);
			} catch (handlerError) {
				e(transformErrorForSerialization(handlerError));
			}
			// var what = msg.type;
			// console.info(what + ' took ' + ((new Date().getTime())-now));

		} else {
			this._requestHandler.request(this, c, e, p, msg);
		}
	}
}

export function create(postMessage:(msg:string)=>void): WorkerServer {
	return new WorkerServer(postMessage);
}
