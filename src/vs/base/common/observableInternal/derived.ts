/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IReader, IObservable, BaseObservable, IObserver, _setDerivedOpts, IChangeContext, getFunctionName, DebugNameFn, getDebugName } from 'vs/base/common/observableInternal/base';
import { getLogger } from 'vs/base/common/observableInternal/logging';

export type EqualityComparer<T> = (a: T, b: T) => boolean;
const defaultEqualityComparer: EqualityComparer<any> = (a, b) => a === b;

/**
 * Creates an observable that is derived from other observables.
 */
export function derived<T>(computeFn: (reader: IReader) => T): IObservable<T>;
export function derived<T>(owner: object, computeFn: (reader: IReader) => T): IObservable<T>;
export function derived<T>(computeFnOrOwner: ((reader: IReader) => T) | object, computeFn?: ((reader: IReader) => T) | undefined): IObservable<T> {
	if (computeFn !== undefined) {
		return new Derived(computeFnOrOwner, undefined, computeFn, undefined, undefined, undefined, defaultEqualityComparer);
	}
	return new Derived(undefined, undefined, computeFnOrOwner as any, undefined, undefined, undefined, defaultEqualityComparer);
}

export function derivedOpts<T>(
	options: {
		owner?: object;
		debugName?: string | (() => string | undefined);
		equalityComparer?: EqualityComparer<T>;
	},
	computeFn: (reader: IReader) => T
): IObservable<T> {
	return new Derived(options.owner, options.debugName, computeFn, undefined, undefined, undefined, options.equalityComparer ?? defaultEqualityComparer);
}

export function derivedHandleChanges<T, TChangeSummary>(
	options: {
		owner?: object;
		debugName?: string | (() => string);
		createEmptyChangeSummary: () => TChangeSummary;
		handleChange: (context: IChangeContext, changeSummary: TChangeSummary) => boolean;
		equalityComparer?: EqualityComparer<T>;
	},
	computeFn: (reader: IReader, changeSummary: TChangeSummary) => T
): IObservable<T> {
	return new Derived(options.owner, options.debugName, computeFn, options.createEmptyChangeSummary, options.handleChange, undefined, options.equalityComparer ?? defaultEqualityComparer);
}

export function derivedWithStore<T>(computeFn: (reader: IReader, store: DisposableStore) => T): IObservable<T>;
export function derivedWithStore<T>(owner: object, computeFn: (reader: IReader, store: DisposableStore) => T): IObservable<T>;
export function derivedWithStore<T>(computeFnOrOwner: ((reader: IReader, store: DisposableStore) => T) | object, computeFnOrUndefined?: ((reader: IReader, store: DisposableStore) => T)): IObservable<T> {
	let computeFn: (reader: IReader, store: DisposableStore) => T;
	let owner: object | undefined;
	if (computeFnOrUndefined === undefined) {
		computeFn = computeFnOrOwner as any;
		owner = undefined;
	} else {
		owner = computeFnOrOwner;
		computeFn = computeFnOrUndefined as any;
	}

	const store = new DisposableStore();
	return new Derived(
		owner,
		(() => getFunctionName(computeFn) ?? '(anonymous)'),
		r => {
			store.clear();
			return computeFn(r, store);
		}, undefined,
		undefined,
		() => store.dispose(),
		defaultEqualityComparer
	);
}

_setDerivedOpts(derived);

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

export class Derived<T, TChangeSummary = any> extends BaseObservable<T, void> implements IReader, IObserver {
	private state = DerivedState.initial;
	private value: T | undefined = undefined;
	private updateCount = 0;
	private dependencies = new Set<IObservable<any>>();
	private dependenciesToBeRemoved = new Set<IObservable<any>>();
	private changeSummary: TChangeSummary | undefined = undefined;

	public override get debugName(): string {
		return getDebugName(this._debugName, this._computeFn, this._owner, this) ?? '(anonymous)';
	}

