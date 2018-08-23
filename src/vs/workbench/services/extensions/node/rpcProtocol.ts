/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { LazyPromise } from 'vs/workbench/services/extensions/node/lazyPromise';
import { ProxyIdentifier, IRPCProtocol } from 'vs/workbench/services/extensions/node/proxyIdentifier';
import { CharCode } from 'vs/base/common/charCode';
import URI from 'vs/base/common/uri';
import { MarshalledObject } from 'vs/base/common/marshalling';
import { IURITransformer } from 'vs/base/common/uriIpc';

declare var Proxy: any; // TODO@TypeScript

function _transformOutgoingURIs(obj: any, transformer: IURITransformer, depth: number): any {

	if (!obj || depth > 200) {
		return null;
	}

	if (typeof obj === 'object') {
		if (obj instanceof URI) {
			return transformer.transformOutgoing(obj);
		}

		// walk object (or array)
		for (let key in obj) {
			if (Object.hasOwnProperty.call(obj, key)) {
				const r = _transformOutgoingURIs(obj[key], transformer, depth + 1);
				if (r !== null) {
					obj[key] = r;
				}
			}
		}
	}

	return null;
}

export function transformOutgoingURIs(obj: any, transformer: IURITransformer): any {
	const result = _transformOutgoingURIs(obj, transformer, 0);
	if (result === null) {
		// no change
		return obj;
	}
	return result;
}

function _transformIncomingURIs(obj: any, transformer: IURITransformer, depth: number): any {

	if (!obj || depth > 200) {
		return null;
	}

	if (typeof obj === 'object') {

		if ((<MarshalledObject>obj).$mid === 1) {
			return transformer.transformIncoming(obj);
		}

		// walk object (or array)
		for (let key in obj) {
			if (Object.hasOwnProperty.call(obj, key)) {
				const r = _transformIncomingURIs(obj[key], transformer, depth + 1);
				if (r !== null) {
					obj[key] = r;
				}
			}
		}
	}

	return null;
}

function transformIncomingURIs(obj: any, transformer: IURITransformer): any {
	const result = _transformIncomingURIs(obj, transformer, 0);
	if (result === null) {
		// no change
		return obj;
	}
	return result;
}

export class RPCProtocol implements IRPCProtocol {

	private readonly _uriTransformer: IURITransformer;
	private _isDisposed: boolean;
	private readonly _locals: { [id: string]: any; };
	private readonly _proxies: { [id: string]: any; };
	private _lastMessageId: number;
	private readonly _invokedHandlers: { [req: string]: TPromise<any>; };
	private readonly _pendingRPCReplies: { [msgId: string]: LazyPromise; };
	private readonly _multiplexor: RPCMultiplexer;

