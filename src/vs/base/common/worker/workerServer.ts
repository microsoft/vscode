/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {setUnexpectedErrorHandler, transformErrorForSerialization} from 'vs/base/common/errors';
import {parse, stringify} from 'vs/base/common/marshalling';
import * as workerProtocol from 'vs/base/common/worker/workerProtocol';

export class WorkerServer {

	private _postSerializedMessage:(msg:string)=>void;
	private _workerId:number;
	private _requestHandler:any;

	constructor(postSerializedMessage:(msg:string)=>void) {
		this._postSerializedMessage = postSerializedMessage;
		this._workerId = 0;
		this._requestHandler = null;
		this._bindConsole();
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
		let transformedObjects = objects.map((obj) => (obj instanceof Error) ? transformErrorForSerialization(obj) : obj);
		let msg:workerProtocol.IServerPrintMessage = {
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
		let msg:workerProtocol.IServerReplyMessage = {
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

	public loadModule(moduleId:string, callback:Function, errorback:(err:any)=>void): void {
		// Use the global require to be sure to get the global config
		(<any>self).require([moduleId], (...result:any[]) => {
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

		let c = this._sendReply.bind(this, msg.id, workerProtocol.ReplyType.COMPLETE);
		let e = this._sendReply.bind(this, msg.id, workerProtocol.ReplyType.ERROR);
		let p = this._sendReply.bind(this, msg.id, workerProtocol.ReplyType.PROGRESS);

		switch(msg.type) {
			case workerProtocol.MessageType.INITIALIZE:
				this._workerId = msg.payload.id;

				let loaderConfig = msg.payload.loaderConfiguration;
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
		if (!this._requestHandler) {
			e('Request handler not loaded');
			return;
		}

		let handlerMethod = this._requestHandler[msg.type];
		if (typeof handlerMethod !== 'function') {
			e('Handler does not have method ' + msg.type);
			return;
		}

		try {
			handlerMethod.call(this._requestHandler, this, c, e, p, msg.payload);
		} catch (handlerError) {
			e(transformErrorForSerialization(handlerError));
		}
	}
}

export function create(postMessage:(msg:string)=>void): WorkerServer {
	return new WorkerServer(postMessage);
}
