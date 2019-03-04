/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { CharCode } from 'vs/base/common/charCode';
import * as errors from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IURITransformer, transformIncomingURIs } from 'vs/base/common/uriIpc';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { LazyPromise } from 'vs/workbench/services/extensions/node/lazyPromise';
import { IRPCProtocol, ProxyIdentifier, getStringIdentifierForProxy } from 'vs/workbench/services/extensions/node/proxyIdentifier';

export interface JSONStringifyReplacer {
	(key: string, value: any): any;
}

function safeStringify(obj: any, replacer: JSONStringifyReplacer | null): string {
	try {
		return JSON.stringify(obj, <(key: string, value: any) => any>replacer);
	} catch (err) {
		return 'null';
	}
}

function createURIReplacer(transformer: IURITransformer | null): JSONStringifyReplacer | null {
	if (!transformer) {
		return null;
	}
	return (key: string, value: any): any => {
		if (value && value.$mid === 1) {
			return transformer.transformOutgoing(value);
		}
		return value;
	};
}

export const enum RequestInitiator {
	LocalSide = 0,
	OtherSide = 1
}

export const enum ResponsiveState {
	Responsive = 0,
	Unresponsive = 1
}

export interface IRPCProtocolLogger {
	logIncoming(msgLength: number, req: number, initiator: RequestInitiator, str: string, data?: any): void;
	logOutgoing(msgLength: number, req: number, initiator: RequestInitiator, str: string, data?: any): void;
}

const noop = () => { };

export class RPCProtocol extends Disposable implements IRPCProtocol {

	private static UNRESPONSIVE_TIME = 3 * 1000; // 3s

	private readonly _onDidChangeResponsiveState: Emitter<ResponsiveState> = this._register(new Emitter<ResponsiveState>());
	public readonly onDidChangeResponsiveState: Event<ResponsiveState> = this._onDidChangeResponsiveState.event;

	private readonly _protocol: IMessagePassingProtocol;
	private readonly _logger: IRPCProtocolLogger | null;
	private readonly _uriTransformer: IURITransformer | null;
	private readonly _uriReplacer: JSONStringifyReplacer | null;
	private _isDisposed: boolean;
	private readonly _locals: any[];
	private readonly _proxies: any[];
	private _lastMessageId: number;
	private readonly _cancelInvokedHandlers: { [req: string]: () => void; };
	private readonly _pendingRPCReplies: { [msgId: string]: LazyPromise; };
	private _responsiveState: ResponsiveState;
	private _unacknowledgedCount: number;
	private _unresponsiveTime: number;
	private _asyncCheckUresponsive: RunOnceScheduler;

	constructor(protocol: IMessagePassingProtocol, logger: IRPCProtocolLogger | null = null, transformer: IURITransformer | null = null) {
		super();
		this._protocol = protocol;
		this._logger = logger;
		this._uriTransformer = transformer;
		this._uriReplacer = createURIReplacer(this._uriTransformer);
		this._isDisposed = false;
		this._locals = [];
		this._proxies = [];
		for (let i = 0, len = ProxyIdentifier.count; i < len; i++) {
			this._locals[i] = null;
			this._proxies[i] = null;
		}
		this._lastMessageId = 0;
		this._cancelInvokedHandlers = Object.create(null);
		this._pendingRPCReplies = {};
		this._responsiveState = ResponsiveState.Responsive;
		this._unacknowledgedCount = 0;
		this._unresponsiveTime = 0;
		this._asyncCheckUresponsive = this._register(new RunOnceScheduler(() => this._checkUnresponsive(), 1000));
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

	private _onWillSendRequest(req: number): void {
		if (this._unacknowledgedCount === 0) {
			// Since this is the first request we are sending in a while,
			// mark this moment as the start for the countdown to unresponsive time
			this._unresponsiveTime = Date.now() + RPCProtocol.UNRESPONSIVE_TIME;
		}
		this._unacknowledgedCount++;
		if (!this._asyncCheckUresponsive.isScheduled()) {
			this._asyncCheckUresponsive.schedule();
		}
	}

	private _onDidReceiveAcknowledge(req: number): void {
		// The next possible unresponsive time is now + delta.
		this._unresponsiveTime = Date.now() + RPCProtocol.UNRESPONSIVE_TIME;
		this._unacknowledgedCount--;
		if (this._unacknowledgedCount === 0) {
			// No more need to check for unresponsive
			this._asyncCheckUresponsive.cancel();
		}
		// The ext host is responsive!
		this._setResponsiveState(ResponsiveState.Responsive);
	}

	private _checkUnresponsive(): void {
		if (this._unacknowledgedCount === 0) {
			// Not waiting for anything => cannot say if it is responsive or not
			return;
		}

		if (Date.now() > this._unresponsiveTime) {
			// Unresponsive!!
			this._setResponsiveState(ResponsiveState.Unresponsive);
		} else {
			// Not (yet) unresponsive, be sure to check again soon
			this._asyncCheckUresponsive.schedule();
		}
	}

	private _setResponsiveState(newResponsiveState: ResponsiveState): void {
		if (this._responsiveState === newResponsiveState) {
			// no change
			return;
		}
		this._responsiveState = newResponsiveState;
		this._onDidChangeResponsiveState.fire(this._responsiveState);
	}

	public get responsiveState(): ResponsiveState {
		return this._responsiveState;
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
			case MessageType.RequestJSONArgs:
			case MessageType.RequestJSONArgsWithCancellation: {
				let { rpcId, method, args } = MessageIO.deserializeRequestJSONArgs(buff);
				if (this._uriTransformer) {
					args = transformIncomingURIs(args, this._uriTransformer);
				}
				this._receiveRequest(msgLength, req, rpcId, method, args, (messageType === MessageType.RequestJSONArgsWithCancellation));
				break;
			}
			case MessageType.RequestMixedArgs:
			case MessageType.RequestMixedArgsWithCancellation: {
				let { rpcId, method, args } = MessageIO.deserializeRequestMixedArgs(buff);
				if (this._uriTransformer) {
					args = transformIncomingURIs(args, this._uriTransformer);
				}
				this._receiveRequest(msgLength, req, rpcId, method, args, (messageType === MessageType.RequestMixedArgsWithCancellation));
				break;
			}
			case MessageType.Acknowledged: {
				if (this._logger) {
					this._logger.logIncoming(msgLength, req, RequestInitiator.LocalSide, `ack`);
				}
				this._onDidReceiveAcknowledge(req);
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
				this._receiveReplyErr(msgLength, req, err);
				break;
			}
			case MessageType.ReplyErrEmpty: {
				this._receiveReplyErr(msgLength, req, undefined);
				break;
			}
		}
	}

