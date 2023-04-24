/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IReader, IObservable, IObserver } from 'vs/base/common/observableImpl/base';
import { getLogger } from 'vs/base/common/observableImpl/logging';

export function autorun(debugName: string, fn: (reader: IReader) => void): IDisposable {
	return new AutorunObserver(debugName, fn, undefined);
}

interface IChangeContext {
	readonly changedObservable: IObservable<any, any>;
	readonly change: unknown;

	didChange<T, TChange>(observable: IObservable<T, TChange>): this is { change: TChange };
}

export function autorunHandleChanges(
	debugName: string,
	options: {
		/**
		 * Returns if this change should cause a re-run of the autorun.
		*/
		handleChange: (context: IChangeContext) => boolean;
	},
	fn: (reader: IReader) => void
): IDisposable {
	return new AutorunObserver(debugName, fn, options.handleChange);
}

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

export class AutorunObserver implements IObserver, IReader, IDisposable {
	private state = AutorunState.stale;
	private updateCount = 0;
	private disposed = false;

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
		public readonly debugName: string,
		private readonly runFn: (reader: IReader) => void,
		private readonly _handleChange: ((context: IChangeContext) => boolean) | undefined
	) {
		getLogger()?.handleAutorunCreated(this);
		this.runIfNeeded();
	}

	public readObservable<T>(observable: IObservable<T>): T {
		// In case the run action disposes the autorun
		if (this.disposed) {
			return observable.get();
		}

		observable.addObserver(this);
		const value = observable.get();
		this._dependencies.add(observable);
		this.staleDependencies.delete(observable);
		return value;
	}

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
					for (const d of this._dependencies) {
						d.reportChanges();
						if (this.state as AutorunState === AutorunState.stale) {
							// The other dependencies will refresh on demand
							break;
						}
					}
				}

				this.runIfNeeded();
			} while (this.state !== AutorunState.upToDate);
		}
		this.updateCount--;
	}

	public handlePossibleChange(observable: IObservable<any>): void {
		if (this.state === AutorunState.upToDate && this.dependencies.has(observable)) {
			this.state = AutorunState.dependenciesMightHaveChanged;
		}
	}

	public handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		if (this.dependencies.has(observable)) {
			const shouldReact = this._handleChange ? this._handleChange({
				changedObservable: observable,
				change,
				didChange: o => o === observable as any,
			}) : true;
			if (shouldReact) {
				this.state = AutorunState.stale;
			}
		}
	}

	private runIfNeeded() {
		if (this.state === AutorunState.upToDate) {
			return;
		}

		// Assert: this.staleDependencies is an empty set.
		const emptySet = this.staleDependencies;
		this.staleDependencies = this._dependencies;
		this._dependencies = emptySet;

		this.state = AutorunState.upToDate;

		getLogger()?.handleAutorunTriggered(this);

		try {
			this.runFn(this);
		} finally {
			// We don't want our observed observables to think that they are (not even temporarily) not being observed.
			// Thus, we only unsubscribe from observables that are definitely not read anymore.
			for (const o of this.staleDependencies) {
				o.removeObserver(this);
			}
			this.staleDependencies.clear();
		}
	}

	public dispose(): void {
		this.disposed = true;
		for (const o of this._dependencies) {
			o.removeObserver(this);
		}
		this._dependencies.clear();
	}

	public toString(): string {
		return `Autorun<${this.debugName}>`;
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
