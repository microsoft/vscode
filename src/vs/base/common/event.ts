/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { once as onceFn } from 'vs/base/common/functional';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, SafeDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { IObservable, IObserver } from 'vs/base/common/observable';
import { StopWatch } from 'vs/base/common/stopwatch';


// -----------------------------------------------------------------------------------------------------------------------
// Uncomment the next line to print warnings whenever an emitter with listeners is disposed. That is a sign of code smell.
// -----------------------------------------------------------------------------------------------------------------------
const _enableDisposeWithListenerWarning = false;
// _enableDisposeWithListenerWarning = Boolean("TRUE"); // causes a linter warning so that it cannot be pushed


// -----------------------------------------------------------------------------------------------------------------------
// Uncomment the next line to print warnings whenever a snapshotted event is used repeatedly without cleanup.
// See https://github.com/microsoft/vscode/issues/142851
// -----------------------------------------------------------------------------------------------------------------------
const _enableSnapshotPotentialLeakWarning = false;
// _enableSnapshotPotentialLeakWarning = Boolean("TRUE"); // causes a linter warning so that it cannot be pushed

/**
 * To an event a function with one or zero parameters
 * can be subscribed. The event is the subscriber function itself.
 */
export interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[] | DisposableStore): IDisposable;
}

export namespace Event {
	export const None: Event<any> = () => Disposable.None;


	function _addLeakageTraceLogic(options: EmitterOptions) {
		if (_enableSnapshotPotentialLeakWarning) {
			const { onListenerDidAdd: origListenerDidAdd } = options;
			const stack = Stacktrace.create();
			let count = 0;
			options.onListenerDidAdd = () => {
				if (++count === 2) {
					console.warn('snapshotted emitter LIKELY used public and SHOULD HAVE BEEN created with DisposableStore. snapshotted here');
					stack.print();
				}
				origListenerDidAdd?.();
			};
		}
	}


