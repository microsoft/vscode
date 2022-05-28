/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export interface IObservable<T> {
	/**
	 * Reads the current value.
	 *
	 * This causes a recomputation if needed.
	 * Calling this method forces changes to propagate to observers during update operations.
	 * Must not be called from {@link IObserver.handleChange}.
	 */
	get(): T;

	/**
	 * Registers an observer.
	 *
	 * Calls {@link IObserver.handleChange} immediately after a change is noticed.
	 * Might happen while someone calls {@link IObservable.get} or {@link IObservable.read}.
	 */
	subscribe(observer: IObserver): void;
	unsubscribe(observer: IObserver): void;

	/**
	 * Calls {@link IObservable.get} and then {@link IReader.handleBeforeReadObservable}.
	 */
	read(reader: IReader): T;

	map<TNew>(fn: (value: T) => TNew): IObservable<TNew>;
}

export interface IReader {
	/**
	 * Reports an observable that was read.
	 *
	 * Is called by `Observable.read`.
	 */
	handleBeforeReadObservable<T>(observable: IObservable<T>): void;
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
	handleChange<T>(observable: IObservable<T>): void;

	/**
	 * Indicates that an update operation has completed.
	 */
	endUpdate<T>(observable: IObservable<T>): void;
}

export interface ISettable<T> {
	set(value: T, transaction: ITransaction | undefined): void;
}

export interface ITransaction {
	/**
	 * Calls `Observer.beginUpdate` immediately
	 * and `Observer.endUpdate` when the transaction is complete.
	 */
	updateObserver(
		observer: IObserver,
		observable: IObservable<any>
	): void;
}

// === Base ===
export abstract class ConvenientObservable<T> implements IObservable<T> {
	public abstract get(): T;
	public abstract subscribe(observer: IObserver): void;
	public abstract unsubscribe(observer: IObserver): void;

	public read(reader: IReader): T {
		reader.handleBeforeReadObservable(this);
		return this.get();
	}

	public map<TNew>(fn: (value: T) => TNew): IObservable<TNew> {
		return new LazyDerived((reader) => fn(this.read(reader)), '(mapped)');
	}
}

export abstract class BaseObservable<T> extends ConvenientObservable<T> {
	protected readonly observers = new Set<IObserver>();

	public subscribe(observer: IObserver): void {
		const len = this.observers.size;
		this.observers.add(observer);
		if (len === 0) {
			this.onFirstObserverSubscribed();
		}
	}

	public unsubscribe(observer: IObserver): void {
		const deleted = this.observers.delete(observer);
		if (deleted && this.observers.size === 0) {
			this.onLastObserverUnsubscribed();
		}
	}

	protected onFirstObserverSubscribed(): void { }
	protected onLastObserverUnsubscribed(): void { }
}

export function transaction(fn: (tx: ITransaction) => void) {
	const tx = new TransactionImpl();
	try {
		fn(tx);
	} finally {
		tx.finish();
	}
}

class TransactionImpl implements ITransaction {
	private readonly finishActions = new Array<() => void>();

	public updateObserver(
		observer: IObserver,
		observable: IObservable<any>
	): void {
		this.finishActions.push(function () {
			observer.endUpdate(observable);
		});
		observer.beginUpdate(observable);
	}

	public finish(): void {
		for (const action of this.finishActions) {
			action();
		}
	}
}

export class ObservableValue<T>
	extends BaseObservable<T>
	implements ISettable<T>
{
	private value: T;

	constructor(initialValue: T, public readonly name: string) {
		super();
		this.value = initialValue;
	}

	public get(): T {
		return this.value;
	}

	public set(value: T, tx: ITransaction | undefined): void {
		if (this.value === value) {
			return;
		}

		if (!tx) {
			transaction((tx) => {
				this.set(value, tx);
			});
			return;
		}

		this.value = value;

		for (const observer of this.observers) {
			tx.updateObserver(observer, this);
			observer.handleChange(this);
		}
	}
}

export function constObservable<T>(value: T): IObservable<T> {
	return new ConstObservable(value);
}

class ConstObservable<T> extends ConvenientObservable<T> {
	constructor(private readonly value: T) {
		super();
	}

	public get(): T {
		return this.value;
	}
	public subscribe(observer: IObserver): void {
		// NO OP
	}
	public unsubscribe(observer: IObserver): void {
		// NO OP
	}
}

// == autorun ==
export function autorun(
	fn: (reader: IReader) => void,
	name: string
): IDisposable {
	return new AutorunObserver(fn, name);
}

export function autorunWithStore(
	fn: (reader: IReader, store: DisposableStore) => void,
	name: string
): IDisposable {
	let store = new DisposableStore();
	const disposable = autorun(
		reader => {
			store.clear();
			fn(reader, store);
		},
		name
	);
	return toDisposable(() => {
		disposable.dispose();
		store.dispose();
	});
}

