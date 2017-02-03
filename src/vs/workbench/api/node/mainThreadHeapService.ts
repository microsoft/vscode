/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, ObjectIdentifier } from './extHost.protocol';
import { consumeSignals, GCSignal } from 'gc-signals';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export const IHeapService = createDecorator<IHeapService>('heapService');

export interface IHeapService {
	_serviceBrand: any;

	/**
	 * Track gc-collection for all new objects that
	 * have the $ident-value set.
	 */
	trackRecursive<T>(p: TPromise<T>): TPromise<T>;

	/**
	 * Track gc-collection for all new objects that
	 * have the $ident-value set.
	 */
	trackRecursive<T>(obj: T): T;
}


export class MainThreadHeapService implements IHeapService {

	_serviceBrand: any;

	private _activeSignals = new WeakMap<any, GCSignal>();
	private _activeIds = new Set<number>();
	private _consumeHandle: number;

	constructor( @IThreadService threadService: IThreadService) {
		const proxy = threadService.get(ExtHostContext.ExtHostHeapService);

		this._consumeHandle = setInterval(() => {
			const ids = consumeSignals();

			if (ids.length > 0) {
				// local book-keeping
				for (const id of ids) {
					this._activeIds.delete(id);
				}

				// send to ext host
				proxy.$onGarbageCollection(ids);
			}

		}, 15 * 1000);
	}

	dispose() {
		clearInterval(this._consumeHandle);
	}

	trackRecursive<T>(p: TPromise<T>): TPromise<T>;
	trackRecursive<T>(obj: T): T;
	trackRecursive<T>(obj: any): any {
		if (TPromise.is(obj)) {
			return obj.then(result => this.trackRecursive(result));
		} else {
			return this._doTrackRecursive(obj);
		}
	}

	private _doTrackRecursive(obj: any): any {

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
	}
}

registerSingleton(IHeapService, MainThreadHeapService);
