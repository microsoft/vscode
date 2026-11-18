/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISettableObservable, ITransaction } from '../base.js';
import { TransactionImpl } from '../transaction.js';
import { BaseObservable } from './baseObservable.js';
import { EqualityComparer, IDisposable, strictEquals } from '../commonFacade/deps.js';
import { DebugNameData } from '../debugName.js';
import { getLogger } from '../logging/logging.js';
import { DebugLocation } from '../debugLocation.js';

/**
 * Creates an observable value.
 * Observers get informed when the value changes.
 * @template TChange An arbitrary type to describe how or why the value changed. Defaults to `void`.
 * Observers will receive every single change value.
 */

export function observableValue<T, TChange = void>(name: string, initialValue: T): ISettableObservable<T, TChange>;
export function observableValue<T, TChange = void>(owner: object, initialValue: T): ISettableObservable<T, TChange>;
export function observableValue<T, TChange = void>(nameOrOwner: string | object, initialValue: T, debugLocation = DebugLocation.ofCaller()): ISettableObservable<T, TChange> {
	let debugNameData: DebugNameData;
	if (typeof nameOrOwner === 'string') {
		debugNameData = new DebugNameData(undefined, nameOrOwner, undefined);
	} else {
		debugNameData = new DebugNameData(nameOrOwner, undefined, undefined);
	}
	return new ObservableValue(debugNameData, initialValue, strictEquals, debugLocation);
}

export class ObservableValue<T, TChange = void>
	extends BaseObservable<T, TChange>
	implements ISettableObservable<T, TChange> {
	protected _value: T;

	get debugName() {
		return this._debugNameData.getDebugName(this) ?? 'ObservableValue';
	}

	constructor(
		private readonly _debugNameData: DebugNameData,
		initialValue: T,
		private readonly _equalityComparator: EqualityComparer<T>,
		debugLocation: DebugLocation
	) {
		super(debugLocation);
		this._value = initialValue;

		getLogger()?.handleObservableUpdated(this, { hadValue: false, newValue: initialValue, change: undefined, didChange: true, oldValue: undefined });
	}
	public override get(): T {
		return this._value;
	}

	public set(value: T, tx: ITransaction | undefined, change: TChange): void {
		if (change === undefined && this._equalityComparator(this._value, value)) {
			return;
		}

		let _tx: TransactionImpl | undefined;
		if (!tx) {
			tx = _tx = new TransactionImpl(() => { }, () => `Setting ${this.debugName}`);
		}
		try {
			const oldValue = this._value;
			this._setValue(value);
			getLogger()?.handleObservableUpdated(this, { oldValue, newValue: value, change, didChange: true, hadValue: true });

			for (const observer of this._observers) {
				tx.updateObserver(observer, this);
				observer.handleChange(this, change);
			}
		} finally {
			if (_tx) {
				_tx.finish();
			}
		}
	}

	override toString(): string {
		return `${this.debugName}: ${this._value}`;
	}

	protected _setValue(newValue: T): void {
		this._value = newValue;
	}

	public debugGetState() {
		return {
			value: this._value,
		};
	}

	public debugSetValue(value: unknown) {
		this._value = value as T;
	}
}
/**
 * A disposable observable. When disposed, its value is also disposed.
 * When a new value is set, the previous value is disposed.
 */

export function disposableObservableValue<T extends IDisposable | undefined, TChange = void>(nameOrOwner: string | object, initialValue: T, debugLocation = DebugLocation.ofCaller()): ISettableObservable<T, TChange> & IDisposable {
	let debugNameData: DebugNameData;
	if (typeof nameOrOwner === 'string') {
		debugNameData = new DebugNameData(undefined, nameOrOwner, undefined);
	} else {
		debugNameData = new DebugNameData(nameOrOwner, undefined, undefined);
	}
	return new DisposableObservableValue(debugNameData, initialValue, strictEquals, debugLocation);
}

export class DisposableObservableValue<T extends IDisposable | undefined, TChange = void> extends ObservableValue<T, TChange> implements IDisposable {
	protected override _setValue(newValue: T): void {
		if (this._value === newValue) {
			return;
		}
		if (this._value) {
			this._value.dispose();
		}
		this._value = newValue;
	}

	public dispose(): void {
		this._value?.dispose();
	}
}