export class AutorunObserver implements IObserver, IReader, IDisposable {
	public needsToRun = true;
	private updateCount = 0;

	/**
	 * The actual dependencies.
	*/
	private _dependencies = new Set<IObservable<any>>();
	public get dependencies() {
		return this._dependencies;
	}

	/**
	 * Dependencies that have to be removed when {@link runFn} ran through.
	*/
	private staleDependencies = new Set<IObservable<any>>();

	constructor(
		private readonly runFn: (reader: IReader) => void,
		public readonly name: string
	) {
		this.runIfNeeded();
	}

	public handleBeforeReadObservable<T>(observable: IObservable<T>) {
		this._dependencies.add(observable);
		if (!this.staleDependencies.delete(observable)) {
			observable.subscribe(this);
		}
	}

	public handleChange() {
		this.needsToRun = true;

		if (this.updateCount === 0) {
			this.runIfNeeded();
		}
	}

	public beginUpdate() {
		this.updateCount++;
	}

	public endUpdate() {
		this.updateCount--;
		if (this.updateCount === 0) {
			this.runIfNeeded();
		}
	}

	private runIfNeeded(): void {
		if (!this.needsToRun) {
			return;
		}
		// Assert: this.staleDependencies is an empty set.
		const emptySet = this.staleDependencies;
		this.staleDependencies = this._dependencies;
		this._dependencies = emptySet;

		this.needsToRun = false;

		try {
			this.runFn(this);
		} finally {
			// We don't want our observed observables to think that they are (not even temporarily) not being observed.
			// Thus, we only unsubscribe from observables that are definitely not read anymore.
			for (const o of this.staleDependencies) {
				o.unsubscribe(this);
			}
			this.staleDependencies.clear();
		}
	}

	public dispose() {
		for (const o of this._dependencies) {
			o.unsubscribe(this);
		}
		this._dependencies.clear();
	}
}

export namespace autorun {
	export const Observer = AutorunObserver;
}
export function autorunDelta<T>(
	name: string,
	observable: IObservable<T>,
	handler: (args: { lastValue: T | undefined; newValue: T }) => void
): IDisposable {
	let _lastValue: T | undefined;
	return autorun((reader) => {
		const newValue = observable.read(reader);
		const lastValue = _lastValue;
		_lastValue = newValue;
		handler({ lastValue, newValue });
	}, name);
}


// == Lazy Derived ==

export function derivedObservable<T>(name: string, computeFn: (reader: IReader) => T): IObservable<T> {
	return new LazyDerived(computeFn, name);
}
export class LazyDerived<T> extends ConvenientObservable<T> {
	private readonly observer: LazyDerivedObserver<T>;

	constructor(computeFn: (reader: IReader) => T, name: string) {
		super();
		this.observer = new LazyDerivedObserver(computeFn, name);
	}

	public subscribe(observer: IObserver): void {
		this.observer.subscribe(observer);
	}

	public unsubscribe(observer: IObserver): void {
		this.observer.unsubscribe(observer);
	}

	public override read(reader: IReader): T {
		return this.observer.read(reader);
	}

	public get(): T {
		return this.observer.get();
	}
}

/**
 * @internal
 */
