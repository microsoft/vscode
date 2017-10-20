/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as marshalling from 'vs/base/common/marshalling';
import * as errors from 'vs/base/common/errors';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { LazyPromise } from 'vs/workbench/services/extensions/node/lazyPromise';

export interface IDispatcher {
	invoke(proxyId: string, methodName: string, args: any[]): any;
}

export class RPCProtocol {

	private _isDisposed: boolean;
	private _bigHandler: IDispatcher;
	private _lastMessageId: number;
	private readonly _invokedHandlers: { [req: string]: TPromise<any>; };
	private readonly _pendingRPCReplies: { [msgId: string]: LazyPromise; };
	private readonly _multiplexor: RPCMultiplexer;

	constructor(protocol: IMessagePassingProtocol) {
		this._isDisposed = false;
		this._bigHandler = null;
		this._lastMessageId = 0;
		this._invokedHandlers = Object.create(null);
		this._pendingRPCReplies = {};
		this._multiplexor = new RPCMultiplexer(protocol, (msg) => this._receiveOneMessage(msg));
	}

	public dispose(): void {
		this._isDisposed = true;

		// Release all outstanding promises with a canceled error
		Object.keys(this._pendingRPCReplies).forEach((msgId) => {
			const pending = this._pendingRPCReplies[msgId];
			pending.resolveErr(errors.canceled());
		});
	}

	private _receiveOneMessage(rawmsg: string): void {
		if (this._isDisposed) {
			console.warn('Received message after being shutdown: ', rawmsg);
			return;
		}
		let msg = marshalling.parse(rawmsg);

		if (msg.seq) {
			if (!this._pendingRPCReplies.hasOwnProperty(msg.seq)) {
				console.warn('Got reply to unknown seq');
				return;
			}
			let reply = this._pendingRPCReplies[msg.seq];
			delete this._pendingRPCReplies[msg.seq];

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

	private _invokeHandler(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		try {
			return TPromise.as(this._bigHandler.invoke(proxyId, methodName, args));
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}

	public callOnRemote(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		if (this._isDisposed) {
			return TPromise.wrapError<any>(errors.canceled());
		}

		let req = String(++this._lastMessageId);
		let result = new LazyPromise(() => {
			this._multiplexor.send(MessageFactory.cancel(req));
		});

		this._pendingRPCReplies[req] = result;

		this._multiplexor.send(MessageFactory.request(req, proxyId, methodName, args));

		return result;
	}

	public setDispatcher(handler: IDispatcher): void {
		this._bigHandler = handler;
	}
}

/**
 * Sends/Receives multiple messages in one go:
 *  - multiple messages to be sent from one stack get sent in bulk at `process.nextTick`.
 *  - each incoming message is handled in a separate `process.nextTick`.
 */
class RPCMultiplexer {

	private readonly _protocol: IMessagePassingProtocol;
	private readonly _sendAccumulatedBound: () => void;

	private _messagesToSend: string[];

	constructor(protocol: IMessagePassingProtocol, onMessage: (msg: string) => void) {
		this._protocol = protocol;
		this._sendAccumulatedBound = this._sendAccumulated.bind(this);

		this._messagesToSend = [];

		this._protocol.onMessage(data => {
			for (let i = 0, len = data.length; i < len; i++) {
				onMessage(data[i]);
			}
		});
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
