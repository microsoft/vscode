/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ExtHostHeapMonitorShape} from './extHost.protocol';

export class ExtHostHeapMonitor extends ExtHostHeapMonitorShape {

	private static _idPool = 0;

	private _data: { [n: number]: any } = Object.create(null);
	private _callbacks: { [n: number]: Function } = Object.create(null);

	private _mixinObjectIdentifier(obj: any): number {
		const id = ExtHostHeapMonitor._idPool++;

		Object.defineProperties(obj, {
			'$heap_ident': {
				value: id,
				enumerable: true,
				configurable: false,
				writable: false
			},
			'$mid': {
				value: 3,
				enumerable: true,
				configurable: false,
				writable: false
			}
		});

		return id;
	}

	linkObjects(external: any, internal: any, callback?: () => any) {
		const id = this._mixinObjectIdentifier(external);
		this._data[id] = internal;
		if (typeof callback === 'function') {
			this._callbacks[id] = callback;
		}
	}

	getInternalObject<T>(external: any): T {
		const id = external.$heap_ident;
		if (typeof id === 'number') {
			return this._data[id];
		}
	}

	$onGarbageCollection(ids: number[]): void {
		for (const id of ids) {
			delete this._data[id];
			const callback = this._callbacks[id];
			if (callback) {
				delete this._callbacks[id];
				setTimeout(callback);
			}
		}
	}
}