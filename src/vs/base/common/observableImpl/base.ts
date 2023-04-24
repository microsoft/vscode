/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import type { derived } from 'vs/base/common/observableImpl/derived';
import { getLogger } from 'vs/base/common/observableImpl/logging';

export interface IObservable<T, TChange = unknown> {
	readonly TChange: TChange;

	/**
	 * Reads the current value.
	 *
	 * Must not be called from {@link IObserver.handleChange}.
	 */
	get(): T;

	reportChanges(): void;

	addObserver(observer: IObserver): void;
	removeObserver(observer: IObserver): void;

	/**
	 * Subscribes the reader to this observable and returns the current value of this observable.
	 */
	read(reader: IReader | undefined): T;

	map<TNew>(fn: (value: T, reader: IReader) => TNew): IObservable<TNew>;

	readonly debugName: string;

	/*get isPossiblyStale(): boolean;

	get isUpdating(): boolean;*/
}

export interface IReader {
	/**
	 * Reads the value of an observable and subscribes to it.
	 *
	 * Is called by {@link IObservable.read}.
	 */
	readObservable<T>(observable: IObservable<T, any>): T;
}

export interface IObserver {
	/**
	 * Indicates that calling {@link IObservable.get} might return a different value and the observable is in updating mode.
	 * Must not be called when the given observable has already been reported to be in updating mode.
	 */
	beginUpdate<T>(observable: IObservable<T>): void;

	/**
	 * Is called by a subscribed observable when it leaves updating mode and it doesn't expect changes anymore,
	 * i.e. when a transaction for that observable is over.
	 *
	 * Call {@link IObservable.reportChanges} to learn about possible changes (if they weren't reported yet).
	 */
	endUpdate<T>(observable: IObservable<T>): void;

	handlePossibleChange<T>(observable: IObservable<T>): void;

	/**
	 * Is called by a subscribed observable immediately after it notices a change.
	 *
	 * When {@link IObservable.get} is called two times and no change was reported before the second call returns,
	 * there has been no change in between the two calls for that observable.
	 *
	 * If the update counter is zero for a subscribed observable and calling {@link IObservable.get} didn't trigger a change,
	 * subsequent calls to {@link IObservable.get} don't trigger a change either until the update counter is increased again.
	 *
	 * Implementations must not call into other observables!
	 * The change should be processed when all observed observables settled.
	 */
	handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void;
}

export interface ISettable<T, TChange = void> {
	set(value: T, transaction: ITransaction | undefined, change: TChange): void;
}

export interface ITransaction {
	/**
	 * Calls `Observer.beginUpdate` immediately
	 * and `Observer.endUpdate` when the transaction is complete.
	 */
	updateObserver(
		observer: IObserver,
		observable: IObservable<any, any>
	): void;
}

let _derived: typeof derived;
/**
 * @internal
 * This is to allow splitting files.
*/
export function _setDerived(derived: typeof _derived) {
	_derived = derived;
}

export abstract class ConvenientObservable<T, TChange> implements IObservable<T, TChange> {
	get TChange(): TChange { return null!; }

	public abstract get(): T;

	public reportChanges(): void {
		this.get();
	}

	public abstract addObserver(observer: IObserver): void;
	public abstract removeObserver(observer: IObserver): void;

	/** @sealed */
	public read(reader: IReader | undefined): T {
		if (reader) {
			return reader.readObservable(this);
		} else {
			return this.get();
		}
	}

	/** @sealed */
	public map<TNew>(fn: (value: T, reader: IReader) => TNew): IObservable<TNew> {
		return _derived(
			() => {
				const name = getFunctionName(fn);
				return name !== undefined ? name : `${this.debugName} (mapped)`;
			},
			(reader) => fn(this.read(reader), reader)
		);
	}

	public abstract get debugName(): string;
}

export abstract class BaseObservable<T, TChange = void> extends ConvenientObservable<T, TChange> {
	protected readonly observers = new Set<IObserver>();

	/** @sealed */
	public addObserver(observer: IObserver): void {
		const len = this.observers.size;
		this.observers.add(observer);
		if (len === 0) {
			this.onFirstObserverAdded();
		}
	}

	/** @sealed */
	public removeObserver(observer: IObserver): void {
		const deleted = this.observers.delete(observer);
		if (deleted && this.observers.size === 0) {
			this.onLastObserverRemoved();
		}
	}

	protected onFirstObserverAdded(): void { }
	protected onLastObserverRemoved(): void { }
}

export function transaction(fn: (tx: ITransaction) => void, getDebugName?: () => string): void {
	const tx = new TransactionImpl(fn, getDebugName);
	try {
		getLogger()?.handleBeginTransaction(tx);
		fn(tx);
	} finally {
		tx.finish();
		getLogger()?.handleEndTransaction();
	}
}

export class TransactionImpl implements ITransaction {
	private updatingObservers: { observer: IObserver; observable: IObservable<any> }[] | null = [];

	constructor(private readonly fn: Function, private readonly _getDebugName?: () => string) { }

	public getDebugName(): string | undefined {
		if (this._getDebugName) {
			return this._getDebugName();
		}
		return getFunctionName(this.fn);
	}

	public updateObserver(observer: IObserver, observable: IObservable<any>): void {
		this.updatingObservers!.push({ observer, observable });
		observer.beginUpdate(observable);
	}

	public finish(): void {
		const updatingObservers = this.updatingObservers!;
		// Prevent anyone from updating observers from now on.
		this.updatingObservers = null;
		for (const { observer, observable } of updatingObservers) {
			observer.endUpdate(observable);
		}
	}
}

export function getFunctionName(fn: Function): string | undefined {
	const fnSrc = fn.toString();
	// Pattern: /** @description ... */
	const regexp = /\/\*\*\s*@description\s*([^*]*)\*\//;
	const match = regexp.exec(fnSrc);
	const result = match ? match[1] : undefined;
	return result?.trim();
}

export interface ISettableObservable<T, TChange = void> extends IObservable<T, TChange>, ISettable<T, TChange> {
}

export function observableValue<T, TChange = void>(name: string, initialValue: T): ISettableObservable<T, TChange> {
	return new ObservableValue(name, initialValue);
}

export class ObservableValue<T, TChange = void>
	extends BaseObservable<T, TChange>
	implements ISettableObservable<T, TChange>
{
	protected _value: T;

	constructor(public readonly debugName: string, initialValue: T) {
		super();
		this._value = initialValue;
	}
	public get(): T {
		return this._value;
	}

	public set(value: T, tx: ITransaction | undefined, change: TChange): void {
		if (this._value === value) {
			return;
		}

		let _tx: TransactionImpl | undefined;
		if (!tx) {
			tx = _tx = new TransactionImpl(() => { }, () => `Setting ${this.debugName}`);
		}
		try {
			const oldValue = this._value;
			this._setValue(value);
			getLogger()?.handleObservableChanged(this, { oldValue, newValue: value, change, didChange: true });

			for (const observer of this.observers) {
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
}

export function disposableObservableValue<T extends IDisposable | undefined, TChange = void>(name: string, initialValue: T): ISettableObservable<T, TChange> & IDisposable {
	return new DisposableObservableValue(name, initialValue);
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
