/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import type { derived } from 'vs/base/common/observableImpl/derived';
import { getLogger } from 'vs/base/common/observableImpl/logging';

/**
 * Represents an observable value.
 * @template T The type of the value.
 * @template TChange The type of delta information (usually `void` and only used in advanced scenarios).
 */
export interface IObservable<T, TChange = unknown> {
	/**
	 * Returns the current value.
	 *
	 * Calls {@link IObserver.handleChange} if the observable notices that the value changed.
	 * Must not be called from {@link IObserver.handleChange}!
	 */
	get(): T;

	/**
	 * Forces the observable to check for and report changes.
	 *
	 * Has the same effect as calling {@link IObservable.get}, but does not force the observable
	 * to actually construct the value, e.g. if change deltas are used.
	 * Calls {@link IObserver.handleChange} if the observable notices that the value changed.
	 * Must not be called from {@link IObserver.handleChange}!
	 */
	reportChanges(): void;

	/**
	 * Adds the observer to the set of subscribed observers.
	 * This method is idempotent.
	 */
	addObserver(observer: IObserver): void;

	/**
	 * Removes the observer from the set of subscribed observers.
	 * This method is idempotent.
	 */
	removeObserver(observer: IObserver): void;

	/**
	 * Reads the current value and subscribes to this observable.
	 *
	 * Just calls {@link IReader.readObservable} if a reader is given, otherwise {@link IObservable.get}
	 * (see {@link ConvenientObservable.read}).
	 */
	read(reader: IReader | undefined): T;

	/**
	 * Creates a derived observable that depends on this observable.
	 * Use the reader to read other observables
	 * (see {@link ConvenientObservable.map}).
	 */
	map<TNew>(fn: (value: T, reader: IReader) => TNew): IObservable<TNew>;

	/**
	 * A human-readable name for debugging purposes.
	 */
	readonly debugName: string;

	/**
	 * This property captures the type of the change object. Do not use it at runtime!
	 */
	readonly TChange: TChange;
}

export interface IReader {
	/**
	 * Reads the value of an observable and subscribes to it.
	 */
	readObservable<T>(observable: IObservable<T, any>): T;
}

/**
 * Represents an observer that can be subscribed to an observable.
 *
 * If an observer is subscribed to an observable and that observable didn't signal
 * a change through one of the observer methods, the observer can assume that the
 * observable didn't change.
 * If an observable reported a possible change, {@link IObservable.reportChanges} forces
 * the observable to report an actual change if there was one.
 */
export interface IObserver {
	/**
	 * Signals that the given observable might have changed and a transaction potentially modifying that observable started.
	 * Before the given observable can call this method again, is must call {@link IObserver.endUpdate}.
	 *
	 * The method {@link IObservable.reportChanges} can be used to force the observable to report the changes.
	 */
	beginUpdate<T>(observable: IObservable<T>): void;

	/**
	 * Signals that the transaction that potentially modified the given observable ended.
	 */
	endUpdate<T>(observable: IObservable<T>): void;

	/**
	 * Signals that the given observable might have changed.
	 * The method {@link IObservable.reportChanges} can be used to force the observable to report the changes.
	 *
	 * Implementations must not call into other observables, as they might not have received this event yet!
	 * The change should be processed lazily or in {@link IObserver.endUpdate}.
	 */
	handlePossibleChange<T>(observable: IObservable<T>): void;

	/**
	 * Signals that the given observable changed.
	 *
	 * Implementations must not call into other observables, as they might not have received this event yet!
	 * The change should be processed lazily or in {@link IObserver.endUpdate}.
	 */
	handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void;
}

export interface ISettable<T, TChange = void> {
	set(value: T, transaction: ITransaction | undefined, change: TChange): void;
}

export interface ITransaction {
	/**
	 * Calls {@link Observer.beginUpdate} immediately
	 * and {@link Observer.endUpdate} when the transaction ends.
	 */
	updateObserver(observer: IObserver, observable: IObservable<any, any>): void;
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

	public addObserver(observer: IObserver): void {
		const len = this.observers.size;
		this.observers.add(observer);
		if (len === 0) {
			this.onFirstObserverAdded();
		}
	}

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

export function subtransaction(tx: ITransaction | undefined, fn: (tx: ITransaction) => void, getDebugName?: () => string): void {
	if (!tx) {
		transaction(fn, getDebugName);
	} else {
		fn(tx);
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

/**
 * Creates an observable value.
 * Observers get informed when the value changes.
 */
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

export interface IChangeContext {
	readonly changedObservable: IObservable<any, any>;
	readonly change: unknown;

	didChange<T, TChange>(observable: IObservable<T, TChange>): this is { change: TChange };
}

export interface IChangeTracker {
	/**
	 * Returns if this change should cause an invalidation.
	 * Can record the changes to just process deltas.
	*/
	handleChange(context: IChangeContext): boolean;
}
