/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator, tieBreakComparators } from '../../common/arrays.js';
import { Emitter, Event } from '../../common/event.js';
import { Disposable, IDisposable } from '../../common/lifecycle.js';
import { setTimeout0, setTimeout0IsFaster } from '../../common/platform.js';

export type TimeOffset = number;

export interface Scheduler {
	schedule(task: ScheduledTask): IDisposable;
	get now(): TimeOffset;
}

export interface ScheduledTask {
	readonly time: TimeOffset;
	readonly source: ScheduledTaskSource;
	readonly useRealAnimationFrame?: boolean;

	run(): void;
}

export interface ScheduledTaskSource {
	toString(): string;
	readonly stackTrace: string | undefined;
}

export interface TimeApi {
	setTimeout(handler: TimerHandler, timeout?: number): any;
	clearTimeout(id: any): void;
	setInterval(handler: TimerHandler, interval: number): any;
	clearInterval(id: any): void;
	setImmediate?: ((handler: () => void) => any);
	clearImmediate?: ((id: any) => void);
	requestAnimationFrame?: ((callback: (time: number) => void) => number);
	cancelAnimationFrame?: ((id: number) => void);
	Date: DateConstructor;
}

interface ExtendedScheduledTask extends ScheduledTask {
	id: number;
}

const scheduledTaskComparator = tieBreakComparators<ExtendedScheduledTask>(
	compareBy(i => i.time, numberComparator),
	compareBy(i => i.id, numberComparator),
);

export class TimeTravelScheduler implements Scheduler {
	private taskCounter = 0;
	private _nowMs: TimeOffset = 0;
	private readonly queue: PriorityQueue<ExtendedScheduledTask> = new SimplePriorityQueue<ExtendedScheduledTask>([], scheduledTaskComparator);

	private readonly taskScheduledEmitter = new Emitter<{ task: ScheduledTask }>();
	public readonly onTaskScheduled = this.taskScheduledEmitter.event;

	constructor(startTimeMs: number) {
		this._nowMs = startTimeMs;
	}

	schedule(task: ScheduledTask): IDisposable {
		if (task.time < this._nowMs) {
			throw new Error(`Scheduled time (${task.time}) must be equal to or greater than the current time (${this._nowMs}).`);
		}
		const extendedTask: ExtendedScheduledTask = { ...task, id: this.taskCounter++ };
		this.queue.add(extendedTask);
		this.taskScheduledEmitter.fire({ task });
		return { dispose: () => this.queue.remove(extendedTask) };
	}

	get now(): TimeOffset {
		return this._nowMs;
	}

	get hasScheduledTasks(): boolean {
		return this.queue.length > 0;
	}

	peekNext(): ScheduledTask | undefined {
		return this.queue.getMin();
	}

	getScheduledTasks(): readonly ScheduledTask[] {
		return this.queue.toSortedArray();
	}

	runNext(): ScheduledTask | undefined {
		const task = this.queue.removeMin();
		if (task) {
			this._nowMs = task.time;
			task.run();
		}

		return task;
	}

	installGlobally(options?: CreateVirtualTimeApiOptions): IDisposable {
		return overwriteGlobalTimeApi(createVirtualTimeApi(this, options));
	}
}

export class AsyncSchedulerProcessor extends Disposable {
	private isProcessing = false;
	private readonly _history = new Array<ScheduledTask>();
	public get history(): readonly ScheduledTask[] { return this._history; }

	private readonly maxTaskCount: number;
	private readonly useSetImmediate: boolean;
	private readonly _realTimeApi: TimeApi;

	private readonly queueEmptyEmitter = new Emitter<void>();
	public readonly onTaskQueueEmpty = this.queueEmptyEmitter.event;

	private lastError: Error | undefined;
	private _virtualDeadline = Number.MAX_SAFE_INTEGER;

