/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import marshalling = require('vs/base/common/marshalling');
import errors = require('vs/base/common/errors');
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { LazyPromise } from "vs/workbench/services/extensions/node/lazyPromise";

let lastMessageId = 0;
const pendingRPCReplies: { [msgId: string]: LazyPromise; } = {};

class MessageFactory {
	public static cancel(req: string): string {
		return `{"cancel":"${req}"}`;
	}

	public static request(req: string, rpcId: string, method: string, args: any[]): string {
		return `{"req":"${req}","rpcId":"${rpcId}","method":"${method}","args":${marshalling.stringify(args)}}`;
	}

	public static replyOK(req: string, res: any): string {
		if (typeof res === 'undefined') {
			return `{"seq":"${req}"}`;
		}
		return `{"seq":"${req}","res":${marshalling.stringify(res)}}`;
	}

	public static replyErr(req: string, err: any): string {
		if (typeof err === 'undefined') {
			return `{"seq":"${req}","err":null}`;
		}
		return `{"seq":"${req}","err":${marshalling.stringify(errors.transformErrorForSerialization(err))}}`;
	}
}

export interface IManyHandler {
	handle(rpcId: string, method: string, args: any[]): any;
}

export interface IRemoteCom {
	callOnRemote(proxyId: string, path: string, args: any[]): winjs.TPromise<any>;
	setManyHandler(handler: IManyHandler): void;
}

/**
 * Sends/Receives multiple messages in one go:
 *  - multiple messages to be sent from one stack get sent in bulk at `process.nextTick`.
 *  - each incoming message is handled in a separate `process.nextTick`.
 */
class RPCMultiplexer {

	private readonly _protocol: IMessagePassingProtocol;
	private readonly _onMessage: (msg: string) => void;
	private readonly _receiveOneMessageBound: () => void;
	private readonly _sendAccumulatedBound: () => void;

	private _messagesToSend: string[];
	private _messagesToReceive: string[];

	constructor(protocol: IMessagePassingProtocol, onMessage: (msg: string) => void) {
		this._protocol = protocol;
		this._onMessage = onMessage;
		this._receiveOneMessageBound = this._receiveOneMessage.bind(this);
		this._sendAccumulatedBound = this._sendAccumulated.bind(this);

		this._messagesToSend = [];
		this._messagesToReceive = [];

		this._protocol.onMessage(data => {
			// console.log('RECEIVED ' + rawmsg.length + ' MESSAGES.');
			if (this._messagesToReceive.length === 0) {
				process.nextTick(this._receiveOneMessageBound);
			}

			this._messagesToReceive = this._messagesToReceive.concat(data);
		});
	}

	private _receiveOneMessage(): void {
		const rawmsg = this._messagesToReceive.shift();

		if (this._messagesToReceive.length > 0) {
			process.nextTick(this._receiveOneMessageBound);
		}

		this._onMessage(rawmsg);
	}

	private _sendAccumulated(): void {
		const tmp = this._messagesToSend;
		this._messagesToSend = [];
		this._protocol.send(tmp);
	}

	public send(msg: string): void {
		if (this._messagesToSend.length === 0) {
			process.nextTick(this._sendAccumulatedBound);
		}
		this._messagesToSend.push(msg);
	}
}

export class RPCManager implements IRemoteCom {

	private _bigHandler: IManyHandler;
	private readonly _invokedHandlers: { [req: string]: winjs.TPromise<any>; };
	private readonly _multiplexor: RPCMultiplexer;

	constructor(protocol: IMessagePassingProtocol) {
		this._bigHandler = null;
		this._invokedHandlers = Object.create(null);
		this._multiplexor = new RPCMultiplexer(protocol, (msg) => this._receiveOneMessage(msg));
	}

	private _receiveOneMessage(rawmsg: string): void {
		let msg = marshalling.parse(rawmsg);

		if (msg.seq) {
			if (!pendingRPCReplies.hasOwnProperty(msg.seq)) {
				console.warn('Got reply to unknown seq');
				return;
			}
			let reply = pendingRPCReplies[msg.seq];
			delete pendingRPCReplies[msg.seq];

			if (msg.err) {
				let err = msg.err;
				if (msg.err.$isError) {
					err = new Error();
					err.name = msg.err.name;
					err.message = msg.err.message;
					err.stack = msg.err.stack;
				}
				reply.resolveErr(err);
				return;
			}

			reply.resolveOk(msg.res);
			return;
		}

		if (msg.cancel) {
			if (this._invokedHandlers[msg.cancel]) {
				this._invokedHandlers[msg.cancel].cancel();
			}
			return;
		}

		if (msg.err) {
			console.error(msg.err);
			return;
		}

		let rpcId = msg.rpcId;

		if (!this._bigHandler) {
			throw new Error('got message before big handler attached!');
		}

		let req = msg.req;

		this._invokedHandlers[req] = this._invokeHandler(rpcId, msg.method, msg.args);

		this._invokedHandlers[req].then((r) => {
			delete this._invokedHandlers[req];
			this._multiplexor.send(MessageFactory.replyOK(req, r));
		}, (err) => {
			delete this._invokedHandlers[req];
			this._multiplexor.send(MessageFactory.replyErr(req, err));
		});
	}

	private _invokeHandler(rpcId: string, method: string, args: any[]): winjs.TPromise<any> {
		try {
			return winjs.TPromise.as(this._bigHandler.handle(rpcId, method, args));
		} catch (err) {
			return winjs.TPromise.wrapError(err);
		}
	}

	public callOnRemote(proxyId: string, path: string, args: any[]): winjs.TPromise<any> {
		let req = String(++lastMessageId);
		let result = new LazyPromise(() => {
			this._multiplexor.send(MessageFactory.cancel(req));
		});

		pendingRPCReplies[req] = result;

		this._multiplexor.send(MessageFactory.request(req, proxyId, path, args));

		return result;
	}

	public setManyHandler(handler: IManyHandler): void {
		this._bigHandler = handler;
	}
}

export function createProxyProtocol(protocol: IMessagePassingProtocol): IRemoteCom {
	return new RPCManager(protocol);
}