	private _receiveRequest(msgLength: number, req: number, rpcId: number, method: string, args: any[], usesCancellationToken: boolean): void {
		if (this._logger) {
			this._logger.logIncoming(msgLength, req, RequestInitiator.OtherSide, `receiveRequest ${getStringIdentifierForProxy(rpcId)}.${method}(`, args);
		}
		const callId = String(req);

		let promise: Promise<any>;
		let cancel: () => void;
		if (usesCancellationToken) {
			const cancellationTokenSource = new CancellationTokenSource();
			args.push(cancellationTokenSource.token);
			promise = this._invokeHandler(rpcId, method, args);
			cancel = () => cancellationTokenSource.cancel();
		} else {
			// cannot be cancelled
			promise = this._invokeHandler(rpcId, method, args);
			cancel = noop;
		}

		this._cancelInvokedHandlers[callId] = cancel;

		// Acknowledge the request
		const msg = MessageIO.serializeAcknowledged(req);
		if (this._logger) {
			this._logger.logOutgoing(msg.byteLength, req, RequestInitiator.OtherSide, `ack`);
		}
		this._protocol.send(msg);

		promise.then((r) => {
			delete this._cancelInvokedHandlers[callId];
			const msg = MessageIO.serializeReplyOK(req, r, this._uriReplacer);
			if (this._logger) {
				this._logger.logOutgoing(msg.byteLength, req, RequestInitiator.OtherSide, `reply:`, r);
			}
			this._protocol.send(msg);
		}, (err) => {
			delete this._cancelInvokedHandlers[callId];
			const msg = MessageIO.serializeReplyErr(req, err);
			if (this._logger) {
				this._logger.logOutgoing(msg.byteLength, req, RequestInitiator.OtherSide, `replyErr:`, err);
			}
			this._protocol.send(msg);
		});
	}

	private _receiveCancel(msgLength: number, req: number): void {
		if (this._logger) {
			this._logger.logIncoming(msgLength, req, RequestInitiator.OtherSide, `receiveCancel`);
		}
		const callId = String(req);
		if (this._cancelInvokedHandlers[callId]) {
			this._cancelInvokedHandlers[callId]();
		}
	}

	private _receiveReply(msgLength: number, req: number, value: any): void {
		if (this._logger) {
			this._logger.logIncoming(msgLength, req, RequestInitiator.LocalSide, `receiveReply:`, value);
		}
		const callId = String(req);
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		pendingReply.resolveOk(value);
	}

	private _receiveReplyErr(msgLength: number, req: number, value: any): void {
		if (this._logger) {
			this._logger.logIncoming(msgLength, req, RequestInitiator.LocalSide, `receiveReplyErr:`, value);
		}

		const callId = String(req);
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		let err: Error | null = null;
		if (value && value.$isError) {
			err = new Error();
			err.name = value.name;
			err.message = value.message;
			err.stack = value.stack;
		}
		pendingReply.resolveErr(err);
	}

