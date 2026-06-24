/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from 'vscode';

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

	private data: { buffers: Function[] }[] = [];

	wrapEvent<T>(event: Event<T>): Event<T>;
	wrapEvent<T>(event: Event<T>, reduce: (last: T | undefined, event: T) => T): Event<T>;
	wrapEvent<T, O>(event: Event<T>, reduce: (last: O | undefined, event: T) => O, initial: O): Event<O>;
	wrapEvent<T, O>(event: Event<T>, reduce?: (last: T | O | undefined, event: T) => T | O, initial?: O): Event<O | T> {
		return (listener, thisArgs?, disposables?) => {
			return event(i => {
				const data = this.data[this.data.length - 1];

				// Non-reduce scenario
				if (!reduce) {
					// Buffering case
					if (data) {
						data.buffers.push(() => listener.call(thisArgs, i));
					} else {
						// Not buffering case
						listener.call(thisArgs, i);
					}
					return;
				}

				// Reduce scenario
				const reduceData = data as typeof data & {
					/**
					 * The accumulated items that will be reduced.
					 */
					items?: T[];
					/**
					 * The reduced result cached to be shared with other listeners.
					 */
					reducedResult?: T | O;
				};

				// Not buffering case
				if (!reduceData) {
					// TODO: Is there a way to cache this reduce call for all listeners?
					listener.call(thisArgs, reduce(initial, i));
					return;
				}

				// Buffering case
				reduceData.items ??= [];
				reduceData.items.push(i);
				if (reduceData.buffers.length === 0) {
					// Include a single buffered function that will reduce all events when we're done buffering events
					data.buffers.push(() => {
						// cache the reduced result so that the value can be shared across all listeners
						reduceData.reducedResult ??= initial
							? reduceData.items!.reduce(reduce as (last: O | undefined, event: T) => O, initial)
							: reduceData.items!.reduce(reduce as (last: T | undefined, event: T) => T);
						listener.call(thisArgs, reduceData.reducedResult);
					});
				}
			}, undefined, disposables);
		};
	}

	bufferEvents<R = void>(fn: () => R): R {
		const data = { buffers: new Array<Function>() };
		this.data.push(data);
		const r = fn();
		this.data.pop();
		data.buffers.forEach(flush => flush());
		return r;
	}

	async bufferEventsAsync<R = void>(fn: () => Promise<R>): Promise<R> {
		const data = { buffers: new Array<Function>() };
		this.data.push(data);
		try {
			const r = await fn();
			return r;
		} finally {
			this.data.pop();
			data.buffers.forEach(flush => flush());
		}
	}
}
