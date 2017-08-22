/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDispatcher, RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';
import { ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';

declare var Proxy: any; // TODO@TypeScript

export abstract class AbstractThreadService implements IDispatcher {

	private readonly _rpcProtocol: RPCProtocol;
	private readonly _isMain: boolean;
	protected readonly _locals: { [id: string]: any; };
	private readonly _proxies: { [id: string]: any; } = Object.create(null);

	constructor(rpcProtocol: RPCProtocol, isMain: boolean) {
		this._rpcProtocol = rpcProtocol;
		this._isMain = isMain;
		this._locals = Object.create(null);
		this._proxies = Object.create(null);
		this._rpcProtocol.setDispatcher(this);
	}

	public dispose(): void {
		this._rpcProtocol.dispose();
	}

	public invoke(proxyId: string, methodName: string, args: any[]): any {
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

	get<T>(identifier: ProxyIdentifier<T>): T {
		if (!this._proxies[identifier.id]) {
			this._proxies[identifier.id] = this._createProxy(identifier.id);
		}
		return this._proxies[identifier.id];
	}

	private _createProxy<T>(proxyId: string): T {
		let handler = {
			get: (target, name) => {
				if (!target[name]) {
					target[name] = (...myArgs: any[]) => {
						return this._callOnRemote(proxyId, name, myArgs);
					};
				}
				return target[name];
			}
		};
		return new Proxy(Object.create(null), handler);
	}

	set<T, R extends T>(identifier: ProxyIdentifier<T>, value: R): R {
		if (identifier.isMain !== this._isMain) {
			throw new Error('Mismatch in object registration!');
		}
		this._locals[identifier.id] = value;
		return value;
	}

	assertRegistered(identifiers: ProxyIdentifier<any>[]): void {
		for (let i = 0, len = identifiers.length; i < len; i++) {
			const identifier = identifiers[i];
			if (!this._locals[identifier.id]) {
				throw new Error(`Missing actor ${identifier.id} (isMain: ${identifier.isMain})`);
			}
		}
	}

	private _callOnRemote(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		return this._rpcProtocol.callOnRemote(proxyId, methodName, args);
	}
}