	private _invokeHandler(rpcId: number, methodName: string, args: any[]): Promise<any> {
		try {
			return Promise.resolve(this._doInvokeHandler(rpcId, methodName, args));
		} catch (err) {
			return Promise.reject(err);
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

	private _remoteCall(rpcId: number, methodName: string, args: any[]): Promise<any> {
		if (this._isDisposed) {
			return Promise.reject<any>(errors.canceled());
		}
		let cancellationToken: CancellationToken | null = null;
		if (args.length > 0 && CancellationToken.isCancellationToken(args[args.length - 1])) {
			cancellationToken = args.pop();
		}

		if (cancellationToken && cancellationToken.isCancellationRequested) {
			// No need to do anything...
			return Promise.reject<any>(errors.canceled());
		}

		const req = ++this._lastMessageId;
		const callId = String(req);
		const result = new LazyPromise();

		if (cancellationToken) {
			cancellationToken.onCancellationRequested(() => {
				const msg = MessageIO.serializeCancel(req);
				if (this._logger) {
					this._logger.logOutgoing(msg.byteLength, req, RequestInitiator.LocalSide, `cancel`);
				}
				this._protocol.send(MessageIO.serializeCancel(req));
			});
		}

		this._pendingRPCReplies[callId] = result;
		this._onWillSendRequest(req);
		const msg = MessageIO.serializeRequest(req, rpcId, methodName, args, !!cancellationToken, this._uriReplacer);
		if (this._logger) {
			this._logger.logOutgoing(msg.byteLength, req, RequestInitiator.LocalSide, `request: ${getStringIdentifierForProxy(rpcId)}.${methodName}(`, args);
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

	public static sizeMixedArray(arr: Array<string | Buffer>, arrLengths: number[]): number {
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

	public writeMixedArray(arr: Array<string | Buffer>, arrLengths: number[]): void {
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

	public readMixedArray(): Array<string | Buffer> {
		const arrLen = this._buff.readUInt8(this._offset, true); this._offset += 1;
		let arr: Array<string | Buffer> = new Array(arrLen);
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

	public static serializeRequest(req: number, rpcId: number, method: string, args: any[], usesCancellationToken: boolean, replacer: JSONStringifyReplacer | null): Buffer {
		if (this._arrayContainsBuffer(args)) {
			let massagedArgs: Array<string | Buffer> = new Array(args.length);
			let argsLengths: number[] = new Array(args.length);
			for (let i = 0, len = args.length; i < len; i++) {
				const arg = args[i];
				if (Buffer.isBuffer(arg)) {
					massagedArgs[i] = arg;
					argsLengths[i] = arg.byteLength;
				} else {
					massagedArgs[i] = safeStringify(arg, replacer);
					argsLengths[i] = Buffer.byteLength(massagedArgs[i], 'utf8');
				}
			}
			return this._requestMixedArgs(req, rpcId, method, massagedArgs, argsLengths, usesCancellationToken);
		}
		return this._requestJSONArgs(req, rpcId, method, safeStringify(args, replacer), usesCancellationToken);
	}

	private static _requestJSONArgs(req: number, rpcId: number, method: string, args: string, usesCancellationToken: boolean): Buffer {
		const methodByteLength = Buffer.byteLength(method, 'utf8');
		const argsByteLength = Buffer.byteLength(args, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeUInt8();
		len += MessageBuffer.sizeShortString(method, methodByteLength);
		len += MessageBuffer.sizeLongString(args, argsByteLength);

		let result = MessageBuffer.alloc(usesCancellationToken ? MessageType.RequestJSONArgsWithCancellation : MessageType.RequestJSONArgs, req, len);
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

	private static _requestMixedArgs(req: number, rpcId: number, method: string, args: Array<string | Buffer>, argsLengths: number[], usesCancellationToken: boolean): Buffer {
		const methodByteLength = Buffer.byteLength(method, 'utf8');

		let len = 0;
		len += MessageBuffer.sizeUInt8();
		len += MessageBuffer.sizeShortString(method, methodByteLength);
		len += MessageBuffer.sizeMixedArray(args, argsLengths);

		let result = MessageBuffer.alloc(usesCancellationToken ? MessageType.RequestMixedArgsWithCancellation : MessageType.RequestMixedArgs, req, len);
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

	public static serializeAcknowledged(req: number): Buffer {
		return MessageBuffer.alloc(MessageType.Acknowledged, req, 0).buffer;
	}

	public static serializeCancel(req: number): Buffer {
		return MessageBuffer.alloc(MessageType.Cancel, req, 0).buffer;
	}

	public static serializeReplyOK(req: number, res: any, replacer: JSONStringifyReplacer | null): Buffer {
		if (typeof res === 'undefined') {
			return this._serializeReplyOKEmpty(req);
		}
		if (Buffer.isBuffer(res)) {
			return this._serializeReplyOKBuffer(req, res);
		}
		return this._serializeReplyOKJSON(req, safeStringify(res, replacer));
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
		const err = safeStringify(errors.transformErrorForSerialization(_err), null);
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
	RequestJSONArgsWithCancellation = 2,
	RequestMixedArgs = 3,
	RequestMixedArgsWithCancellation = 4,
	Acknowledged = 5,
	Cancel = 6,
	ReplyOKEmpty = 7,
	ReplyOKBuffer = 8,
	ReplyOKJSON = 9,
	ReplyErrError = 10,
	ReplyErrEmpty = 11,
}

const enum ArgType {
	String = 1,
	Buffer = 2
}