	constructor(private readonly scheduler: TimeTravelScheduler, options?: { useSetImmediate?: boolean; maxTaskCount?: number; realTimeApi?: TimeApi }) {
		super();

		this.maxTaskCount = options && options.maxTaskCount ? options.maxTaskCount : 100;
		this.useSetImmediate = options && options.useSetImmediate ? options.useSetImmediate : false;
		this._realTimeApi = options?.realTimeApi ?? originalGlobalValues;

		this._register(scheduler.onTaskScheduled(() => {
			if (this.isProcessing) {
				return;
			} else {
				this.isProcessing = true;
				this._schedule();
			}
		}));
	}

	private _schedule() {
		// This allows promises created by a previous task to settle and schedule tasks before the next task is run.
		// Tasks scheduled in those promises might have to run before the current next task.
		Promise.resolve().then(() => {
			// When the next task requires a real animation frame (e.g. virtual rAF),
			// use the real browser rAF so the browser reflows before the callback runs.
			// This ensures DOM measurements like offsetHeight return accurate values.
			const nextTask = this.scheduler.peekNext();
			if (nextTask?.useRealAnimationFrame && this._realTimeApi.requestAnimationFrame) {
				this._realTimeApi.requestAnimationFrame(() => this._process());
			} else if (this.useSetImmediate && this._realTimeApi.setImmediate) {
				this._realTimeApi.setImmediate(() => this._process());
			} else if (setTimeout0IsFaster) {
				setTimeout0(() => this._process());
			} else {
				this._realTimeApi.setTimeout(() => this._process());
			}
		});
	}

	private _process() {
		let executedTask: ScheduledTask | undefined;
		try {
			executedTask = this.scheduler.runNext();
		} catch (e) {
			console.error(`[TimeTravelScheduler] Task threw:`, e);
		}
		if (executedTask) {
			this._history.push(executedTask);

			if (this.history.length >= this.maxTaskCount && this.scheduler.hasScheduledTasks) {
				const lastTasks = this._history.slice(Math.max(0, this.history.length - 10)).map(h => `${h.source.toString()}: ${h.source.stackTrace}`);
				this.lastError = new Error(`Queue did not get empty after processing ${this.history.length} items. These are the last ${lastTasks.length} scheduled tasks:\n${lastTasks.join('\n\n\n')}`);
				this.isProcessing = false;
				this.queueEmptyEmitter.fire();
				return;
			}

			if (this.scheduler.now >= this._virtualDeadline && this.scheduler.hasScheduledTasks) {
				this.isProcessing = false;
				this.queueEmptyEmitter.fire();
				return;
			}
		}

		if (this.scheduler.hasScheduledTasks) {
			this._schedule();
		} else {
			this.isProcessing = false;
			this.queueEmptyEmitter.fire();
		}
	}

	waitForEmptyQueue(): Promise<void> {
		if (this.lastError) {
			const error = this.lastError;
			this.lastError = undefined;
			throw error;
		}
		if (!this.isProcessing) {
			return Promise.resolve();
		} else {
			return Event.toPromise(this.onTaskQueueEmpty).then(() => {
				if (this.lastError) {
					const error = this.lastError;
					this.lastError = undefined;
					throw error;
				}
			});
		}
	}

	runForVirtualTimeMs(virtualTimeMs: number): Promise<void> {
		this._virtualDeadline = this.scheduler.now + virtualTimeMs;
		return this.waitForEmptyQueue().finally(() => {
			this._virtualDeadline = Number.MAX_SAFE_INTEGER;
		});
	}
}


export async function runWithFakedTimers<T>(options: { startTime?: number; useFakeTimers?: boolean; useSetImmediate?: boolean; maxTaskCount?: number }, fn: () => Promise<T>): Promise<T> {
	const useFakeTimers = options.useFakeTimers === undefined ? true : options.useFakeTimers;
	if (!useFakeTimers) {
		return fn();
	}

	const scheduler = new TimeTravelScheduler(options.startTime ?? 0);
	const schedulerProcessor = new AsyncSchedulerProcessor(scheduler, { useSetImmediate: options.useSetImmediate, maxTaskCount: options.maxTaskCount });
	const globalInstallDisposable = scheduler.installGlobally();

	let didThrow = true;
	let result: T;
	try {
		result = await fn();
		didThrow = false;
	} finally {
		globalInstallDisposable.dispose();

		try {
			if (!didThrow) {
				// We process the remaining scheduled tasks.
				// The global override is no longer active, so during this, no more tasks will be scheduled.
				await schedulerProcessor.waitForEmptyQueue();
			}
		} finally {
			schedulerProcessor.dispose();
		}
	}

	return result;
}

