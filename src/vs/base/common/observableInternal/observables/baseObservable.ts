/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservableWithChange, IObserver, IReader, IObservable } from '../base.js';
import { DisposableStore } from '../commonFacade/deps.js';
import { DebugLocation } from '../debugLocation.js';
import { DebugOwner, getFunctionName } from '../debugName.js';
import { debugGetObservableGraph } from '../logging/debugGetDependencyGraph.js';
import { getLogger, logObservable } from '../logging/logging.js';
import type { keepObserved, recomputeInitiallyAndOnChange } from '../utils/utils.js';
import { derivedOpts } from './derived.js';

let _derived: typeof derivedOpts;
/**
 * @internal
 * This is to allow splitting files.
*/
export function _setDerivedOpts(derived: typeof _derived) {
	_derived = derived;
}

let _recomputeInitiallyAndOnChange: typeof recomputeInitiallyAndOnChange;
export function _setRecomputeInitiallyAndOnChange(recomputeInitiallyAndOnChange: typeof _recomputeInitiallyAndOnChange) {
	_recomputeInitiallyAndOnChange = recomputeInitiallyAndOnChange;
}

let _keepObserved: typeof keepObserved;
export function _setKeepObserved(keepObserved: typeof _keepObserved) {
	_keepObserved = keepObserved;
}

let _debugGetObservableGraph: typeof debugGetObservableGraph;
export function _setDebugGetObservableGraph(debugGetObservableGraph: typeof _debugGetObservableGraph) {
	_debugGetObservableGraph = debugGetObservableGraph;
}

export abstract class ConvenientObservable<T, TChange> implements IObservableWithChange<T, TChange> {
	get TChange(): TChange { return null!; }

	public abstract get(): T;

	public reportChanges(): void {
		this.get();
	}

	public abstract addObserver(observer: IObserver): void;
	public abstract removeObserver(observer: IObserver): void;

	/** @sealed */
	public read(reader: IReader | undefined): T {
		if (reader) {
			return reader.readObservable(this);
		} else {
			return this.get();
		}
	}

	/** @sealed */
	public map<TNew>(fn: (value: T, reader: IReader) => TNew): IObservable<TNew>;
	public map<TNew>(owner: DebugOwner, fn: (value: T, reader: IReader) => TNew): IObservable<TNew>;
	public map<TNew>(fnOrOwner: DebugOwner | ((value: T, reader: IReader) => TNew), fnOrUndefined?: (value: T, reader: IReader) => TNew, debugLocation: DebugLocation = DebugLocation.ofCaller()): IObservable<TNew> {
		const owner = fnOrUndefined === undefined ? undefined : fnOrOwner as DebugOwner;
		const fn = fnOrUndefined === undefined ? fnOrOwner as (value: T, reader: IReader) => TNew : fnOrUndefined;

		return _derived(
			{
				owner,
				debugName: () => {
					const name = getFunctionName(fn);
					if (name !== undefined) {
						return name;
					}

					// regexp to match `x => x.y` or `x => x?.y` where x and y can be arbitrary identifiers (uses backref):
					const regexp = /^\s*\(?\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*\)?\s*=>\s*\1(?:\??)\.([a-zA-Z_$][a-zA-Z_$0-9]*)\s*$/;
					const match = regexp.exec(fn.toString());
					if (match) {
						return `${this.debugName}.${match[2]}`;
					}
					if (!owner) {
						return `${this.debugName} (mapped)`;
					}
					return undefined;
				},
				debugReferenceFn: fn,
			},
			(reader) => fn(this.read(reader), reader),
			debugLocation,
		);
	}

	public abstract log(): IObservableWithChange<T, TChange>;

	/**
	 * @sealed
	 * Converts an observable of an observable value into a direct observable of the value.
	*/
	public flatten<TNew>(this: IObservable<IObservableWithChange<TNew, any>>): IObservable<TNew> {
		return _derived(
			{
				owner: undefined,
				debugName: () => `${this.debugName} (flattened)`,
			},
			(reader) => this.read(reader).read(reader)
		);
	}

	public recomputeInitiallyAndOnChange(store: DisposableStore, handleValue?: (value: T) => void): IObservable<T> {
		store.add(_recomputeInitiallyAndOnChange!(this, handleValue));
		return this;
	}

	/**
	 * Ensures that this observable is observed. This keeps the cache alive.
	 * However, in case of deriveds, it does not force eager evaluation (only when the value is read/get).
	 * Use `recomputeInitiallyAndOnChange` for eager evaluation.
	 */
	public keepObserved(store: DisposableStore): IObservable<T> {
		store.add(_keepObserved!(this));
		return this;
	}

	public abstract get debugName(): string;

	protected get debugValue() {
		return this.get();
	}

	get debug(): DebugHelper {
		return new DebugHelper(this);
	}
}

class DebugHelper {
	constructor(public readonly observable: IObservableWithChange<any, any>) {
	}

	getDependencyGraph(): string {
		return _debugGetObservableGraph(this.observable, { type: 'dependencies' });
	}

	getObserverGraph(): string {
		return _debugGetObservableGraph(this.observable, { type: 'observers' });
	}
}

export abstract class BaseObservable<T, TChange = void> extends ConvenientObservable<T, TChange> {
	protected readonly _observers = new Set<IObserver>();

	constructor(debugLocation: DebugLocation) {
		super();
		getLogger()?.handleObservableCreated(this, debugLocation);
	}

	public addObserver(observer: IObserver): void {
		const len = this._observers.size;
		this._observers.add(observer);
		if (len === 0) {
			this.onFirstObserverAdded();
		}
		if (len !== this._observers.size) {
			getLogger()?.handleOnListenerCountChanged(this, this._observers.size);
		}
	}

	public removeObserver(observer: IObserver): void {
		const deleted = this._observers.delete(observer);
		if (deleted && this._observers.size === 0) {
			this.onLastObserverRemoved();
		}
		if (deleted) {
			getLogger()?.handleOnListenerCountChanged(this, this._observers.size);
		}
	}

	protected onFirstObserverAdded(): void { }
	protected onLastObserverRemoved(): void { }

	public override log(): IObservableWithChange<T, TChange> {
		const hadLogger = !!getLogger();
		logObservable(this);
		if (!hadLogger) {
			getLogger()?.handleObservableCreated(this, DebugLocation.ofCaller());
		}
		return this;
	}

	public debugGetObservers() {
		return this._observers;
	}
}
