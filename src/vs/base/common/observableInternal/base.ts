/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, onUnexpectedError } from './commonFacade/deps.js';

/**
 * Represents an observable value.
 *
 * @template T The type of the values the observable can hold.
 */
// This interface exists so that, for example for string observables,
// typescript renders the type as `IObservable<string>` instead of `IObservable<string, unknown>`.
export interface IObservable<T> extends IObservableWithChange<T, unknown> { }

/**
 * Represents an observable value.
 *
 * @template T The type of the values the observable can hold.
 * @template TChange The type used to describe value changes
 * (usually `void` and only used in advanced scenarios).
 * While observers can miss temporary values of an observable,
 * they will receive all change values (as long as they are subscribed)!
 */
export interface IObservableWithChange<T, TChange = unknown> {
	/**
	 * Returns the current value.
	 *
	 * Calls {@link IObserver.handleChange} if the observable notices that the value changed.
	 * Must not be called from {@link IObserver.handleChange}!
	 */
	get(): T;

	/**
	 * Forces the observable to check for changes and report them.
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

	// #region These members have a standard implementation and are only part of the interface for convenience.

	/**
	 * Reads the current value and subscribes the reader to this observable.
	 *
	 * Calls {@link IReader.readObservable} if a reader is given, otherwise {@link IObservable.get}
	 * (see {@link ConvenientObservable.read} for the implementation).
	 */
	read(reader: IReader | undefined): T;

	/**
	 * Makes sure this value is computed eagerly.
	 */
	recomputeInitiallyAndOnChange(store: DisposableStore, handleValue?: (value: T) => void): IObservable<T>;

	/**
	 * Makes sure this value is cached.
	 */
	keepObserved(store: DisposableStore): IObservable<T>;

	/**
	 * Creates a derived observable that depends on this observable.
	 * Use the reader to read other observables
	 * (see {@link ConvenientObservable.map} for the implementation).
	 */
	map<TNew>(fn: (value: T, reader: IReader) => TNew): IObservable<TNew>;
	map<TNew>(owner: object, fn: (value: T, reader: IReader) => TNew): IObservable<TNew>;

	flatten<TNew>(this: IObservable<IObservable<TNew>>): IObservable<TNew>;

	/**
	 * ONLY FOR DEBUGGING!
	 * Logs computations of this derived.
	*/
	log(): IObservableWithChange<T, TChange>;

	/**
	 * A human-readable name for debugging purposes.
	 */
	readonly debugName: string;

	/**
	 * This property captures the type of the change object. Do not use it at runtime!
	 */
	readonly TChange: TChange;

	// #endregion
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
	 * Implementations must not get/read the value of other observables, as they might not have received this event yet!
	 * The method {@link IObservable.reportChanges} can be used to force the observable to report the changes.
	 */
	beginUpdate<T>(observable: IObservable<T>): void;

	/**
	 * Signals that the transaction that potentially modified the given observable ended.
	 * This is a good place to react to (potential) changes.
	 */
	endUpdate<T>(observable: IObservable<T>): void;

	/**
	 * Signals that the given observable might have changed.
	 * The method {@link IObservable.reportChanges} can be used to force the observable to report the changes.
	 *
	 * Implementations must not get/read the value of other observables, as they might not have received this event yet!
	 * The change should be processed lazily or in {@link IObserver.endUpdate}.
	 */
	handlePossibleChange<T>(observable: IObservable<T>): void;

	/**
	 * Signals that the given {@link observable} changed.
	 *
	 * Implementations must not get/read the value of other observables, as they might not have received this event yet!
	 * The change should be processed lazily or in {@link IObserver.endUpdate}.
	 *
	 * @param change Indicates how or why the value changed.
	 */
	handleChange<T, TChange>(observable: IObservableWithChange<T, TChange>, change: TChange): void;
}

export interface IReader {
	/**
	 * Reads the value of an observable and subscribes to it.
	 */
	readObservable<T>(observable: IObservableWithChange<T, any>): T;
}

export interface ISettable<T, TChange = void> {
	/**
	 * Sets the value of the observable.
	 * Use a transaction to batch multiple changes (with a transaction, observers only react at the end of the transaction).
	 *
	 * @param transaction When given, value changes are handled on demand or when the transaction ends.
	 * @param change Describes how or why the value changed.
	 */
	set(value: T, transaction: ITransaction | undefined, change: TChange): void;
}

export interface ITransaction {
	/**
	 * Calls {@link Observer.beginUpdate} immediately
	 * and {@link Observer.endUpdate} when the transaction ends.
	 */
	updateObserver(observer: IObserver, observable: IObservableWithChange<any, any>): void;
}

/**
 * This function is used to indicate that the caller recovered from an error that indicates a bug.
*/
export function handleBugIndicatingErrorRecovery(message: string) {
	const err = new Error('BugIndicatingErrorRecovery: ' + message);
	onUnexpectedError(err);
	console.error('recovered from an error that indicates a bug', err);
}

/**
 * A settable observable.
 */
export interface ISettableObservable<T, TChange = void> extends IObservableWithChange<T, TChange>, ISettable<T, TChange> {
}

export interface IReaderWithStore extends IReader {
	/**
	 * Items in this store get disposed just before the observable recomputes/reruns or when it becomes unobserved.
	*/
	get store(): DisposableStore;

	/**
	 * Items in this store get disposed just after the observable recomputes/reruns or when it becomes unobserved.
	 * This is important if the current run needs the undisposed result from the last run.
	 *
	 * Warning: Items in this store might still get disposed before dependents (that read the now disposed value in the past) are recomputed with the new (undisposed) value!
	 * A clean solution for this is ref counting.
	*/
	get delayedStore(): DisposableStore;
}
