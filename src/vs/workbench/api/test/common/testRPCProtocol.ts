/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isThenable } from 'vs/base/common/async';
import { CharCode } from 'vs/base/common/charCode';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ExtensionHostKind } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { Proxied, ProxyIdentifier, SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { parseJsonAndRestoreBufferRefs, stringifyJsonWithBufferRefs } from 'vs/workbench/services/extensions/common/rpcProtocol';

export function SingleProxyRPCProtocol(thing: any): IExtHostContext & IExtHostRpcService {
	return {
		_serviceBrand: undefined,
		remoteAuthority: null!,
		getProxy<T>(): T {
			return thing;
		},
		set<T, R extends T>(identifier: ProxyIdentifier<T>, value: R): R {
			return value;
		},
		dispose: undefined!,
		assertRegistered: undefined!,
		drain: undefined!,
		extensionHostKind: ExtensionHostKind.LocalProcess
	};
}

/** Makes a fake {@link SingleProxyRPCProtocol} on which any method can be called */
export function AnyCallRPCProtocol<T>(useCalls?: { [K in keyof T]: T[K] }) {
	return SingleProxyRPCProtocol(new Proxy({}, {
		get(_target, prop: string) {
			if (useCalls && prop in useCalls) {
				return (useCalls as any)[prop];
			}
			return () => Promise.resolve(undefined);
		}
	}));
}

export class TestRPCProtocol implements IExtHostContext, IExtHostRpcService {

	public _serviceBrand: undefined;
	public remoteAuthority = null!;
	public extensionHostKind = ExtensionHostKind.LocalProcess;

	private _callCountValue: number = 0;
	private _idle?: Promise<any>;
	private _completeIdle?: Function;

	private readonly _locals: { [id: string]: any };
	private readonly _proxies: { [id: string]: any };

	constructor() {
		this._locals = Object.create(null);
		this._proxies = Object.create(null);
	}

	drain(): Promise<void> {
		return Promise.resolve();
	}

	private get _callCount(): number {
		return this._callCountValue;
	}

	private set _callCount(value: number) {
		this._callCountValue = value;
		if (this._callCountValue === 0) {
			this._completeIdle?.();
			this._idle = undefined;
		}
	}

	sync(): Promise<any> {
		return new Promise<any>((c) => {
			setTimeout(c, 0);
		}).then(() => {
			if (this._callCount === 0) {
				return undefined;
			}
			if (!this._idle) {
				this._idle = new Promise<any>((c, e) => {
					this._completeIdle = c;
				});
			}
			return this._idle;
		});
	}

	public getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T> {
		if (!this._proxies[identifier.sid]) {
			this._proxies[identifier.sid] = this._createProxy(identifier.sid);
		}
		return this._proxies[identifier.sid];
	}

	private _createProxy<T>(proxyId: string): T {
		const handler = {
			get: (target: any, name: PropertyKey) => {
				if (typeof name === 'string' && !target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
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
		this._locals[identifier.sid] = value;
		return value;
	}

	protected _remoteCall(proxyId: string, path: string, args: any[]): Promise<any> {
		this._callCount++;

		return new Promise<any>((c) => {
			setTimeout(c, 0);
		}).then(() => {
			const instance = this._locals[proxyId];
			// pretend the args went over the wire... (invoke .toJSON on objects...)
			const wireArgs = simulateWireTransfer(args);
			let p: Promise<any>;
			try {
				const result = (<Function>instance[path]).apply(instance, wireArgs);
				p = isThenable(result) ? result : Promise.resolve(result);
			} catch (err) {
				p = Promise.reject(err);
			}

			return p.then(result => {
				this._callCount--;
				// pretend the result went over the wire... (invoke .toJSON on objects...)
				const wireResult = simulateWireTransfer(result);
				return wireResult;
			}, err => {
				this._callCount--;
				return Promise.reject(err);
			});
		});
	}

	public dispose() {
		throw new Error('Not implemented!');
	}

	public assertRegistered(identifiers: ProxyIdentifier<any>[]): void {
		throw new Error('Not implemented!');
	}
}

function simulateWireTransfer<T>(obj: T): T {
	if (!obj) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(simulateWireTransfer) as any;
	}

	if (obj instanceof SerializableObjectWithBuffers) {
		const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(obj);
		return parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null);
	} else {
		return JSON.parse(JSON.stringify(obj));
	}
}
