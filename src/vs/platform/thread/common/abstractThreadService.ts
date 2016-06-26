/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import remote = require('vs/base/common/remote');
import {ProxyIdentifier} from 'vs/platform/thread/common/thread';

declare var Proxy:any; // TODO@TypeScript

export abstract class AbstractThreadService implements remote.IManyHandler {

	private _isMain: boolean;
	protected _locals: { [id: string]: any; };
	private _proxies: {[id:string]:any;} = Object.create(null);

	constructor(isMain:boolean) {
		this._isMain = isMain;
		this._locals = Object.create(null);
		this._proxies = Object.create(null);
	}

	public handle(rpcId: string, methodName: string, args: any[]): any {
		if (!this._locals[rpcId]) {
			throw new Error('Unknown actor ' + rpcId);
		}
		let actor = this._locals[rpcId];
		let method = actor[methodName];
		if (typeof method !== 'function') {
			throw new Error('Unknown method ' + methodName + ' on actor ' + rpcId);
		}
		return method.apply(actor, args);
	}

	get<T>(identifier:ProxyIdentifier<T>): T {
		if (!this._proxies[identifier.id]) {
			this._proxies[identifier.id] = this._createProxy(identifier.id);
		}
		return this._proxies[identifier.id];
	}

	private _createProxy<T>(id:string): T {
		let handler = {
			get: (target, name) => {
				return (...myArgs: any[]) => {
					return this._callOnRemote(id, name, myArgs);
				};
			}
		};

		return new Proxy({}, handler);
	}

	set<T>(identifier:ProxyIdentifier<T>, value:T): T {
		if (identifier.isMain !== this._isMain) {
			throw new Error('Mismatch in object registration!');
		}
		this._locals[identifier.id] = value;
		return value;
	}

	protected abstract _callOnRemote(proxyId: string, path: string, args:any[]): TPromise<any>;
}
