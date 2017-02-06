/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import CallbackList from 'vs/base/common/callbackList';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { TPromise } from 'vs/base/common/winjs.base';
import { once as onceFn } from 'vs/base/common/functional';

/**
 * To an event a function with one or zero parameters
 * can be subscribed. The event is the subscriber function itself.
 */
interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

namespace Event {
	const _disposable = { dispose() { } };
	export const None: Event<any> = function () { return _disposable; };
}

export default Event;

export interface EmitterOptions {
	onFirstListenerAdd?: Function;
	onFirstListenerDidAdd?: Function;
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

	private static _noop = function () { };

	private _event: Event<T>;
	private _callbacks: CallbackList;
	private _disposed: boolean;

	constructor(private _options?: EmitterOptions) {

	}

	/**
	 * For the public to allow to subscribe
	 * to events from this Emitter
	 */
	get event(): Event<T> {
		if (!this._event) {
			this._event = (listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]) => {
				if (!this._callbacks) {
					this._callbacks = new CallbackList();
				}

				const firstListener = this._callbacks.isEmpty();

				if (firstListener && this._options && this._options.onFirstListenerAdd) {
					this._options.onFirstListenerAdd(this);
				}

				this._callbacks.add(listener, thisArgs);

				if (firstListener && this._options && this._options.onFirstListenerDidAdd) {
					this._options.onFirstListenerDidAdd(this);
				}

				let result: IDisposable;
				result = {
					dispose: () => {
						result.dispose = Emitter._noop;
						if (!this._disposed) {
							this._callbacks.remove(listener, thisArgs);
							if (this._options && this._options.onLastListenerRemove && this._callbacks.isEmpty()) {
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
		if (this._callbacks) {
			this._callbacks.invoke.call(this._callbacks, event);
		}
	}

	dispose() {
		if (this._callbacks) {
			this._callbacks.dispose();
			this._callbacks = undefined;
			this._disposed = true;
		}
	}
}

export class EventMultiplexer<T> implements IDisposable {

	private emitter: Emitter<T>;
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

/**
 * Creates an Event which is backed-up by the event emitter. This allows
 * to use the existing eventing pattern and is likely using less memory.
 * Sample:
 *
 * 	class Document {
 *
 *		private _eventbus = new EventEmitter();
 *
 *		public onDidChange = fromEventEmitter(this._eventbus, 'changed');
 *
 *		// getter-style
 *		// get onDidChange(): Event<(value:string)=>any> {
 *		// 	cache fromEventEmitter result and return
 *		// }
 *
 *		private _doIt() {
 *			// ...
 *			this._eventbus.emit('changed', value)
 *		}
 *	}
 */
export function fromEventEmitter<T>(emitter: EventEmitter, eventType: string): Event<T> {
	return function (listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable {
		const result = emitter.addListener2(eventType, function () {
			listener.apply(thisArgs, arguments);
		});
		if (Array.isArray(disposables)) {
			disposables.push(result);
		}
		return result;
	};
}

export function fromCallback<T>(fn: (handler: (e: T) => void) => IDisposable): Event<T> {
	let listener: IDisposable;

	const emitter = new Emitter<T>({
		onFirstListenerAdd: () => listener = fn(e => emitter.fire(e)),
		onLastListenerRemove: () => listener.dispose()
	});

	return emitter.event;
}

export function fromPromise(promise: TPromise<any>): Event<void> {
	const emitter = new Emitter<void>();
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

export function delayed<T>(promise: TPromise<Event<T>>): Event<T> {
	let toCancel: TPromise<any> = null;
	let listener: IDisposable = null;

	const emitter = new Emitter<T>({
		onFirstListenerAdd() {
			toCancel = promise.then(
				event => listener = event(e => emitter.fire(e)),
				() => null
			);
		},
		onLastListenerRemove() {
			if (toCancel) {
				toCancel.cancel();
				toCancel = null;
			}

			if (listener) {
				listener.dispose();
				listener = null;
			}
		}
	});

	return emitter.event;
}

export function once<T>(event: Event<T>): Event<T> {
	return (listener, thisArgs = null, disposables?) => {
		const result = event(e => {
			result.dispose();
			return listener.call(thisArgs, e);
		}, null, disposables);

		return result;
	};
}

export function any<T>(...events: Event<T>[]): Event<T> {
	let listeners: IDisposable[] = [];

	const emitter = new Emitter<T>({
		onFirstListenerAdd() {
			listeners = events.map(e => e(r => emitter.fire(r)));
		},
		onLastListenerRemove() {
			listeners = dispose(listeners);
		}
	});

	return emitter.event;
}

export function debounceEvent<T>(event: Event<T>, merger: (last: T, event: T) => T, delay?: number, leading?: boolean): Event<T>;
export function debounceEvent<I, O>(event: Event<I>, merger: (last: O, event: I) => O, delay?: number, leading?: boolean): Event<O>;
export function debounceEvent<I, O>(event: Event<I>, merger: (last: O, event: I) => O, delay: number = 100, leading = false): Event<O> {

	let subscription: IDisposable;
	let output: O;
	let handle: number;

	const emitter = new Emitter<O>({
		onFirstListenerAdd() {
			subscription = event(cur => {
				output = merger(output, cur);
				if (!handle && leading) {
					emitter.fire(output);
				}

				clearTimeout(handle);
				handle = setTimeout(() => {
					let _output = output;
					output = undefined;
					emitter.fire(_output);
					handle = null;
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
	filter(fn: (e: T) => boolean): IChainableEvent<T>;
	on(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

export function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
	return (listener, thisArgs = null, disposables?) => event(i => listener.call(thisArgs, map(i)), null, disposables);
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
	return (listener, thisArgs = null, disposables?) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

class ChainableEvent<T> implements IChainableEvent<T> {

	get event(): Event<T> { return this._event; }

	constructor(private _event: Event<T>) { }

	map(fn) {
		return new ChainableEvent(mapEvent(this._event, fn));
	}

	filter(fn) {
		return new ChainableEvent(filterEvent(this._event, fn));
	}

	on(listener, thisArgs, disposables: IDisposable[]) {
		return this._event(listener, thisArgs, disposables);
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