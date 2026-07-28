/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReaderWithStore, IReader, IObservable, ISettableObservable } from '../base.js';
import { IChangeTracker } from '../changeTracker.js';
import { DisposableStore, IDisposable, toDisposable } from '../commonFacade/deps.js';
import { DebugNameData, IDebugNameData } from '../debugName.js';
import { AutorunObserver } from './autorunImpl.js';
import { DebugLocation } from '../debugLocation.js';
import { observableValue } from '../observables/observableValue.js';
import { transaction } from '../transaction.js';

/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 */
export function autorun(fn: (reader: IReaderWithStore) => void, debugLocation = DebugLocation.ofCaller()): IDisposable {
	return new AutorunObserver(
		new DebugNameData(undefined, undefined, fn),
		fn,
		undefined,
		debugLocation
	);
}

/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 */
export function autorunOpts(options: IDebugNameData & {}, fn: (reader: IReaderWithStore) => void, debugLocation = DebugLocation.ofCaller()): IDisposable {
	return new AutorunObserver(
		new DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? fn),
		fn,
		undefined,
		debugLocation
	);
}

/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 *
 * Use `changeTracker.createChangeSummary` to create a "change summary" that can collect the changes.
 * Use `changeTracker.handleChange` to add a reported change to the change summary.
 * The run function is given the last change summary.
 * The change summary is discarded after the run function was called.
 *
 * @see autorun
 */
export function autorunHandleChanges<TChangeSummary>(
	options: IDebugNameData & {
		changeTracker: IChangeTracker<TChangeSummary>;
	},
	fn: (reader: IReader, changeSummary: TChangeSummary) => void,
	debugLocation = DebugLocation.ofCaller()
): IDisposable {
	return new AutorunObserver(
		new DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? fn),
		fn,
		options.changeTracker,
		debugLocation
	);
}

/**
 * @see autorunHandleChanges (but with a disposable store that is cleared before the next run or on dispose)
 */
export function autorunWithStoreHandleChanges<TChangeSummary>(
	options: IDebugNameData & {
		changeTracker: IChangeTracker<TChangeSummary>;
	},
	fn: (reader: IReader, changeSummary: TChangeSummary, store: DisposableStore) => void
): IDisposable {
	const store = new DisposableStore();
	const disposable = autorunHandleChanges(
		{
			owner: options.owner,
			debugName: options.debugName,
			debugReferenceFn: options.debugReferenceFn ?? fn,
			changeTracker: options.changeTracker,
		},
		(reader, changeSummary) => {
			store.clear();
			fn(reader, changeSummary, store);
		}
	);
	return toDisposable(() => {
		disposable.dispose();
		store.dispose();
	});
}

/**
 * @see autorun (but with a disposable store that is cleared before the next run or on dispose)
 *
 * @deprecated Use `autorun(reader => { reader.store.add(...) })` instead!
 */
export function autorunWithStore(fn: (reader: IReader, store: DisposableStore) => void): IDisposable {
	const store = new DisposableStore();
	const disposable = autorunOpts(
		{
			owner: undefined,
			debugName: undefined,
			debugReferenceFn: fn,
		},
		reader => {
			store.clear();
			fn(reader, store);
		}
	);
	return toDisposable(() => {
		disposable.dispose();
		store.dispose();
	});
}

export function autorunDelta<T>(
	observable: IObservable<T>,
	handler: (args: { lastValue: T | undefined; newValue: T }) => void
): IDisposable {
	let _lastValue: T | undefined;
	return autorunOpts({ debugReferenceFn: handler }, (reader) => {
		const newValue = observable.read(reader);
		const lastValue = _lastValue;
		_lastValue = newValue;
		handler({ lastValue, newValue });
	});
}

export function autorunIterableDelta<T>(
	getValue: (reader: IReader) => Iterable<T>,
	handler: (args: { addedValues: T[]; removedValues: T[] }) => void,
	getUniqueIdentifier: (value: T) => unknown = v => v
) {
	const lastValues = new Map<unknown, T>();
	return autorunOpts({ debugReferenceFn: getValue }, (reader) => {
		const newValues = new Map();
		const removedValues = new Map(lastValues);
		for (const value of getValue(reader)) {
			const id = getUniqueIdentifier(value);
			if (lastValues.has(id)) {
				removedValues.delete(id);
			} else {
				newValues.set(id, value);
				lastValues.set(id, value);
			}
		}
		for (const id of removedValues.keys()) {
			lastValues.delete(id);
		}

		if (newValues.size || removedValues.size) {
			handler({ addedValues: [...newValues.values()], removedValues: [...removedValues.values()] });
		}
	});
}

