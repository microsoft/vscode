/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observableInternal/autorun';
import { BaseObservable, ConvenientObservable, IObservable, IObserver, IReader, ITransaction, getDebugName, getFunctionName, observableValue, transaction } from 'vs/base/common/observableInternal/base';
import { derived } from 'vs/base/common/observableInternal/derived';
import { getLogger } from 'vs/base/common/observableInternal/logging';

/**
 * Represents an efficient observable whose value never changes.
 */
export function constObservable<T>(value: T): IObservable<T> {
	return new ConstObservable(value);
}

class ConstObservable<T> extends ConvenientObservable<T, void> {
	constructor(private readonly value: T) {
		super();
	}

	public override get debugName(): string {
		return this.toString();
	}

	public get(): T {
		return this.value;
	}
	public addObserver(observer: IObserver): void {
		// NO OP
	}
	public removeObserver(observer: IObserver): void {
		// NO OP
	}

	override toString(): string {
		return `Const: ${this.value}`;
	}
}


export function observableFromPromise<T>(promise: Promise<T>): IObservable<{ value?: T }> {
	const observable = observableValue<{ value?: T }>('promiseValue', {});
	promise.then((value) => {
		observable.set({ value }, undefined);
	});
	return observable;
}

export function waitForState<T, TState extends T>(observable: IObservable<T>, predicate: (state: T) => state is TState): Promise<TState>;
export function waitForState<T>(observable: IObservable<T>, predicate: (state: T) => boolean): Promise<T>;
export function waitForState<T>(observable: IObservable<T>, predicate: (state: T) => boolean): Promise<T> {
	return new Promise(resolve => {
		let didRun = false;
		let shouldDispose = false;
		const d = autorun(reader => {
			/** @description waitForState */
			const currentState = observable.read(reader);
			if (predicate(currentState)) {
				if (!didRun) {
					shouldDispose = true;
				} else {
					d.dispose();
				}
				resolve(currentState);
			}
		});
		didRun = true;
		if (shouldDispose) {
			d.dispose();
		}
	});
}

export function observableFromEvent<T, TArgs = unknown>(
	event: Event<TArgs>,
	getValue: (args: TArgs | undefined) => T
): IObservable<T> {
	return new FromEventObservable(event, getValue);
}

export class FromEventObservable<TArgs, T> extends BaseObservable<T> {
	private value: T | undefined;
	private hasValue = false;
	private subscription: IDisposable | undefined;

	constructor(
		private readonly event: Event<TArgs>,
		public readonly _getValue: (args: TArgs | undefined) => T
	) {
		super();
	}

	private getDebugName(): string | undefined {
		return getFunctionName(this._getValue);
	}

	public get debugName(): string {
		const name = this.getDebugName();
		return 'From Event' + (name ? `: ${name}` : '');
	}

	protected override onFirstObserverAdded(): void {
		this.subscription = this.event(this.handleEvent);
	}

	private readonly handleEvent = (args: TArgs | undefined) => {
		const newValue = this._getValue(args);

		const didChange = !this.hasValue || this.value !== newValue;

		getLogger()?.handleFromEventObservableTriggered(this, { oldValue: this.value, newValue, change: undefined, didChange, hadValue: this.hasValue });

		if (didChange) {
			this.value = newValue;

			if (this.hasValue) {
				transaction(
					(tx) => {
						for (const o of this.observers) {
							tx.updateObserver(o, this);
							o.handleChange(this, undefined);
						}
					},
					() => {
						const name = this.getDebugName();
						return 'Event fired' + (name ? `: ${name}` : '');
					}
				);
			}
			this.hasValue = true;
		}
	};

	protected override onLastObserverRemoved(): void {
		this.subscription!.dispose();
		this.subscription = undefined;
		this.hasValue = false;
		this.value = undefined;
	}

	public get(): T {
		if (this.subscription) {
			if (!this.hasValue) {
				this.handleEvent(undefined);
			}
			return this.value!;
		} else {
			// no cache, as there are no subscribers to keep it updated
			return this._getValue(undefined);
		}
	}
}

export namespace observableFromEvent {
	export const Observer = FromEventObservable;
}

export function observableSignalFromEvent(
	debugName: string,
	event: Event<any>
): IObservable<void> {
	return new FromEventObservableSignal(debugName, event);
}

class FromEventObservableSignal extends BaseObservable<void> {
	private subscription: IDisposable | undefined;

	constructor(
		public readonly debugName: string,
		private readonly event: Event<any>,
	) {
		super();
	}

	protected override onFirstObserverAdded(): void {
		this.subscription = this.event(this.handleEvent);
	}

	private readonly handleEvent = () => {
		transaction(
			(tx) => {
				for (const o of this.observers) {
					tx.updateObserver(o, this);
					o.handleChange(this, undefined);
				}
			},
			() => this.debugName
		);
	};

