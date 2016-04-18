/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {binarySearch} from 'vs/base/common/arrays';
import {ServiceIdentifier, _util} from 'vs/platform/instantiation/common/instantiation';
import {SyncDescriptor} from './descriptors';

type Entry = [ServiceIdentifier<any>, any];

export default class ServiceCollection {

	private _entries: Entry[] = [];

	constructor(...entries:[ServiceIdentifier<any>, any][]) {
		for (let entry of entries) {
			this.set(entry[0], entry[1]);
		}
	}

	set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): void {
		const entry: Entry = [id, instanceOrDescriptor];
		const idx = ~binarySearch(this._entries, entry, ServiceCollection._entryCompare);
		if (idx < 0) {
			throw new Error(`service with that identifier already registered`);
		}
		this._entries.splice(idx, 0, entry);
	}

	forEach(callback: (id: ServiceIdentifier<any>, instanceOrDescriptor: any) => any): void {
		for (let entry of this._entries) {
			let [id, instanceOrDescriptor] = entry;
			callback(id, instanceOrDescriptor);
		}
	}

	has(id: ServiceIdentifier<any>): boolean {
		return binarySearch(this._entries, <Entry>[id,], ServiceCollection._entryCompare) >= 0;
	}

	get<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
		const idx = binarySearch(this._entries, <Entry> [id,], ServiceCollection._entryCompare);
		if (idx >= 0) {
			return this._entries[idx][1];
		}
	}

	private static _entryCompare(a: Entry, b: Entry): number {
		const _a = _util.getServiceId(a[0]);
		const _b = _util.getServiceId(b[0]);
		if (_a < _b) {
			return -1;
		} else if (_a > _b) {
			return 1;
		} else {
			return 0;
		}
	}
}
