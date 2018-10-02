/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { once as onceFn } from 'vs/base/common/functional';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { TPromise } from 'vs/base/common/winjs.base';

/**
 * To an event a function with one or zero parameters
 * can be subscribed. The event is the subscriber function itself.
 */
export interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

export namespace Event {
	const _disposable = { dispose() { } };
	export const None: Event<any> = function () { return _disposable; };
}

type Listener = [Function, any] | Function;

export interface EmitterOptions {
	onFirstListenerAdd?: Function;
	onFirstListenerDidAdd?: Function;
	onListenerDidAdd?: Function;
	onLastListenerRemove?: Function;
}

/**
 * The Emitter can be used to expose an Event to the public
 * to fire it from the insides.
 * Sample:
	class Document {

		private _onDidChange = new Emitter<(value:string)=>any>();

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

	private static readonly _noop = function () { };

	private _event: Event<T>;
	private _disposed: boolean;
	private _deliveryQueue: [Listener, T][];
	protected _listeners: LinkedList<Listener>;

	constructor(private _options?: EmitterOptions) {

	}

	/**
	 * For the public to allow to subscribe
	 * to events from this Emitter
	 */
	get event(): Event<T> {
		if (!this._event) {
			this._event = (listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]) => {
				if (!this._listeners) {
					this._listeners = new LinkedList();
				}

				const firstListener = this._listeners.isEmpty();

				if (firstListener && this._options && this._options.onFirstListenerAdd) {
					this._options.onFirstListenerAdd(this);
				}

				const remove = this._listeners.push(!thisArgs ? listener : [listener, thisArgs]);

				if (firstListener && this._options && this._options.onFirstListenerDidAdd) {
					this._options.onFirstListenerDidAdd(this);
				}

				if (this._options && this._options.onListenerDidAdd) {
					this._options.onListenerDidAdd(this, listener, thisArgs);
				}

				let result: IDisposable;
				result = {
					dispose: () => {
						result.dispose = Emitter._noop;
						if (!this._disposed) {
							remove();
							if (this._options && this._options.onLastListenerRemove && this._listeners.isEmpty()) {
								this._options.onLastListenerRemove(this);
							}
						}
					}
				};
				if (Array.isArray(disposables)) {
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
	fire(event?: T): any {
		if (this._listeners) {
			// put all [listener,event]-pairs into delivery queue
			// then emit all event. an inner/nested event might be
			// the driver of this

			if (!this._deliveryQueue) {
				this._deliveryQueue = [];
			}

			for (let iter = this._listeners.iterator(), e = iter.next(); !e.done; e = iter.next()) {
				this._deliveryQueue.push([e.value, event]);
			}

			while (this._deliveryQueue.length > 0) {
				const [listener, event] = this._deliveryQueue.shift();
				try {
					if (typeof listener === 'function') {
						listener.call(undefined, event);
					} else {
						listener[0].call(listener[1], event);
					}
				} catch (e) {
					onUnexpectedError(e);
				}
			}
		}
	}

	dispose() {
		if (this._listeners) {
			this._listeners = undefined;
		}
		if (this._deliveryQueue) {
			this._deliveryQueue.length = 0;
		}
		this._disposed = true;
	}
}

export interface IWaitUntil {
	waitUntil(thenable: Thenable<any>): void;
}

export class AsyncEmitter<T extends IWaitUntil> extends Emitter<T> {

	private _asyncDeliveryQueue: [Listener, T, Thenable<any>[]][];

	async fireAsync(eventFn: (thenables: Thenable<any>[], listener: Function) => T): Promise<void> {
		if (!this._listeners) {
			return;
		}

		// put all [listener,event]-pairs into delivery queue
		// then emit all event. an inner/nested event might be
		// the driver of this
		if (!this._asyncDeliveryQueue) {
			this._asyncDeliveryQueue = [];
		}

		for (let iter = this._listeners.iterator(), e = iter.next(); !e.done; e = iter.next()) {
			let thenables: Thenable<void>[] = [];
			this._asyncDeliveryQueue.push([e.value, eventFn(thenables, typeof e.value === 'function' ? e.value : e.value[0]), thenables]);
		}

		while (this._asyncDeliveryQueue.length > 0) {
			const [listener, event, thenables] = this._asyncDeliveryQueue.shift();
			try {
				if (typeof listener === 'function') {
					listener.call(undefined, event);
				} else {
					listener[0].call(listener[1], event);
				}
			} catch (e) {
				onUnexpectedError(e);
				continue;
			}

			// freeze thenables-collection to enforce sync-calls to
			// wait until and then wait for all thenables to resolve
			Object.freeze(thenables);
			await Promise.all(thenables);
		}
	}
}

export class EventMultiplexer<T> implements IDisposable {

	private readonly emitter: Emitter<T>;
	private hasListeners = false;
	private events: { event: Event<T>; listener: IDisposable; }[] = [];

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

	private hook(e: { event: Event<T>; listener: IDisposable; }): void {
		e.listener = e.event(r => this.emitter.fire(r));
	}

	private unhook(e: { event: Event<T>; listener: IDisposable; }): void {
		e.listener.dispose();
		e.listener = null;
	}

	dispose(): void {
		this.emitter.dispose();
	}
}

export function fromCallback<T>(fn: (handler: (e: T) => void) => IDisposable): Event<T> {
	let listener: IDisposable;

	const emitter = new Emitter<T>({
		onFirstListenerAdd: () => listener = fn(e => emitter.fire(e)),
		onLastListenerRemove: () => listener.dispose()
	});

	return emitter.event;
}

export function fromPromise<T =any>(promise: Thenable<T>): Event<T> {
	const emitter = new Emitter<T>();
	let shouldEmit = false;

	promise
		.then(null, () => null)
		.then(() => {
			if (!shouldEmit) {
				setTimeout(() => emitter.fire(), 0);
			} else {
				emitter.fire();
			}
		});

	shouldEmit = true;
	return emitter.event;
}

export function toPromise<T>(event: Event<T>): Thenable<T> {
	return new TPromise(c => once(event)(c));
}

export function toNativePromise<T>(event: Event<T>): Thenable<T> {
	return new Promise(c => once(event)(c));
}

export function once<T>(event: Event<T>): Event<T> {
	return (listener, thisArgs = null, disposables?) => {
		// we need this, in case the event fires during the listener call
		let didFire = false;

		const result = event(e => {
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

export function anyEvent<T>(...events: Event<T>[]): Event<T> {
	return (listener, thisArgs = null, disposables?) => combinedDisposable(events.map(event => event(e => listener.call(thisArgs, e), null, disposables)));
}

export function debounceEvent<T>(event: Event<T>, merger: (last: T, event: T) => T, delay?: number, leading?: boolean): Event<T>;
export function debounceEvent<I, O>(event: Event<I>, merger: (last: O, event: I) => O, delay?: number, leading?: boolean): Event<O>;
export function debounceEvent<I, O>(event: Event<I>, merger: (last: O, event: I) => O, delay: number = 100, leading = false): Event<O> {

	let subscription: IDisposable;
	let output: O = undefined;
	let handle: any = undefined;
	let numDebouncedCalls = 0;

	const emitter = new Emitter<O>({
		onFirstListenerAdd() {
			subscription = event(cur => {
				numDebouncedCalls++;
				output = merger(output, cur);

				if (leading && !handle) {
					emitter.fire(output);
				}

				clearTimeout(handle);
				handle = setTimeout(() => {
					let _output = output;
					output = undefined;
					handle = undefined;
					if (!leading || numDebouncedCalls > 1) {
						emitter.fire(_output);
					}

					numDebouncedCalls = 0;
				}, delay);
			});
		},
		onLastListenerRemove() {
			subscription.dispose();
		}
	});

	return emitter.event;
}

/**
 * The EventDelayer is useful in situations in which you want
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
			}, void 0, disposables);
		};
	}

	bufferEvents(fn: () => void): void {
		const buffer: Function[] = [];
		this.buffers.push(buffer);
		fn();
		this.buffers.pop();
		buffer.forEach(flush => flush());
	}
}

export interface IChainableEvent<T> {
	event: Event<T>;
	map<O>(fn: (i: T) => O): IChainableEvent<O>;
	forEach(fn: (i: T) => void): IChainableEvent<T>;
	filter(fn: (e: T) => boolean): IChainableEvent<T>;
	latch(): IChainableEvent<T>;
	on(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
	once(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

export function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
	return (listener, thisArgs = null, disposables?) => event(i => listener.call(thisArgs, map(i)), null, disposables);
}

export function forEach<I>(event: Event<I>, each: (i: I) => void): Event<I> {
	return (listener, thisArgs = null, disposables?) => event(i => { each(i); listener.call(thisArgs, i); }, null, disposables);
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T>;
export function filterEvent<T, R>(event: Event<T | R>, filter: (e: T | R) => e is R): Event<R>;
export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
	return (listener, thisArgs = null, disposables?) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

export function signalEvent<T>(event: Event<T>): Event<void> {
	return event as Event<any> as Event<void>;
}

class ChainableEvent<T> implements IChainableEvent<T> {

	get event(): Event<T> { return this._event; }

	constructor(private _event: Event<T>) { }

	map<O>(fn: (i: T) => O): IChainableEvent<O> {
		return new ChainableEvent(mapEvent(this._event, fn));
	}

	forEach(fn: (i: T) => void): IChainableEvent<T> {
		return new ChainableEvent(forEach(this._event, fn));
	}

	filter(fn: (e: T) => boolean): IChainableEvent<T> {
		return new ChainableEvent(filterEvent(this._event, fn));
	}

	latch(): IChainableEvent<T> {
		return new ChainableEvent(latch(this._event));
	}

	on(listener: (e: T) => any, thisArgs: any, disposables: IDisposable[]) {
		return this._event(listener, thisArgs, disposables);
	}

	once(listener: (e: T) => any, thisArgs: any, disposables: IDisposable[]) {
		return once(this._event)(listener, thisArgs, disposables);
	}
}

export function chain<T>(event: Event<T>): IChainableEvent<T> {
	return new ChainableEvent(event);
}

export function stopwatch<T>(event: Event<T>): Event<number> {
	const start = new Date().getTime();
	return mapEvent(once(event), _ => new Date().getTime() - start);
}

/**
 * Buffers the provided event until a first listener comes
 * along, at which point fire all the events at once and
 * pipe the event from then on.
 *
 * ```typescript
 * const emitter = new Emitter<number>();
 * const event = emitter.event;
 * const bufferedEvent = buffer(event);
 *
 * emitter.fire(1);
 * emitter.fire(2);
 * emitter.fire(3);
 * // nothing...
 *
 * const listener = bufferedEvent(num => console.log(num));
 * // 1, 2, 3
 *
 * emitter.fire(4);
 * // 4
 * ```
 */
export function buffer<T>(event: Event<T>, nextTick = false, buffer: T[] = []): Event<T> {
	buffer = buffer.slice();

	let listener = event(e => {
		if (buffer) {
			buffer.push(e);
		} else {
			emitter.fire(e);
		}
	});

	const flush = () => {
		buffer.forEach(e => emitter.fire(e));
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
				if (nextTick) {
					setTimeout(flush);
				} else {
					flush();
				}
			}
		},

		onLastListenerRemove() {
			listener.dispose();
			listener = null;
		}
	});

	return emitter.event;
}

/**
 * Similar to `buffer` but it buffers indefinitely and repeats
 * the buffered events to every new listener.
 */
export function echo<T>(event: Event<T>, nextTick = false, buffer: T[] = []): Event<T> {
	buffer = buffer.slice();

	event(e => {
		buffer.push(e);
		emitter.fire(e);
	});

	const flush = (listener: (e: T) => any, thisArgs?: any) => buffer.forEach(e => listener.call(thisArgs, e));

	const emitter = new Emitter<T>({
		onListenerDidAdd(emitter, listener: (e: T) => any, thisArgs?: any) {
			if (nextTick) {
				setTimeout(() => flush(listener, thisArgs));
			} else {
				flush(listener, thisArgs);
			}
		}
	});

	return emitter.event;
}

export class Relay<T> implements IDisposable {

	private listening = false;
	private inputEvent: Event<T> = Event.None;
	private inputEventListener: IDisposable = Disposable.None;

	private emitter = new Emitter<T>({
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

export interface NodeEventEmitter {
	on(event: string | symbol, listener: Function): this;
	removeListener(event: string | symbol, listener: Function): this;
}

export function fromNodeEventEmitter<T>(emitter: NodeEventEmitter, eventName: string, map: (...args: any[]) => T = id => id): Event<T> {
	const fn = (...args: any[]) => result.fire(map(...args));
	const onFirstListenerAdd = () => emitter.on(eventName, fn);
	const onLastListenerRemove = () => emitter.removeListener(eventName, fn);
	const result = new Emitter<T>({ onFirstListenerAdd, onLastListenerRemove });

	return result.event;
}

export function latch<T>(event: Event<T>): Event<T> {
	let firstCall = true;
	let cache: T;

	return filterEvent(event, value => {
		let shouldEmit = firstCall || value !== cache;
		firstCall = false;
		cache = value;
		return shouldEmit;
	});
}
