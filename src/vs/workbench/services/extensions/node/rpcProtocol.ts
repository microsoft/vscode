/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { LazyPromise } from 'vs/workbench/services/extensions/node/lazyPromise';
import { ProxyIdentifier, IRPCProtocol, getStringIdentifierForProxy } from 'vs/workbench/services/extensions/node/proxyIdentifier';
import { CharCode } from 'vs/base/common/charCode';
import { URI } from 'vs/base/common/uri';
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

export interface IRPCProtocolLogger {
	logIncoming(msgLength: number, str: string, data?: any): void;
	logOutgoing(msgLength: number, str: string, data?: any): void;
}

export class RPCProtocol implements IRPCProtocol {

	private readonly _protocol: IMessagePassingProtocol;
	private readonly _logger: IRPCProtocolLogger;
	private readonly _uriTransformer: IURITransformer;
	private _isDisposed: boolean;
	private readonly _locals: any[];
	private readonly _proxies: any[];
	private _lastMessageId: number;
	private readonly _invokedHandlers: { [req: string]: TPromise<any>; };
	private readonly _pendingRPCReplies: { [msgId: string]: LazyPromise; };

	constructor(protocol: IMessagePassingProtocol, logger: IRPCProtocolLogger = null, transformer: IURITransformer = null) {
		this._protocol = protocol;
		this._logger = logger;
		this._uriTransformer = transformer;
		this._isDisposed = false;
		this._locals = [];
		this._proxies = [];
		for (let i = 0, len = ProxyIdentifier.count; i < len; i++) {
			this._locals[i] = null;
			this._proxies[i] = null;
		}
		this._lastMessageId = 0;
		this._invokedHandlers = Object.create(null);
		this._pendingRPCReplies = {};
		this._protocol.onMessage((msg) => this._receiveOneMessage(msg));
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
		const rpcId = identifier.nid;
		if (!this._proxies[rpcId]) {
			this._proxies[rpcId] = this._createProxy(rpcId);
		}
		return this._proxies[rpcId];
	}

	private _createProxy<T>(rpcId: number): T {
		let handler = {
			get: (target: any, name: string) => {
				if (!target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
					target[name] = (...myArgs: any[]) => {
						return this._remoteCall(rpcId, name, myArgs);
					};
				}
				return target[name];
			}
		};
		return new Proxy(Object.create(null), handler);
	}

	public set<T, R extends T>(identifier: ProxyIdentifier<T>, value: R): R {
		this._locals[identifier.nid] = value;
		return value;
	}

	public assertRegistered(identifiers: ProxyIdentifier<any>[]): void {
		for (let i = 0, len = identifiers.length; i < len; i++) {
			const identifier = identifiers[i];
			if (!this._locals[identifier.nid]) {
				throw new Error(`Missing actor ${identifier.sid} (isMain: ${identifier.isMain})`);
			}
		}
	}

