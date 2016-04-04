/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable}  from 'vs/base/common/lifecycle';
import CallbackList from 'vs/base/common/callbackList';
import {EventEmitter} from 'vs/base/common/eventEmitter';

/**
 * To an event a function with one or zero parameters
 * can be subscribed. The event is the subscriber function itself.
 */
interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

namespace Event {
	const _disposable = { dispose() { } };
	export const None: Event<any> = function() { return _disposable; };
}

export default Event;

export interface EmitterOptions {
	onFirstListenerAdd?: Function;
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
			this._event = (listener: (e: T) => any,  thisArgs?: any, disposables?: IDisposable[]) => {
				if (!this._callbacks) {
					this._callbacks = new CallbackList();
				}
				if (this._options && this._options.onFirstListenerAdd && this._callbacks.isEmpty()) {
					this._options.onFirstListenerAdd(this);
				}
				this._callbacks.add(listener, thisArgs);

				let result: IDisposable;
				result = {
					dispose: () => {
						result.dispose = Emitter._noop;
						if (!this._disposed) {
							this._callbacks.remove(listener, thisArgs);
							if(this._options && this._options.onLastListenerRemove && this._callbacks.isEmpty()) {
								this._options.onLastListenerRemove(this);
							}
						}
					}
				};
				if(Array.isArray(disposables)) {
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
		if(this._callbacks) {
			this._callbacks.dispose();
			this._callbacks = undefined;
			this._disposed = true;
		}
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
		if(Array.isArray(disposables)) {
			disposables.push(result);
		}
		return result;
	};
}

export function mapEvent<I,O>(event: Event<I>, map: (i:I)=>O): Event<O> {
	return (listener, thisArgs?, disposables?) =>
		event(i => listener(map(i)), thisArgs, disposables);
}

enum EventDelayerState {
	Idle,
	Running
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
 * const delayedEvent = delayer.delay(emitter.event);
 *
 * delayedEvent(console.log);
 *
 * delayer.wrap(() => {
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
		const buffer = [];
		this.buffers.push(buffer);
		fn();
		this.buffers.pop();
		buffer.forEach(flush => flush());
	}
}