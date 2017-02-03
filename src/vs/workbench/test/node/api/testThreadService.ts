/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { AbstractThreadService } from 'vs/workbench/services/thread/common/abstractThreadService';
import { IThreadService, ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';

export function OneGetThreadService(thing: any): IThreadService {
	return {
		_serviceBrand: undefined,
		get<T>(): T {
			return thing;
		},
		set<T>(): void {
			throw new Error();
		}
	};
}

export class TestThreadService extends AbstractThreadService implements IThreadService {
	public _serviceBrand: any;

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
}
