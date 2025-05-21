/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IObservableWithChange, IObserver, IReader, IReaderWithStore } from './base.js';
import { DebugNameData, IDebugNameData } from './debugName.js';
import { assertFn, BugIndicatingError, DisposableStore, IDisposable, markAsDisposed, onBugIndicatingError, toDisposable, trackDisposable } from './commonFacade/deps.js';
import { getLogger } from './logging/logging.js';
import { IChangeTracker } from './changeTracker.js';

/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 */
export function autorun(fn: (reader: IReaderWithStore) => void): IDisposable {
	return new AutorunObserver(
		new DebugNameData(undefined, undefined, fn),
		fn,
		undefined
	);
}

/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 */
export function autorunOpts(options: IDebugNameData & {}, fn: (reader: IReaderWithStore) => void): IDisposable {
	return new AutorunObserver(
		new DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? fn),
		fn,
		undefined
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
	fn: (reader: IReader, changeSummary: TChangeSummary) => void
): IDisposable {
	return new AutorunObserver(
		new DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? fn),
		fn,
		options.changeTracker,
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
	getUniqueIdentifier: (value: T) => unknown = v => v,
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

export const enum AutorunState {
	/**
	 * A dependency could have changed.
	 * We need to explicitly ask them if at least one dependency changed.
	 */
	dependenciesMightHaveChanged = 1,

	/**
	 * A dependency changed and we need to recompute.
	 */
	stale = 2,
	upToDate = 3,
}

export class AutorunObserver<TChangeSummary = any> implements IObserver, IReaderWithStore, IDisposable {
	private _state = AutorunState.stale;
	private _updateCount = 0;
	private _disposed = false;
	private _dependencies = new Set<IObservable<any>>();
	private _dependenciesToBeRemoved = new Set<IObservable<any>>();
	private _changeSummary: TChangeSummary | undefined;
	private _isRunning = false;

	public get debugName(): string {
		return this._debugNameData.getDebugName(this) ?? '(anonymous)';
	}

	constructor(
		public readonly _debugNameData: DebugNameData,
		public readonly _runFn: (reader: IReaderWithStore, changeSummary: TChangeSummary) => void,
		private readonly _changeTracker: IChangeTracker<TChangeSummary> | undefined,
	) {
		this._changeSummary = this._changeTracker?.createChangeSummary(undefined);
		getLogger()?.handleAutorunCreated(this);
		this._run();

		trackDisposable(this);
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		for (const o of this._dependencies) {
			o.removeObserver(this); // Warning: external call!
		}
		this._dependencies.clear();

		if (this._store !== undefined) {
			this._store.dispose();
		}
		if (this._delayedStore !== undefined) {
			this._delayedStore.dispose();
		}

		getLogger()?.handleAutorunDisposed(this);
		markAsDisposed(this);
	}

	private _run() {
		const emptySet = this._dependenciesToBeRemoved;
		this._dependenciesToBeRemoved = this._dependencies;
		this._dependencies = emptySet;

		this._state = AutorunState.upToDate;

		try {
			if (!this._disposed) {
				getLogger()?.handleAutorunStarted(this);
				const changeSummary = this._changeSummary!;
				const delayedStore = this._delayedStore;
				if (delayedStore !== undefined) {
					this._delayedStore = undefined;
				}
				try {
					this._isRunning = true;
					if (this._changeTracker) {
						this._changeTracker.beforeUpdate?.(this, changeSummary);
						this._changeSummary = this._changeTracker.createChangeSummary(changeSummary); // Warning: external call!
					}
					if (this._store !== undefined) {
						this._store.dispose();
						this._store = undefined;
					}

					this._runFn(this, changeSummary); // Warning: external call!
				} catch (e) {
					onBugIndicatingError(e);
				} finally {
					this._isRunning = false;
					if (delayedStore !== undefined) {
						delayedStore.dispose();
					}
				}
			}
		} finally {
			if (!this._disposed) {
				getLogger()?.handleAutorunFinished(this);
			}
			// We don't want our observed observables to think that they are (not even temporarily) not being observed.
			// Thus, we only unsubscribe from observables that are definitely not read anymore.
			for (const o of this._dependenciesToBeRemoved) {
				o.removeObserver(this); // Warning: external call!
			}
			this._dependenciesToBeRemoved.clear();
		}
	}

	public toString(): string {
		return `Autorun<${this.debugName}>`;
	}

	// IObserver implementation
	public beginUpdate(_observable: IObservable<any>): void {
		if (this._state === AutorunState.upToDate) {
			this._state = AutorunState.dependenciesMightHaveChanged;
		}
		this._updateCount++;
	}

	public endUpdate(_observable: IObservable<any>): void {
		try {
			if (this._updateCount === 1) {
				do {
					if (this._state === AutorunState.dependenciesMightHaveChanged) {
						this._state = AutorunState.upToDate;
						for (const d of this._dependencies) {
							d.reportChanges(); // Warning: external call!
							if (this._state as AutorunState === AutorunState.stale) {
								// The other dependencies will refresh on demand
								break;
							}
						}
					}

					if (this._state !== AutorunState.upToDate) {
						this._run(); // Warning: indirect external call!
					}
				} while (this._state !== AutorunState.upToDate);
			}
		} finally {
			this._updateCount--;
		}

		assertFn(() => this._updateCount >= 0);
	}

	public handlePossibleChange(observable: IObservable<any>): void {
		if (this._state === AutorunState.upToDate && this._isDependency(observable)) {
			this._state = AutorunState.dependenciesMightHaveChanged;
		}
	}

	public handleChange<T, TChange>(observable: IObservableWithChange<T, TChange>, change: TChange): void {
		if (this._isDependency(observable)) {
			getLogger()?.handleAutorunDependencyChanged(this, observable, change);
			try {
				// Warning: external call!
				const shouldReact = this._changeTracker ? this._changeTracker.handleChange({
					changedObservable: observable,
					change,
					didChange: (o): this is any => o === observable as any,
				}, this._changeSummary!) : true;
				if (shouldReact) {
					this._state = AutorunState.stale;
				}
			} catch (e) {
				onBugIndicatingError(e);
			}
		}
	}

	private _isDependency(observable: IObservableWithChange<any, any>): boolean {
		return this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable);
	}

	// IReader implementation

	private _ensureNoRunning(): void {
		if (!this._isRunning) { throw new BugIndicatingError('The reader object cannot be used outside its compute function!'); }
	}

	public readObservable<T>(observable: IObservable<T>): T {
		this._ensureNoRunning();

		// In case the run action disposes the autorun
		if (this._disposed) {
			return observable.get(); // warning: external call!
		}

		observable.addObserver(this); // warning: external call!
		const value = observable.get(); // warning: external call!
		this._dependencies.add(observable);
		this._dependenciesToBeRemoved.delete(observable);
		return value;
	}

	private _store: DisposableStore | undefined = undefined;
	get store(): DisposableStore {
		this._ensureNoRunning();
		if (this._disposed) {
			throw new BugIndicatingError('Cannot access store after dispose');
		}

		if (this._store === undefined) {
			this._store = new DisposableStore();
		}
		return this._store;
	}

	private _delayedStore: DisposableStore | undefined = undefined;
	get delayedStore(): DisposableStore {
		this._ensureNoRunning();
		if (this._disposed) {
			throw new BugIndicatingError('Cannot access store after dispose');
		}

		if (this._delayedStore === undefined) {
			this._delayedStore = new DisposableStore();
		}
		return this._delayedStore;
	}

	public debugGetState() {
		return {
			isRunning: this._isRunning,
			updateCount: this._updateCount,
			dependencies: this._dependencies,
			state: this._state,
		};
	}

	public debugRerun(): void {
		if (!this._isRunning) {
			this._run();
		} else {
			this._state = AutorunState.stale;
		}
	}
}

export namespace autorun {
	export const Observer = AutorunObserver;
}
