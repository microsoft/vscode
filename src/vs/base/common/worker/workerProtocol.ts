/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IManyHandler, IRemoteCom} from 'vs/base/common/remote';
import {TPromise} from 'vs/base/common/winjs.base';

/**
 * A message sent from the UI thread to a worker
 */
export interface IClientMessage {
	id:number;
	type:string;
	timestamp:number;
	payload:any;
}

/**
 * A message sent from the UI thread in reply to a worker
 */
export interface IClientReplyMessage extends IClientMessage {
	seq:string;
	err:any;
}

/**
 * A message sent from a worker to the UI thread
 */
export interface IServerMessage {
	monacoWorker:boolean;
	from:number;
	req:string;
	type:string;
	payload:any;
}

/**
 * A message sent from a worker to the UI thread in reply to a UI thread request
 */
export interface IServerReplyMessage extends IServerMessage {
	id:number;
	action:string;
}

/**
 * A message sent from a worker to the UI thread for debugging purposes (console.log, console.info, etc.)
 */
export interface IServerPrintMessage extends IServerMessage {
	level:string;
}

export var MessageType = {
	INITIALIZE: '$initialize',
	REPLY: '$reply',
	PRINT: '$print'
};

export var ReplyType = {
	COMPLETE: 'complete',
	ERROR: 'error',
	PROGRESS: 'progress'
};

export var PrintType = {
	LOG: 'log',
	DEBUG: 'debug',
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error'
};

export interface IRequester {
	request(requestName: string, payload: any): TPromise<any>;
}

export class RemoteCom implements IRemoteCom {

	private _requester: IRequester;
	private _bigHandler: IManyHandler;

	constructor(requester:IRequester) {
		this._requester = requester;
		this._bigHandler = null;
	}

	public callOnRemote(proxyId: string, path: string, args:any[]): TPromise<any> {
		return this._requester.request('_proxyObj', {
			proxyId: proxyId,
			path: path,
			args: args
		});
	}

	public setManyHandler(handler:IManyHandler): void {
		this._bigHandler = handler;
	}

	public handleMessage(msg: { proxyId: string; path: string; args: any[]; }): TPromise<any> {
		if (!this._bigHandler) {
			throw new Error('got message before big handler attached!');
		}
		return this._invokeHandler(msg.proxyId, msg.path, msg.args);
	}

	private _invokeHandler(rpcId:string, method:string, args:any[]): TPromise<any> {
		try {
			return TPromise.as(this._bigHandler.handle(rpcId, method, args));
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}
}