/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CharCode } from '../../../../base/common/charCode.js';
import * as errors from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { MarshalledObject } from '../../../../base/common/marshalling.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { IURITransformer, transformIncomingURIs } from '../../../../base/common/uriIpc.js';
import { IMessagePassingProtocol } from '../../../../base/parts/ipc/common/ipc.js';
import { CanceledLazyPromise, LazyPromise } from './lazyPromise.js';
import { getStringIdentifierForProxy, IRPCProtocol, Proxied, ProxyIdentifier, SerializableObjectWithBuffers } from './proxyIdentifier.js';

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

const refSymbolName = '$$ref$$';
const undefinedRef = { [refSymbolName]: -1 } as const;

class StringifiedJsonWithBufferRefs {
	constructor(
		public readonly jsonString: string,
		public readonly referencedBuffers: readonly VSBuffer[],
	) { }
}

export function stringifyJsonWithBufferRefs<T>(obj: T, replacer: JSONStringifyReplacer | null = null, useSafeStringify = false): StringifiedJsonWithBufferRefs {
	const foundBuffers: VSBuffer[] = [];
	const serialized = (useSafeStringify ? safeStringify : JSON.stringify)(obj, (key, value) => {
		if (typeof value === 'undefined') {
			return undefinedRef; // JSON.stringify normally converts 'undefined' to 'null'
		} else if (typeof value === 'object') {
			if (value instanceof VSBuffer) {
				const bufferIndex = foundBuffers.push(value) - 1;
				return { [refSymbolName]: bufferIndex };
			}
			if (replacer) {
				return replacer(key, value);
			}
		}
		return value;
	});
	return {
		jsonString: serialized,
		referencedBuffers: foundBuffers
	};
}

export function parseJsonAndRestoreBufferRefs(jsonString: string, buffers: readonly VSBuffer[], uriTransformer: IURITransformer | null): any {
	return JSON.parse(jsonString, (_key, value) => {
		if (value) {
			const ref = value[refSymbolName];
			if (typeof ref === 'number') {
				return buffers[ref];
			}

			if (uriTransformer && (<MarshalledObject>value).$mid === MarshalledId.Uri) {
				return uriTransformer.transformIncoming(value);
			}
		}
		return value;
	});
}


function stringify(obj: any, replacer: JSONStringifyReplacer | null): string {
	return JSON.stringify(obj, <(key: string, value: any) => any>replacer);
}

