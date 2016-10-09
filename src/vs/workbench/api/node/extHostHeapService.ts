/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ExtHostHeapServiceShape } from './extHost.protocol';

export class ExtHostHeapService extends ExtHostHeapServiceShape {

	private static _idPool = 0;

	private _data: { [n: number]: any } = Object.create(null);
	private _callbacks: { [n: number]: Function } = Object.create(null);

	keep(obj: any, callback?: () => any): number {
		const id = ExtHostHeapService._idPool++;
		this._data[id] = obj;
		if (typeof callback === 'function') {
			this._callbacks[id] = callback;
		}
		return id;
	}

	delete(id: number): boolean {
		delete this._callbacks[id];
		return this._data[id];
	}

	get<T>(id: number): T {
		return this._data[id];
	}

	$onGarbageCollection(ids: number[]): void {
		for (const id of ids) {
			setTimeout(this._callbacks[id]);
			this.delete(id);
		}
	}
}