export function captureGlobalTimeApi(): TimeApi {
	return {
		setTimeout: globalThis.setTimeout.bind(globalThis),
		clearTimeout: globalThis.clearTimeout.bind(globalThis),
		setInterval: globalThis.setInterval.bind(globalThis),
		clearInterval: globalThis.clearInterval.bind(globalThis),
		setImmediate: globalThis.setImmediate?.bind(globalThis),
		clearImmediate: globalThis.clearImmediate?.bind(globalThis),
		requestAnimationFrame: globalThis.requestAnimationFrame?.bind(globalThis),
		cancelAnimationFrame: globalThis.cancelAnimationFrame?.bind(globalThis),
		Date: globalThis.Date,
	};
}

export const originalGlobalValues: TimeApi = captureGlobalTimeApi();
// Expose the real setTimeout for the component explorer runtime, which needs true time
// even when virtual time is installed for fixtures.
// eslint-disable-next-line local/code-no-any-casts
(originalGlobalValues.setTimeout as any).originalFn = originalGlobalValues.setTimeout;

export interface CreateVirtualTimeApiOptions {
	fakeRequestAnimationFrame?: boolean;
}

export function createVirtualTimeApi(scheduler: Scheduler, options?: CreateVirtualTimeApiOptions): TimeApi {
	function virtualSetTimeout(handler: TimerHandler, timeout: number = 0): IDisposable {
		if (typeof handler === 'string') {
			throw new Error('String handler args should not be used and are not supported');
		}
		return scheduler.schedule({
			time: scheduler.now + timeout,
			run: () => { handler(); },
			source: {
				toString() { return 'setTimeout'; },
				stackTrace: new Error().stack,
			}
		});
	}

	function virtualClearTimeout(timeoutId: unknown): void {
		if (typeof timeoutId === 'object' && timeoutId && 'dispose' in timeoutId) {
			(timeoutId as IDisposable).dispose();
		}
	}

	function virtualSetInterval(handler: TimerHandler, interval: number): IDisposable {
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
				if (disposed) { return; }
				disposed = true;
				lastDisposable.dispose();
			}
		};
	}

	function virtualClearInterval(intervalId: unknown): void {
		if (typeof intervalId === 'object' && intervalId && 'dispose' in intervalId) {
			(intervalId as IDisposable).dispose();
		}
	}

	const OriginalDate = globalThis.Date;
	function SchedulerDate(this: any, ...args: any): any {
		if (!(this instanceof SchedulerDate)) {
			return new OriginalDate(scheduler.now).toString();
		}
		if (args.length === 0) {
			return new OriginalDate(scheduler.now);
		}
		// eslint-disable-next-line local/code-no-any-casts
		return new (OriginalDate as any)(...args);
	}
	for (const prop in OriginalDate) {
		if (OriginalDate.hasOwnProperty(prop)) {
			// eslint-disable-next-line local/code-no-any-casts
			(SchedulerDate as any)[prop] = (OriginalDate as any)[prop];
		}
	}
	SchedulerDate.now = function now() { return scheduler.now; };
	SchedulerDate.toString = function toString() { return OriginalDate.toString(); };
	SchedulerDate.prototype = OriginalDate.prototype;
	SchedulerDate.parse = OriginalDate.parse;
	SchedulerDate.UTC = OriginalDate.UTC;
	SchedulerDate.prototype.toUTCString = OriginalDate.prototype.toUTCString;

	/* eslint-disable local/code-no-any-casts */
	const api: TimeApi = {
		setTimeout: virtualSetTimeout as any,
		clearTimeout: virtualClearTimeout as any,
		setInterval: virtualSetInterval as any,
		clearInterval: virtualClearInterval as any,
		Date: SchedulerDate as any,
	};
	/* eslint-enable local/code-no-any-casts */

	if (options?.fakeRequestAnimationFrame) {
		let rafIdCounter = 0;
		const rafDisposables = new Map<number, IDisposable>();

		api.requestAnimationFrame = (callback: (time: number) => void) => {
			const id = ++rafIdCounter;
			// Advance virtual time by 16ms (~60fps). The task is marked with
			// useRealAnimationFrame so the AsyncSchedulerProcessor uses a real
			// browser rAF to schedule its execution, ensuring the browser
			// reflows before the callback runs (so DOM measurements like
			// offsetHeight return accurate values).
			const disposable = scheduler.schedule({
				time: scheduler.now + 16,
				useRealAnimationFrame: true,
				run: () => {
					rafDisposables.delete(id);
					callback(scheduler.now);
				},
				source: {
					toString() { return 'requestAnimationFrame'; },
					stackTrace: new Error().stack,
				}
			});
			rafDisposables.set(id, disposable);
			return id;
		};

		api.cancelAnimationFrame = (id: number) => {
			const disposable = rafDisposables.get(id);
			if (disposable) {
				disposable.dispose();
				rafDisposables.delete(id);
			}
		};
	}

	return api;
}