class LazyDerivedObserver<T>
	extends BaseObservable<T>
	implements IReader, IObserver {
	private hadValue = false;
	private hasValue = false;
	private value: T | undefined = undefined;
	private updateCount = 0;

	private _dependencies = new Set<IObservable<any>>();
	public get dependencies(): ReadonlySet<IObservable<any>> {
		return this._dependencies;
	}

	/**
	 * Dependencies that have to be removed when {@link runFn} ran through.
	*/
	private staleDependencies = new Set<IObservable<any>>();

	constructor(
		private readonly computeFn: (reader: IReader) => T,
		public readonly name: string
	) {
		super();
	}

	protected override onLastObserverUnsubscribed(): void {
		/**
		 * We are not tracking changes anymore, thus we have to assume
		 * that our cache is invalid.
		*/
		this.hasValue = false;
		this.hadValue = false;
		this.value = undefined;
		for (const d of this._dependencies) {
			d.unsubscribe(this);
		}
		this._dependencies.clear();
	}

	public handleBeforeReadObservable<T>(observable: IObservable<T>) {
		this._dependencies.add(observable);
		if (!this.staleDependencies.delete(observable)) {
			observable.subscribe(this);
		}
	}

	public handleChange() {
		if (this.hasValue) {
			this.hadValue = true;
			this.hasValue = false;
		}

		// Not in transaction: Recompute & inform observers immediately
		if (this.updateCount === 0 && this.observers.size > 0) {
			this.get();
		}

		// Otherwise, recompute in `endUpdate` or on demand.
	}

	public beginUpdate() {
		if (this.updateCount === 0) {
			for (const r of this.observers) {
				r.beginUpdate(this);
			}
		}
		this.updateCount++;
	}

	public endUpdate() {
		this.updateCount--;
		if (this.updateCount === 0) {
			if (this.observers.size > 0) {
				// Propagate invalidation
				this.get();
			}

			for (const r of this.observers) {
				r.endUpdate(this);
			}
		}
	}

	public get(): T {
		if (this.observers.size === 0) {
			// Cache is not valid and don't refresh the cache.
			// Observables should not be read in non-reactive contexts.
			return this.computeFn(this);
		}

		if (this.updateCount > 0 && this.hasValue) {
			// Refresh dependencies
			for (const d of this._dependencies) {
				// Maybe `.get()` triggers `handleChange`?
				d.get();
				if (!this.hasValue) {
					// The other dependencies will refresh on demand
					break;
				}
			}
		}

		if (!this.hasValue) {
			const emptySet = this.staleDependencies;
			this.staleDependencies = this._dependencies;
			this._dependencies = emptySet;

			const oldValue = this.value;
			try {
				this.value = this.computeFn(this);
			} finally {
				// We don't want our observed observables to think that they are (not even temporarily) not being observed.
				// Thus, we only unsubscribe from observables that are definitely not read anymore.
				for (const o of this.staleDependencies) {
					o.unsubscribe(this);
				}
				this.staleDependencies.clear();
			}

			this.hasValue = true;
			if (this.hadValue && oldValue !== this.value) {
				//
				for (const r of this.observers) {
					r.handleChange(this);
				}
			}
		}
		return this.value!;
	}
}

export namespace LazyDerived {
	export const Observer = LazyDerivedObserver;
}

export function observableFromPromise<T>(promise: Promise<T>): IObservable<{ value?: T }> {
	const observable = new ObservableValue<{ value?: T }>({}, 'promiseValue');
	promise.then((value) => {
		observable.set({ value }, undefined);
	});
	return observable;
}

export function observableFromEvent<T, TArgs = unknown>(
	event: Event<TArgs>,
	getValue: (args: TArgs | undefined) => T
): IObservable<T> {
	return new FromEventObservable(event, getValue);
}

class FromEventObservable<TArgs, T> extends BaseObservable<T> {
	private value: T | undefined;
	private hasValue = false;
	private subscription: IDisposable | undefined;

	constructor(
		private readonly event: Event<TArgs>,
		private readonly getValue: (args: TArgs | undefined) => T
	) {
		super();
	}

	protected override onFirstObserverSubscribed(): void {
		this.subscription = this.event(this.handleEvent);
	}

	private readonly handleEvent = (args: TArgs | undefined) => {
		const newValue = this.getValue(args);
		if (this.value !== newValue) {
			this.value = newValue;

			if (this.hasValue) {
				transaction(tx => {
					for (const o of this.observers) {
						tx.updateObserver(o, this);
						o.handleChange(this);
					}
				});
			}
			this.hasValue = true;
		}
	};

	protected override onLastObserverUnsubscribed(): void {
		this.subscription!.dispose();
		this.subscription = undefined;
		this.hasValue = false;
		this.value = undefined;
	}

	public get(): T {
		if (this.subscription) {
			if (!this.hasValue) {
				this.handleEvent(undefined);
			}
			return this.value!;
		} else {
			// no cache, as there are no subscribers to clean it up
			return this.getValue(undefined);
		}
	}
}

export namespace observableFromEvent {
	export const Observer = FromEventObservable;
}

export function debouncedObservable<T>(observable: IObservable<T>, debounceMs: number, disposableStore: DisposableStore): IObservable<T | undefined> {
	const debouncedObservable = new ObservableValue<T | undefined>(undefined, 'debounced');

	let timeout: any = undefined;

	disposableStore.add(autorun(reader => {
		const value = observable.read(reader);

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			transaction(tx => {
				debouncedObservable.set(value, tx);
			});
		}, debounceMs);

	}, 'debounce'));

	return debouncedObservable;
}

export function wasEventTriggeredRecently(event: Event<any>, timeoutMs: number, disposableStore: DisposableStore): IObservable<boolean> {
	const observable = new ObservableValue(false, 'triggeredRecently');

	let timeout: any = undefined;

	disposableStore.add(event(() => {
		observable.set(true, undefined);

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			observable.set(false, undefined);
		}, timeoutMs);
	}));

	return observable;
}

/**
 * This ensures the observable is kept up-to-date.
 * This is useful when the observables `get` method is used.
*/
export function keepAlive(observable: IObservable<any>): IDisposable {
	return autorun(reader => {
		observable.read(reader);
	}, 'keep-alive');
}
