/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator, tieBreakComparators } from '../../../common/arrays.js';
import { Emitter } from '../../../common/event.js';
import { IDisposable } from '../../../common/lifecycle.js';
import { Trace } from './trace.js';

export type VirtualTime = number;

/** Debug source description for an event. */
export interface EventSource {
	toString(): string;
	readonly stackTrace?: string;
}

/**
 * A unit of work scheduled at a point in virtual time.
 *
 * Timer callbacks are events. External completions (e.g. fake fs reads) can
 * also be modelled as events whose virtual completion time is chosen by a
 * scheduling policy — to the {@link VirtualClock} they are indistinguishable.
 */
export interface VirtualEvent {
	readonly time: VirtualTime;
	readonly source: EventSource;
	readonly trace?: Trace;
	/**
	 * Hint for the {@link Embedding}: this event prefers to run on a real
	 * animation frame (e.g. so DOM measurements after it observe a real
	 * reflow). Pure-time tests can ignore the hint.
	 */
	readonly preferRealAnimationFrame?: boolean;
	run(): void;
}

interface QueuedEvent extends VirtualEvent { readonly id: number }

const eventComparator = tieBreakComparators<QueuedEvent>(
	compareBy(e => e.time, numberComparator),
	compareBy(e => e.id, numberComparator),
);

/**
 * A pure data structure: a virtual clock + a priority queue of events.
 *
 * The clock has no concept of "real time". It is advanced exclusively by
 * {@link runNext}, which sets `now` to the next event's `time` before running
 * it. The {@link VirtualTimeProcessor} is the only intended driver, but the
 * clock is useful in isolation (e.g. for unit-testing a scheduler or for
 * stepping a scenario manually).
 */
export class VirtualClock {
	private _now: VirtualTime;
	private _idCounter = 0;
	private readonly _queue = new SimplePriorityQueue<QueuedEvent>(eventComparator);
	private readonly _onEventScheduled = new Emitter<VirtualEvent>();

	public readonly onEventScheduled = this._onEventScheduled.event;

	constructor(startTime: VirtualTime = 0) {
		this._now = startTime;
	}

	get now(): VirtualTime { return this._now; }
	get hasEvents(): boolean { return this._queue.length > 0; }

	schedule(event: VirtualEvent): IDisposable {
		if (event.time < this._now) {
			throw new Error(`Scheduled time (${event.time}) must be >= now (${this._now}).`);
		}
		const queued: QueuedEvent = { ...event, id: this._idCounter++ };
		this._queue.add(queued);
		this._onEventScheduled.fire(event);
		return { dispose: () => this._queue.remove(queued) };
	}

	peekNext(): VirtualEvent | undefined { return this._queue.getMin(); }

	runNext(): VirtualEvent | undefined {
		const e = this._queue.removeMin();
		if (e) {
			this._now = e.time;
			e.run();
		}
		return e;
	}

	getEvents(): readonly VirtualEvent[] { return this._queue.toSortedArray(); }
}

class SimplePriorityQueue<T> {
	private _items: T[] = [];
	private _sorted = true;

	constructor(private readonly _compare: (a: T, b: T) => number) { }

	get length(): number { return this._items.length; }

	add(value: T): void {
		this._items.push(value);
		this._sorted = false;
	}

	remove(value: T): void {
		const i = this._items.indexOf(value);
		if (i !== -1) { this._items.splice(i, 1); }
	}

	getMin(): T | undefined { this._ensureSorted(); return this._items[0]; }
	removeMin(): T | undefined { this._ensureSorted(); return this._items.shift(); }
	toSortedArray(): T[] { this._ensureSorted(); return [...this._items]; }

	private _ensureSorted(): void {
		if (this._sorted) { return; }
		this._items.sort(this._compare);
		this._sorted = true;
	}
}
