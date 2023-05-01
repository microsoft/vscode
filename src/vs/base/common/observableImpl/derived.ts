/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { IReader, IObservable, BaseObservable, IObserver, _setDerived } from 'vs/base/common/observableImpl/base';
import { getLogger } from 'vs/base/common/observableImpl/logging';

export function derived<T>(debugName: string | (() => string), computeFn: (reader: IReader) => T): IObservable<T> {
	return new Derived(debugName, computeFn);
}

_setDerived(derived);

const enum DerivedState {
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

export class Derived<T> extends BaseObservable<T, void> implements IReader, IObserver {
	private state = DerivedState.initial;
	private value: T | undefined = undefined;
	private updateCount = 0;
	private dependencies = new Set<IObservable<any>>();
	private dependenciesToBeRemoved = new Set<IObservable<any>>();

	public override get debugName(): string {
		return typeof this._debugName === 'function' ? this._debugName() : this._debugName;
	}

	constructor(
		private readonly _debugName: string | (() => string),
		private readonly computeFn: (reader: IReader) => T
	) {
		super();

		getLogger()?.handleDerivedCreated(this);
	}

	protected override onLastObserverRemoved(): void {
		/**
		 * We are not tracking changes anymore, thus we have to assume
		 * that our cache is invalid.
		 */
		this.state = DerivedState.initial;
		this.value = undefined;
		for (const d of this.dependencies) {
			d.removeObserver(this);
		}
		this.dependencies.clear();
	}

	public override get(): T {
		if (this.observers.size === 0) {
			// Without observers, we don't know when to clean up stuff.
			// Thus, we don't cache anything to prevent memory leaks.
			const result = this.computeFn(this);
			// Clear new dependencies
			this.onLastObserverRemoved();
			return result;
		} else {
			do {
				if (this.state === DerivedState.dependenciesMightHaveChanged) {
					// We might not get a notification for a dependency that changed while it is updating,
					// thus we also have to ask all our depedencies if they changed in this case.
					this.state = DerivedState.upToDate;

					for (const d of this.dependencies) {
						/** might call {@link handleChange} indirectly, which could invalidate us */
						d.reportChanges();

						if (this.state as DerivedState === DerivedState.stale) {
							// The other dependencies will refresh on demand, so early break
							break;
						}
					}
				}

				this._recomputeIfNeeded();
				// In case recomputation changed one of our dependencies, we need to recompute again.
			} while (this.state !== DerivedState.upToDate);
			return this.value!;
		}
	}

	private _recomputeIfNeeded() {
		if (this.state === DerivedState.upToDate) {
			return;
		}
		const emptySet = this.dependenciesToBeRemoved;
		this.dependenciesToBeRemoved = this.dependencies;
		this.dependencies = emptySet;

		const hadValue = this.state !== DerivedState.initial;
		const oldValue = this.value;
		this.state = DerivedState.upToDate;

		try {
			/** might call {@link handleChange} indirectly, which could invalidate us */
			this.value = this.computeFn(this);
		} finally {
			// We don't want our observed observables to think that they are (not even temporarily) not being observed.
			// Thus, we only unsubscribe from observables that are definitely not read anymore.
			for (const o of this.dependenciesToBeRemoved) {
				o.removeObserver(this);
			}
			this.dependenciesToBeRemoved.clear();
		}

		const didChange = hadValue && oldValue !== this.value;

		getLogger()?.handleDerivedRecomputed(this, {
			oldValue,
			newValue: this.value,
			change: undefined,
			didChange
		});

		if (didChange) {
			for (const r of this.observers) {
				r.handleChange(this, undefined);
			}
		}
	}

	public override toString(): string {
		return `LazyDerived<${this.debugName}>`;
	}

	// IObserver Implementation
	public beginUpdate(): void {
		this.updateCount++;
		const propagateBeginUpdate = this.updateCount === 1;
		if (this.state === DerivedState.upToDate) {
			this.state = DerivedState.dependenciesMightHaveChanged;
			// If we propagate begin update, that will already signal a possible change.
			if (!propagateBeginUpdate) {
				for (const r of this.observers) {
					r.handlePossibleChange(this);
				}
			}
		}
		if (propagateBeginUpdate) {
			for (const r of this.observers) {
				r.beginUpdate(this); // This signals a possible change
			}
		}
	}

	public endUpdate(): void {
		this.updateCount--;
		if (this.updateCount === 0) {
			// End update could change the observer list.
			const observers = [...this.observers];
			for (const r of observers) {
				r.endUpdate(this);
			}
		}
		if (this.updateCount < 0) {
			throw new BugIndicatingError();
		}
	}

	public handlePossibleChange<T>(observable: IObservable<T, unknown>): void {
		// In all other states, observers already know that we might have changed.
		if (this.state === DerivedState.upToDate && this.dependencies.has(observable)) {
			this.state = DerivedState.dependenciesMightHaveChanged;
			for (const r of this.observers) {
				r.handlePossibleChange(this);
			}
		}
	}

	public handleChange<T, TChange>(observable: IObservable<T, TChange>, _change: TChange): void {
		const isUpToDate = this.state === DerivedState.upToDate;
		if ((this.state === DerivedState.dependenciesMightHaveChanged || isUpToDate) && this.dependencies.has(observable)) {
			this.state = DerivedState.stale;
			if (isUpToDate) {
				for (const r of this.observers) {
					r.handlePossibleChange(this);
				}
			}
		}
	}

	// IReader Implementation
	public readObservable<T>(observable: IObservable<T>): T {
		// Subscribe before getting the value to enable caching
		observable.addObserver(this);
		/** This might call {@link handleChange} indirectly, which could invalidate us */
		const value = observable.get();
		// Which is why we only add the observable to the dependencies now.
		this.dependencies.add(observable);
		this.dependenciesToBeRemoved.delete(observable);
		return value;
	}
}
