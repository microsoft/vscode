/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IObservableWithChange, IObserver, IReaderWithStore, ISettableObservable, ITransaction, } from '../base.js';
import { BaseObservable } from './baseObservable.js';
import { DebugNameData } from '../debugName.js';
import { BugIndicatingError, DisposableStore, EqualityComparer, assertFn, onBugIndicatingError } from '../commonFacade/deps.js';
import { getLogger } from '../logging/logging.js';
import { IChangeTracker } from '../changeTracker.js';
import { DebugLocation } from '../debugLocation.js';

export interface IDerivedReader<TChange = void> extends IReaderWithStore {
	/**
	 * Call this to report a change delta or to force report a change, even if the new value is the same as the old value.
	*/
	reportChange(change: TChange): void;
}

export const enum DerivedState {
	/** Initial state, no previous value, recomputation needed */
	initial = 0,

	/**
	 * A dependency could have changed.
	 * We need to explicitly ask them if at least one dependency changed.
	 */
	dependenciesMightHaveChanged = 1,

	/**
	 * A dependency changed and we need to recompute.
	 * After recomputation, we need to check the previous value to see if we changed as well.
	 */
	stale = 2,

	/**
	 * No change reported, our cached value is up to date.
	 */
	upToDate = 3,
}

function derivedStateToString(state: DerivedState): string {
	switch (state) {
		case DerivedState.initial: return 'initial';
		case DerivedState.dependenciesMightHaveChanged: return 'dependenciesMightHaveChanged';
		case DerivedState.stale: return 'stale';
		case DerivedState.upToDate: return 'upToDate';
		default: return '<unknown>';
	}
}

export class Derived<T, TChangeSummary = any, TChange = void> extends BaseObservable<T, TChange> implements IDerivedReader<TChange>, IObserver {
	private _state = DerivedState.initial;
	private _value: T | undefined = undefined;
	private _updateCount = 0;
	private _dependencies = new Set<IObservable<any>>();
	private _dependenciesToBeRemoved = new Set<IObservable<any>>();
	private _changeSummary: TChangeSummary | undefined = undefined;
	private _isUpdating = false;
	private _isComputing = false;
	private _didReportChange = false;
	private _isInBeforeUpdate = false;
	private _isReaderValid = false;
	private _store: DisposableStore | undefined = undefined;
	private _delayedStore: DisposableStore | undefined = undefined;
	private _removedObserverToCallEndUpdateOn: Set<IObserver> | null = null;

	public override get debugName(): string {
		return this._debugNameData.getDebugName(this) ?? '(anonymous)';
	}

	constructor(
		public readonly _debugNameData: DebugNameData,
		public readonly _computeFn: (reader: IDerivedReader<TChange>, changeSummary: TChangeSummary) => T,
		private readonly _changeTracker: IChangeTracker<TChangeSummary> | undefined,
		private readonly _handleLastObserverRemoved: (() => void) | undefined = undefined,
		private readonly _equalityComparator: EqualityComparer<T>,
		debugLocation: DebugLocation,
	) {
		super(debugLocation);
		this._changeSummary = this._changeTracker?.createChangeSummary(undefined);
	}

	protected override onLastObserverRemoved(): void {
		/**
		 * We are not tracking changes anymore, thus we have to assume
		 * that our cache is invalid.
		 */
		this._state = DerivedState.initial;
		this._value = undefined;
		getLogger()?.handleDerivedCleared(this);
		for (const d of this._dependencies) {
			d.removeObserver(this);
		}
		this._dependencies.clear();

		if (this._store !== undefined) {
			this._store.dispose();
			this._store = undefined;
		}
		if (this._delayedStore !== undefined) {
			this._delayedStore.dispose();
			this._delayedStore = undefined;
		}

		this._handleLastObserverRemoved?.();
	}

	public override get(): T {
		const checkEnabled = false; // TODO set to true
		if (this._isComputing && checkEnabled) {
			// investigate why this fails in the diff editor!
			throw new BugIndicatingError('Cyclic deriveds are not supported yet!');
		}

		if (this._observers.size === 0) {
			let result;
			// Without observers, we don't know when to clean up stuff.
			// Thus, we don't cache anything to prevent memory leaks.
			try {
				this._isReaderValid = true;
				let changeSummary = undefined;
				if (this._changeTracker) {
					changeSummary = this._changeTracker.createChangeSummary(undefined);
					this._changeTracker.beforeUpdate?.(this, changeSummary);
				}
				result = this._computeFn(this, changeSummary!);
			} finally {
				this._isReaderValid = false;
			}
			// Clear new dependencies
			this.onLastObserverRemoved();
			return result;

		} else {
			do {
				// We might not get a notification for a dependency that changed while it is updating,
				// thus we also have to ask all our depedencies if they changed in this case.
				if (this._state === DerivedState.dependenciesMightHaveChanged) {
					for (const d of this._dependencies) {
						/** might call {@link handleChange} indirectly, which could make us stale */
						d.reportChanges();

						if (this._state as DerivedState === DerivedState.stale) {
							// The other dependencies will refresh on demand, so early break
							break;
						}
					}
				}

				// We called report changes of all dependencies.
				// If we are still not stale, we can assume to be up to date again.
				if (this._state === DerivedState.dependenciesMightHaveChanged) {
					this._state = DerivedState.upToDate;
				}

				if (this._state !== DerivedState.upToDate) {
					this._recompute();
				}
				// In case recomputation changed one of our dependencies, we need to recompute again.
			} while (this._state !== DerivedState.upToDate);
			return this._value!;
		}
	}