	protected override onLastObserverRemoved(): void {
		this.subscription!.dispose();
		this.subscription = undefined;
	}

	public override get(): void {
		// NO OP
	}
}

/**
 * Creates a signal that can be triggered to invalidate observers.
 * Signals don't have a value - when they are triggered they indicate a change.
 * However, signals can carry a delta that is passed to observers.
 */
export function observableSignal<TDelta = void>(debugName: string): IObservableSignal<TDelta>;
export function observableSignal<TDelta = void>(owner: object): IObservableSignal<TDelta>;
export function observableSignal<TDelta = void>(debugNameOrOwner: string | object): IObservableSignal<TDelta> {
	if (typeof debugNameOrOwner === 'string') {
		return new ObservableSignal<TDelta>(debugNameOrOwner);
	} else {
		return new ObservableSignal<TDelta>(undefined, debugNameOrOwner);
	}
}

export interface IObservableSignal<TChange> extends IObservable<void, TChange> {
	trigger(tx: ITransaction | undefined, change: TChange): void;
}

class ObservableSignal<TChange> extends BaseObservable<void, TChange> implements IObservableSignal<TChange> {
	public get debugName() {
		return getDebugName(this._debugName, undefined, this._owner, this) ?? 'Observable Signal';
	}

	constructor(
		private readonly _debugName: string | undefined,
		private readonly _owner?: object,
	) {
		super();
	}

	public trigger(tx: ITransaction | undefined, change: TChange): void {
		if (!tx) {
			transaction(tx => {
				this.trigger(tx, change);
			}, () => `Trigger signal ${this.debugName}`);
			return;
		}

		for (const o of this.observers) {
			tx.updateObserver(o, this);
			o.handleChange(this, change);
		}
	}

	public override get(): void {
		// NO OP
	}
}

export function debouncedObservable<T>(observable: IObservable<T>, debounceMs: number, disposableStore: DisposableStore): IObservable<T | undefined> {
	const debouncedObservable = observableValue<T | undefined>('debounced', undefined);

	let timeout: any = undefined;

	disposableStore.add(autorun(reader => {
		/** @description debounce */
		const value = observable.read(reader);

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			transaction(tx => {
				debouncedObservable.set(value, tx);
			});
		}, debounceMs);

	}));

	return debouncedObservable;
}

export function wasEventTriggeredRecently(event: Event<any>, timeoutMs: number, disposableStore: DisposableStore): IObservable<boolean> {
	const observable = observableValue('triggeredRecently', false);

	let timeout: any = undefined;

	disposableStore.add(event(() => {
		observable.set(true, undefined);

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			observable.set(false, undefined);
		}, timeoutMs);
	}));

	return observable;
}

/**
 * This makes sure the observable is being observed and keeps its cache alive.
 */
export function keepObserved<T>(observable: IObservable<T>): IDisposable {
	const o = new KeepAliveObserver(false);
	observable.addObserver(o);
	return toDisposable(() => {
		observable.removeObserver(o);
	});
}

/**
 * This converts the given observable into an autorun.
 */
export function recomputeInitiallyAndOnChange<T>(observable: IObservable<T>): IDisposable {
	const o = new KeepAliveObserver(true);
	observable.addObserver(o);
	observable.reportChanges();

	return toDisposable(() => {
		observable.removeObserver(o);
	});
}

class KeepAliveObserver implements IObserver {
	private counter = 0;

	constructor(private readonly forceRecompute: boolean) { }

	beginUpdate<T>(observable: IObservable<T, void>): void {
		this.counter++;
	}

	endUpdate<T>(observable: IObservable<T, void>): void {
		this.counter--;
		if (this.counter === 0 && this.forceRecompute) {
			observable.reportChanges();
		}
	}

	handlePossibleChange<T>(observable: IObservable<T, unknown>): void {
		// NO OP
	}

	handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		// NO OP
	}
}

export function derivedObservableWithCache<T>(computeFn: (reader: IReader, lastValue: T | undefined) => T): IObservable<T> {
	let lastValue: T | undefined = undefined;
	const observable = derived(reader => {
		lastValue = computeFn(reader, lastValue);
		return lastValue;
	});
	return observable;
}

export function derivedObservableWithWritableCache<T>(owner: object, computeFn: (reader: IReader, lastValue: T | undefined) => T): IObservable<T> & { clearCache(transaction: ITransaction): void } {
	let lastValue: T | undefined = undefined;
	const counter = observableValue('derivedObservableWithWritableCache.counter', 0);
	const observable = derived(owner, reader => {
		counter.read(reader);
		lastValue = computeFn(reader, lastValue);
		return lastValue;
	});
	return Object.assign(observable, {
		clearCache: (transaction: ITransaction) => {
			lastValue = undefined;
			counter.set(counter.get() + 1, transaction);
		},
	});
}
