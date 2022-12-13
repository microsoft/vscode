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

export class Derived<T> extends BaseObservable<T, void> implements IReader, IObserver {
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
		this.hasValue = false;
		this.hadValue = false;
		this.value = undefined;
		for (const d of this._dependencies) {
			d.removeObserver(this);
		}
		this._dependencies.clear();
	}

	public get(): T {
		if (this.observers.size === 0) {
			// Cache is not valid and don't refresh the cache.
			// Observables should not be read in non-reactive contexts.
			const result = this.computeFn(this);
			// Clear new dependencies
			this.onLastObserverRemoved();
			return result;
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
					o.removeObserver(this);
				}
				this.staleDependencies.clear();
			}

			this.hasValue = true;
			const didChange = this.hadValue && oldValue !== this.value;
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
		return this.value!;
	}

	// IObserver Implementation
	public beginUpdate(): void {
		if (this.updateCount === 0) {
			for (const r of this.observers) {
				r.beginUpdate(this);
			}
		}
		this.updateCount++;
	}

	public handleChange<T, TChange>(
		_observable: IObservable<T, TChange>,
		_change: TChange
	): void {
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

	public endUpdate(): void {
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

	// IReader Implementation
	public subscribeTo<T>(observable: IObservable<T>) {
		this._dependencies.add(observable);
		// We are already added as observer for stale dependencies.
		if (!this.staleDependencies.delete(observable)) {
			observable.addObserver(this);
		}
	}

	override toString(): string {
		return `LazyDerived<${this.debugName}>`;
	}
}
