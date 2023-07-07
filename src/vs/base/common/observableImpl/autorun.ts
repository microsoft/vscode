/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn } from 'vs/base/common/assert';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IReader, IObservable, IObserver, IChangeContext } from 'vs/base/common/observableImpl/base';
import { getLogger } from 'vs/base/common/observableImpl/logging';

export function autorun(debugName: string, fn: (reader: IReader) => void): IDisposable {
	return new AutorunObserver(debugName, fn, undefined, undefined);
}

export function autorunHandleChanges<TChangeSummary>(
	debugName: string,
	options: {
		createEmptyChangeSummary?: () => TChangeSummary;
		handleChange: (context: IChangeContext, changeSummary: TChangeSummary) => boolean;
	},
	fn: (reader: IReader, changeSummary: TChangeSummary) => void
): IDisposable {
	return new AutorunObserver(debugName, fn, options.createEmptyChangeSummary, options.handleChange);
}

// TODO@hediet rename to autorunWithStore
export function autorunWithStore2(
	debugName: string,
	fn: (reader: IReader, store: DisposableStore) => void,
): IDisposable {
	return autorunWithStore(fn, debugName);
}

export function autorunWithStoreHandleChanges<TChangeSummary>(
	debugName: string,
	options: {
		createEmptyChangeSummary?: () => TChangeSummary;
		handleChange: (context: IChangeContext, changeSummary: TChangeSummary) => boolean;
	},
	fn: (reader: IReader, changeSummary: TChangeSummary, store: DisposableStore) => void
): IDisposable {
	const store = new DisposableStore();
	const disposable = autorunHandleChanges(
		debugName,
		{
			createEmptyChangeSummary: options.createEmptyChangeSummary,
			handleChange: options.handleChange,
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

// TODO@hediet deprecate, rename to autorunWithStoreEx
export function autorunWithStore(
	fn: (reader: IReader, store: DisposableStore) => void,
	debugName: string
): IDisposable {
	const store = new DisposableStore();
	const disposable = autorun(
		debugName,
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

const enum AutorunState {
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

export class AutorunObserver<TChangeSummary = any> implements IObserver, IReader, IDisposable {
	private state = AutorunState.stale;
	private updateCount = 0;
	private disposed = false;
	private dependencies = new Set<IObservable<any>>();
	private dependenciesToBeRemoved = new Set<IObservable<any>>();
	private changeSummary: TChangeSummary | undefined;

	constructor(
		public readonly debugName: string,
		private readonly runFn: (reader: IReader, changeSummary: TChangeSummary) => void,
		private readonly createChangeSummary: (() => TChangeSummary) | undefined,
		private readonly _handleChange: ((context: IChangeContext, summary: TChangeSummary) => boolean) | undefined,
	) {
		this.changeSummary = this.createChangeSummary?.();
		getLogger()?.handleAutorunCreated(this);
		this._runIfNeeded();
	}

	public dispose(): void {
		this.disposed = true;
		for (const o of this.dependencies) {
			o.removeObserver(this);
		}
		this.dependencies.clear();
	}

	private _runIfNeeded() {
		if (this.state === AutorunState.upToDate) {
			return;
		}

		const emptySet = this.dependenciesToBeRemoved;
		this.dependenciesToBeRemoved = this.dependencies;
		this.dependencies = emptySet;

		this.state = AutorunState.upToDate;

		getLogger()?.handleAutorunTriggered(this);

		try {
			const changeSummary = this.changeSummary!;
			this.changeSummary = this.createChangeSummary?.();
			this.runFn(this, changeSummary);
		} finally {
			// We don't want our observed observables to think that they are (not even temporarily) not being observed.
			// Thus, we only unsubscribe from observables that are definitely not read anymore.
			for (const o of this.dependenciesToBeRemoved) {
				o.removeObserver(this);
			}
			this.dependenciesToBeRemoved.clear();
		}
	}

	public toString(): string {
		return `Autorun<${this.debugName}>`;
	}

	// IObserver implementation
	public beginUpdate(): void {
		if (this.state === AutorunState.upToDate) {
			this.state = AutorunState.dependenciesMightHaveChanged;
		}
		this.updateCount++;
	}

	public endUpdate(): void {
		if (this.updateCount === 1) {
			do {
				if (this.state === AutorunState.dependenciesMightHaveChanged) {
					this.state = AutorunState.upToDate;
					for (const d of this.dependencies) {
						d.reportChanges();
						if (this.state as AutorunState === AutorunState.stale) {
							// The other dependencies will refresh on demand
							break;
						}
					}
				}

				this._runIfNeeded();
			} while (this.state !== AutorunState.upToDate);
		}
		this.updateCount--;

		assertFn(() => this.updateCount >= 0);
	}

	public handlePossibleChange(observable: IObservable<any>): void {
		if (this.state === AutorunState.upToDate && this.dependencies.has(observable) && !this.dependenciesToBeRemoved.has(observable)) {
			this.state = AutorunState.dependenciesMightHaveChanged;
		}
	}

	public handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		if (this.dependencies.has(observable) && !this.dependenciesToBeRemoved.has(observable)) {
			const shouldReact = this._handleChange ? this._handleChange({
				changedObservable: observable,
				change,
				didChange: o => o === observable as any,
			}, this.changeSummary!) : true;
			if (shouldReact) {
				this.state = AutorunState.stale;
			}
		}
	}

	// IReader implementation
	public readObservable<T>(observable: IObservable<T>): T {
		// In case the run action disposes the autorun
		if (this.disposed) {
			return observable.get();
		}

		observable.addObserver(this);
		const value = observable.get();
		this.dependencies.add(observable);
		this.dependenciesToBeRemoved.delete(observable);
		return value;
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
	return autorun(name, (reader) => {
		const newValue = observable.read(reader);
		const lastValue = _lastValue;
		_lastValue = newValue;
		handler({ lastValue, newValue });
	});
}
