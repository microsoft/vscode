/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	 */
	stale = 2,
	upToDate = 3,
}

export class Derived<T> extends BaseObservable<T, void> implements IReader, IObserver {
	private state = DerivedState.initial;
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
		this.state = DerivedState.stale;
		this.value = undefined;
		for (const d of this._dependencies) {
			d.removeObserver(this);
		}
		this._dependencies.clear();
	}

	public get(): T {
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

					for (const d of this._dependencies) {
						/** might call {@link handleChange} indirectly, which could invalidate us */
						d.reportChanges();

						if (this.state as DerivedState === DerivedState.stale) {
							// The other dependencies will refresh on demand, so early break
							break;
						}
					}
				}

				this._recomputeIfNeeded();
			} while (this.state !== DerivedState.upToDate);
			return this.value!;
		}
	}

	private _recomputeIfNeeded() {
		if (this.state === DerivedState.upToDate) {
			return;
		}
		const emptySet = this.staleDependencies;
		this.staleDependencies = this._dependencies;
		this._dependencies = emptySet;

		const hadValue = this.state !== DerivedState.initial;
		const oldValue = this.value;
		this.state = DerivedState.upToDate;

		try {
			/** might call {@link handleChange} indirectly, which could invalidate us */
			this.value = this.computeFn(this);
		} finally {
			// We don't want our observed observables to think that they are (not even temporarily) not being observed.
			// Thus, we only unsubscribe from observables that are definitely not read anymore.
			for (const o of this.staleDependencies) {
				o.removeObserver(this);
			}
			this.staleDependencies.clear();
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

	// IObserver Implementation
	public beginUpdate(): void {
		const prevState = this.state;
		if (this.state === DerivedState.upToDate) {
			this.state = DerivedState.dependenciesMightHaveChanged;
		}
		if (this.updateCount === 0) {
			for (const r of this.observers) {
				r.beginUpdate(this);
			}
		} else if (prevState === DerivedState.upToDate) {
			for (const r of this.observers) {
				r.handlePossibleChange(this);
			}
		}
		this.updateCount++;
	}

	public endUpdate(): void {
		this.updateCount--;
		if (this.updateCount === 0) {
			for (const r of this.observers) {
				r.endUpdate(this);
			}
		}
	}

	public handlePossibleChange<T>(observable: IObservable<T, unknown>): void {
		if (this.state === DerivedState.upToDate && this._dependencies.has(observable)) {
			// In all other states, observers already know that we might have changed.
			for (const r of this.observers) {
				r.handlePossibleChange(this);
			}
			this.state = DerivedState.dependenciesMightHaveChanged;
		}
	}

	public handleChange<T, TChange>(observable: IObservable<T, TChange>, _change: TChange): void {
		if ((this.state === DerivedState.dependenciesMightHaveChanged || this.state === DerivedState.upToDate) && this._dependencies.has(observable)) {
			const prevState = this.state;
			this.state = DerivedState.stale;

			if (prevState === DerivedState.upToDate) {
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
		this._dependencies.add(observable);
		this.staleDependencies.delete(observable);
		return value;
	}

	override toString(): string {
		return `LazyDerived<${this.debugName}>`;
	}
}
