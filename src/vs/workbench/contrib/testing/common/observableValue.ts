/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';

export class ObservableValue<T> {
	private readonly changeEmitter = new Emitter<T>();

	public readonly onDidChange = this.changeEmitter.event;

	public get value() {
		return this._value;
	}

	public set value(v: T) {
		if (v !== this._value) {
			this._value = v;
			this.changeEmitter.fire(v);
		}
	}

	public static stored<T>(stored: StoredValue<T>, defaultValue: T) {
		const o = new ObservableValue(stored.get(defaultValue));
		o.onDidChange(value => stored.store(value));
		return o;
	}

	constructor(private _value: T) { }
}
