/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDispatcher, RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';
import { ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';

// declare var Proxy:any; // TODO@TypeScript

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
			this._proxies[identifier.id] = this._createProxy(identifier.id, identifier.methodNames);
		}
		return this._proxies[identifier.id];
	}

	private _createProxy<T>(proxyId: string, methodNames: string[]): T {
		// Check below how to switch to native proxies
		let result: any = {};
		for (let i = 0; i < methodNames.length; i++) {
			let methodName = methodNames[i];
			result[methodName] = this._createMethodProxy(proxyId, methodName);
		}
		return result;

		// let handler = {
		// 	get: (target, name) => {
		// 		return (...myArgs: any[]) => {
		// 			return this._callOnRemote(id, name, myArgs);
		// 		};
		// 	}
		// };
		// return new Proxy({}, handler);
	}

	private _createMethodProxy(proxyId: string, methodName: string): (...myArgs: any[]) => TPromise<any> {
		return (...myArgs: any[]) => {
			return this._callOnRemote(proxyId, methodName, myArgs);
		};
	}

	set<T>(identifier: ProxyIdentifier<T>, value: T): void {
		if (identifier.isMain !== this._isMain) {
			throw new Error('Mismatch in object registration!');
		}
		this._locals[identifier.id] = value;
	}

	private _callOnRemote(proxyId: string, methodName: string, args: any[]): TPromise<any> {
		return this._rpcProtocol.callOnRemote(proxyId, methodName, args);
	}
}