	private _receiveOneMessage(rawmsg: Buffer): void {
		if (this._isDisposed) {
			return;
		}

		const msgLength = rawmsg.length;
		const buff = MessageBuffer.read(rawmsg, 0);
		const messageType = <MessageType>buff.readUInt8();
		const req = buff.readUInt32();

		switch (messageType) {
			case MessageType.RequestJSONArgs: {
				let { rpcId, method, args } = MessageIO.deserializeRequestJSONArgs(buff);
				if (this._uriTransformer) {
					args = transformIncomingURIs(args, this._uriTransformer);
				}
				this._receiveRequest(msgLength, req, rpcId, method, args);
				break;
			}
			case MessageType.RequestMixedArgs: {
				let { rpcId, method, args } = MessageIO.deserializeRequestMixedArgs(buff);
				if (this._uriTransformer) {
					args = transformIncomingURIs(args, this._uriTransformer);
				}
				this._receiveRequest(msgLength, req, rpcId, method, args);
				break;
			}
			case MessageType.Cancel: {
				this._receiveCancel(msgLength, req);
				break;
			}
			case MessageType.ReplyOKEmpty: {
				this._receiveReply(msgLength, req, undefined);
				break;
			}
			case MessageType.ReplyOKJSON: {
				let value = MessageIO.deserializeReplyOKJSON(buff);
				if (this._uriTransformer) {
					value = transformIncomingURIs(value, this._uriTransformer);
				}
				this._receiveReply(msgLength, req, value);
				break;
			}
			case MessageType.ReplyOKBuffer: {
				let value = MessageIO.deserializeReplyOKBuffer(buff);
				this._receiveReply(msgLength, req, value);
				break;
			}
			case MessageType.ReplyErrError: {
				let err = MessageIO.deserializeReplyErrError(buff);
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

	private _receiveRequest(msgLength: number, req: number, rpcId: number, method: string, args: any[]): void {
		if (this._logger) {
			this._logger.logIncoming(msgLength, `receiveRequest ${req}, ${getStringIdentifierForProxy(rpcId)}.${method}:`, args);
		}
		const callId = String(req);

		this._invokedHandlers[callId] = this._invokeHandler(rpcId, method, args);

		this._invokedHandlers[callId].then((r) => {
			delete this._invokedHandlers[callId];
			if (this._uriTransformer) {
				r = transformOutgoingURIs(r, this._uriTransformer);
			}
			const msg = MessageIO.serializeReplyOK(req, r);
			if (this._logger) {
				this._logger.logOutgoing(msg.byteLength, `replyOK ${req}:`, r);
			}
			this._protocol.send(msg);
		}, (err) => {
			delete this._invokedHandlers[callId];
			const msg = MessageIO.serializeReplyErr(req, err);
			if (this._logger) {
				this._logger.logOutgoing(msg.byteLength, `replyErr ${req}:`, err);
			}
			this._protocol.send(msg);
		});
	}

	private _receiveCancel(msgLength: number, req: number): void {
		if (this._logger) {
			this._logger.logIncoming(msgLength, `receiveCancel ${req}`);
		}
		const callId = String(req);
		if (this._invokedHandlers[callId]) {
			this._invokedHandlers[callId].cancel();
		}
	}

	private _receiveReply(msgLength: number, req: number, value: any): void {
		if (this._logger) {
			this._logger.logIncoming(msgLength, `receiveReply ${req}:`, value);
		}
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

	private _invokeHandler(rpcId: number, methodName: string, args: any[]): TPromise<any> {
		try {
			return TPromise.as(this._doInvokeHandler(rpcId, methodName, args));
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}

	private _doInvokeHandler(rpcId: number, methodName: string, args: any[]): any {
		const actor = this._locals[rpcId];
		if (!actor) {
			throw new Error('Unknown actor ' + getStringIdentifierForProxy(rpcId));
		}
		let method = actor[methodName];
		if (typeof method !== 'function') {
			throw new Error('Unknown method ' + methodName + ' on actor ' + getStringIdentifierForProxy(rpcId));
		}
		return method.apply(actor, args);
	}

	private _remoteCall(rpcId: number, methodName: string, args: any[]): TPromise<any> {
		if (this._isDisposed) {
			return TPromise.wrapError<any>(errors.canceled());
		}

		const req = ++this._lastMessageId;
		const callId = String(req);
		const result = new LazyPromise(() => {
			const msg = MessageIO.serializeCancel(req);
			if (this._logger) {
				this._logger.logOutgoing(msg.byteLength, `cancel ${req}`);
			}
			this._protocol.send(MessageIO.serializeCancel(req));
		});

		this._pendingRPCReplies[callId] = result;
		if (this._uriTransformer) {
			args = transformOutgoingURIs(args, this._uriTransformer);
		}
		const msg = MessageIO.serializeRequest(req, rpcId, methodName, args);
		if (this._logger) {
			this._logger.logOutgoing(msg.byteLength, `request ${req}: ${getStringIdentifierForProxy(rpcId)}.${methodName}:`, args);
		}
		this._protocol.send(msg);
		return result;
	}
}

class MessageBuffer {

	public static alloc(type: MessageType, req: number, messageSize: number): MessageBuffer {
		let result = new MessageBuffer(Buffer.allocUnsafe(messageSize + 1 /* type */ + 4 /* req */), 0);
		result.writeUInt8(type);
		result.writeUInt32(req);
		return result;
	}

	public static read(buff: Buffer, offset: number): MessageBuffer {
		return new MessageBuffer(buff, offset);
	}

	private _buff: Buffer;
	private _offset: number;

	public get buffer(): Buffer {
		return this._buff;
	}

	private constructor(buff: Buffer, offset: number) {
		this._buff = buff;
		this._offset = offset;
	}

	public static sizeUInt8(): number {
		return 1;
	}

	public writeUInt8(n: number): void {
		this._buff.writeUInt8(n, this._offset, true); this._offset += 1;
	}

	public readUInt8(): number {
		const n = this._buff.readUInt8(this._offset, true); this._offset += 1;
		return n;
	}

	public writeUInt32(n: number): void {
		this._buff.writeUInt32BE(n, this._offset, true); this._offset += 4;
	}

	public readUInt32(): number {
		const n = this._buff.readUInt32BE(this._offset, true); this._offset += 4;
		return n;
	}

	public static sizeShortString(str: string, strByteLength: number): number {
		return 1 /* string length */ + strByteLength /* actual string */;
	}

	public writeShortString(str: string, strByteLength: number): void {
		this._buff.writeUInt8(strByteLength, this._offset, true); this._offset += 1;
		this._buff.write(str, this._offset, strByteLength, 'utf8'); this._offset += strByteLength;
	}

	public readShortString(): string {
		const strLength = this._buff.readUInt8(this._offset, true); this._offset += 1;
		const str = this._buff.toString('utf8', this._offset, this._offset + strLength); this._offset += strLength;
		return str;
	}

	public static sizeLongString(str: string, strByteLength: number): number {
		return 4 /* string length */ + strByteLength /* actual string */;
	}

	public writeLongString(str: string, strByteLength: number): void {
		this._buff.writeUInt32LE(strByteLength, this._offset, true); this._offset += 4;
		this._buff.write(str, this._offset, strByteLength, 'utf8'); this._offset += strByteLength;
	}

	public readLongString(): string {
		const strLength = this._buff.readUInt32LE(this._offset, true); this._offset += 4;
		const str = this._buff.toString('utf8', this._offset, this._offset + strLength); this._offset += strLength;
		return str;
	}

	public static sizeBuffer(buff: Buffer, buffByteLength: number): number {
		return 4 /* buffer length */ + buffByteLength /* actual buffer */;
	}

	public writeBuffer(buff: Buffer, buffByteLength: number): void {
		this._buff.writeUInt32LE(buffByteLength, this._offset, true); this._offset += 4;
		buff.copy(this._buff, this._offset); this._offset += buffByteLength;
	}

	public readBuffer(): Buffer {
		const buffLength = this._buff.readUInt32LE(this._offset, true); this._offset += 4;
		const buff = this._buff.slice(this._offset, this._offset + buffLength); this._offset += buffLength;
		return buff;
	}

	public static sizeMixedArray(arr: (string | Buffer)[], arrLengths: number[]): number {
		let size = 0;
		size += 1; // arr length
		for (let i = 0, len = arr.length; i < len; i++) {
			const el = arr[i];
			const elLength = arrLengths[i];
			size += 1; // arg type
			if (typeof el === 'string') {
				size += this.sizeLongString(el, elLength);
			} else {
				size += this.sizeBuffer(el, elLength);
			}
		}
		return size;
	}

	public writeMixedArray(arr: (string | Buffer)[], arrLengths: number[]): void {
		this._buff.writeUInt8(arr.length, this._offset, true); this._offset += 1;
		for (let i = 0, len = arr.length; i < len; i++) {
			const el = arr[i];
			const elLength = arrLengths[i];
			if (typeof el === 'string') {
				this.writeUInt8(ArgType.String);
				this.writeLongString(el, elLength);
			} else {
				this.writeUInt8(ArgType.Buffer);
				this.writeBuffer(el, elLength);
			}
		}
	}

	public readMixedArray(): (string | Buffer)[] {
		const arrLen = this._buff.readUInt8(this._offset, true); this._offset += 1;
		let arr: (string | Buffer)[] = new Array(arrLen);
		for (let i = 0; i < arrLen; i++) {
			const argType = <ArgType>this.readUInt8();
			if (argType === ArgType.String) {
				arr[i] = this.readLongString();
			} else {
				arr[i] = this.readBuffer();
			}
		}
		return arr;
	}
}

class MessageIO {

	private static _arrayContainsBuffer(arr: any[]): boolean {
		for (let i = 0, len = arr.length; i < len; i++) {
			if (Buffer.isBuffer(arr[i])) {
				return true;
			}
		}
		return false;
	}

	public static serializeRequest(req: number, rpcId: number, method: string, args: any[]): Buffer {
		if (this._arrayContainsBuffer(args)) {
			let massagedArgs: (string | Buffer)[] = new Array(args.length);
			let argsLengths: number[] = new Array(args.length);
			for (let i = 0, len = args.length; i < len; i++) {
				const arg = args[i];
				if (Buffer.isBuffer(arg)) {
					massagedArgs[i] = arg;
					argsLengths[i] = arg.byteLength;
				} else {
					massagedArgs[i] = JSON.stringify(arg);
					argsLengths[i] = Buffer.byteLength(massagedArgs[i], 'utf8');
				}
			}
			return this._requestMixedArgs(req, rpcId, method, massagedArgs, argsLengths);
		}
		return this._requestJSONArgs(req, rpcId, method, JSON.stringify(args));
	}

	private static _requestJSONArgs(req: number, rpcId: number, method: string, args: string): Buffer {
		const methodByteLength = Buffer.byteLength(method, 'utf8');
		const argsByteLength = Buffer.byteLength(args, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeUInt8();
		len += MessageBuffer.sizeShortString(method, methodByteLength);
		len += MessageBuffer.sizeLongString(args, argsByteLength);

		let result = MessageBuffer.alloc(MessageType.RequestJSONArgs, req, len);
		result.writeUInt8(rpcId);
		result.writeShortString(method, methodByteLength);
		result.writeLongString(args, argsByteLength);
		return result.buffer;
	}

	public static deserializeRequestJSONArgs(buff: MessageBuffer): { rpcId: number; method: string; args: any[]; } {
		const rpcId = buff.readUInt8();
		const method = buff.readShortString();
		const args = buff.readLongString();
		return {
			rpcId: rpcId,
			method: method,
			args: JSON.parse(args)
		};
	}

	private static _requestMixedArgs(req: number, rpcId: number, method: string, args: (string | Buffer)[], argsLengths: number[]): Buffer {
		const methodByteLength = Buffer.byteLength(method, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeUInt8();
		len += MessageBuffer.sizeShortString(method, methodByteLength);
		len += MessageBuffer.sizeMixedArray(args, argsLengths);

		let result = MessageBuffer.alloc(MessageType.RequestMixedArgs, req, len);
		result.writeUInt8(rpcId);
		result.writeShortString(method, methodByteLength);
		result.writeMixedArray(args, argsLengths);
		return result.buffer;
	}

	public static deserializeRequestMixedArgs(buff: MessageBuffer): { rpcId: number; method: string; args: any[]; } {
		const rpcId = buff.readUInt8();
		const method = buff.readShortString();
		const rawargs = buff.readMixedArray();
		const args: any[] = new Array(rawargs.length);
		for (let i = 0, len = rawargs.length; i < len; i++) {
			const rawarg = rawargs[i];
			if (typeof rawarg === 'string') {
				args[i] = JSON.parse(rawarg);
			} else {
				args[i] = rawarg;
			}
		}
		return {
			rpcId: rpcId,
			method: method,
			args: args
		};
	}

	public static serializeCancel(req: number): Buffer {
		return MessageBuffer.alloc(MessageType.Cancel, req, 0).buffer;
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
		return MessageBuffer.alloc(MessageType.ReplyOKEmpty, req, 0).buffer;
	}

	private static _serializeReplyOKBuffer(req: number, res: Buffer): Buffer {
		const resByteLength = res.byteLength;

		let len = 0;
		len += MessageBuffer.sizeBuffer(res, resByteLength);

		let result = MessageBuffer.alloc(MessageType.ReplyOKBuffer, req, len);
		result.writeBuffer(res, resByteLength);
		return result.buffer;
	}

	public static deserializeReplyOKBuffer(buff: MessageBuffer): Buffer {
		return buff.readBuffer();
	}

	private static _serializeReplyOKJSON(req: number, res: string): Buffer {
		const resByteLength = Buffer.byteLength(res, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeLongString(res, resByteLength);

		let result = MessageBuffer.alloc(MessageType.ReplyOKJSON, req, len);
		result.writeLongString(res, resByteLength);
		return result.buffer;
	}

	public static deserializeReplyOKJSON(buff: MessageBuffer): any {
		const res = buff.readLongString();
		return JSON.parse(res);
	}

	public static serializeReplyErr(req: number, err: any): Buffer {
		if (err instanceof Error) {
			return this._serializeReplyErrEror(req, err);
		}
		return this._serializeReplyErrEmpty(req);
	}

	private static _serializeReplyErrEror(req: number, _err: Error): Buffer {
		const err = JSON.stringify(errors.transformErrorForSerialization(_err));
		const errByteLength = Buffer.byteLength(err, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeLongString(err, errByteLength);

		let result = MessageBuffer.alloc(MessageType.ReplyErrError, req, len);
		result.writeLongString(err, errByteLength);
		return result.buffer;
	}

	public static deserializeReplyErrError(buff: MessageBuffer): Error {
		const err = buff.readLongString();
		return JSON.parse(err);
	}

	private static _serializeReplyErrEmpty(req: number): Buffer {
		return MessageBuffer.alloc(MessageType.ReplyErrEmpty, req, 0).buffer;
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
	String = 1,
	Buffer = 2
}