export function overwriteGlobalTimeApi(api: TimeApi): IDisposable {
	const captured = captureGlobalTimeApi();

	// eslint-disable-next-line local/code-no-any-casts
	globalThis.setTimeout = api.setTimeout as any;
	// eslint-disable-next-line local/code-no-any-casts
	globalThis.clearTimeout = api.clearTimeout as any;
	// eslint-disable-next-line local/code-no-any-casts
	globalThis.setInterval = api.setInterval as any;
	// eslint-disable-next-line local/code-no-any-casts
	globalThis.clearInterval = api.clearInterval as any;
	globalThis.Date = api.Date;

	if (api.requestAnimationFrame) {
		globalThis.requestAnimationFrame = api.requestAnimationFrame;
	}
	if (api.cancelAnimationFrame) {
		globalThis.cancelAnimationFrame = api.cancelAnimationFrame;
	}

	return {
		dispose: () => {
			Object.assign(globalThis, captured);
		}
	};
}

export function createLoggingTimeApi(
	underlying: TimeApi,
	onCall: (name: string, stack: string | undefined, handler?: TimerHandler) => void,
): TimeApi {
	return {
		setTimeout(handler: TimerHandler, timeout?: number) {
			onCall('setTimeout', new Error().stack, handler);
			return underlying.setTimeout(handler, timeout);
		},
		clearTimeout(id: unknown) {
			return underlying.clearTimeout(id);
		},
		setInterval(handler: TimerHandler, interval: number) {
			onCall('setInterval', new Error().stack, handler);
			return underlying.setInterval(handler, interval);
		},
		clearInterval(id: unknown) {
			return underlying.clearInterval(id);
		},
		setImmediate: underlying.setImmediate ? (handler: () => void) => {
			onCall('setImmediate', new Error().stack, handler);
			return underlying.setImmediate!(handler);
		} : undefined,
		clearImmediate: underlying.clearImmediate,
		requestAnimationFrame: underlying.requestAnimationFrame ? (callback: (time: number) => void) => {
			onCall('requestAnimationFrame', new Error().stack, callback as TimerHandler);
			return underlying.requestAnimationFrame!(callback);
		} : undefined,
		cancelAnimationFrame: underlying.cancelAnimationFrame,
		Date: underlying.Date,
	};
}

interface PriorityQueue<T> {
	length: number;
	add(value: T): void;
	remove(value: T): void;

	removeMin(): T | undefined;
	getMin(): T | undefined;
	toSortedArray(): T[];
}

class SimplePriorityQueue<T> implements PriorityQueue<T> {
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
		const idx = this.items.indexOf(value);
		if (idx !== -1) {
			this.items.splice(idx, 1);
			this.isSorted = false;
		}
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
