/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError, transformErrorForSerialization} from 'vs/base/common/errors';
import {parse, stringify} from 'vs/base/common/marshalling';
import {IRemoteCom} from 'vs/base/common/remote';
import * as timer from 'vs/base/common/timer';
import {TPromise} from 'vs/base/common/winjs.base';
import * as workerProtocol from 'vs/base/common/worker/workerProtocol';

export interface IWorker {
	getId():number;
	postMessage(message:string):void;
	dispose():void;
}

export interface IWorkerCallback {
	(message:string):void;
}

export interface IWorkerFactory {
	create(moduleId:string, callback:IWorkerCallback, onCrashCallback?:()=>void):IWorker;
}

interface IActiveRequest {
	complete:(value:any)=>void;
	error:(err:any)=>void;
	progress:(progress:any)=>void;
	type:string;
	payload:any;
}

export class WorkerClient {

	private _lastMessageId:number;
	private _promises:{[id:string]:IActiveRequest;};
	private _worker:IWorker;

	private _messagesQueue:workerProtocol.IClientMessage[];
	private _processQueueTimeout:number;
	private _waitingForWorkerReply:boolean;
	private _lastTimerEvent:timer.ITimerEvent;

	private _remoteCom: workerProtocol.RemoteCom;
	private _decodeMessageName: (msg: workerProtocol.IClientMessage) => string;

	public onModuleLoaded:TPromise<void>;

	constructor(workerFactory:IWorkerFactory, moduleId:string, decodeMessageName:(msg:workerProtocol.IClientMessage)=>string) {
		this._decodeMessageName = decodeMessageName;
		this._lastMessageId = 0;
		this._promises = {};

		this._messagesQueue = [];
		this._processQueueTimeout = -1;
		this._waitingForWorkerReply = false;
		this._lastTimerEvent = null;

		this._worker = workerFactory.create('vs/base/common/worker/workerServer', (msg) => this._onSerializedMessage(msg));

		let loaderConfiguration:any = null;

		let globalRequire = (<any>window).require;
		if (typeof globalRequire.getConfig === 'function') {
			// Get the configuration from the Monaco AMD Loader
			loaderConfiguration = globalRequire.getConfig();
		} else if (typeof (<any>window).requirejs !== 'undefined') {
			// Get the configuration from requirejs
			loaderConfiguration = (<any>window).requirejs.s.contexts._.config;
		}

		let MonacoEnvironment = (<any>window).MonacoEnvironment || null;

		this.onModuleLoaded = this._sendMessage(workerProtocol.MessageType.INITIALIZE, {
			id: this._worker.getId(),
			moduleId: moduleId,
			loaderConfiguration: loaderConfiguration,
			MonacoEnvironment: MonacoEnvironment
		});
		this.onModuleLoaded.then(null, (e) => this._onError('Worker failed to load ' + moduleId, e));

		this._remoteCom = new workerProtocol.RemoteCom(this);
	}

	public getRemoteCom(): IRemoteCom {
		return this._remoteCom;
	}

	public getQueueSize(): number {
		return this._messagesQueue.length + (this._waitingForWorkerReply ? 1 : 0);
	}

	public request(requestName:string, payload:any, forceTimestamp?:number): TPromise<any> {

		if (requestName.charAt(0) === '$') {
			throw new Error('Illegal requestName: ' + requestName);
		}

		let shouldCancelPromise = false,
			messagePromise:TPromise<any>;

		return new TPromise<any>((c, e, p) => {

			// hide the initialize promise inside this
			// promise so that it won't be canceled by accident
			this.onModuleLoaded.then(() => {
				if (!shouldCancelPromise) {
					messagePromise = this._sendMessage(requestName, payload, forceTimestamp).then(c, e, p);
				}
			}, e, p);

		}, () => {
			// forward cancel to the proper promise
			if(messagePromise) {
				messagePromise.cancel();
			} else {
				shouldCancelPromise = true;
			}
		});
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		let promises = Object.keys(this._promises);
		if (promises.length > 0) {
			console.warn('Terminating a worker with ' + promises.length + ' pending promises:');
			console.warn(this._promises);
			for (let id in this._promises) {
				if (promises.hasOwnProperty(id)) {
					this._promises[id].error('Worker forcefully terminated');
				}
			}
		}
		this._worker.dispose();
	}

	private _sendMessage(type:string, payload:any, forceTimestamp:number=(new Date()).getTime()):TPromise<any> {

		let msg = {
			id: ++this._lastMessageId,
			type: type,
			timestamp: forceTimestamp,
			payload: payload
		};

		let pc:(value:any)=>void, pe:(err:any)=>void, pp:(progress:any)=>void;
		let promise = new TPromise<any>((c, e, p) => {
				pc = c;
				pe = e;
				pp = p;
			}, () => {
				this._removeMessage(msg.id);
			}
		);

		this._promises[msg.id] = {
			complete: pc,
			error: pe,
			progress: pp,
			type: type,
			payload: payload
		};

		this._enqueueMessage(msg);

		return promise;
	}

	private _enqueueMessage(msg:workerProtocol.IClientMessage): void {

		let lastIndexSmallerOrEqual = -1,
			i:number;

		// Find the right index to insert at - keep the queue ordered by timestamp
		for (i = this._messagesQueue.length - 1; i >= 0; i--) {
			if (this._messagesQueue[i].timestamp <= msg.timestamp) {
				lastIndexSmallerOrEqual = i;
				break;
			}
		}

		this._messagesQueue.splice(lastIndexSmallerOrEqual + 1, 0, msg);
		this._processMessagesQueue();
	}

