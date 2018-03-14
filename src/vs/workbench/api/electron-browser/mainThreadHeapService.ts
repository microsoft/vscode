/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ExtHostContext, ObjectIdentifier, IExtHostContext } from '../node/extHost.protocol';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { isThenable } from 'vs/base/common/async';
import { isNullOrUndefined } from 'util';

export const IHeapService = createDecorator<IHeapService>('heapService');

export interface IHeapService {
	_serviceBrand: any;

	readonly onGarbageCollection: Event<number[]>;

	/**
	 * Track gc-collection for all new objects that
	 * have the $ident-value set.
	 */
	trackRecursive<T>(obj: T | Thenable<T>): Thenable<T>;
}

export class HeapService implements IHeapService {

	_serviceBrand: any;

	private readonly _onGarbageCollection: Emitter<number[]> = new Emitter<number[]>();
	public readonly onGarbageCollection: Event<number[]> = this._onGarbageCollection.event;

	private _activeSignals = new WeakMap<any, object>();
	private _activeIds = new Set<number>();
	private _consumeHandle: number;

	constructor() {
		//
	}

	dispose() {
		clearInterval(this._consumeHandle);
	}

	trackRecursive<T>(obj: T | Thenable<T>): Thenable<T> {
		if (isThenable(obj)) {
			return obj.then(result => this.trackRecursive(result));
		} else {
			return this._doTrackRecursive(obj);
		}
	}

	private _doTrackRecursive(obj: any): Promise<any> {

		if (isNullOrUndefined(obj)) {
			return Promise.resolve(obj);
		}

		return import('gc-signals').then(({ GCSignal, consumeSignals }) => {

			if (this._consumeHandle === void 0) {
				// ensure that there is one consumer of signals
				this._consumeHandle = setInterval(() => {
					const ids = consumeSignals();

					if (ids.length > 0) {
						// local book-keeping
						for (const id of ids) {
							this._activeIds.delete(id);
						}

						// fire event
						this._onGarbageCollection.fire(ids);
					}

				}, 15 * 1000);
			}

			const stack = [obj];
			while (stack.length > 0) {

				// remove first element
				let obj = stack.shift();

				if (!obj || typeof obj !== 'object') {
					continue;
				}

				for (let key in obj) {
					if (!Object.prototype.hasOwnProperty.call(obj, key)) {
						continue;
					}

					const value = obj[key];
					// recurse -> object/array
					if (typeof value === 'object') {
						stack.push(value);

					} else if (key === ObjectIdentifier.name) {
						// track new $ident-objects

						if (typeof value === 'number' && !this._activeIds.has(value)) {
							this._activeIds.add(value);
							this._activeSignals.set(obj, new GCSignal(value));
						}
					}
				}
			}

			return obj;
		});
	}
}

@extHostCustomer
export class MainThreadHeapService {

	private _toDispose: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IHeapService heapService: IHeapService,
	) {
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostHeapService);
		this._toDispose = heapService.onGarbageCollection((ids) => {
			// send to ext host
			proxy.$onGarbageCollection(ids);
		});
	}

	public dispose(): void {
		this._toDispose.dispose();
	}

}

registerSingleton(IHeapService, HeapService);
