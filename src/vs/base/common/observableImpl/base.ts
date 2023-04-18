/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import type { derived } from 'vs/base/common/observableImpl/derived';
import { getLogger } from 'vs/base/common/observableImpl/logging';

export interface IObservable<T, TChange = void> {
	readonly TChange: TChange;

	/**
	 * Reads the current value.
	 *
	 * Must not be called from {@link IObserver.handleChange}.
	 */
	get(): T;

	/**
	 * Adds an observer.
	 */
	addObserver(observer: IObserver): void;
	removeObserver(observer: IObserver): void;

	/**
	 * Subscribes the reader to this observable and returns the current value of this observable.
	 */
	read(reader: IReader | undefined): T;

	map<TNew>(fn: (value: T, reader: IReader) => TNew): IObservable<TNew>;

	readonly debugName: string;
}

export interface IReader {
	/**
	 * Reports an observable that was read.
	 *
	 * Is called by {@link IObservable.read}.
	 */
	subscribeTo<T>(observable: IObservable<T, any>): void;
}

export interface IObserver {
	/**
	 * Indicates that an update operation is about to begin.
	 *
	 * During an update, invariants might not hold for subscribed observables and
	 * change events might be delayed.
	 * However, all changes must be reported before all update operations are over.
	 */
	beginUpdate<T>(observable: IObservable<T>): void;

	/**
	 * Is called by a subscribed observable immediately after it notices a change.
	 *
	 * When {@link IObservable.get} returns and no change has been reported,
	 * there has been no change for that observable.
	 *
	 * Implementations must not call into other observables!
	 * The change should be processed when {@link IObserver.endUpdate} is called.
	 */
	handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void;

	/**
	 * Indicates that an update operation has completed.
	 */
	endUpdate<T>(observable: IObservable<T>): void;
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
	public abstract addObserver(observer: IObserver): void;
	public abstract removeObserver(observer: IObserver): void;

	/** @sealed */
	public read(reader: IReader | undefined): T {
		reader?.subscribeTo(this);
		return this.get();
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

export function getFunctionName(fn: Function): string | undefined {
	const fnSrc = fn.toString();
	// Pattern: /** @description ... */
	const regexp = /\/\*\*\s*@description\s*([^*]*)\*\//;
	const match = regexp.exec(fnSrc);
	const result = match ? match[1] : undefined;
	return result?.trim();
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

	public updateObserver(
		observer: IObserver,
		observable: IObservable<any>
	): void {
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

		if (!tx) {
			transaction((tx) => {
				this.set(value, tx, change);
			}, () => `Setting ${this.debugName}`);
			return;
		}

		const oldValue = this._value;
		this._setValue(value);
		getLogger()?.handleObservableChanged(this, { oldValue, newValue: value, change, didChange: true });

		for (const observer of this.observers) {
			tx.updateObserver(observer, this);
			observer.handleChange(this, change);
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
