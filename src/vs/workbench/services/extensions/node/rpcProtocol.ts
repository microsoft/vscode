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
			return;
		}

		let msg = <RPCMessage>JSON.parse(rawmsg);

		switch (msg.type) {
			case MessageType.Request:
				this._receiveRequest(msg);
				break;
			case MessageType.FancyRequest:
				this._receiveRequest(marshalling.revive(msg, 0));
				break;
			case MessageType.Cancel:
				this._receiveCancel(msg);
				break;
			case MessageType.Reply:
				this._receiveReply(msg);
				break;
			case MessageType.FancyReply:
				this._receiveReply(marshalling.revive(msg, 0));
				break;
			case MessageType.ReplyErr:
				this._receiveReplyErr(msg);
				break;
		}
	}

	private _receiveRequest(msg: RequestMessage | FancyRequestMessage): void {
		if (!this._bigHandler) {
			throw new Error('got message before big handler attached!');
		}

		const callId = msg.id;
		const proxyId = msg.proxyId;
		const isFancy = (msg.type === MessageType.FancyRequest); // a fancy request gets a fancy reply

		this._invokedHandlers[callId] = this._invokeHandler(proxyId, msg.method, msg.args);

		this._invokedHandlers[callId].then((r) => {
			delete this._invokedHandlers[callId];
			if (isFancy) {
				this._multiplexor.send(MessageFactory.fancyReplyOK(callId, r));
			} else {
				this._multiplexor.send(MessageFactory.replyOK(callId, r));
			}
		}, (err) => {
			delete this._invokedHandlers[callId];
			this._multiplexor.send(MessageFactory.replyErr(callId, err));
		});
	}

	private _receiveCancel(msg: CancelMessage): void {
		const callId = msg.id;
		if (this._invokedHandlers[callId]) {
			this._invokedHandlers[callId].cancel();
		}
	}

	private _receiveReply(msg: ReplyMessage | FancyReplyMessage): void {
		const callId = msg.id;
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		pendingReply.resolveOk(msg.res);
	}

	private _receiveReplyErr(msg: ReplyErrMessage): void {
		const callId = msg.id;
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		let err: Error = null;
		if (msg.err && msg.err.$isError) {
			err = new Error();
			err.name = msg.err.name;
			err.message = msg.err.message;
			err.stack = msg.err.stack;
		}
		pendingReply.resolveErr(err);
	}

	private _invokeHandler(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		try {
			return TPromise.as(this._bigHandler.invoke(proxyId, methodName, args));
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}

	public remoteCall(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		return this._remoteCall(proxyId, methodName, args, false);
	}

	public fancyRemoteCall(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		return this._remoteCall(proxyId, methodName, args, true);
	}

	private _remoteCall(proxyId: string, methodName: string, args: any[], isFancy: boolean): TPromise<any> {
		if (this._isDisposed) {
			return TPromise.wrapError<any>(errors.canceled());
		}

		const callId = String(++this._lastMessageId);
		const result = new LazyPromise(() => {
			this._multiplexor.send(MessageFactory.cancel(callId));
		});

		this._pendingRPCReplies[callId] = result;

		if (isFancy) {
			this._multiplexor.send(MessageFactory.fancyRequest(callId, proxyId, methodName, args));
		} else {
			this._multiplexor.send(MessageFactory.request(callId, proxyId, methodName, args));
		}

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
		return `{"type":${MessageType.Cancel},"id":"${req}"}`;
	}

	public static request(req: string, rpcId: string, method: string, args: any[]): string {
		return `{"type":${MessageType.Request},"id":"${req}","proxyId":"${rpcId}","method":"${method}","args":${JSON.stringify(args)}}`;
	}

	public static fancyRequest(req: string, rpcId: string, method: string, args: any[]): string {
		return `{"type":${MessageType.FancyRequest},"id":"${req}","proxyId":"${rpcId}","method":"${method}","args":${marshalling.stringify(args)}}`;
	}

	public static replyOK(req: string, res: any): string {
		if (typeof res === 'undefined') {
			return `{"type":${MessageType.Reply},"id":"${req}"}`;
		}
		return `{"type":${MessageType.Reply},"id":"${req}","res":${JSON.stringify(res)}}`;
	}

	public static fancyReplyOK(req: string, res: any): string {
		if (typeof res === 'undefined') {
			return `{"type":${MessageType.Reply},"id":"${req}"}`;
		}
		return `{"type":${MessageType.FancyReply},"id":"${req}","res":${marshalling.stringify(res)}}`;
	}

	public static replyErr(req: string, err: any): string {
		if (err instanceof Error) {
			return `{"type":${MessageType.ReplyErr},"id":"${req}","err":${JSON.stringify(errors.transformErrorForSerialization(err))}}`;
		}
		return `{"type":${MessageType.ReplyErr},"id":"${req}","err":null}`;
	}
}

export const enum MessageType {
	Request = 1,
	FancyRequest = 2,
	Cancel = 3,
	Reply = 4,
	FancyReply = 5,
	ReplyErr = 6
}

class RequestMessage {
	type: MessageType.Request;
	id: string;
	proxyId: string;
	method: string;
	args: any[];
}
class FancyRequestMessage {
	type: MessageType.FancyRequest;
	id: string;
	proxyId: string;
	method: string;
	args: any[];
}
class CancelMessage {
	type: MessageType.Cancel;
	id: string;
}
class ReplyMessage {
	type: MessageType.Reply;
	id: string;
	res: any;
}
class FancyReplyMessage {
	type: MessageType.FancyReply;
	id: string;
	res: any;
}
class ReplyErrMessage {
	type: MessageType.ReplyErr;
	id: string;
	err: errors.SerializedError;
}

type RPCMessage = RequestMessage | FancyRequestMessage | CancelMessage | ReplyMessage | FancyReplyMessage | ReplyErrMessage;