	private _recompute() {
		let didChange = false;
		this._isComputing = true;
		this._didReportChange = false;

		const emptySet = this._dependenciesToBeRemoved;
		this._dependenciesToBeRemoved = this._dependencies;
		this._dependencies = emptySet;

		try {
			const changeSummary = this._changeSummary!;

			this._isReaderValid = true;
			if (this._changeTracker) {
				this._isInBeforeUpdate = true;
				this._changeTracker.beforeUpdate?.(this, changeSummary);
				this._isInBeforeUpdate = false;
				this._changeSummary = this._changeTracker?.createChangeSummary(changeSummary);
			}

			const hadValue = this._state !== DerivedState.initial;
			const oldValue = this._value;
			this._state = DerivedState.upToDate;

			const delayedStore = this._delayedStore;
			if (delayedStore !== undefined) {
				this._delayedStore = undefined;
			}
			try {
				if (this._store !== undefined) {
					this._store.dispose();
					this._store = undefined;
				}
				/** might call {@link handleChange} indirectly, which could invalidate us */
				this._value = this._computeFn(this, changeSummary);

			} finally {
				this._isReaderValid = false;
				// We don't want our observed observables to think that they are (not even temporarily) not being observed.
				// Thus, we only unsubscribe from observables that are definitely not read anymore.
				for (const o of this._dependenciesToBeRemoved) {
					o.removeObserver(this);
				}
				this._dependenciesToBeRemoved.clear();

				if (delayedStore !== undefined) {
					delayedStore.dispose();
				}
			}

			didChange = this._didReportChange || (hadValue && !(this._equalityComparator(oldValue!, this._value)));

			getLogger()?.handleObservableUpdated(this, {
				oldValue,
				newValue: this._value,
				change: undefined,
				didChange,
				hadValue,
			});
		} catch (e) {
			onBugIndicatingError(e);
		}

		this._isComputing = false;

		if (!this._didReportChange && didChange) {
			for (const r of this._observers) {
				r.handleChange(this, undefined);
			}
		} else {
			this._didReportChange = false;
		}
	}

	public override toString(): string {
		return `LazyDerived<${this.debugName}>`;
	}

	// IObserver Implementation

	public beginUpdate<T>(_observable: IObservable<T>): void {
		if (this._isUpdating) {
			throw new BugIndicatingError('Cyclic deriveds are not supported yet!');
		}

		this._updateCount++;
		this._isUpdating = true;
		try {
			const propagateBeginUpdate = this._updateCount === 1;
			if (this._state === DerivedState.upToDate) {
				this._state = DerivedState.dependenciesMightHaveChanged;
				// If we propagate begin update, that will already signal a possible change.
				if (!propagateBeginUpdate) {
					for (const r of this._observers) {
						r.handlePossibleChange(this);
					}
				}
			}
			if (propagateBeginUpdate) {
				for (const r of this._observers) {
					r.beginUpdate(this); // This signals a possible change
				}
			}
		} finally {
			this._isUpdating = false;
		}
	}

	public endUpdate<T>(_observable: IObservable<T>): void {
		this._updateCount--;
		if (this._updateCount === 0) {
			// End update could change the observer list.
			const observers = [...this._observers];
			for (const r of observers) {
				r.endUpdate(this);
			}
			if (this._removedObserverToCallEndUpdateOn) {
				const observers = [...this._removedObserverToCallEndUpdateOn];
				this._removedObserverToCallEndUpdateOn = null;
				for (const r of observers) {
					r.endUpdate(this);
				}
			}
		}
		assertFn(() => this._updateCount >= 0);
	}

