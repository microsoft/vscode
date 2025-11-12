/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../reactions/autorun.js';
import { IObservable, IObservableWithChange, IObserver, IReader, ITransaction } from '../base.js';
import { transaction } from '../transaction.js';
import { observableValue } from '../observables/observableValue.js';
import { DebugOwner } from '../debugName.js';
import { DisposableStore, Event, IDisposable, toDisposable } from '../commonFacade/deps.js';
import { derived, derivedOpts } from '../observables/derived.js';
import { observableFromEvent } from '../observables/observableFromEvent.js';
import { observableSignal } from '../observables/observableSignal.js';
import { _setKeepObserved, _setRecomputeInitiallyAndOnChange } from '../observables/baseObservable.js';

export function observableFromPromise<T>(promise: Promise<T>): IObservable<{ value?: T }> {
	const observable = observableValue<{ value?: T }>('promiseValue', {});
	promise.then((value) => {
		observable.set({ value }, undefined);
	});
	return observable;
}

export function signalFromObservable<T>(owner: DebugOwner | undefined, observable: IObservable<T>): IObservable<void> {
	return derivedOpts({
		owner,
		equalsFn: () => false,
	}, reader => {
		observable.read(reader);
	});
}

/**
 * @deprecated Use `debouncedObservable` instead.
 */
export function debouncedObservableDeprecated<T>(observable: IObservable<T>, debounceMs: number, disposableStore: DisposableStore): IObservable<T | undefined> {
	const debouncedObservable = observableValue<T | undefined>('debounced', undefined);

	let timeout: Timeout | undefined = undefined;

	disposableStore.add(autorun(reader => {
		/** @description debounce */
		const value = observable.read(reader);

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			transaction(tx => {
				debouncedObservable.set(value, tx);
			});
		}, debounceMs);

	}));

	return debouncedObservable;
}

/**
 * Creates an observable that debounces the input observable.
 */
export function debouncedObservable<T>(observable: IObservable<T>, debounceMs: number): IObservable<T> {
	let hasValue = false;
	let lastValue: T | undefined;

	let timeout: Timeout | undefined = undefined;

	return observableFromEvent<T, void>(cb => {
		const d = autorun(reader => {
			const value = observable.read(reader);

			if (!hasValue) {
				hasValue = true;
				lastValue = value;
			} else {
				if (timeout) {
					clearTimeout(timeout);
				}
				timeout = setTimeout(() => {
					lastValue = value;
					cb();
				}, debounceMs);
			}
		});
		return {
			dispose() {
				d.dispose();
				hasValue = false;
				lastValue = undefined;
			},
		};
	}, () => {
		if (hasValue) {
			return lastValue!;
		} else {
			return observable.get();
		}
	});
}