	constructor(protocol: IMessagePassingProtocol, transformer: IURITransformer = null) {
		this._uriTransformer = transformer;
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

	public transformIncomingURIs<T>(obj: T): T {
		if (!this._uriTransformer) {
			return obj;
		}
		return transformIncomingURIs(obj, this._uriTransformer);
	}

	public getProxy<T>(identifier: ProxyIdentifier<T>): T {
		if (!this._proxies[identifier.id]) {
			this._proxies[identifier.id] = this._createProxy(identifier.id);
		}
		return this._proxies[identifier.id];
	}

	private _createProxy<T>(proxyId: string): T {
		let handler = {
			get: (target: any, name: string) => {
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

	private _receiveOneMessage(rawmsg: Buffer): void {
		if (this._isDisposed) {
			return;
		}

		let offset = 0;
		const messageType = MessageIO.deserializeMessageType(rawmsg, offset); offset += 1;
		const req = MessageIO.deserializeReq(rawmsg, offset); offset += 4;

		switch (messageType) {
			case MessageType.RequestJSONArgs: {
				let { rpcId, method, args } = MessageIO.deserializeRequestJSONArgs(rawmsg, offset);
				if (this._uriTransformer) {
					args = transformIncomingURIs(args, this._uriTransformer);
				}
				this._receiveRequest(req, rpcId, method, args);
				break;
			}
			case MessageType.RequestMixedArgs: {
				let { rpcId, method, args } = MessageIO.deserializeRequestMixedArgs(rawmsg, offset);
				if (this._uriTransformer) {
					args = transformIncomingURIs(args, this._uriTransformer);
				}
				this._receiveRequest(req, rpcId, method, args);
				break;
			}
			case MessageType.Cancel: {
				this._receiveCancel(req);
				break;
			}
			case MessageType.ReplyOKEmpty: {
				this._receiveReply(req, undefined);
				break;
			}
			case MessageType.ReplyOKJSON: {
				let value = MessageIO.deserializeReplyOKJSON(rawmsg, offset);
				if (this._uriTransformer) {
					value = transformIncomingURIs(value, this._uriTransformer);
				}
				this._receiveReply(req, value);
				break;
			}
			case MessageType.ReplyOKBuffer: {
				let value = MessageIO.deserializeReplyOKBuffer(rawmsg, offset);
				this._receiveReply(req, value);
				break;
			}
			case MessageType.ReplyErrError: {
				let err = MessageIO.deserializeReplyErrError(rawmsg, offset);
				if (this._uriTransformer) {
					err = transformIncomingURIs(err, this._uriTransformer);
				}
				this._receiveReplyErr(req, err);
				break;
			}
			case MessageType.ReplyErrEmpty: {
				this._receiveReplyErr(req, undefined);
				break;
			}
		}
	}

	private _receiveRequest(req: number, rpcId: string, method: string, args: any[]): void {
		// console.log(`receiveRequest: ${req}, ${rpcId}.${method}`, args);
		const callId = String(req);

		this._invokedHandlers[callId] = this._invokeHandler(rpcId, method, args);

		this._invokedHandlers[callId].then((r) => {
			delete this._invokedHandlers[callId];
			if (this._uriTransformer) {
				r = transformOutgoingURIs(r, this._uriTransformer);
			}
			this._multiplexor.send(MessageIO.serializeReplyOK(req, r));
		}, (err) => {
			delete this._invokedHandlers[callId];
			this._multiplexor.send(MessageIO.serializeReplyErr(req, err));
		});
	}

	private _receiveCancel(req: number): void {
		// console.log(`receiveCancel: ${req}`);
		const callId = String(req);
		if (this._invokedHandlers[callId]) {
			this._invokedHandlers[callId].cancel();
		}
	}

	private _receiveReply(req: number, value: any): void {
		// console.log(`receiveReply: ${req}`, value);
		const callId = String(req);
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		pendingReply.resolveOk(value);
	}

	private _receiveReplyErr(req: number, value: any): void {
		const callId = String(req);
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		let err: Error = null;
		if (value && value.$isError) {
			err = new Error();
			err.name = value.name;
			err.message = value.message;
			err.stack = value.stack;
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

		const nCallId = ++this._lastMessageId;
		const callId = String(nCallId);
		const result = new LazyPromise(() => {
			this._multiplexor.send(MessageIO.serializeCancel(nCallId));
		});

		this._pendingRPCReplies[callId] = result;
		if (this._uriTransformer) {
			args = transformOutgoingURIs(args, this._uriTransformer);
		}
		this._multiplexor.send(MessageIO.serializeRequest(nCallId, proxyId, methodName, args));
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

	private _messagesToSend: Buffer[];

	constructor(protocol: IMessagePassingProtocol, onMessage: (msg: Buffer) => void) {
		this._protocol = protocol;
		this._sendAccumulatedBound = this._sendAccumulated.bind(this);

		this._messagesToSend = [];

		this._protocol.onMessage(data => {
			let i = 0;

			while (i < data.length) {
				const size = data.readUInt32LE(i);
				onMessage(data.slice(i + 4, i + 4 + size));
				i += 4 + size;
			}
		});
	}

	private _sendAccumulated(): void {
		const size = this._messagesToSend.reduce((r, b) => r + b.byteLength, 0);
		const buffer = Buffer.allocUnsafe(size);

		let offset = 0;
		for (const msg of this._messagesToSend) {
			msg.copy(buffer, offset);
			offset += msg.byteLength;
		}

		this._messagesToSend = [];
		this._protocol.send(buffer);
	}

	public send(msg: Buffer): void {
		if (this._messagesToSend.length === 0) {
			process.nextTick(this._sendAccumulatedBound);
		}
		this._messagesToSend.push(msg);
	}
}

class MessageIO {
	private static arrayContainsBuffer(arr: any[]): boolean {
		for (let i = 0, len = arr.length; i < len; i++) {
			if (Buffer.isBuffer(arr[i])) {
				return true;
			}
		}
		return false;
	}

	public static serializeRequest(req: number, rpcId: string, method: string, args: any[]): Buffer {
		if (this.arrayContainsBuffer(args)) {
			let massagedArgs: (string | Buffer)[] = new Array(args.length);
			let argsLengths: number[] = new Array(args.length);
			for (let i = 0, len = args.length; i < len; i++) {
				const arg = args[i];
				if (Buffer.isBuffer(arg)) {
					massagedArgs[i] = arg;
					argsLengths[i] = arg.byteLength;
				} else {
					massagedArgs[i] = JSON.stringify(arg);
					argsLengths[i] = Buffer.byteLength(massagedArgs[i]);
				}
			}
			return this._requestMixedArgs(req, rpcId, method, massagedArgs, argsLengths);
		}
		return this._requestJSONArgs(req, rpcId, method, JSON.stringify(args));
	}

	public static deserializeMessageType(buff: Buffer, offset: number): MessageType {
		return buff[offset];
	}

	public static deserializeReq(buff: Buffer, offset: number): number {
		return buff.readUInt32LE(offset, true);
	}

	private static _requestJSONArgs(req: number, rpcId: string, method: string, args: string): Buffer {
		const rpcIdByteLength = Buffer.byteLength(rpcId);
		const methodByteLength = Buffer.byteLength(method);
		const argsByteLength = Buffer.byteLength(args);

		let len = 0;
		// len += 4; // msg length
		len += 1; // msg type
		len += 4; // req
		len += 1; // rpcId length
		len += rpcIdByteLength;
		len += 1; // method length
		len += methodByteLength;
		len += 4; // arg length
		len += argsByteLength;

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.RequestJSONArgs, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;
		result.writeUInt8(rpcIdByteLength, offset, true); offset += 1;
		result.write(rpcId, offset, rpcIdByteLength, 'utf8'); offset += rpcIdByteLength;
		result.writeUInt8(methodByteLength, offset, true); offset += 1;
		result.write(method, offset, methodByteLength, 'utf8'); offset += methodByteLength;
		result.writeUInt32LE(argsByteLength, offset, true); offset += 4;
		result.write(args, offset, argsByteLength, 'utf8'); offset += argsByteLength;

		return result;
	}

	public static deserializeRequestJSONArgs(buff: Buffer, offset: number): { rpcId: string; method: string; args: any[]; } {
		const rpcIdByteLength = buff.readUInt8(offset, true); offset += 1;
		const rpcId = buff.toString('utf8', offset, offset + rpcIdByteLength); offset += rpcIdByteLength;
		const methodByteLength = buff.readUInt8(offset, true); offset += 1;
		const method = buff.toString('utf8', offset, offset + methodByteLength); offset += methodByteLength;
		const argsByteLength = buff.readUInt32LE(offset, true); offset += 4;
		const args = buff.toString('utf8', offset, offset + argsByteLength); offset += argsByteLength;
		return {
			rpcId: rpcId,
			method: method,
			args: JSON.parse(args)
		};
	}

	private static _requestMixedArgs(req: number, rpcId: string, method: string, args: (string | Buffer)[], argsLengths: number[]): Buffer {
		const rpcIdByteLength = Buffer.byteLength(rpcId);
		const methodByteLength = Buffer.byteLength(method);

		let len = 0;
		// len += 4; // msg length
		len += 1; // msg type
		len += 4; // req
		len += 1; // rpcId length
		len += rpcIdByteLength;
		len += 1; // method length
		len += methodByteLength;
		len += 1; // arg count
		for (let i = 0, len = args.length; i < len; i++) {
			len += 1; // arg type
			len += 4; // buffer length
			len += argsLengths[i];
		}

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.RequestMixedArgs, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;
		result.writeUInt8(rpcIdByteLength, offset, true); offset += 1;
		result.write(rpcId, offset, rpcIdByteLength, 'utf8'); offset += rpcIdByteLength;
		result.writeUInt8(methodByteLength, offset, true); offset += 1;
		result.write(method, offset, methodByteLength, 'utf8'); offset += methodByteLength;
		result.writeUInt8(args.length, offset, true); offset += 1;
		for (let i = 0, len = args.length; i < len; i++) {
			const arg = args[i];
			if (typeof arg === 'string') {
				result.writeUInt8(ArgType.ArgString, offset, true); offset += 1;
				result.writeUInt32LE(argsLengths[i], offset, true); offset += 4;
				result.write(arg, offset, argsLengths[i], 'utf8'); offset += argsLengths[i];
			} else {
				result.writeUInt8(ArgType.ArgBuffer, offset, true); offset += 1;
				result.writeUInt32LE(argsLengths[i], offset, true); offset += 4;
				arg.copy(result, offset); offset += argsLengths[i];
			}
		}

		return result;
	}

	public static deserializeRequestMixedArgs(buff: Buffer, offset: number): { rpcId: string; method: string; args: any[]; } {
		const rpcIdByteLength = buff.readUInt8(offset, true); offset += 1;
		const rpcId = buff.toString('utf8', offset, offset + rpcIdByteLength); offset += rpcIdByteLength;
		const methodByteLength = buff.readUInt8(offset, true); offset += 1;
		const method = buff.toString('utf8', offset, offset + methodByteLength); offset += methodByteLength;
		const argsCount = buff.readUInt8(offset, true); offset += 1;
		let args: any[] = new Array(argsCount);
		for (let i = 0; i < argsCount; i++) {
			const argType = buff.readUInt8(offset, true); offset += 1;
			const argLength = buff.readUInt32LE(offset, true); offset += 4;
			if (argType === ArgType.ArgString) {
				args[i] = JSON.parse(buff.toString('utf8', offset, offset + argLength)); offset += argLength;
			} else {
				args[i] = buff.slice(offset, offset + argLength); offset += argLength;
			}
		}
		return {
			rpcId: rpcId,
			method: method,
			args: args
		};
	}

	public static serializeCancel(req: number): Buffer {
		let len = 0;
		// len += 4; // msg length
		len += 1; // msg type
		len += 4; // req

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.Cancel, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;

		return result;
	}

	public static serializeReplyOK(req: number, res: any): Buffer {
		if (typeof res === 'undefined') {
			return this._serializeReplyOKEmpty(req);
		}
		if (Buffer.isBuffer(res)) {
			return this._serializeReplyOKBuffer(req, res);
		}
		return this._serializeReplyOKJSON(req, JSON.stringify(res));
	}

	private static _serializeReplyOKEmpty(req: number): Buffer {
		let len = 0;
		// len += 4; // msg length
		len += 1; // msg type
		len += 4; // req

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.ReplyOKEmpty, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;

		return result;
	}

	private static _serializeReplyOKBuffer(req: number, res: Buffer): Buffer {
		let len = 0;
		// len += 4; // msg length
		len += 1; // msg type
		len += 4; // req
		len += 4; // res length
		len += res.byteLength;

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.ReplyOKBuffer, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;
		result.writeUInt32LE(res.byteLength, offset, true); offset += 4;
		res.copy(result, offset); offset += res.byteLength;

		return result;
	}

	public static deserializeReplyOKBuffer(buff: Buffer, offset: number): Buffer {
		const resByteLength = buff.readUInt32LE(offset, true); offset += 4;
		const res = buff.slice(offset, offset + resByteLength); offset += resByteLength;
		return res;
	}

	private static _serializeReplyOKJSON(req: number, res: string): Buffer {
		const resByteLength = Buffer.byteLength(res);

		let len = 0;
		// len += 4; // msg length
		len += 1; // msg type
		len += 4; // req
		len += 4; // res length
		len += resByteLength;

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.ReplyOKJSON, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;
		result.writeUInt32LE(resByteLength, offset, true); offset += 4;
		result.write(res, offset, resByteLength, 'utf8'); offset += resByteLength;

		return result;
	}

	public static deserializeReplyOKJSON(buff: Buffer, offset: number): any {
		const resByteLength = buff.readUInt32LE(offset, true); offset += 4;
		const res = buff.toString('utf8', offset, offset + resByteLength); offset += resByteLength;
		return JSON.parse(res);
	}

	public static serializeReplyErr(req: number, err: any): Buffer {
		if (err instanceof Error) {
			return this._serializeReplyErrEror(req, err);
		}
		return this._serializeReplyErrEmpty(err);
	}

	private static _serializeReplyErrEror(req: number, _err: Error): Buffer {
		const err = JSON.stringify(errors.transformErrorForSerialization(_err));
		const errByteLength = Buffer.byteLength(err);

		let len = 0;
		len += 1; // msg type
		len += 4; // req
		len += 4; // err length
		len += errByteLength;

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.ReplyErrError, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;
		result.writeUInt32LE(errByteLength, offset, true); offset += 4;
		result.write(err, offset, errByteLength, 'utf8'); offset += errByteLength;

		console.log(result);

		return result;
	}

	public static deserializeReplyErrError(buff: Buffer, offset: number): Error {
		const errByteLength = buff.readUInt32LE(offset, true); offset += 4;
		const err = buff.toString('utf8', offset, offset + errByteLength); offset += errByteLength;
		return JSON.parse(err);
	}

	private static _serializeReplyErrEmpty(req: number): Buffer {
		let len = 0;
		len += 1; // msg type
		len += 4; // req

		let result = Buffer.allocUnsafe(len + 4);
		let offset = 0;

		result.writeUInt32LE(len, offset, true); offset += 4;
		result.writeUInt8(MessageType.ReplyErrEmpty, offset, true); offset += 1;
		result.writeUInt32LE(req, offset, true); offset += 4;

		return result;
	}
}

const enum MessageType {
	RequestJSONArgs = 1,
	RequestMixedArgs = 2,
	Cancel = 3,
	ReplyOKEmpty = 4,
	ReplyOKBuffer = 5,
	ReplyOKJSON = 6,
	ReplyErrError = 7,
	ReplyErrEmpty = 8,
}

const enum ArgType {
	ArgString = 1,
	ArgBuffer = 2
}