function createURIReplacer(transformer: IURITransformer | null): JSONStringifyReplacer | null {
	if (!transformer) {
		return null;
	}
	return (key: string, value: any): any => {
		if (value && value.$mid === MarshalledId.Uri) {
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

const _RPCProtocolSymbol = Symbol.for('rpcProtocol');
const _RPCProxySymbol = Symbol.for('rpcProxy');

export class RPCProtocol extends Disposable implements IRPCProtocol {

	[_RPCProtocolSymbol] = true;

	private static readonly UNRESPONSIVE_TIME = 3 * 1000; // 3s

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
	private readonly _cancelInvokedHandlers: { [req: string]: () => void };
	private readonly _pendingRPCReplies: { [msgId: string]: PendingRPCReply };
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
		this._register(this._protocol.onMessage((msg) => this._receiveOneMessage(msg)));
	}

	public override dispose(): void {
		this._isDisposed = true;

		// Release all outstanding promises with a canceled error
		Object.keys(this._pendingRPCReplies).forEach((msgId) => {
			const pending = this._pendingRPCReplies[msgId];
			delete this._pendingRPCReplies[msgId];
			pending.resolveErr(errors.canceled());
		});

		super.dispose();
	}

	public drain(): Promise<void> {
		if (typeof this._protocol.drain === 'function') {
			return this._protocol.drain();
		}
		return Promise.resolve();
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

	public getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T> {
		const { nid: rpcId, sid } = identifier;
		if (!this._proxies[rpcId]) {
			this._proxies[rpcId] = this._createProxy(rpcId, sid);
		}
		return this._proxies[rpcId];
	}

	private _createProxy<T>(rpcId: number, debugName: string): T {
		const handler = {
			get: (target: any, name: PropertyKey) => {
				if (typeof name === 'string' && !target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
					target[name] = (...myArgs: any[]) => {
						return this._remoteCall(rpcId, name, myArgs);
					};
				}
				if (name === _RPCProxySymbol) {
					return debugName;
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
				throw new Error(`Missing proxy instance ${identifier.sid}`);
			}
		}
	}

	private _receiveOneMessage(rawmsg: VSBuffer): void {
		if (this._isDisposed) {
			return;
		}

		const msgLength = rawmsg.byteLength;
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
				this._logger?.logIncoming(msgLength, req, RequestInitiator.LocalSide, `ack`);
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
			case MessageType.ReplyOKJSONWithBuffers: {
				const value = MessageIO.deserializeReplyOKJSONWithBuffers(buff, this._uriTransformer);
				this._receiveReply(msgLength, req, value);
				break;
			}
			case MessageType.ReplyOKVSBuffer: {
				const value = MessageIO.deserializeReplyOKVSBuffer(buff);
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
			default:
				console.error(`received unexpected message`);
				console.error(rawmsg);
		}
	}

	private _receiveRequest(msgLength: number, req: number, rpcId: number, method: string, args: any[], usesCancellationToken: boolean): void {
		this._logger?.logIncoming(msgLength, req, RequestInitiator.OtherSide, `receiveRequest ${getStringIdentifierForProxy(rpcId)}.${method}(`, args);
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
		this._logger?.logOutgoing(msg.byteLength, req, RequestInitiator.OtherSide, `ack`);
		this._protocol.send(msg);

		promise.then((r) => {
			delete this._cancelInvokedHandlers[callId];
			const msg = MessageIO.serializeReplyOK(req, r, this._uriReplacer);
			this._logger?.logOutgoing(msg.byteLength, req, RequestInitiator.OtherSide, `reply:`, r);
			this._protocol.send(msg);
		}, (err) => {
			delete this._cancelInvokedHandlers[callId];
			const msg = MessageIO.serializeReplyErr(req, err);
			this._logger?.logOutgoing(msg.byteLength, req, RequestInitiator.OtherSide, `replyErr:`, err);
			this._protocol.send(msg);
		});
	}

	private _receiveCancel(msgLength: number, req: number): void {
		this._logger?.logIncoming(msgLength, req, RequestInitiator.OtherSide, `receiveCancel`);
		const callId = String(req);
		this._cancelInvokedHandlers[callId]?.();
	}

	private _receiveReply(msgLength: number, req: number, value: any): void {
		this._logger?.logIncoming(msgLength, req, RequestInitiator.LocalSide, `receiveReply:`, value);
		const callId = String(req);
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		pendingReply.resolveOk(value);
	}

	private _receiveReplyErr(msgLength: number, req: number, value: any): void {
		this._logger?.logIncoming(msgLength, req, RequestInitiator.LocalSide, `receiveReplyErr:`, value);

		const callId = String(req);
		if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
			return;
		}

		const pendingReply = this._pendingRPCReplies[callId];
		delete this._pendingRPCReplies[callId];

		let err: any = undefined;
		if (value) {
			if (value.$isError) {
				err = new Error();
				err.name = value.name;
				err.message = value.message;
				err.stack = value.stack;
			} else {
				err = value;
			}
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
		const method = actor[methodName];
		if (typeof method !== 'function') {
			throw new Error('Unknown method ' + methodName + ' on actor ' + getStringIdentifierForProxy(rpcId));
		}
		return method.apply(actor, args);
	}

	private _remoteCall(rpcId: number, methodName: string, args: any[]): Promise<any> {
		if (this._isDisposed) {
			return new CanceledLazyPromise();
		}
		let cancellationToken: CancellationToken | null = null;
		if (args.length > 0 && CancellationToken.isCancellationToken(args[args.length - 1])) {
			cancellationToken = args.pop();
		}

		if (cancellationToken && cancellationToken.isCancellationRequested) {
			// No need to do anything...
			return Promise.reject<any>(errors.canceled());
		}

		const serializedRequestArguments = MessageIO.serializeRequestArguments(args, this._uriReplacer);

		const req = ++this._lastMessageId;
		const callId = String(req);
		const result = new LazyPromise();

		const disposable = new DisposableStore();
		if (cancellationToken) {
			disposable.add(cancellationToken.onCancellationRequested(() => {
				const msg = MessageIO.serializeCancel(req);
				this._logger?.logOutgoing(msg.byteLength, req, RequestInitiator.LocalSide, `cancel`);
				this._protocol.send(msg);
			}));
		}

		this._pendingRPCReplies[callId] = new PendingRPCReply(result, disposable);
		this._onWillSendRequest(req);
		const msg = MessageIO.serializeRequest(req, rpcId, methodName, serializedRequestArguments, !!cancellationToken);
		this._logger?.logOutgoing(msg.byteLength, req, RequestInitiator.LocalSide, `request: ${getStringIdentifierForProxy(rpcId)}.${methodName}(`, args);
		this._protocol.send(msg);
		return result;
	}
}

class PendingRPCReply {
	constructor(
		private readonly _promise: LazyPromise,
		private readonly _disposable: IDisposable
	) { }

	public resolveOk(value: any): void {
		this._promise.resolveOk(value);
		this._disposable.dispose();
	}

	public resolveErr(err: any): void {
		this._promise.resolveErr(err);
		this._disposable.dispose();
	}
}

class MessageBuffer {

	public static alloc(type: MessageType, req: number, messageSize: number): MessageBuffer {
		const result = new MessageBuffer(VSBuffer.alloc(messageSize + 1 /* type */ + 4 /* req */), 0);
		result.writeUInt8(type);
		result.writeUInt32(req);
		return result;
	}

	public static read(buff: VSBuffer, offset: number): MessageBuffer {
		return new MessageBuffer(buff, offset);
	}

	private _buff: VSBuffer;
	private _offset: number;

	public get buffer(): VSBuffer {
		return this._buff;
	}

	private constructor(buff: VSBuffer, offset: number) {
		this._buff = buff;
		this._offset = offset;
	}

	public static sizeUInt8(): number {
		return 1;
	}

	public static readonly sizeUInt32 = 4;

	public writeUInt8(n: number): void {
		this._buff.writeUInt8(n, this._offset); this._offset += 1;
	}

	public readUInt8(): number {
		const n = this._buff.readUInt8(this._offset); this._offset += 1;
		return n;
	}

	public writeUInt32(n: number): void {
		this._buff.writeUInt32BE(n, this._offset); this._offset += 4;
	}

	public readUInt32(): number {
		const n = this._buff.readUInt32BE(this._offset); this._offset += 4;
		return n;
	}

	public static sizeShortString(str: VSBuffer): number {
		return 1 /* string length */ + str.byteLength /* actual string */;
	}

	public writeShortString(str: VSBuffer): void {
		this._buff.writeUInt8(str.byteLength, this._offset); this._offset += 1;
		this._buff.set(str, this._offset); this._offset += str.byteLength;
	}

	public readShortString(): string {
		const strByteLength = this._buff.readUInt8(this._offset); this._offset += 1;
		const strBuff = this._buff.slice(this._offset, this._offset + strByteLength);
		const str = strBuff.toString(); this._offset += strByteLength;
		return str;
	}

	public static sizeLongString(str: VSBuffer): number {
		return 4 /* string length */ + str.byteLength /* actual string */;
	}

	public writeLongString(str: VSBuffer): void {
		this._buff.writeUInt32BE(str.byteLength, this._offset); this._offset += 4;
		this._buff.set(str, this._offset); this._offset += str.byteLength;
	}

	public readLongString(): string {
		const strByteLength = this._buff.readUInt32BE(this._offset); this._offset += 4;
		const strBuff = this._buff.slice(this._offset, this._offset + strByteLength);
		const str = strBuff.toString(); this._offset += strByteLength;
		return str;
	}

	public writeBuffer(buff: VSBuffer): void {
		this._buff.writeUInt32BE(buff.byteLength, this._offset); this._offset += 4;
		this._buff.set(buff, this._offset); this._offset += buff.byteLength;
	}

	public static sizeVSBuffer(buff: VSBuffer): number {
		return 4 /* buffer length */ + buff.byteLength /* actual buffer */;
	}

	public writeVSBuffer(buff: VSBuffer): void {
		this._buff.writeUInt32BE(buff.byteLength, this._offset); this._offset += 4;
		this._buff.set(buff, this._offset); this._offset += buff.byteLength;
	}

	public readVSBuffer(): VSBuffer {
		const buffLength = this._buff.readUInt32BE(this._offset); this._offset += 4;
		const buff = this._buff.slice(this._offset, this._offset + buffLength); this._offset += buffLength;
		return buff;
	}

	public static sizeMixedArray(arr: readonly MixedArg[]): number {
		let size = 0;
		size += 1; // arr length
		for (let i = 0, len = arr.length; i < len; i++) {
			const el = arr[i];
			size += 1; // arg type
			switch (el.type) {
				case ArgType.String:
					size += this.sizeLongString(el.value);
					break;
				case ArgType.VSBuffer:
					size += this.sizeVSBuffer(el.value);
					break;
				case ArgType.SerializedObjectWithBuffers:
					size += this.sizeUInt32; // buffer count
					size += this.sizeLongString(el.value);
					for (let i = 0; i < el.buffers.length; ++i) {
						size += this.sizeVSBuffer(el.buffers[i]);
					}
					break;
				case ArgType.Undefined:
					// empty...
					break;
			}
		}
		return size;
	}

	public writeMixedArray(arr: readonly MixedArg[]): void {
		this._buff.writeUInt8(arr.length, this._offset); this._offset += 1;
		for (let i = 0, len = arr.length; i < len; i++) {
			const el = arr[i];
			switch (el.type) {
				case ArgType.String:
					this.writeUInt8(ArgType.String);
					this.writeLongString(el.value);
					break;
				case ArgType.VSBuffer:
					this.writeUInt8(ArgType.VSBuffer);
					this.writeVSBuffer(el.value);
					break;
				case ArgType.SerializedObjectWithBuffers:
					this.writeUInt8(ArgType.SerializedObjectWithBuffers);
					this.writeUInt32(el.buffers.length);
					this.writeLongString(el.value);
					for (let i = 0; i < el.buffers.length; ++i) {
						this.writeBuffer(el.buffers[i]);
					}
					break;
				case ArgType.Undefined:
					this.writeUInt8(ArgType.Undefined);
					break;
			}
		}
	}

	public readMixedArray(): Array<string | VSBuffer | SerializableObjectWithBuffers<any> | undefined> {
		const arrLen = this._buff.readUInt8(this._offset); this._offset += 1;
		const arr: Array<string | VSBuffer | SerializableObjectWithBuffers<any> | undefined> = new Array(arrLen);
		for (let i = 0; i < arrLen; i++) {
			const argType = <ArgType>this.readUInt8();
			switch (argType) {
				case ArgType.String:
					arr[i] = this.readLongString();
					break;
				case ArgType.VSBuffer:
					arr[i] = this.readVSBuffer();
					break;
				case ArgType.SerializedObjectWithBuffers: {
					const bufferCount = this.readUInt32();
					const jsonString = this.readLongString();
					const buffers: VSBuffer[] = [];
					for (let i = 0; i < bufferCount; ++i) {
						buffers.push(this.readVSBuffer());
					}
					arr[i] = new SerializableObjectWithBuffers(parseJsonAndRestoreBufferRefs(jsonString, buffers, null));
					break;
				}
				case ArgType.Undefined:
					arr[i] = undefined;
					break;
			}
		}
		return arr;
	}
}

const enum SerializedRequestArgumentType {
	Simple,
	Mixed,
}

type SerializedRequestArguments =
	| { readonly type: SerializedRequestArgumentType.Simple; args: string }
	| { readonly type: SerializedRequestArgumentType.Mixed; args: MixedArg[] };


class MessageIO {

	private static _useMixedArgSerialization(arr: any[]): boolean {
		for (let i = 0, len = arr.length; i < len; i++) {
			if (arr[i] instanceof VSBuffer) {
				return true;
			}
			if (arr[i] instanceof SerializableObjectWithBuffers) {
				return true;
			}
			if (typeof arr[i] === 'undefined') {
				return true;
			}
		}
		return false;
	}

	public static serializeRequestArguments(args: any[], replacer: JSONStringifyReplacer | null): SerializedRequestArguments {
		if (this._useMixedArgSerialization(args)) {
			const massagedArgs: MixedArg[] = [];
			for (let i = 0, len = args.length; i < len; i++) {
				const arg = args[i];
				if (arg instanceof VSBuffer) {
					massagedArgs[i] = { type: ArgType.VSBuffer, value: arg };
				} else if (typeof arg === 'undefined') {
					massagedArgs[i] = { type: ArgType.Undefined };
				} else if (arg instanceof SerializableObjectWithBuffers) {
					const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(arg.value, replacer);
					massagedArgs[i] = { type: ArgType.SerializedObjectWithBuffers, value: VSBuffer.fromString(jsonString), buffers: referencedBuffers };
				} else {
					massagedArgs[i] = { type: ArgType.String, value: VSBuffer.fromString(stringify(arg, replacer)) };
				}
			}
			return {
				type: SerializedRequestArgumentType.Mixed,
				args: massagedArgs,
			};
		}
		return {
			type: SerializedRequestArgumentType.Simple,
			args: stringify(args, replacer)
		};
	}

	public static serializeRequest(req: number, rpcId: number, method: string, serializedArgs: SerializedRequestArguments, usesCancellationToken: boolean): VSBuffer {
		switch (serializedArgs.type) {
			case SerializedRequestArgumentType.Simple:
				return this._requestJSONArgs(req, rpcId, method, serializedArgs.args, usesCancellationToken);
			case SerializedRequestArgumentType.Mixed:
				return this._requestMixedArgs(req, rpcId, method, serializedArgs.args, usesCancellationToken);
		}
	}

	private static _requestJSONArgs(req: number, rpcId: number, method: string, args: string, usesCancellationToken: boolean): VSBuffer {
		const methodBuff = VSBuffer.fromString(method);
		const argsBuff = VSBuffer.fromString(args);

		let len = 0;
		len += MessageBuffer.sizeUInt8();
		len += MessageBuffer.sizeShortString(methodBuff);
		len += MessageBuffer.sizeLongString(argsBuff);

		const result = MessageBuffer.alloc(usesCancellationToken ? MessageType.RequestJSONArgsWithCancellation : MessageType.RequestJSONArgs, req, len);
		result.writeUInt8(rpcId);
		result.writeShortString(methodBuff);
		result.writeLongString(argsBuff);
		return result.buffer;
	}

	public static deserializeRequestJSONArgs(buff: MessageBuffer): { rpcId: number; method: string; args: any[] } {
		const rpcId = buff.readUInt8();
		const method = buff.readShortString();
		const args = buff.readLongString();
		return {
			rpcId: rpcId,
			method: method,
			args: JSON.parse(args)
		};
	}

	private static _requestMixedArgs(req: number, rpcId: number, method: string, args: readonly MixedArg[], usesCancellationToken: boolean): VSBuffer {
		const methodBuff = VSBuffer.fromString(method);

		let len = 0;
		len += MessageBuffer.sizeUInt8();
		len += MessageBuffer.sizeShortString(methodBuff);
		len += MessageBuffer.sizeMixedArray(args);

		const result = MessageBuffer.alloc(usesCancellationToken ? MessageType.RequestMixedArgsWithCancellation : MessageType.RequestMixedArgs, req, len);
		result.writeUInt8(rpcId);
		result.writeShortString(methodBuff);
		result.writeMixedArray(args);
		return result.buffer;
	}

	public static deserializeRequestMixedArgs(buff: MessageBuffer): { rpcId: number; method: string; args: any[] } {
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

	public static serializeAcknowledged(req: number): VSBuffer {
		return MessageBuffer.alloc(MessageType.Acknowledged, req, 0).buffer;
	}

	public static serializeCancel(req: number): VSBuffer {
		return MessageBuffer.alloc(MessageType.Cancel, req, 0).buffer;
	}

	public static serializeReplyOK(req: number, res: any, replacer: JSONStringifyReplacer | null): VSBuffer {
		if (typeof res === 'undefined') {
			return this._serializeReplyOKEmpty(req);
		} else if (res instanceof VSBuffer) {
			return this._serializeReplyOKVSBuffer(req, res);
		} else if (res instanceof SerializableObjectWithBuffers) {
			const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(res.value, replacer, true);
			return this._serializeReplyOKJSONWithBuffers(req, jsonString, referencedBuffers);
		} else {
			return this._serializeReplyOKJSON(req, safeStringify(res, replacer));
		}
	}

	private static _serializeReplyOKEmpty(req: number): VSBuffer {
		return MessageBuffer.alloc(MessageType.ReplyOKEmpty, req, 0).buffer;
	}

	private static _serializeReplyOKVSBuffer(req: number, res: VSBuffer): VSBuffer {
		let len = 0;
		len += MessageBuffer.sizeVSBuffer(res);

		const result = MessageBuffer.alloc(MessageType.ReplyOKVSBuffer, req, len);
		result.writeVSBuffer(res);
		return result.buffer;
	}

	public static deserializeReplyOKVSBuffer(buff: MessageBuffer): VSBuffer {
		return buff.readVSBuffer();
	}

	private static _serializeReplyOKJSON(req: number, res: string): VSBuffer {
		const resBuff = VSBuffer.fromString(res);

		let len = 0;
		len += MessageBuffer.sizeLongString(resBuff);

		const result = MessageBuffer.alloc(MessageType.ReplyOKJSON, req, len);
		result.writeLongString(resBuff);
		return result.buffer;
	}

	private static _serializeReplyOKJSONWithBuffers(req: number, res: string, buffers: readonly VSBuffer[]): VSBuffer {
		const resBuff = VSBuffer.fromString(res);

		let len = 0;
		len += MessageBuffer.sizeUInt32; // buffer count
		len += MessageBuffer.sizeLongString(resBuff);
		for (const buffer of buffers) {
			len += MessageBuffer.sizeVSBuffer(buffer);
		}

		const result = MessageBuffer.alloc(MessageType.ReplyOKJSONWithBuffers, req, len);
		result.writeUInt32(buffers.length);
		result.writeLongString(resBuff);
		for (const buffer of buffers) {
			result.writeBuffer(buffer);
		}

		return result.buffer;
	}

	public static deserializeReplyOKJSON(buff: MessageBuffer): any {
		const res = buff.readLongString();
		return JSON.parse(res);
	}

	public static deserializeReplyOKJSONWithBuffers(buff: MessageBuffer, uriTransformer: IURITransformer | null): SerializableObjectWithBuffers<any> {
		const bufferCount = buff.readUInt32();
		const res = buff.readLongString();

		const buffers: VSBuffer[] = [];
		for (let i = 0; i < bufferCount; ++i) {
			buffers.push(buff.readVSBuffer());
		}

		return new SerializableObjectWithBuffers(parseJsonAndRestoreBufferRefs(res, buffers, uriTransformer));
	}

	public static serializeReplyErr(req: number, err: any): VSBuffer {
		const errStr: string | undefined = (err ? safeStringify(errors.transformErrorForSerialization(err), null) : undefined);
		if (typeof errStr !== 'string') {
			return this._serializeReplyErrEmpty(req);
		}
		const errBuff = VSBuffer.fromString(errStr);

		let len = 0;
		len += MessageBuffer.sizeLongString(errBuff);

		const result = MessageBuffer.alloc(MessageType.ReplyErrError, req, len);
		result.writeLongString(errBuff);
		return result.buffer;
	}

	public static deserializeReplyErrError(buff: MessageBuffer): Error {
		const err = buff.readLongString();
		return JSON.parse(err);
	}

	private static _serializeReplyErrEmpty(req: number): VSBuffer {
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
	ReplyOKVSBuffer = 8,
	ReplyOKJSON = 9,
	ReplyOKJSONWithBuffers = 10,
	ReplyErrError = 11,
	ReplyErrEmpty = 12,
}

const enum ArgType {
	String = 1,
	VSBuffer = 2,
	SerializedObjectWithBuffers = 3,
	Undefined = 4,
}


type MixedArg =
	| { readonly type: ArgType.String; readonly value: VSBuffer }
	| { readonly type: ArgType.VSBuffer; readonly value: VSBuffer }
	| { readonly type: ArgType.SerializedObjectWithBuffers; readonly value: VSBuffer; readonly buffers: readonly VSBuffer[] }
	| { readonly type: ArgType.Undefined }
	;
