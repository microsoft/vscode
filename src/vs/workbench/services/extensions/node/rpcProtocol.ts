/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { LazyPromise } from 'vs/workbench/services/extensions/node/lazyPromise';
import { ProxyIdentifier, IRPCProtocol } from 'vs/workbench/services/extensions/node/proxyIdentifier';
import { CharCode } from 'vs/base/common/charCode';

declare var Proxy: any; // TODO@TypeScript

export class RPCProtocol implements IRPCProtocol {

	private _isDisposed: boolean;
	private readonly _locals: { [id: string]: any; };
	private readonly _proxies: { [id: string]: any; };
	private _lastMessageId: number;
	private readonly _invokedHandlers: { [req: string]: TPromise<any>; };
	private readonly _pendingRPCReplies: { [msgId: string]: LazyPromise; };
	private readonly _multiplexor: RPCMultiplexer;

	constructor(protocol: IMessagePassingProtocol) {
		this._isDisposed = false;
		this._locals = Object.create(null);
		this._proxies = Object.create(null);
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

	public getProxy<T>(identifier: ProxyIdentifier<T>): T {
		if (!this._proxies[identifier.id]) {
			this._proxies[identifier.id] = this._createProxy(identifier.id);
		}
		return this._proxies[identifier.id];
	}

	private _createProxy<T>(proxyId: string): T {
		let handler = {
			get: (target, name: string) => {
				if (!target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
					target[name] = (...myArgs: any[]) => {
						return this._remoteCall(proxyId, name, myArgs);
					};
				}
				return target[name];
			}
		};
		return new Proxy(Object.create(null), handler);
	}

	public set<T, R extends T>(identifier: ProxyIdentifier<T>, value: R): R {
		this._locals[identifier.id] = value;
		return value;
	}

	public assertRegistered(identifiers: ProxyIdentifier<any>[]): void {
		for (let i = 0, len = identifiers.length; i < len; i++) {
			const identifier = identifiers[i];
			if (!this._locals[identifier.id]) {
				throw new Error(`Missing actor ${identifier.id} (isMain: ${identifier.isMain})`);
			}
		}
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
			case MessageType.Cancel:
				this._receiveCancel(msg);
				break;
			case MessageType.Reply:
				this._receiveReply(msg);
				break;
			case MessageType.ReplyErr:
				this._receiveReplyErr(msg);
				break;
		}
	}

	private _receiveRequest(msg: RequestMessage): void {
		const callId = msg.id;
		const proxyId = msg.proxyId;

		this._invokedHandlers[callId] = this._invokeHandler(proxyId, msg.method, msg.args);

		this._invokedHandlers[callId].then((r) => {
			delete this._invokedHandlers[callId];
			this._multiplexor.send(MessageFactory.replyOK(callId, r));
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

	private _receiveReply(msg: ReplyMessage): void {
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
			return TPromise.as(this._doInvokeHandler(proxyId, methodName, args));
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}

	private _doInvokeHandler(proxyId: string, methodName: string, args: any[]): any {
		if (!this._locals[proxyId]) {
			throw new Error('Unknown actor ' + proxyId);
		}
		let actor = this._locals[proxyId];
		let method = actor[methodName];
		if (typeof method !== 'function') {
			throw new Error('Unknown method ' + methodName + ' on actor ' + proxyId);
		}
		return method.apply(actor, args);
	}

	private _remoteCall(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		if (this._isDisposed) {
			return TPromise.wrapError<any>(errors.canceled());
		}

		const callId = String(++this._lastMessageId);
		const result = new LazyPromise(() => {
			this._multiplexor.send(MessageFactory.cancel(callId));
		});

		this._pendingRPCReplies[callId] = result;
		this._multiplexor.send(MessageFactory.request(callId, proxyId, methodName, args));
		return result;
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

	public static replyOK(req: string, res: any): string {
		if (typeof res === 'undefined') {
			return `{"type":${MessageType.Reply},"id":"${req}"}`;
		}
		return `{"type":${MessageType.Reply},"id":"${req}","res":${JSON.stringify(res)}}`;
	}

	public static replyErr(req: string, err: any): string {
		if (err instanceof Error) {
			return `{"type":${MessageType.ReplyErr},"id":"${req}","err":${JSON.stringify(errors.transformErrorForSerialization(err))}}`;
		}
		return `{"type":${MessageType.ReplyErr},"id":"${req}","err":null}`;
	}
}

const enum MessageType {
	Request = 1,
	Cancel = 2,
	Reply = 3,
	ReplyErr = 4
}

class RequestMessage {
	type: MessageType.Request;
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
class ReplyErrMessage {
	type: MessageType.ReplyErr;
	id: string;
	err: errors.SerializedError;
}

type RPCMessage = RequestMessage | CancelMessage | ReplyMessage | ReplyErrMessage;