/**
 * For each key-stable item in {@link items}, runs {@link setup} once when the
 * key is first observed and disposes the per-key {@link DisposableStore} when
 * the key is no longer present in the array (or when the returned disposable
 * is disposed).
 *
 * The {@link IObservable} handed to {@link setup} fires whenever the array
 * still contains an item with the same key but the item value itself has
 * changed (e.g. because the upstream state is immutable and produced a new
 * object with the same id). All per-key value updates triggered by a single
 * change to {@link items} are batched into one transaction, so dependent
 * autoruns observe a consistent snapshot.
 *
 * Per-key state should be stored in closures or in disposables registered
 * against the per-key {@link DisposableStore}. {@link setup} should not call
 * `.read()` on the outer {@link items} observable from its body (use the
 * provided per-key value observable, or create inner autoruns).
 */
export function autorunPerKeyedItem<TIn, TKey>(
	items: IObservable<readonly TIn[]>,
	keyFn: (input: TIn) => TKey,
	setup: (key: TKey, value: IObservable<TIn>, store: DisposableStore) => void,
	debugLocation = DebugLocation.ofCaller()
): IDisposable {
	interface ICell {
		readonly value: ISettableObservable<TIn>;
		readonly store: DisposableStore;
	}
	const cells = new Map<TKey, ICell>();
	const ar = autorunOpts({ debugReferenceFn: setup }, reader => {
		const arr = items.read(reader);
		const seen = new Set<TKey>();
		const additions: { key: TKey; cell: ICell }[] = [];
		transaction(tx => {
			for (const item of arr) {
				const key = keyFn(item);
				seen.add(key);
				const existing = cells.get(key);
				if (existing) {
					existing.value.set(item, tx);
				} else {
					const store = new DisposableStore();
					const value = observableValue<TIn>('keyedItem', item);
					const cell: ICell = { value, store };
					cells.set(key, cell);
					additions.push({ key, cell });
				}
			}
			for (const [k, cell] of cells) {
				if (!seen.has(k)) {
					cell.store.dispose();
					cells.delete(k);
				}
			}
		});
		// Setup runs after the transaction so per-key autoruns observe the
		// final cell values on their first read.
		for (const { key, cell } of additions) {
			setup(key, cell.value, cell.store);
		}
	}, debugLocation);
	return toDisposable(() => {
		ar.dispose();
		for (const cell of cells.values()) {
			cell.store.dispose();
		}
		cells.clear();
	});
}

export interface IReaderWithDispose extends IReaderWithStore, IDisposable { }

/**
 * An autorun with a `dispose()` method on its `reader` which cancels the autorun.
 * It it safe to call `dispose()` synchronously.
 * @deprecated Use autorunSelfDisposable2
 */
export function autorunSelfDisposable(fn: (reader: IReaderWithDispose) => void, debugLocation = DebugLocation.ofCaller()): IDisposable {
	let ar: IDisposable | undefined;
	let disposed = false;

	// eslint-disable-next-line prefer-const
	ar = autorun(reader => {
		fn({
			delayedStore: reader.delayedStore,
			store: reader.store,
			readObservable: reader.readObservable.bind(reader),
			dispose: () => {
				ar?.dispose();
				disposed = true;
			}
		});
	}, debugLocation);

	if (disposed) {
		ar.dispose();
	}

	return ar;
}


/**
 * An autorun with a `dispose()` method on its `reader` which cancels the autorun.
 * It it safe to call `dispose()` synchronously.
 * TODO@hediet/copilot: rename to delete autorunSelfDisposable, and rename autorunSelfDisposable2 to autorunSelfDisposable.
 */
export function registerAutorunSelfDisposable(store: DisposableStore, fn: (reader: IReaderWithDispose) => void, debugLocation = DebugLocation.ofCaller()): void {
	let ar: IDisposable | undefined;
	let disposeSync = false;

	// eslint-disable-next-line prefer-const
	ar = autorun(reader => {
		fn({
			delayedStore: reader.delayedStore,
			store: reader.store,
			readObservable: reader.readObservable.bind(reader),
			dispose: () => {
				if (!ar) {
					// dispose on first run, ar is not initialized yet.
					disposeSync = true;
				} else {
					// dispose on reaction, ar is already registered.
					store.delete(ar);
				}
			}
		});
	}, debugLocation);

	if (disposeSync) {
		ar.dispose();
	} else {
		store.add(ar);
	}
}
