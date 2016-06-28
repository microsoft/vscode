/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {SyncDescriptor} from './descriptors';

type Entry = [ServiceIdentifier<any>, any];

export class ServiceCollection {
	private _entriesDictionary = {};

	constructor(...entries:[ServiceIdentifier<any>, any][]) {
		for (let entry of entries) {
			this.set(entry[0], entry[1]);
		}
	}

	set<T>(identifier: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
		const entry: Entry = [identifier, instanceOrDescriptor];
		const id = identifier.toString();
		if (this.has(identifier)) {
			const old = this._entriesDictionary[id];
			this._entriesDictionary[id] = entry;
			return old[1];
		} else {
			// new element
			this._entriesDictionary[id] = entry;
		}
	}

	forEach(callback: (identifier: ServiceIdentifier<any>, instanceOrDescriptor: any) => any): void {
		for (let key of Object.keys(this._entriesDictionary)) {
			let entry = this._entriesDictionary[key];
			let [identifier, instanceOrDescriptor] = entry;
			callback(identifier, instanceOrDescriptor);
		}
	}

	has(identifier: ServiceIdentifier<any>): boolean {
		return typeof this._entriesDictionary[identifier.toString()] !== 'undefined';
	}

	get<T>(identifier: ServiceIdentifier<T>): T | SyncDescriptor<T> {
		if (this.has(identifier)) {
			return this._entriesDictionary[identifier.toString()][1];
		}
	}
}