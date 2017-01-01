/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ExtHostHeapServiceShape } from './extHost.protocol';

export class ExtHostHeapService extends ExtHostHeapServiceShape {

	private static _idPool = 0;

	private _data = new Map<number, any>();

	keep(obj: any): number {
		const id = ExtHostHeapService._idPool++;
		this._data.set(id, obj);
		return id;
	}

	delete(id: number): boolean {
		return this._data.delete(id);
	}

	get<T>(id: number): T {
		return this._data.get(id);
	}

	$onGarbageCollection(ids: number[]): void {
		for (const id of ids) {
			this.delete(id);
		}
	}
}