export function wasEventTriggeredRecently(event: Event<any>, timeoutMs: number, disposableStore: DisposableStore): IObservable<boolean> {
	const observable = observableValue('triggeredRecently', false);

	let timeout: Timeout | undefined = undefined;

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
 * This makes sure the observable is being observed and keeps its cache alive.
 */
export function keepObserved<T>(observable: IObservable<T>): IDisposable {
	const o = new KeepAliveObserver(false, undefined);
	observable.addObserver(o);
	return toDisposable(() => {
		observable.removeObserver(o);
	});
}

_setKeepObserved(keepObserved);

/**
 * This converts the given observable into an autorun.
 */
export function recomputeInitiallyAndOnChange<T>(observable: IObservable<T>, handleValue?: (value: T) => void): IDisposable {
	const o = new KeepAliveObserver(true, handleValue);
	observable.addObserver(o);
	try {
		o.beginUpdate(observable);
	} finally {
		o.endUpdate(observable);
	}

	return toDisposable(() => {
		observable.removeObserver(o);
	});
}

_setRecomputeInitiallyAndOnChange(recomputeInitiallyAndOnChange);

export class KeepAliveObserver implements IObserver {
	private _counter = 0;

	constructor(
		private readonly _forceRecompute: boolean,
		private readonly _handleValue: ((value: any) => void) | undefined,
	) { }

	beginUpdate<T>(observable: IObservable<T>): void {
		this._counter++;
	}

	endUpdate<T>(observable: IObservable<T>): void {
		if (this._counter === 1 && this._forceRecompute) {
			if (this._handleValue) {
				this._handleValue(observable.get());
			} else {
				observable.reportChanges();
			}
		}
		this._counter--;
	}

	handlePossibleChange<T>(observable: IObservable<T>): void {
		// NO OP
	}

	handleChange<T, TChange>(observable: IObservableWithChange<T, TChange>, change: TChange): void {
		// NO OP
	}
}

export function derivedObservableWithCache<T>(owner: DebugOwner, computeFn: (reader: IReader, lastValue: T | undefined) => T): IObservable<T> {
	let lastValue: T | undefined = undefined;
	const observable = derivedOpts({ owner, debugReferenceFn: computeFn }, reader => {
		lastValue = computeFn(reader, lastValue);
		return lastValue;
	});
	return observable;
}

export function derivedObservableWithWritableCache<T>(owner: object, computeFn: (reader: IReader, lastValue: T | undefined) => T): IObservable<T>
	& { clearCache(transaction: ITransaction): void; setCache(newValue: T | undefined, tx: ITransaction | undefined): void } {
	let lastValue: T | undefined = undefined;
	const onChange = observableSignal('derivedObservableWithWritableCache');
	const observable = derived(owner, reader => {
		onChange.read(reader);
		lastValue = computeFn(reader, lastValue);
		return lastValue;
	});
	return Object.assign(observable, {
		clearCache: (tx: ITransaction) => {
			lastValue = undefined;
			onChange.trigger(tx);
		},
		setCache: (newValue: T | undefined, tx: ITransaction | undefined) => {
			lastValue = newValue;
			onChange.trigger(tx);
		}
	});
}

/**
 * When the items array changes, referential equal items are not mapped again.
 */
export function mapObservableArrayCached<TIn, TOut, TKey = TIn>(owner: DebugOwner, items: IObservable<readonly TIn[]>, map: (input: TIn, store: DisposableStore) => TOut, keySelector?: (input: TIn) => TKey): IObservable<readonly TOut[]> {
	let m = new ArrayMap(map, keySelector);
	const self = derivedOpts({
		debugReferenceFn: map,
		owner,
		onLastObserverRemoved: () => {
			m.dispose();
			m = new ArrayMap(map);
		}
	}, (reader) => {
		const i = items.read(reader);
		m.setItems(i);
		return m.getItems();
	});
	return self;
}

class ArrayMap<TIn, TOut, TKey> implements IDisposable {
	private readonly _cache = new Map<TKey, { out: TOut; store: DisposableStore }>();
	private _items: TOut[] = [];
	constructor(
		private readonly _map: (input: TIn, store: DisposableStore) => TOut,
		private readonly _keySelector?: (input: TIn) => TKey,
	) {
	}

	public dispose(): void {
		this._cache.forEach(entry => entry.store.dispose());
		this._cache.clear();
	}

	public setItems(items: readonly TIn[]): void {
		const newItems: TOut[] = [];
		const itemsToRemove = new Set(this._cache.keys());

		for (const item of items) {
			const key = this._keySelector ? this._keySelector(item) : item as unknown as TKey;

			let entry = this._cache.get(key);
			if (!entry) {
				const store = new DisposableStore();
				const out = this._map(item, store);
				entry = { out, store };
				this._cache.set(key, entry);
			} else {
				itemsToRemove.delete(key);
			}
			newItems.push(entry.out);
		}

		for (const item of itemsToRemove) {
			const entry = this._cache.get(item)!;
			entry.store.dispose();
			this._cache.delete(item);
		}

		this._items = newItems;
	}

	public getItems(): TOut[] {
		return this._items;
	}
}