	private _removeMessage(msgId:number): void {
		for (let i = 0, len = this._messagesQueue.length; i < len; i++) {
			if (this._messagesQueue[i].id === msgId) {
				if (this._promises.hasOwnProperty(String(msgId))) {
					delete this._promises[String(msgId)];
				}
				this._messagesQueue.splice(i, 1);
				this._processMessagesQueue();
				return;
			}
		}
	}

	private _processMessagesQueue(): void {
		if (this._processQueueTimeout !== -1) {
			clearTimeout(this._processQueueTimeout);
			this._processQueueTimeout = -1;
		}

		if (this._messagesQueue.length === 0) {
			return;
		}

		if (this._waitingForWorkerReply) {
			return;
		}

		let delayUntilNextMessage = this._messagesQueue[0].timestamp - (new Date()).getTime();
		delayUntilNextMessage = Math.max(0, delayUntilNextMessage);

		this._processQueueTimeout = setTimeout(() => {
			this._processQueueTimeout = -1;
			if (this._messagesQueue.length === 0) {
				return;
			}
			this._waitingForWorkerReply = true;
			let msg = this._messagesQueue.shift();
			this._lastTimerEvent = timer.start(timer.Topic.WORKER, this._decodeMessageName(msg));
			this._postMessage(msg);
		}, delayUntilNextMessage);
	}

	private _postMessage(msg:any): void {
		this._worker.postMessage(stringify(msg));
	}

	private _onSerializedMessage(msg:string): void {
		let message:workerProtocol.IServerMessage = null;
		try {
			message = parse(msg);
		} catch (e) {
			// nothing
		}
		if (message) {
			this._onmessage(message);
		}
	}

	private _onmessage(msg:workerProtocol.IServerMessage): void {
		if (!msg.monacoWorker) {
			return;
		}
		if (msg.from && msg.from !== this._worker.getId()) {
			return;
		}

		switch (msg.type) {
			case workerProtocol.MessageType.REPLY:
				let serverReplyMessage = <workerProtocol.IServerReplyMessage>msg;

				this._waitingForWorkerReply = false;
				if(this._lastTimerEvent) {
					this._lastTimerEvent.stop();
				}

				if (!this._promises.hasOwnProperty(String(serverReplyMessage.id))) {
					this._onError('Received unexpected message from Worker:', msg);
					return;
				}

				switch (serverReplyMessage.action) {
					case workerProtocol.ReplyType.COMPLETE:
						this._promises[serverReplyMessage.id].complete(serverReplyMessage.payload);
						delete this._promises[serverReplyMessage.id];
						break;

					case workerProtocol.ReplyType.ERROR:
						this._onError('Main Thread sent to worker the following message:', {
							type: this._promises[serverReplyMessage.id].type,
							payload: this._promises[serverReplyMessage.id].payload
						});
						this._onError('And the worker replied with an error:', serverReplyMessage.payload);
						onUnexpectedError(serverReplyMessage.payload);
						this._promises[serverReplyMessage.id].error(serverReplyMessage.payload);
						delete this._promises[serverReplyMessage.id];
						break;

					case workerProtocol.ReplyType.PROGRESS:
						this._promises[serverReplyMessage.id].progress(serverReplyMessage.payload);
						break;
				}
				break;

			case workerProtocol.MessageType.PRINT:
				let serverPrintMessage = <workerProtocol.IServerPrintMessage>msg;
				this._consoleLog(serverPrintMessage.level, serverPrintMessage.payload);
				break;

			default:
				this._dispatchRequestFromWorker(msg);
		}

		this._processMessagesQueue();
	}

	private _dispatchRequestFromWorker(msg:workerProtocol.IServerMessage): void {
		this._handleWorkerRequest(msg).then((result) => {
			let reply: workerProtocol.IClientReplyMessage = {
				id: 0,
				type: workerProtocol.MessageType.REPLY,
				timestamp: (new Date()).getTime(),

				seq: msg.req,
				payload: (result instanceof Error ? transformErrorForSerialization(result) : result),
				err: null
			};
			this._postMessage(reply);
		}, (err) => {
			let reply: workerProtocol.IClientReplyMessage = {
				id: 0,
				type: workerProtocol.MessageType.REPLY,
				timestamp: (new Date()).getTime(),

				seq: msg.req,
				payload: null,
				err: (err instanceof Error ? transformErrorForSerialization(err) : err)
			};
			this._postMessage(reply);
		});
	}

	private _handleWorkerRequest(msg:workerProtocol.IServerMessage): TPromise<any> {
		if (msg.type === '_proxyObj') {
			return this._remoteCom.handleMessage(msg.payload);
		}

		if (typeof this[msg.type] === 'function') {
			return this._invokeHandler(this[msg.type], this, msg.payload);
		}

		this._onError('Received unexpected message from Worker:', msg);
		return TPromise.wrapError(new Error('No handler found'));
	}

	private _invokeHandler(handler:Function, handlerCtx:any, payload:any): TPromise<any> {
		try {
			return TPromise.as(handler.call(handlerCtx, payload));
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}

	_consoleLog(level:string, payload:any): void {
		switch (level) {
			case workerProtocol.PrintType.LOG:
				console.log(payload);
				break;
			case workerProtocol.PrintType.DEBUG:
				console.info(payload);
				break;
			case workerProtocol.PrintType.INFO:
				console.info(payload);
				break;
			case workerProtocol.PrintType.WARN:
				console.warn(payload);
				break;
			case workerProtocol.PrintType.ERROR:
				console.error(payload);
				break;
			default:
				this._onError('Received unexpected message from Worker:', payload);
		}
	}

	_onError(message:string, error?:any): void {
		console.error(message);
		console.info(error);
	}
}