	constructor(
		private readonly _owner: object | undefined,
		private readonly _debugName: DebugNameFn | undefined,
		public readonly _computeFn: (reader: IReader, changeSummary: TChangeSummary) => T,
		private readonly createChangeSummary: (() => TChangeSummary) | undefined,
		private readonly _handleChange: ((context: IChangeContext, summary: TChangeSummary) => boolean) | undefined,
		private readonly _handleLastObserverRemoved: (() => void) | undefined = undefined,
		private readonly _equalityComparator: EqualityComparer<T>,
	) {
		super();
		this.changeSummary = this.createChangeSummary?.();
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

		this._handleLastObserverRemoved?.();
	}

	public override get(): T {
		if (this.observers.size === 0) {
			// Without observers, we don't know when to clean up stuff.
			// Thus, we don't cache anything to prevent memory leaks.
			const result = this._computeFn(this, this.createChangeSummary?.()!);
			// Clear new dependencies
			this.onLastObserverRemoved();
			return result;
		} else {
			do {
				// We might not get a notification for a dependency that changed while it is updating,
				// thus we also have to ask all our depedencies if they changed in this case.
				if (this.state === DerivedState.dependenciesMightHaveChanged) {
					for (const d of this.dependencies) {
						/** might call {@link handleChange} indirectly, which could make us stale */
						d.reportChanges();

						if (this.state as DerivedState === DerivedState.stale) {
							// The other dependencies will refresh on demand, so early break
							break;
						}
					}
				}

				// We called report changes of all dependencies.
				// If we are still not stale, we can assume to be up to date again.
				if (this.state === DerivedState.dependenciesMightHaveChanged) {
					this.state = DerivedState.upToDate;
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

		const changeSummary = this.changeSummary!;
		this.changeSummary = this.createChangeSummary?.();
		try {
			/** might call {@link handleChange} indirectly, which could invalidate us */
			this.value = this._computeFn(this, changeSummary);
		} finally {
			// We don't want our observed observables to think that they are (not even temporarily) not being observed.
			// Thus, we only unsubscribe from observables that are definitely not read anymore.
			for (const o of this.dependenciesToBeRemoved) {
				o.removeObserver(this);
			}
			this.dependenciesToBeRemoved.clear();
		}

		const didChange = hadValue && !(this._equalityComparator(oldValue!, this.value));

		getLogger()?.handleDerivedRecomputed(this, {
			oldValue,
			newValue: this.value,
			change: undefined,
			didChange,
			hadValue,
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
	public beginUpdate<T>(_observable: IObservable<T>): void {
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

	public endUpdate<T>(_observable: IObservable<T>): void {
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
		if (this.state === DerivedState.upToDate && this.dependencies.has(observable) && !this.dependenciesToBeRemoved.has(observable)) {
			this.state = DerivedState.dependenciesMightHaveChanged;
			for (const r of this.observers) {
				r.handlePossibleChange(this);
			}
		}
	}

	public handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		if (this.dependencies.has(observable) && !this.dependenciesToBeRemoved.has(observable)) {
			const shouldReact = this._handleChange ? this._handleChange({
				changedObservable: observable,
				change,
				didChange: o => o === observable as any,
			}, this.changeSummary!) : true;
			const wasUpToDate = this.state === DerivedState.upToDate;
			if (shouldReact && (this.state === DerivedState.dependenciesMightHaveChanged || wasUpToDate)) {
				this.state = DerivedState.stale;
				if (wasUpToDate) {
					for (const r of this.observers) {
						r.handlePossibleChange(this);
					}
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

	public override addObserver(observer: IObserver): void {
		const shouldCallBeginUpdate = !this.observers.has(observer) && this.updateCount > 0;
		super.addObserver(observer);

		if (shouldCallBeginUpdate) {
			observer.beginUpdate(this);
		}
	}

	public override removeObserver(observer: IObserver): void {
		const shouldCallEndUpdate = this.observers.has(observer) && this.updateCount > 0;
		super.removeObserver(observer);

		if (shouldCallEndUpdate) {
			// Calling end update after removing the observer makes sure endUpdate cannot be called twice here.
			observer.endUpdate(this);
		}
	}
}
