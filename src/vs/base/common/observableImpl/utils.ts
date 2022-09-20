/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observableImpl/autorun';
import { IObservable, BaseObservable, transaction, IReader, ITransaction, ConvenientObservable, IObserver, observableValue, getFunctionName } from 'vs/base/common/observableImpl/base';
import { derived } from 'vs/base/common/observableImpl/derived';
import { Event } from 'vs/base/common/event';
import { getLogger } from 'vs/base/common/observableImpl/logging';

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
		const d = autorun('waitForState', reader => {
			const currentState = observable.read(reader);
			if (predicate(currentState)) {
				d.dispose();
				resolve(currentState);
			}
		});
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
		private readonly getValue: (args: TArgs | undefined) => T
	) {
		super();
	}

	private getDebugName(): string | undefined {
		return getFunctionName(this.getValue);
	}

	public get debugName(): string {
		const name = this.getDebugName();
		return 'From Event' + (name ? `: ${name}` : '');
	}

	protected override onFirstObserverAdded(): void {
		this.subscription = this.event(this.handleEvent);
	}

	private readonly handleEvent = (args: TArgs | undefined) => {
		const newValue = this.getValue(args);

		const didChange = this.value !== newValue;

		getLogger()?.handleFromEventObservableTriggered(this, { oldValue: this.value, newValue, change: undefined, didChange });

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
			return this.getValue(undefined);
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

export function observableSignal(
	debugName: string
): IObservableSignal {
	return new ObservableSignal(debugName);
}

export interface IObservableSignal extends IObservable<void> {
	trigger(tx: ITransaction | undefined): void;
}

class ObservableSignal extends BaseObservable<void> implements IObservableSignal {
	constructor(
		public readonly debugName: string
	) {
		super();
	}

	public trigger(tx: ITransaction | undefined): void {
		if (!tx) {
			transaction(tx => {
				this.trigger(tx);
			}, () => `Trigger signal ${this.debugName}`);
			return;
		}

		for (const o of this.observers) {
			tx.updateObserver(o, this);
			o.handleChange(this, undefined);
		}
	}

	public override get(): void {
		// NO OP
	}
}

export function debouncedObservable<T>(observable: IObservable<T>, debounceMs: number, disposableStore: DisposableStore): IObservable<T | undefined> {
	const debouncedObservable = observableValue<T | undefined>('debounced', undefined);

	let timeout: any = undefined;

	disposableStore.add(autorun('debounce', reader => {
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
 * This ensures the observable is kept up-to-date.
 * This is useful when the observables `get` method is used.
*/
export function keepAlive(observable: IObservable<any>): IDisposable {
	const o = new KeepAliveObserver();
	observable.addObserver(o);
	return toDisposable(() => {
		observable.removeObserver(o);
	});
}

class KeepAliveObserver implements IObserver {
	beginUpdate<T>(observable: IObservable<T, void>): void {
		// NO OP
	}

	handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		// NO OP
	}

	endUpdate<T>(observable: IObservable<T, void>): void {
		// NO OP
	}
}

export function derivedObservableWithCache<T>(name: string, computeFn: (reader: IReader, lastValue: T | undefined) => T): IObservable<T> {
	let lastValue: T | undefined = undefined;
	const observable = derived(name, reader => {
		lastValue = computeFn(reader, lastValue);
		return lastValue;
	});
	return observable;
}

export function derivedObservableWithWritableCache<T>(name: string, computeFn: (reader: IReader, lastValue: T | undefined) => T): IObservable<T> & { clearCache(transaction: ITransaction): void } {
	let lastValue: T | undefined = undefined;
	const counter = observableValue('derivedObservableWithWritableCache.counter', 0);
	const observable = derived(name, reader => {
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
