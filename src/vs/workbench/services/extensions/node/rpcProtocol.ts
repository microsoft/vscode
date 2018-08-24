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
	private readonly _protocol: IMessagePassingProtocol;

	constructor(protocol: IMessagePassingProtocol, transformer: IURITransformer = null) {
		this._uriTransformer = transformer;
		this._isDisposed = false;
		this._locals = Object.create(null);
		this._proxies = Object.create(null);
		this._lastMessageId = 0;
		this._invokedHandlers = Object.create(null);
		this._pendingRPCReplies = {};
		this._protocol = protocol;
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
			this._protocol.send(MessageIO.serializeReplyOK(req, r));
		}, (err) => {
			delete this._invokedHandlers[callId];
			this._protocol.send(MessageIO.serializeReplyErr(req, err));
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
			this._protocol.send(MessageIO.serializeCancel(nCallId));
		});

		this._pendingRPCReplies[callId] = result;
		if (this._uriTransformer) {
			args = transformOutgoingURIs(args, this._uriTransformer);
		}
		this._protocol.send(MessageIO.serializeRequest(nCallId, proxyId, methodName, args));
		return result;
	}
}

class MessageBuffer {

	public static alloc(type: MessageType, req: number, messageSize: number): MessageBuffer {
		let buff = Buffer.allocUnsafe(messageSize + 1 /* type */ + 4 /* req */);
		let offset = 0;
		buff.writeUInt8(type, offset, true); offset += 1;
		buff.writeUInt32LE(req, offset, true); offset += 4;
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
				this._buff.writeUInt8(ArgType.ArgString, this._offset, true); this._offset += 1;
				this.writeLongString(el, elLength);
			} else {
				this._buff.writeUInt8(ArgType.ArgBuffer, this._offset, true); this._offset += 1;
				this.writeBuffer(el, elLength);
			}
		}
	}
}

class MessageIO {
	public static deserializeMessageType(buff: Buffer, offset: number): MessageType {
		return buff[offset];
	}

	public static deserializeReq(buff: Buffer, offset: number): number {
		return buff.readUInt32LE(offset, true);
	}

	private static _arrayContainsBuffer(arr: any[]): boolean {
		for (let i = 0, len = arr.length; i < len; i++) {
			if (Buffer.isBuffer(arr[i])) {
				return true;
			}
		}
		return false;
	}

	public static serializeRequest(req: number, rpcId: string, method: string, args: any[]): Buffer {
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

	private static _requestJSONArgs(req: number, rpcId: string, method: string, args: string): Buffer {
		const rpcIdByteLength = Buffer.byteLength(rpcId, 'utf8');
		const methodByteLength = Buffer.byteLength(method, 'utf8');
		const argsByteLength = Buffer.byteLength(args, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeShortString(rpcId, rpcIdByteLength);
		len += MessageBuffer.sizeShortString(method, methodByteLength);
		len += MessageBuffer.sizeLongString(args, argsByteLength);

		let result = MessageBuffer.alloc(MessageType.RequestJSONArgs, req, len);
		result.writeShortString(rpcId, rpcIdByteLength);
		result.writeShortString(method, methodByteLength);
		result.writeLongString(args, argsByteLength);
		return result.buffer;
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
		const rpcIdByteLength = Buffer.byteLength(rpcId, 'utf8');
		const methodByteLength = Buffer.byteLength(method, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeShortString(rpcId, rpcIdByteLength);
		len += MessageBuffer.sizeShortString(method, methodByteLength);
		len += MessageBuffer.sizeMixedArray(args, argsLengths);

		let result = MessageBuffer.alloc(MessageType.RequestMixedArgs, req, len);
		result.writeShortString(rpcId, rpcIdByteLength);
		result.writeShortString(method, methodByteLength);
		result.writeMixedArray(args, argsLengths);
		return result.buffer;
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

	public static deserializeReplyOKBuffer(buff: Buffer, offset: number): Buffer {
		const resByteLength = buff.readUInt32LE(offset, true); offset += 4;
		const res = buff.slice(offset, offset + resByteLength); offset += resByteLength;
		return res;
	}

	private static _serializeReplyOKJSON(req: number, res: string): Buffer {
		const resByteLength = Buffer.byteLength(res, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeLongString(res, resByteLength);

		let result = MessageBuffer.alloc(MessageType.ReplyOKJSON, req, len);
		result.writeLongString(res, resByteLength);
		return result.buffer;
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

	public static deserializeReplyErrError(buff: Buffer, offset: number): Error {
		const errByteLength = buff.readUInt32LE(offset, true); offset += 4;
		const err = buff.toString('utf8', offset, offset + errByteLength); offset += errByteLength;
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
	ArgString = 1,
	ArgBuffer = 2
}