	public handlePossibleChange<T>(observable: IObservable<T>): void {
		// In all other states, observers already know that we might have changed.
		if (this._state === DerivedState.upToDate && this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable)) {
			this._state = DerivedState.dependenciesMightHaveChanged;
			for (const r of this._observers) {
				r.handlePossibleChange(this);
			}
		}
	}

	public handleChange<T, TChange>(observable: IObservableWithChange<T, TChange>, change: TChange): void {
		if (this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable) || this._isInBeforeUpdate) {
			getLogger()?.handleDerivedDependencyChanged(this, observable, change);

			let shouldReact = false;
			try {
				shouldReact = this._changeTracker ? this._changeTracker.handleChange({
					changedObservable: observable,
					change,
					// eslint-disable-next-line local/code-no-any-casts
					didChange: (o): this is any => o === observable as any,
				}, this._changeSummary!) : true;
			} catch (e) {
				onBugIndicatingError(e);
			}

			const wasUpToDate = this._state === DerivedState.upToDate;
			if (shouldReact && (this._state === DerivedState.dependenciesMightHaveChanged || wasUpToDate)) {
				this._state = DerivedState.stale;
				if (wasUpToDate) {
					for (const r of this._observers) {
						r.handlePossibleChange(this);
					}
				}
			}
		}
	}

	// IReader Implementation

	private _ensureReaderValid(): void {
		if (!this._isReaderValid) { throw new BugIndicatingError('The reader object cannot be used outside its compute function!'); }
	}

	public readObservable<T>(observable: IObservable<T>): T {
		this._ensureReaderValid();

		// Subscribe before getting the value to enable caching
		observable.addObserver(this);
		/** This might call {@link handleChange} indirectly, which could invalidate us */
		const value = observable.get();
		// Which is why we only add the observable to the dependencies now.
		this._dependencies.add(observable);
		this._dependenciesToBeRemoved.delete(observable);
		return value;
	}

	public reportChange(change: TChange): void {
		this._ensureReaderValid();

		this._didReportChange = true;
		// TODO add logging
		for (const r of this._observers) {
			r.handleChange(this, change);
		}
	}

	get store(): DisposableStore {
		this._ensureReaderValid();

		if (this._store === undefined) {
			this._store = new DisposableStore();
		}
		return this._store;
	}

	get delayedStore(): DisposableStore {
		this._ensureReaderValid();

		if (this._delayedStore === undefined) {
			this._delayedStore = new DisposableStore();
		}
		return this._delayedStore;
	}

	public override addObserver(observer: IObserver): void {
		const shouldCallBeginUpdate = !this._observers.has(observer) && this._updateCount > 0;
		super.addObserver(observer);

		if (shouldCallBeginUpdate) {
			if (this._removedObserverToCallEndUpdateOn && this._removedObserverToCallEndUpdateOn.has(observer)) {
				this._removedObserverToCallEndUpdateOn.delete(observer);
			} else {
				observer.beginUpdate(this);
			}
		}
	}

	public override removeObserver(observer: IObserver): void {
		if (this._observers.has(observer) && this._updateCount > 0) {
			if (!this._removedObserverToCallEndUpdateOn) {
				this._removedObserverToCallEndUpdateOn = new Set();
			}
			this._removedObserverToCallEndUpdateOn.add(observer);
		}
		super.removeObserver(observer);
	}

	public debugGetState() {
		return {
			state: this._state,
			stateStr: derivedStateToString(this._state),
			updateCount: this._updateCount,
			isComputing: this._isComputing,
			dependencies: this._dependencies,
			value: this._value,
		};
	}

	public debugSetValue(newValue: unknown) {
		// eslint-disable-next-line local/code-no-any-casts
		this._value = newValue as any;
	}

	public debugRecompute(): void {
		if (!this._isComputing) {
			this._recompute();
		} else {
			this._state = DerivedState.stale;
		}
	}

	public setValue(newValue: T, tx: ITransaction, change: TChange): void {
		this._value = newValue;
		const observers = this._observers;
		tx.updateObserver(this, this);
		for (const d of observers) {
			d.handleChange(this, change);
		}
	}
}


export class DerivedWithSetter<T, TChangeSummary = any, TOutChanges = any> extends Derived<T, TChangeSummary, TOutChanges> implements ISettableObservable<T, TOutChanges> {
	constructor(
		debugNameData: DebugNameData,
		computeFn: (reader: IDerivedReader<TOutChanges>, changeSummary: TChangeSummary) => T,
		changeTracker: IChangeTracker<TChangeSummary> | undefined,
		handleLastObserverRemoved: (() => void) | undefined = undefined,
		equalityComparator: EqualityComparer<T>,
		public readonly set: (value: T, tx: ITransaction | undefined, change: TOutChanges) => void,
		debugLocation: DebugLocation,
	) {
		super(
			debugNameData,
			computeFn,
			changeTracker,
			handleLastObserverRemoved,
			equalityComparator,
			debugLocation,
		);
	}
}
