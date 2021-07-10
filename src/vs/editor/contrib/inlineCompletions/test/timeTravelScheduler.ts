/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';

export type TimeOffset = number;

export interface Scheduler {
	schedule(action: ScheduledAction): IDisposable;
	get now(): TimeOffset;
}

export interface ScheduledAction {
	readonly time: TimeOffset;
	readonly source: ScheduledActionSource;

	run(): void;
}

export interface ScheduledActionSource {
	toString(): string;
	readonly stackTrace: string | undefined;
}

interface ExtendedScheduledAction extends ScheduledAction {
	id: number;
}

function compareScheduledActions(a: ExtendedScheduledAction, b: ExtendedScheduledAction): number {
	if (a.time !== b.time) {
		// Prefer lower time
		return a.time - b.time;
	}

	if (a.id !== b.id) {
		// Prefer lower id
		return a.id - b.id;
	}

	return 0;
}

export class TimeTravelScheduler implements Scheduler {
	private actionCounter = 0;
	private _now: TimeOffset = 0;
	private readonly queue: PriorityQueue<ExtendedScheduledAction> = new StupidPriorityQueue([], compareScheduledActions);

	schedule(action: ScheduledAction): IDisposable {
		if (action.time < this._now) {
			throw new Error(`Scheduled time (${action.time}) must be equal to or greater than the current time (${this._now}).`);
		}
		const extendedAction: ExtendedScheduledAction = { ...action, id: this.actionCounter++ };
		this.queue.add(extendedAction);
		return { dispose: () => this.queue.remove(extendedAction) };
	}

	get now(): TimeOffset {
		return this._now;
	}

	get hasScheduledActions(): boolean {
		return this.queue.length > 0;
	}

	getScheduledActions(): readonly ScheduledAction[] {
		return this.queue.toSortedArray();
	}

	runNext(): ScheduledAction | undefined {
		const action = this.queue.removeMin();
		if (action) {
			this._now = action.time;
			action.run();
		}

		return action;
	}

	runUntilQueueEmpty(maxCount: number = 100): ScheduledAction[] {
		const history = new Array<ScheduledAction>();
		while (true) {
			const executedAction = this.runNext();
			if (!executedAction) {
				break;
			}
			history.push(executedAction);
			if (history.length >= maxCount && this.hasScheduledActions) {
				const lastActions = history.slice(Math.max(0, history.length - 10)).map(h => `${h.source.toString()}: ${h.source.stackTrace}`);
				throw new Error(`Queue did not get empty after processing ${history.length} items. These are the last ${lastActions.length} scheduled actions:\n${lastActions.join('\n\n\n')}`);
			}
		}
		return history;
	}

	async runUntilQueueEmptyAsync(maxCount: number = 100): Promise<ScheduledAction[]> {
		const history = new Array<ScheduledAction>();
		while (true) {
			await new Promise(res => process.nextTick(res));
			const executedAction = this.runNext();
			if (!executedAction) {
				break;
			}
			history.push(executedAction);
			if (history.length >= maxCount && this.hasScheduledActions) {
				const lastActions = history.slice(Math.max(0, history.length - 10)).map(h => `${h.source.toString()}: ${h.source.stackTrace}`);
				throw new Error(`Queue did not get empty after processing ${history.length} items. These are the last ${lastActions.length} scheduled actions:\n${lastActions.join('\n\n\n')}`);
			}
		}
		return history;
	}

	installGlobally(): IDisposable {
		return overwriteGlobals(this);
	}
}

export const originalGlobalValues = {
	setTimeout: globalThis.setTimeout.bind(globalThis),
	clearTimeout: globalThis.clearTimeout.bind(globalThis),
	setInterval: globalThis.setInterval.bind(globalThis),
	clearInterval: globalThis.clearInterval.bind(globalThis),
	setImmediate: globalThis.setImmediate.bind(globalThis),
	clearImmediate: globalThis.clearImmediate.bind(globalThis),
	requestAnimationFrame: globalThis.requestAnimationFrame.bind(globalThis),
	cancelAnimationFrame: globalThis.cancelAnimationFrame.bind(globalThis),
	Date: globalThis.Date,
};

function setTimeout(scheduler: Scheduler, handler: TimerHandler, timeout: number): IDisposable {
	if (typeof handler === 'string') {
		throw new Error('String handler args should not be used and are not supported');
	}

	return scheduler.schedule({
		time: scheduler.now + timeout,
		run: () => {
			handler();
		},
		source: {
			toString() { return 'setTimeout'; },
			stackTrace: new Error().stack,
		}
	});
}