	/**
	 * Given an event, returns another event which only fires once.
	 */
	export function once<T>(event: Event<T>): Event<T> {
		return (listener, thisArgs = null, disposables?) => {
			// we need this, in case the event fires during the listener call
			let didFire = false;
			let result: IDisposable | undefined = undefined;
			result = event(e => {
				if (didFire) {
					return;
				} else if (result) {
					result.dispose();
				} else {
					didFire = true;
				}

				return listener.call(thisArgs, e);
			}, null, disposables);

			if (didFire) {
				result.dispose();
			}

			return result;
		};
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function map<I, O>(event: Event<I>, map: (i: I) => O, disposable?: DisposableStore): Event<O> {
		return snapshot((listener, thisArgs = null, disposables?) => event(i => listener.call(thisArgs, map(i)), null, disposables), disposable);
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function forEach<I>(event: Event<I>, each: (i: I) => void, disposable?: DisposableStore): Event<I> {
		return snapshot((listener, thisArgs = null, disposables?) => event(i => { each(i); listener.call(thisArgs, i); }, null, disposables), disposable);
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function filter<T, U>(event: Event<T | U>, filter: (e: T | U) => e is T, disposable?: DisposableStore): Event<T>;
	export function filter<T>(event: Event<T>, filter: (e: T) => boolean, disposable?: DisposableStore): Event<T>;
	export function filter<T, R>(event: Event<T | R>, filter: (e: T | R) => e is R, disposable?: DisposableStore): Event<R>;
	export function filter<T>(event: Event<T>, filter: (e: T) => boolean, disposable?: DisposableStore): Event<T> {
		return snapshot((listener, thisArgs = null, disposables?) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables), disposable);
	}

	/**
	 * Given an event, returns the same event but typed as `Event<void>`.
	 */
	export function signal<T>(event: Event<T>): Event<void> {
		return event as Event<any> as Event<void>;
	}

	/**
	 * Given a collection of events, returns a single event which emits
	 * whenever any of the provided events emit.
	 */
	export function any<T>(...events: Event<T>[]): Event<T>;
	export function any(...events: Event<any>[]): Event<void>;
	export function any<T>(...events: Event<T>[]): Event<T> {
		return (listener, thisArgs = null, disposables?) => combinedDisposable(...events.map(event => event(e => listener.call(thisArgs, e), null, disposables)));
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function reduce<I, O>(event: Event<I>, merge: (last: O | undefined, event: I) => O, initial?: O, disposable?: DisposableStore): Event<O> {
		let output: O | undefined = initial;

		return map<I, O>(event, e => {
			output = merge(output, e);
			return output;
		}, disposable);
	}

	function snapshot<T>(event: Event<T>, disposable: DisposableStore | undefined): Event<T> {
		let listener: IDisposable | undefined;

		const options: EmitterOptions | undefined = {
			onFirstListenerAdd() {
				listener = event(emitter.fire, emitter);
			},
			onLastListenerRemove() {
				listener?.dispose();
			}
		};

		if (!disposable) {
			_addLeakageTraceLogic(options);
		}

		const emitter = new Emitter<T>(options);

		disposable?.add(emitter);

		return emitter.event;
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function debounce<T>(event: Event<T>, merge: (last: T | undefined, event: T) => T, delay?: number, leading?: boolean, leakWarningThreshold?: number, disposable?: DisposableStore): Event<T>;
	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function debounce<I, O>(event: Event<I>, merge: (last: O | undefined, event: I) => O, delay?: number, leading?: boolean, leakWarningThreshold?: number, disposable?: DisposableStore): Event<O>;

	export function debounce<I, O>(event: Event<I>, merge: (last: O | undefined, event: I) => O, delay: number = 100, leading = false, leakWarningThreshold?: number, disposable?: DisposableStore): Event<O> {

		let subscription: IDisposable;
		let output: O | undefined = undefined;
		let handle: any = undefined;
		let numDebouncedCalls = 0;

		const options: EmitterOptions | undefined = {
			leakWarningThreshold,
			onFirstListenerAdd() {
				subscription = event(cur => {
					numDebouncedCalls++;
					output = merge(output, cur);

					if (leading && !handle) {
						emitter.fire(output);
						output = undefined;
					}

					clearTimeout(handle);
					handle = setTimeout(() => {
						const _output = output;
						output = undefined;
						handle = undefined;
						if (!leading || numDebouncedCalls > 1) {
							emitter.fire(_output!);
						}

						numDebouncedCalls = 0;
					}, delay);
				});
			},
			onLastListenerRemove() {
				subscription.dispose();
			}
		};

		if (!disposable) {
			_addLeakageTraceLogic(options);
		}

		const emitter = new Emitter<O>(options);

		disposable?.add(emitter);

		return emitter.event;
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function latch<T>(event: Event<T>, equals: (a: T, b: T) => boolean = (a, b) => a === b, disposable?: DisposableStore): Event<T> {
		let firstCall = true;
		let cache: T;

		return filter(event, value => {
			const shouldEmit = firstCall || !equals(value, cache);
			firstCall = false;
			cache = value;
			return shouldEmit;
		}, disposable);
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function split<T, U>(event: Event<T | U>, isT: (e: T | U) => e is T, disposable?: DisposableStore): [Event<T>, Event<U>] {
		return [
			Event.filter(event, isT, disposable),
			Event.filter(event, e => !isT(e), disposable) as Event<U>,
		];
	}

	/**
	 * *NOTE* that this function returns an `Event` and it MUST be called with a `DisposableStore` whenever the returned
	 * event is accessible to "third parties", e.g the event is a public property. Otherwise a leaked listener on the
	 * returned event causes this utility to leak a listener on the original event.
	 */
	export function buffer<T>(event: Event<T>, flushAfterTimeout = false, _buffer: T[] = []): Event<T> {
		let buffer: T[] | null = _buffer.slice();

		let listener: IDisposable | null = event(e => {
			if (buffer) {
				buffer.push(e);
			} else {
				emitter.fire(e);
			}
		});

		const flush = () => {
			buffer?.forEach(e => emitter.fire(e));
			buffer = null;
		};

		const emitter = new Emitter<T>({
			onFirstListenerAdd() {
				if (!listener) {
					listener = event(e => emitter.fire(e));
				}
			},

			onFirstListenerDidAdd() {
				if (buffer) {
					if (flushAfterTimeout) {
						setTimeout(flush);
					} else {
						flush();
					}
				}
			},

			onLastListenerRemove() {
				if (listener) {
					listener.dispose();
				}
				listener = null;
			}
		});

		return emitter.event;
	}

	export interface IChainableEvent<T> extends IDisposable {

		event: Event<T>;
		map<O>(fn: (i: T) => O): IChainableEvent<O>;
		forEach(fn: (i: T) => void): IChainableEvent<T>;
		filter(fn: (e: T) => boolean): IChainableEvent<T>;
		filter<R>(fn: (e: T | R) => e is R): IChainableEvent<R>;
		reduce<R>(merge: (last: R | undefined, event: T) => R, initial?: R): IChainableEvent<R>;
		latch(): IChainableEvent<T>;
		debounce(merge: (last: T | undefined, event: T) => T, delay?: number, leading?: boolean, leakWarningThreshold?: number): IChainableEvent<T>;
		debounce<R>(merge: (last: R | undefined, event: T) => R, delay?: number, leading?: boolean, leakWarningThreshold?: number): IChainableEvent<R>;
		on(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[] | DisposableStore): IDisposable;
		once(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
	}

	class ChainableEvent<T> implements IChainableEvent<T> {

		private readonly disposables = new DisposableStore();

		constructor(readonly event: Event<T>) { }

		map<O>(fn: (i: T) => O): IChainableEvent<O> {
			return new ChainableEvent(map(this.event, fn, this.disposables));
		}

		forEach(fn: (i: T) => void): IChainableEvent<T> {
			return new ChainableEvent(forEach(this.event, fn, this.disposables));
		}

		filter(fn: (e: T) => boolean): IChainableEvent<T>;
		filter<R>(fn: (e: T | R) => e is R): IChainableEvent<R>;
		filter(fn: (e: T) => boolean): IChainableEvent<T> {
			return new ChainableEvent(filter(this.event, fn, this.disposables));
		}

		reduce<R>(merge: (last: R | undefined, event: T) => R, initial?: R): IChainableEvent<R> {
			return new ChainableEvent(reduce(this.event, merge, initial, this.disposables));
		}

		latch(): IChainableEvent<T> {
			return new ChainableEvent(latch(this.event, undefined, this.disposables));
		}

		debounce(merge: (last: T | undefined, event: T) => T, delay?: number, leading?: boolean, leakWarningThreshold?: number): IChainableEvent<T>;
		debounce<R>(merge: (last: R | undefined, event: T) => R, delay?: number, leading?: boolean, leakWarningThreshold?: number): IChainableEvent<R>;
		debounce<R>(merge: (last: R | undefined, event: T) => R, delay: number = 100, leading = false, leakWarningThreshold?: number): IChainableEvent<R> {
			return new ChainableEvent(debounce(this.event, merge, delay, leading, leakWarningThreshold, this.disposables));
		}

		on(listener: (e: T) => any, thisArgs: any, disposables: IDisposable[] | DisposableStore) {
			return this.event(listener, thisArgs, disposables);
		}

		once(listener: (e: T) => any, thisArgs: any, disposables: IDisposable[]) {
			return once(this.event)(listener, thisArgs, disposables);
		}

		dispose() {
			this.disposables.dispose();
		}
	}

	export function chain<T>(event: Event<T>): IChainableEvent<T> {
		return new ChainableEvent(event);
	}

	export interface NodeEventEmitter {
		on(event: string | symbol, listener: Function): unknown;
		removeListener(event: string | symbol, listener: Function): unknown;
	}

	export function fromNodeEventEmitter<T>(emitter: NodeEventEmitter, eventName: string, map: (...args: any[]) => T = id => id): Event<T> {
		const fn = (...args: any[]) => result.fire(map(...args));
		const onFirstListenerAdd = () => emitter.on(eventName, fn);
		const onLastListenerRemove = () => emitter.removeListener(eventName, fn);
		const result = new Emitter<T>({ onFirstListenerAdd, onLastListenerRemove });

		return result.event;
	}

	export interface DOMEventEmitter {
		addEventListener(event: string | symbol, listener: Function): void;
		removeEventListener(event: string | symbol, listener: Function): void;
	}

	export function fromDOMEventEmitter<T>(emitter: DOMEventEmitter, eventName: string, map: (...args: any[]) => T = id => id): Event<T> {
		const fn = (...args: any[]) => result.fire(map(...args));
		const onFirstListenerAdd = () => emitter.addEventListener(eventName, fn);
		const onLastListenerRemove = () => emitter.removeEventListener(eventName, fn);
		const result = new Emitter<T>({ onFirstListenerAdd, onLastListenerRemove });

		return result.event;
	}

	export function toPromise<T>(event: Event<T>): Promise<T> {
		return new Promise(resolve => once(event)(resolve));
	}

	export function runAndSubscribe<T>(event: Event<T>, handler: (e: T | undefined) => any): IDisposable {
		handler(undefined);
		return event(e => handler(e));
	}

	export function runAndSubscribeWithStore<T>(event: Event<T>, handler: (e: T | undefined, disposableStore: DisposableStore) => any): IDisposable {
		let store: DisposableStore | null = null;

		function run(e: T | undefined) {
			store?.dispose();
			store = new DisposableStore();
			handler(e, store);
		}

		run(undefined);
		const disposable = event(e => run(e));
		return toDisposable(() => {
			disposable.dispose();
			store?.dispose();
		});
	}

	class EmitterObserver<T> implements IObserver {

		readonly emitter: Emitter<T>;

		private _counter = 0;
		private _hasChanged = false;

		constructor(readonly obs: IObservable<T, any>, store: DisposableStore | undefined) {
			const options = {
				onFirstListenerAdd: () => {
					obs.addObserver(this);
				},
				onLastListenerRemove: () => {
					obs.removeObserver(this);
				}
			};
			if (!store) {
				_addLeakageTraceLogic(options);
			}
			this.emitter = new Emitter<T>(options);
			if (store) {
				store.add(this.emitter);
			}
		}

		beginUpdate<T>(_observable: IObservable<T, void>): void {
			// console.assert(_observable === this.obs);
			this._counter++;
		}

		handleChange<T, TChange>(_observable: IObservable<T, TChange>, _change: TChange): void {
			this._hasChanged = true;
		}

		endUpdate<T>(_observable: IObservable<T, void>): void {
			if (--this._counter === 0) {
				if (this._hasChanged) {
					this._hasChanged = false;
					this.emitter.fire(this.obs.get());
				}
			}
		}
	}

	export function fromObservable<T>(obs: IObservable<T, any>, store?: DisposableStore): Event<T> {
		const observer = new EmitterObserver(obs, store);
		return observer.emitter.event;
	}
}

export interface EmitterOptions {
	onFirstListenerAdd?: Function;
	onFirstListenerDidAdd?: Function;
	onListenerDidAdd?: Function;
	onLastListenerRemove?: Function;
	leakWarningThreshold?: number;

	/**
	 * Pass in a delivery queue, which is useful for ensuring
	 * in order event delivery across multiple emitters.
	 */
	deliveryQueue?: EventDeliveryQueue;

	/** ONLY enable this during development */
	_profName?: string;
}


export class EventProfiling {

	static readonly all = new Set<EventProfiling>();

	private static _idPool = 0;

	readonly name: string;
	public listenerCount: number = 0;
	public invocationCount = 0;
	public elapsedOverall = 0;
	public durations: number[] = [];

	private _stopWatch?: StopWatch;

	constructor(name: string) {
		this.name = `${name}_${EventProfiling._idPool++}`;
		EventProfiling.all.add(this);
	}

	start(listenerCount: number): void {
		this._stopWatch = new StopWatch(true);
		this.listenerCount = listenerCount;
	}

	stop(): void {
		if (this._stopWatch) {
			const elapsed = this._stopWatch.elapsed();
			this.durations.push(elapsed);
			this.elapsedOverall += elapsed;
			this.invocationCount += 1;
			this._stopWatch = undefined;
		}
	}
}

let _globalLeakWarningThreshold = -1;
export function setGlobalLeakWarningThreshold(n: number): IDisposable {
	const oldValue = _globalLeakWarningThreshold;
	_globalLeakWarningThreshold = n;
	return {
		dispose() {
			_globalLeakWarningThreshold = oldValue;
		}
	};
}

class LeakageMonitor {

	private _stacks: Map<string, number> | undefined;
	private _warnCountdown: number = 0;

	constructor(
		readonly customThreshold?: number,
		readonly name: string = Math.random().toString(18).slice(2, 5),
	) { }

	dispose(): void {
		if (this._stacks) {
			this._stacks.clear();
		}
	}

	check(stack: Stacktrace, listenerCount: number): undefined | (() => void) {

		let threshold = _globalLeakWarningThreshold;
		if (typeof this.customThreshold === 'number') {
			threshold = this.customThreshold;
		}

		if (threshold <= 0 || listenerCount < threshold) {
			return undefined;
		}

		if (!this._stacks) {
			this._stacks = new Map();
		}
		const count = (this._stacks.get(stack.value) || 0);
		this._stacks.set(stack.value, count + 1);
		this._warnCountdown -= 1;

		if (this._warnCountdown <= 0) {
			// only warn on first exceed and then every time the limit
			// is exceeded by 50% again
			this._warnCountdown = threshold * 0.5;

			// find most frequent listener and print warning
			let topStack: string | undefined;
			let topCount: number = 0;
			for (const [stack, count] of this._stacks) {
				if (!topStack || topCount < count) {
					topStack = stack;
					topCount = count;
				}
			}

			console.warn(`[${this.name}] potential listener LEAK detected, having ${listenerCount} listeners already. MOST frequent listener (${topCount}):`);
			console.warn(topStack!);
		}

		return () => {
			const count = (this._stacks!.get(stack.value) || 0);
			this._stacks!.set(stack.value, count - 1);
		};
	}
}

class Stacktrace {

	static create() {
		return new Stacktrace(new Error().stack ?? '');
	}

	private constructor(readonly value: string) { }

	print() {
		console.warn(this.value.split('\n').slice(2).join('\n'));
	}
}

class Listener<T> {

	readonly subscription = new SafeDisposable();

	constructor(
		readonly callback: (e: T) => void,
		readonly callbackThis: any | undefined,
		readonly stack: Stacktrace | undefined
	) { }

	invoke(e: T) {
		this.callback.call(this.callbackThis, e);
	}
}

/**
 * The Emitter can be used to expose an Event to the public
 * to fire it from the insides.
 * Sample:
	class Document {

		private readonly _onDidChange = new Emitter<(value:string)=>any>();

		public onDidChange = this._onDidChange.event;

		// getter-style
		// get onDidChange(): Event<(value:string)=>any> {
		// 	return this._onDidChange.event;
		// }

		private _doIt() {
			//...
			this._onDidChange.fire(value);
		}
	}
 */
export class Emitter<T> {

	private readonly _options?: EmitterOptions;
	private readonly _leakageMon?: LeakageMonitor;
	private readonly _perfMon?: EventProfiling;
	private _disposed: boolean = false;
	private _event?: Event<T>;
	private _deliveryQueue?: EventDeliveryQueue;
	protected _listeners?: LinkedList<Listener<T>>;

	constructor(options?: EmitterOptions) {
		this._options = options;
		this._leakageMon = _globalLeakWarningThreshold > 0 ? new LeakageMonitor(this._options && this._options.leakWarningThreshold) : undefined;
		this._perfMon = this._options?._profName ? new EventProfiling(this._options._profName) : undefined;
		this._deliveryQueue = this._options?.deliveryQueue;
	}

	dispose() {
		if (!this._disposed) {
			this._disposed = true;

			// It is bad to have listeners at the time of disposing an emitter, it is worst to have listeners keep the emitter
			// alive via the reference that's embedded in their disposables. Therefore we loop over all remaining listeners and
			// unset their subscriptions/disposables. Looping and blaming remaining listeners is done on next tick because the
			// the following programming pattern is very popular:
			//
			// const someModel = this._disposables.add(new ModelObject()); // (1) create and register model
			// this._disposables.add(someModel.onDidChange(() => { ... }); // (2) subscribe and register model-event listener
			// ...later...
			// this._disposables.dispose(); disposes (1) then (2): don't warn after (1) but after the "overall dispose" is done

			if (this._listeners) {
				if (_enableDisposeWithListenerWarning) {
					const listeners = Array.from(this._listeners);
					queueMicrotask(() => {
						for (const listener of listeners) {
							if (listener.subscription.isset()) {
								listener.subscription.unset();
								listener.stack?.print();
							}
						}
					});
				}

				this._listeners.clear();
			}
			this._deliveryQueue?.clear(this);
			this._options?.onLastListenerRemove?.();
			this._leakageMon?.dispose();
		}
	}

	/**
	 * For the public to allow to subscribe
	 * to events from this Emitter
	 */
	get event(): Event<T> {
		if (!this._event) {
			this._event = (callback: (e: T) => any, thisArgs?: any, disposables?: IDisposable[] | DisposableStore) => {
				if (!this._listeners) {
					this._listeners = new LinkedList();
				}

				const firstListener = this._listeners.isEmpty();

				if (firstListener && this._options?.onFirstListenerAdd) {
					this._options.onFirstListenerAdd(this);
				}

				let removeMonitor: Function | undefined;
				let stack: Stacktrace | undefined;
				if (this._leakageMon && this._listeners.size >= 30) {
					// check and record this emitter for potential leakage
					stack = Stacktrace.create();
					removeMonitor = this._leakageMon.check(stack, this._listeners.size + 1);
				}

				if (_enableDisposeWithListenerWarning) {
					stack = stack ?? Stacktrace.create();
				}

				const listener = new Listener(callback, thisArgs, stack);
				const removeListener = this._listeners.push(listener);

				if (firstListener && this._options?.onFirstListenerDidAdd) {
					this._options.onFirstListenerDidAdd(this);
				}

				if (this._options?.onListenerDidAdd) {
					this._options.onListenerDidAdd(this, callback, thisArgs);
				}

				const result = listener.subscription.set(() => {
					removeMonitor?.();
					if (!this._disposed) {
						removeListener();
						if (this._options && this._options.onLastListenerRemove) {
							const hasListeners = (this._listeners && !this._listeners.isEmpty());
							if (!hasListeners) {
								this._options.onLastListenerRemove(this);
							}
						}
					}
				});

				if (disposables instanceof DisposableStore) {
					disposables.add(result);
				} else if (Array.isArray(disposables)) {
					disposables.push(result);
				}

				return result;
			};
		}
		return this._event;
	}

	/**
	 * To be kept private to fire an event to
	 * subscribers
	 */
	fire(event: T): void {
		if (this._listeners) {
			// put all [listener,event]-pairs into delivery queue
			// then emit all event. an inner/nested event might be
			// the driver of this

			if (!this._deliveryQueue) {
				this._deliveryQueue = new PrivateEventDeliveryQueue();
			}

			for (const listener of this._listeners) {
				this._deliveryQueue.push(this, listener, event);
			}

			// start/stop performance insight collection
			this._perfMon?.start(this._deliveryQueue.size);

			this._deliveryQueue.deliver();

			this._perfMon?.stop();
		}
	}

	hasListeners(): boolean {
		if (!this._listeners) {
			return false;
		}
		return !this._listeners.isEmpty();
	}
}

export class EventDeliveryQueue {
	protected _queue = new LinkedList<EventDeliveryQueueElement>();

	get size(): number {
		return this._queue.size;
	}

	push<T>(emitter: Emitter<T>, listener: Listener<T>, event: T): void {
		this._queue.push(new EventDeliveryQueueElement(emitter, listener, event));
	}

	clear<T>(emitter: Emitter<T>): void {
		const newQueue = new LinkedList<EventDeliveryQueueElement>();
		for (const element of this._queue) {
			if (element.emitter !== emitter) {
				newQueue.push(element);
			}
		}
		this._queue = newQueue;
	}

	deliver(): void {
		while (this._queue.size > 0) {
			const element = this._queue.shift()!;
			try {
				element.listener.invoke(element.event);
			} catch (e) {
				onUnexpectedError(e);
			}
		}
	}
}

/**
 * An `EventDeliveryQueue` that is guaranteed to be used by a single `Emitter`.
 */
class PrivateEventDeliveryQueue extends EventDeliveryQueue {
	override clear<T>(emitter: Emitter<T>): void {
		// Here we can just clear the entire linked list because
		// all elements are guaranteed to belong to this emitter
		this._queue.clear();
	}
}

class EventDeliveryQueueElement<T = any> {
	constructor(
		readonly emitter: Emitter<T>,
		readonly listener: Listener<T>,
		readonly event: T
	) { }
}

export interface IWaitUntil {
	token: CancellationToken;
	waitUntil(thenable: Promise<unknown>): void;
}

export type IWaitUntilData<T> = Omit<Omit<T, 'waitUntil'>, 'token'>;

export class AsyncEmitter<T extends IWaitUntil> extends Emitter<T> {

	private _asyncDeliveryQueue?: LinkedList<[Listener<T>, IWaitUntilData<T>]>;

	async fireAsync(data: IWaitUntilData<T>, token: CancellationToken, promiseJoin?: (p: Promise<unknown>, listener: Function) => Promise<unknown>): Promise<void> {
		if (!this._listeners) {
			return;
		}

		if (!this._asyncDeliveryQueue) {
			this._asyncDeliveryQueue = new LinkedList();
		}

		for (const listener of this._listeners) {
			this._asyncDeliveryQueue.push([listener, data]);
		}

		while (this._asyncDeliveryQueue.size > 0 && !token.isCancellationRequested) {

			const [listener, data] = this._asyncDeliveryQueue.shift()!;
			const thenables: Promise<unknown>[] = [];

			const event = <T>{
				...data,
				token,
				waitUntil: (p: Promise<unknown>): void => {
					if (Object.isFrozen(thenables)) {
						throw new Error('waitUntil can NOT be called asynchronous');
					}
					if (promiseJoin) {
						p = promiseJoin(p, listener.callback);
					}
					thenables.push(p);
				}
			};

			try {
				listener.invoke(event);
			} catch (e) {
				onUnexpectedError(e);
				continue;
			}

			// freeze thenables-collection to enforce sync-calls to
			// wait until and then wait for all thenables to resolve
			Object.freeze(thenables);

			await Promise.allSettled(thenables).then(values => {
				for (const value of values) {
					if (value.status === 'rejected') {
						onUnexpectedError(value.reason);
					}
				}
			});
		}
	}
}


export class PauseableEmitter<T> extends Emitter<T> {

	private _isPaused = 0;
	protected _eventQueue = new LinkedList<T>();
	private _mergeFn?: (input: T[]) => T;

	constructor(options?: EmitterOptions & { merge?: (input: T[]) => T }) {
		super(options);
		this._mergeFn = options?.merge;
	}

	pause(): void {
		this._isPaused++;
	}

	resume(): void {
		if (this._isPaused !== 0 && --this._isPaused === 0) {
			if (this._mergeFn) {
				// use the merge function to create a single composite
				// event. make a copy in case firing pauses this emitter
				const events = Array.from(this._eventQueue);
				this._eventQueue.clear();
				super.fire(this._mergeFn(events));

			} else {
				// no merging, fire each event individually and test
				// that this emitter isn't paused halfway through
				while (!this._isPaused && this._eventQueue.size !== 0) {
					super.fire(this._eventQueue.shift()!);
				}
			}
		}
	}

	override fire(event: T): void {
		if (this._listeners) {
			if (this._isPaused !== 0) {
				this._eventQueue.push(event);
			} else {
				super.fire(event);
			}
		}
	}
}

export class DebounceEmitter<T> extends PauseableEmitter<T> {

	private readonly _delay: number;
	private _handle: any | undefined;

	constructor(options: EmitterOptions & { merge: (input: T[]) => T; delay?: number }) {
		super(options);
		this._delay = options.delay ?? 100;
	}

	override fire(event: T): void {
		if (!this._handle) {
			this.pause();
			this._handle = setTimeout(() => {
				this._handle = undefined;
				this.resume();
			}, this._delay);
		}
		super.fire(event);
	}
}

/**
 * An emitter which queue all events and then process them at the
 * end of the event loop.
 */
export class MicrotaskEmitter<T> extends Emitter<T> {
	private _queuedEvents: T[] = [];
	private _mergeFn?: (input: T[]) => T;

	constructor(options?: EmitterOptions & { merge?: (input: T[]) => T }) {
		super(options);
		this._mergeFn = options?.merge;
	}
	override fire(event: T): void {

		if (!this.hasListeners()) {
			return;
		}

		this._queuedEvents.push(event);
		if (this._queuedEvents.length === 1) {
			queueMicrotask(() => {
				if (this._mergeFn) {
					super.fire(this._mergeFn(this._queuedEvents));
				} else {
					this._queuedEvents.forEach(e => super.fire(e));
				}
				this._queuedEvents = [];
			});
		}
	}
}

export class EventMultiplexer<T> implements IDisposable {

	private readonly emitter: Emitter<T>;
	private hasListeners = false;
	private events: { event: Event<T>; listener: IDisposable | null }[] = [];

	constructor() {
		this.emitter = new Emitter<T>({
			onFirstListenerAdd: () => this.onFirstListenerAdd(),
			onLastListenerRemove: () => this.onLastListenerRemove()
		});
	}

	get event(): Event<T> {
		return this.emitter.event;
	}

	add(event: Event<T>): IDisposable {
		const e = { event: event, listener: null };
		this.events.push(e);

		if (this.hasListeners) {
			this.hook(e);
		}

		const dispose = () => {
			if (this.hasListeners) {
				this.unhook(e);
			}

			const idx = this.events.indexOf(e);
			this.events.splice(idx, 1);
		};

		return toDisposable(onceFn(dispose));
	}

	private onFirstListenerAdd(): void {
		this.hasListeners = true;
		this.events.forEach(e => this.hook(e));
	}

	private onLastListenerRemove(): void {
		this.hasListeners = false;
		this.events.forEach(e => this.unhook(e));
	}

	private hook(e: { event: Event<T>; listener: IDisposable | null }): void {
		e.listener = e.event(r => this.emitter.fire(r));
	}

	private unhook(e: { event: Event<T>; listener: IDisposable | null }): void {
		if (e.listener) {
			e.listener.dispose();
		}
		e.listener = null;
	}

	dispose(): void {
		this.emitter.dispose();
	}
}

/**
 * The EventBufferer is useful in situations in which you want
 * to delay firing your events during some code.
 * You can wrap that code and be sure that the event will not
 * be fired during that wrap.
 *
 * ```
 * const emitter: Emitter;
 * const delayer = new EventDelayer();
 * const delayedEvent = delayer.wrapEvent(emitter.event);
 *
 * delayedEvent(console.log);
 *
 * delayer.bufferEvents(() => {
 *   emitter.fire(); // event will not be fired yet
 * });
 *
 * // event will only be fired at this point
 * ```
 */
export class EventBufferer {

	private buffers: Function[][] = [];

	wrapEvent<T>(event: Event<T>): Event<T> {
		return (listener, thisArgs?, disposables?) => {
			return event(i => {
				const buffer = this.buffers[this.buffers.length - 1];

				if (buffer) {
					buffer.push(() => listener.call(thisArgs, i));
				} else {
					listener.call(thisArgs, i);
				}
			}, undefined, disposables);
		};
	}

	bufferEvents<R = void>(fn: () => R): R {
		const buffer: Array<() => R> = [];
		this.buffers.push(buffer);
		const r = fn();
		this.buffers.pop();
		buffer.forEach(flush => flush());
		return r;
	}
}

/**
 * A Relay is an event forwarder which functions as a replugabble event pipe.
 * Once created, you can connect an input event to it and it will simply forward
 * events from that input event through its own `event` property. The `input`
 * can be changed at any point in time.
 */
export class Relay<T> implements IDisposable {

	private listening = false;
	private inputEvent: Event<T> = Event.None;
	private inputEventListener: IDisposable = Disposable.None;

	private readonly emitter = new Emitter<T>({
		onFirstListenerDidAdd: () => {
			this.listening = true;
			this.inputEventListener = this.inputEvent(this.emitter.fire, this.emitter);
		},
		onLastListenerRemove: () => {
			this.listening = false;
			this.inputEventListener.dispose();
		}
	});

	readonly event: Event<T> = this.emitter.event;

	set input(event: Event<T>) {
		this.inputEvent = event;

		if (this.listening) {
			this.inputEventListener.dispose();
			this.inputEventListener = event(this.emitter.fire, this.emitter);
		}
	}

	dispose() {
		this.inputEventListener.dispose();
		this.emitter.dispose();
	}
}
