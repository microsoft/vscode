/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService, ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';

export function OneGetThreadService(thing: any): IThreadService {
	return {
		get<T>(): T {
			return thing;
		},
		set<T, R extends T>(identifier: ProxyIdentifier<T>, value: R): R {
			return value;
		},
		assertRegistered: undefined
	};
}

declare var Proxy; // TODO@TypeScript

export abstract class AbstractTestThreadService {

	private _isMain: boolean;
	protected _locals: { [id: string]: any; };
	private _proxies: { [id: string]: any; } = Object.create(null);

	constructor(isMain: boolean) {
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

	get<T>(identifier: ProxyIdentifier<T>): T {
		if (!this._proxies[identifier.id]) {
			this._proxies[identifier.id] = this._createProxy(identifier.id);
		}
		return this._proxies[identifier.id];
	}

	private _createProxy<T>(id: string): T {
		let handler = {
			get: (target, name) => {
				return (...myArgs: any[]) => {
					return this._callOnRemote(id, name, myArgs);
				};
			}
		};
		return new Proxy({}, handler);
	}

	set<T, R extends T>(identifier: ProxyIdentifier<T>, value: R): R {
		if (identifier.isMain !== this._isMain) {
			throw new Error('Mismatch in object registration!');
		}
		this._locals[identifier.id] = value;
		return value;
	}

	protected abstract _callOnRemote(proxyId: string, path: string, args: any[]): TPromise<any>;
}

export class TestThreadService extends AbstractTestThreadService implements IThreadService {
	constructor() {
		super(false);
	}

	private _callCountValue: number = 0;
	private _idle: TPromise<any>;
	private _completeIdle: Function;

	private get _callCount(): number {
		return this._callCountValue;
	}

	private set _callCount(value: number) {
		this._callCountValue = value;
		if (this._callCountValue === 0) {
			if (this._completeIdle) {
				this._completeIdle();
			}
			this._idle = undefined;
		}
	}

	sync(): TPromise<any> {
		return new TPromise<any>((c) => {
			setTimeout(c, 0);
		}).then(() => {
			if (this._callCount === 0) {
				return undefined;
			}
			if (!this._idle) {
				this._idle = new TPromise<any>((c, e) => {
					this._completeIdle = c;
				}, function () {
					// no cancel
				});
			}
			return this._idle;
		});
	}

	private _testInstances: { [id: string]: any; } = Object.create(null);
	setTestInstance<T>(identifier: ProxyIdentifier<T>, value: T): T {
		this._testInstances[identifier.id] = value;
		return value;
	}

	get<T>(identifier: ProxyIdentifier<T>): T {
		let id = identifier.id;
		if (this._locals[id]) {
			return this._locals[id];
		}
		return super.get(identifier);
	}

	protected _callOnRemote(proxyId: string, path: string, args: any[]): TPromise<any> {
		this._callCount++;

		return new TPromise<any>((c) => {
			setTimeout(c, 0);
		}).then(() => {
			const instance = this._testInstances[proxyId];
			let p: Thenable<any>;
			try {
				let result = (<Function>instance[path]).apply(instance, args);
				p = TPromise.is(result) ? result : TPromise.as(result);
			} catch (err) {
				p = TPromise.wrapError(err);
			}

			return p.then(result => {
				this._callCount--;
				return result;
			}, err => {
				this._callCount--;
				return TPromise.wrapError(err);
			});
		});
	}

	public assertRegistered(identifiers: ProxyIdentifier<any>[]): void {
		throw new Error('Not implemented!');
	}
}
