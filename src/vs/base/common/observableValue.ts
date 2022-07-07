/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

export interface IObservableValue<T> {
	onDidChange: Event<T>;
	readonly value: T;
}

export const staticObservableValue = <T>(value: T): IObservableValue<T> => ({
	onDidChange: Event.None,
	value,
});

export class MutableObservableValue<T> extends Disposable implements IObservableValue<T> {
	private readonly changeEmitter = this._register(new Emitter<T>());

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

	constructor(private _value: T) {
		super();
	}
}