function setInterval(scheduler: Scheduler, handler: TimerHandler, interval: number): IDisposable {
	if (typeof handler === 'string') {
		throw new Error('String handler args should not be used and are not supported');
	}
	const validatedHandler = handler;

	let iterCount = 0;
	const stackTrace = new Error().stack;

	let disposed = false;
	let lastDisposable: IDisposable;

	function schedule(): void {
		iterCount++;
		const curIter = iterCount;
		lastDisposable = scheduler.schedule({
			time: scheduler.now + interval,
			run() {
				if (!disposed) {
					schedule();
					validatedHandler();
				}
			},
			source: {
				toString() { return `setInterval (iteration ${curIter})`; },
				stackTrace,
			}
		});
	}

	schedule();

	return {
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			lastDisposable.dispose();
		}
	};
}

function overwriteGlobals(scheduler: Scheduler): IDisposable {
	globalThis.setTimeout = ((handler: TimerHandler, timeout: number) => setTimeout(scheduler, handler, timeout)) as any;
	globalThis.clearTimeout = (timeoutId: any) => {
		if (typeof timeoutId === 'object' && timeoutId && 'dispose' in timeoutId) {
			timeoutId.dispose();
		} else {
			originalGlobalValues.clearTimeout(timeoutId);
		}
	};

	globalThis.setInterval = ((handler: TimerHandler, timeout: number) => setInterval(scheduler, handler, timeout)) as any;
	globalThis.clearInterval = (timeoutId: any) => {
		if (typeof timeoutId === 'object' && timeoutId && 'dispose' in timeoutId) {
			timeoutId.dispose();
		} else {
			originalGlobalValues.clearInterval(timeoutId);
		}
	};

	globalThis.Date = createDateClass(scheduler);

	return {
		dispose: () => {
			Object.assign(globalThis, originalGlobalValues);
		}
	};
}

function createDateClass(scheduler: Scheduler): DateConstructor {
	const OriginalDate = originalGlobalValues.Date;

	function SchedulerDate(this: any, ...args: any): any {
		// the Date constructor called as a function, ref Ecma-262 Edition 5.1, section 15.9.2.
		// This remains so in the 10th edition of 2019 as well.
		if (!(this instanceof SchedulerDate)) {
			return new OriginalDate(scheduler.now).toString();
		}

		// if Date is called as a constructor with 'new' keyword
		if (args.length === 0) {
			return new OriginalDate(scheduler.now);
		}
		return new (OriginalDate as any)(...args);
	}

	for (let prop in OriginalDate) {
		if (OriginalDate.hasOwnProperty(prop)) {
			(SchedulerDate as any)[prop] = (OriginalDate as any)[prop];
		}
	}

	SchedulerDate.now = function now() {
		return scheduler.now;
	};
	SchedulerDate.toString = function toString() {
		return OriginalDate.toString();
	};
	SchedulerDate.prototype = OriginalDate.prototype;
	SchedulerDate.parse = OriginalDate.parse;
	SchedulerDate.UTC = OriginalDate.UTC;
	SchedulerDate.prototype.toUTCString = OriginalDate.prototype.toUTCString;

	return SchedulerDate as any;
}

interface PriorityQueue<T> {
	length: number;
	add(value: T): void;
	remove(value: T): void;

	removeMin(): T | undefined;
	toSortedArray(): T[];
}

class StupidPriorityQueue<T> implements PriorityQueue<T> {
	private isSorted = false;
	private items: T[];

	constructor(items: T[], private readonly compare: (a: T, b: T) => number) {
		this.items = items;
	}

	get length(): number {
		return this.items.length;
	}

	add(value: T): void {
		this.items.push(value);
		this.isSorted = false;
	}

	remove(value: T): void {
		this.items.splice(this.items.indexOf(value), 1);
		this.isSorted = false;
	}

	removeMin(): T | undefined {
		this.ensureSorted();
		return this.items.shift();
	}

	getMin(): T | undefined {
		this.ensureSorted();
		return this.items[0];
	}

	toSortedArray(): T[] {
		this.ensureSorted();
		return [...this.items];
	}

	private ensureSorted() {
		if (!this.isSorted) {
			this.items.sort(this.compare);
			this.isSorted = true;
		}
	}
}
