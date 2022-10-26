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

export class AutorunObserver implements IObserver, IReader, IDisposable {
	public needsToRun = true;
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

	public subscribeTo<T>(observable: IObservable<T>) {
		// In case the run action disposes the autorun
		if (this.disposed) {
			return;
		}
		this._dependencies.add(observable);
		if (!this.staleDependencies.delete(observable)) {
			observable.addObserver(this);
		}
	}

	public handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		const shouldReact = this._handleChange ? this._handleChange({
			changedObservable: observable,
			change,
			didChange: o => o === observable as any,
		}) : true;
		this.needsToRun = this.needsToRun || shouldReact;

		if (this.updateCount === 0) {
			this.runIfNeeded();
		}
	}

	public beginUpdate(): void {
		this.updateCount++;
	}

	public endUpdate(): void {
		this.updateCount--;
		if (this.updateCount === 0) {
			this.runIfNeeded();
		}
	}

	private runIfNeeded(): void {
		if (!this.needsToRun) {
			return;
		}
		// Assert: this.staleDependencies is an empty set.
		const emptySet = this.staleDependencies;
		this.staleDependencies = this._dependencies;
		this._dependencies = emptySet;

		this.needsToRun = false;

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
