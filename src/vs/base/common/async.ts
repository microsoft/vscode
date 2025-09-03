/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from './cancellation.js';
import { BugIndicatingError, CancellationError } from './errors.js';
import { Emitter, Event } from './event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, isDisposable, MutableDisposable, toDisposable } from './lifecycle.js';
import { extUri as defaultExtUri, IExtUri } from './resources.js';
import { URI } from './uri.js';
import { setTimeout0 } from './platform.js';
import { MicrotaskDelay } from './symbols.js';
import { Lazy } from './lazy.js';

export function isThenable<T>(obj: unknown): obj is Promise<T> {
	return !!obj && typeof (obj as unknown as Promise<T>).then === 'function';
}

export interface CancelablePromise<T> extends Promise<T> {
	cancel(): void;
}

/**
 * Returns a promise that can be cancelled using the provided cancellation token.
 *
 * @remarks When cancellation is requested, the promise will be rejected with a {@link CancellationError}.
 * If the promise resolves to a disposable object, it will be automatically disposed when cancellation
 * is requested.
 *
 * @param callback A function that accepts a cancellation token and returns a promise
 * @returns A promise that can be cancelled
 */
export function createCancelablePromise<T>(callback: (token: CancellationToken) => Promise<T>): CancelablePromise<T> {
	const source = new CancellationTokenSource();

	const thenable = callback(source.token);

	let isCancelled = false;

	const promise = new Promise<T>((resolve, reject) => {
		const subscription = source.token.onCancellationRequested(() => {
			isCancelled = true;
			subscription.dispose();
			reject(new CancellationError());
		});
		Promise.resolve(thenable).then(value => {
			subscription.dispose();
			source.dispose();

			if (!isCancelled) {
				resolve(value);

			} else if (isDisposable(value)) {
				// promise has been cancelled, result is disposable and will
				// be cleaned up
				value.dispose();
			}
		}, err => {
			subscription.dispose();
			source.dispose();
			reject(err);
		});
	});

	return <CancelablePromise<T>>new class {
		cancel() {
			source.cancel();
			source.dispose();
		}
		then<TResult1 = T, TResult2 = never>(resolve?: ((value: T) => TResult1 | Promise<TResult1>) | undefined | null, reject?: ((reason: unknown) => TResult2 | Promise<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
			return promise.then(resolve, reject);
		}
		catch<TResult = never>(reject?: ((reason: unknown) => TResult | Promise<TResult>) | undefined | null): Promise<T | TResult> {
			return this.then(undefined, reject);
		}
		finally(onfinally?: (() => void) | undefined | null): Promise<T> {
			return promise.finally(onfinally);
		}
	};
}

/**
 * Returns a promise that resolves with `undefined` as soon as the passed token is cancelled.
 * @see {@link raceCancellationError}
 */
export function raceCancellation<T>(promise: Promise<T>, token: CancellationToken): Promise<T | undefined>;

/**
 * Returns a promise that resolves with `defaultValue` as soon as the passed token is cancelled.
 * @see {@link raceCancellationError}
 */
export function raceCancellation<T>(promise: Promise<T>, token: CancellationToken, defaultValue: T): Promise<T>;

export function raceCancellation<T>(promise: Promise<T>, token: CancellationToken, defaultValue?: T): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const ref = token.onCancellationRequested(() => {
			ref.dispose();
			resolve(defaultValue);
		});
		promise.then(resolve, reject).finally(() => ref.dispose());
	});
}

/**
 * Returns a promise that rejects with an {@CancellationError} as soon as the passed token is cancelled.
 * @see {@link raceCancellation}
 */
export function raceCancellationError<T>(promise: Promise<T>, token: CancellationToken): Promise<T> {
	return new Promise((resolve, reject) => {
		const ref = token.onCancellationRequested(() => {
			ref.dispose();
			reject(new CancellationError());
		});
		promise.then(resolve, reject).finally(() => ref.dispose());
	});
}

/**
 * Wraps a cancellable promise such that it is no cancellable. Can be used to
 * avoid issues with shared promises that would normally be returned as
 * cancellable to consumers.
 */
export function notCancellablePromise<T>(promise: CancelablePromise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		promise.then(resolve, reject);
	});
}

/**
 * Returns as soon as one of the promises resolves or rejects and cancels remaining promises
 */
export function raceCancellablePromises<T>(cancellablePromises: (CancelablePromise<T> | Promise<T>)[]): CancelablePromise<T> {
	let resolvedPromiseIndex = -1;
	const promises = cancellablePromises.map((promise, index) => promise.then(result => { resolvedPromiseIndex = index; return result; }));
	const promise = Promise.race(promises) as CancelablePromise<T>;
	promise.cancel = () => {
		cancellablePromises.forEach((cancellablePromise, index) => {
			if (index !== resolvedPromiseIndex && (cancellablePromise as CancelablePromise<T>).cancel) {
				(cancellablePromise as CancelablePromise<T>).cancel();
			}
		});
	};
	promise.finally(() => {
		promise.cancel();
	});
	return promise;
}

export function raceTimeout<T>(promise: Promise<T>, timeout: number, onTimeout?: () => void): Promise<T | undefined> {
	let promiseResolve: ((value: T | undefined) => void) | undefined = undefined;

	const timer = setTimeout(() => {
		promiseResolve?.(undefined);
		onTimeout?.();
	}, timeout);

	return Promise.race([
		promise.finally(() => clearTimeout(timer)),
		new Promise<T | undefined>(resolve => promiseResolve = resolve)
	]);
}

export function asPromise<T>(callback: () => T | Thenable<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const item = callback();
		if (isThenable<T>(item)) {
			item.then(resolve, reject);
		} else {
			resolve(item);
		}
	});
}

/**
 * Creates and returns a new promise, plus its `resolve` and `reject` callbacks.
 *
 * Replace with standardized [`Promise.withResolvers`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers) once it is supported
 */
export function promiseWithResolvers<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (err?: any) => void } {
	let resolve: (value: T | PromiseLike<T>) => void;
	let reject: (reason?: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve: resolve!, reject: reject! };
}

export interface ITask<T> {
	(): T;
}

/**
 * A helper to prevent accumulation of sequential async tasks.
 *
 * Imagine a mail man with the sole task of delivering letters. As soon as
 * a letter submitted for delivery, he drives to the destination, delivers it
 * and returns to his base. Imagine that during the trip, N more letters were submitted.
 * When the mail man returns, he picks those N letters and delivers them all in a
 * single trip. Even though N+1 submissions occurred, only 2 deliveries were made.
 *
 * The throttler implements this via the queue() method, by providing it a task
 * factory. Following the example:
 *
 * 		const throttler = new Throttler();
 * 		const letters = [];
 *
 * 		function deliver() {
 * 			const lettersToDeliver = letters;
 * 			letters = [];
 * 			return makeTheTrip(lettersToDeliver);
 * 		}
 *
 * 		function onLetterReceived(l) {
 * 			letters.push(l);
 * 			throttler.queue(deliver);
 * 		}
 */
export class Throttler implements IDisposable {

	private activePromise: Promise<any> | null;
	private queuedPromise: Promise<any> | null;
	private queuedPromiseFactory: ITask<Promise<any>> | null;

	private isDisposed = false;

	constructor() {
		this.activePromise = null;
		this.queuedPromise = null;
		this.queuedPromiseFactory = null;
	}

	queue<T>(promiseFactory: ITask<Promise<T>>): Promise<T> {
		if (this.isDisposed) {
			return Promise.reject(new Error('Throttler is disposed'));
		}

		if (this.activePromise) {
			this.queuedPromiseFactory = promiseFactory;

			if (!this.queuedPromise) {
				const onComplete = () => {
					this.queuedPromise = null;

					if (this.isDisposed) {
						return;
					}

					const result = this.queue(this.queuedPromiseFactory!);
					this.queuedPromiseFactory = null;

					return result;
				};

				this.queuedPromise = new Promise(resolve => {
					this.activePromise!.then(onComplete, onComplete).then(resolve);
				});
			}

			return new Promise((resolve, reject) => {
				this.queuedPromise!.then(resolve, reject);
			});
		}

		this.activePromise = promiseFactory();

		return new Promise((resolve, reject) => {
			this.activePromise!.then((result: T) => {
				this.activePromise = null;
				resolve(result);
			}, (err: unknown) => {
				this.activePromise = null;
				reject(err);
			});
		});
	}

	dispose(): void {
		this.isDisposed = true;
	}
}

export class Sequencer {

	private current: Promise<unknown> = Promise.resolve(null);

	queue<T>(promiseTask: ITask<Promise<T>>): Promise<T> {
		return this.current = this.current.then(() => promiseTask(), () => promiseTask());
	}
}

export class SequencerByKey<TKey> {

	private promiseMap = new Map<TKey, Promise<unknown>>();

	queue<T>(key: TKey, promiseTask: ITask<Promise<T>>): Promise<T> {
		const runningPromise = this.promiseMap.get(key) ?? Promise.resolve();
		const newPromise = runningPromise
			.catch(() => { })
			.then(promiseTask)
			.finally(() => {
				if (this.promiseMap.get(key) === newPromise) {
					this.promiseMap.delete(key);
				}
			});
		this.promiseMap.set(key, newPromise);
		return newPromise;
	}

	keys(): IterableIterator<TKey> {
		return this.promiseMap.keys();
	}
}

interface IScheduledLater extends IDisposable {
	isTriggered(): boolean;
}

const timeoutDeferred = (timeout: number, fn: () => void): IScheduledLater => {
	let scheduled = true;
	const handle = setTimeout(() => {
		scheduled = false;
		fn();
	}, timeout);
	return {
		isTriggered: () => scheduled,
		dispose: () => {
			clearTimeout(handle);
			scheduled = false;
		},
	};
};

const microtaskDeferred = (fn: () => void): IScheduledLater => {
	let scheduled = true;
	queueMicrotask(() => {
		if (scheduled) {
			scheduled = false;
			fn();
		}
	});

	return {
		isTriggered: () => scheduled,
		dispose: () => { scheduled = false; },
	};
};

/**
 * A helper to delay (debounce) execution of a task that is being requested often.
 *
 * Following the throttler, now imagine the mail man wants to optimize the number of
 * trips proactively. The trip itself can be long, so he decides not to make the trip
 * as soon as a letter is submitted. Instead he waits a while, in case more
 * letters are submitted. After said waiting period, if no letters were submitted, he
 * decides to make the trip. Imagine that N more letters were submitted after the first
 * one, all within a short period of time between each other. Even though N+1
 * submissions occurred, only 1 delivery was made.
 *
 * The delayer offers this behavior via the trigger() method, into which both the task
 * to be executed and the waiting period (delay) must be passed in as arguments. Following
 * the example:
 *
 * 		const delayer = new Delayer(WAITING_PERIOD);
 * 		const letters = [];
 *
 * 		function letterReceived(l) {
 * 			letters.push(l);
 * 			delayer.trigger(() => { return makeTheTrip(); });
 * 		}
 */
export class Delayer<T> implements IDisposable {

	private deferred: IScheduledLater | null;
	private completionPromise: Promise<any> | null;
	private doResolve: ((value?: any | Promise<any>) => void) | null;
	private doReject: ((err: unknown) => void) | null;
	private task: ITask<T | Promise<T>> | null;

	constructor(public defaultDelay: number | typeof MicrotaskDelay) {
		this.deferred = null;
		this.completionPromise = null;
		this.doResolve = null;
		this.doReject = null;
		this.task = null;
	}

	trigger(task: ITask<T | Promise<T>>, delay = this.defaultDelay): Promise<T> {
		this.task = task;
		this.cancelTimeout();

		if (!this.completionPromise) {
			this.completionPromise = new Promise((resolve, reject) => {
				this.doResolve = resolve;
				this.doReject = reject;
			}).then(() => {
				this.completionPromise = null;
				this.doResolve = null;
				if (this.task) {
					const task = this.task;
					this.task = null;
					return task();
				}
				return undefined;
			});
		}

		const fn = () => {
			this.deferred = null;
			this.doResolve?.(null);
		};

		this.deferred = delay === MicrotaskDelay ? microtaskDeferred(fn) : timeoutDeferred(delay, fn);

		return this.completionPromise;
	}

	isTriggered(): boolean {
		return !!this.deferred?.isTriggered();
	}

	cancel(): void {
		this.cancelTimeout();

		if (this.completionPromise) {
			this.doReject?.(new CancellationError());
			this.completionPromise = null;
		}
	}

	private cancelTimeout(): void {
		this.deferred?.dispose();
		this.deferred = null;
	}

	dispose(): void {
		this.cancel();
	}
}

/**
 * A helper to delay execution of a task that is being requested often, while
 * preventing accumulation of consecutive executions, while the task runs.
 *
 * The mail man is clever and waits for a certain amount of time, before going
 * out to deliver letters. While the mail man is going out, more letters arrive
 * and can only be delivered once he is back. Once he is back the mail man will
 * do one more trip to deliver the letters that have accumulated while he was out.
 */
export class ThrottledDelayer<T> {

	private delayer: Delayer<Promise<T>>;
	private throttler: Throttler;

	constructor(defaultDelay: number) {
		this.delayer = new Delayer(defaultDelay);
		this.throttler = new Throttler();
	}

	trigger(promiseFactory: ITask<Promise<T>>, delay?: number): Promise<T> {
		return this.delayer.trigger(() => this.throttler.queue(promiseFactory), delay) as unknown as Promise<T>;
	}

	isTriggered(): boolean {
		return this.delayer.isTriggered();
	}

	cancel(): void {
		this.delayer.cancel();
	}

	dispose(): void {
		this.delayer.dispose();
		this.throttler.dispose();
	}
}

/**
 * A barrier that is initially closed and then becomes opened permanently.
 */
export class Barrier {
	private _isOpen: boolean;
	private _promise: Promise<boolean>;
	private _completePromise!: (v: boolean) => void;

	constructor() {
		this._isOpen = false;
		this._promise = new Promise<boolean>((c, e) => {
			this._completePromise = c;
		});
	}

	isOpen(): boolean {
		return this._isOpen;
	}

	open(): void {
		this._isOpen = true;
		this._completePromise(true);
	}

	wait(): Promise<boolean> {
		return this._promise;
	}
}

/**
 * A barrier that is initially closed and then becomes opened permanently after a certain period of
 * time or when open is called explicitly
 */
export class AutoOpenBarrier extends Barrier {

	private readonly _timeout: Timeout;

	constructor(autoOpenTimeMs: number) {
		super();
		this._timeout = setTimeout(() => this.open(), autoOpenTimeMs);
	}

	override open(): void {
		clearTimeout(this._timeout);
		super.open();
	}
}

export function timeout(millis: number): CancelablePromise<void>;
export function timeout(millis: number, token: CancellationToken): Promise<void>;
export function timeout(millis: number, token?: CancellationToken): CancelablePromise<void> | Promise<void> {
	if (!token) {
		return createCancelablePromise(token => timeout(millis, token));
	}

	return new Promise((resolve, reject) => {
		const handle = setTimeout(() => {
			disposable.dispose();
			resolve();
		}, millis);
		const disposable = token.onCancellationRequested(() => {
			clearTimeout(handle);
			disposable.dispose();
			reject(new CancellationError());
		});
	});
}

/**
 * Creates a timeout that can be disposed using its returned value.
 * @param handler The timeout handler.
 * @param timeout An optional timeout in milliseconds.
 * @param store An optional {@link DisposableStore} that will have the timeout disposable managed automatically.
 *
 * @example
 * const store = new DisposableStore;
 * // Call the timeout after 1000ms at which point it will be automatically
 * // evicted from the store.
 * const timeoutDisposable = disposableTimeout(() => {}, 1000, store);
 *
 * if (foo) {
 *   // Cancel the timeout and evict it from store.
 *   timeoutDisposable.dispose();
 * }
 */
export function disposableTimeout(handler: () => void, timeout = 0, store?: DisposableStore): IDisposable {
	const timer = setTimeout(() => {
		handler();
		if (store) {
			disposable.dispose();
		}
	}, timeout);
	const disposable = toDisposable(() => {
		clearTimeout(timer);
		store?.delete(disposable);
	});
	store?.add(disposable);
	return disposable;
}

/**
 * Runs the provided list of promise factories in sequential order. The returned
 * promise will complete to an array of results from each promise.
 */

export function sequence<T>(promiseFactories: ITask<Promise<T>>[]): Promise<T[]> {
	const results: T[] = [];
	let index = 0;
	const len = promiseFactories.length;

	function next(): Promise<T> | null {
		return index < len ? promiseFactories[index++]() : null;
	}

	function thenHandler(result: unknown): Promise<any> {
		if (result !== undefined && result !== null) {
			results.push(result as T);
		}

		const n = next();
		if (n) {
			return n.then(thenHandler);
		}

		return Promise.resolve(results);
	}

	return Promise.resolve(null).then(thenHandler);
}

export function first<T>(promiseFactories: ITask<Promise<T>>[], shouldStop: (t: T) => boolean = t => !!t, defaultValue: T | null = null): Promise<T | null> {
	let index = 0;
	const len = promiseFactories.length;

	const loop: () => Promise<T | null> = () => {
		if (index >= len) {
			return Promise.resolve(defaultValue);
		}

		const factory = promiseFactories[index++];
		const promise = Promise.resolve(factory());

		return promise.then(result => {
			if (shouldStop(result)) {
				return Promise.resolve(result);
			}

			return loop();
		});
	};

	return loop();
}

/**
 * Returns the result of the first promise that matches the "shouldStop",
 * running all promises in parallel. Supports cancelable promises.
 */
export function firstParallel<T>(promiseList: Promise<T>[], shouldStop?: (t: T) => boolean, defaultValue?: T | null): Promise<T | null>;
export function firstParallel<T, R extends T>(promiseList: Promise<T>[], shouldStop: (t: T) => t is R, defaultValue?: R | null): Promise<R | null>;
export function firstParallel<T>(promiseList: Promise<T>[], shouldStop: (t: T) => boolean = t => !!t, defaultValue: T | null = null) {
	if (promiseList.length === 0) {
		return Promise.resolve(defaultValue);
	}

	let todo = promiseList.length;
	const finish = () => {
		todo = -1;
		for (const promise of promiseList) {
			(promise as Partial<CancelablePromise<T>>).cancel?.();
		}
	};

	return new Promise<T | null>((resolve, reject) => {
		for (const promise of promiseList) {
			promise.then(result => {
				if (--todo >= 0 && shouldStop(result)) {
					finish();
					resolve(result);
				} else if (todo === 0) {
					resolve(defaultValue);
				}
			})
				.catch(err => {
					if (--todo >= 0) {
						finish();
						reject(err);
					}
				});
		}
	});
}

interface ILimitedTaskFactory<T> {
	factory: ITask<Promise<T>>;
	c: (value: T | Promise<T>) => void;
	e: (error?: unknown) => void;
}

export interface ILimiter<T> {

	readonly size: number;

	queue(factory: ITask<Promise<T>>): Promise<T>;

	clear(): void;
}

/**
 * A helper to queue N promises and run them all with a max degree of parallelism. The helper
 * ensures that at any time no more than M promises are running at the same time.
 */
export class Limiter<T> implements ILimiter<T> {

	private _size = 0;
	private _isDisposed = false;
	private runningPromises: number;
	private readonly maxDegreeOfParalellism: number;
	private readonly outstandingPromises: ILimitedTaskFactory<T>[];
	private readonly _onDrained: Emitter<void>;

	constructor(maxDegreeOfParalellism: number) {
		this.maxDegreeOfParalellism = maxDegreeOfParalellism;
		this.outstandingPromises = [];
		this.runningPromises = 0;
		this._onDrained = new Emitter<void>();
	}

	/**
	 *
	 * @returns A promise that resolved when all work is done (onDrained) or when
	 * there is nothing to do
	 */
	whenIdle(): Promise<void> {
		return this.size > 0
			? Event.toPromise(this.onDrained)
			: Promise.resolve();
	}

	get onDrained(): Event<void> {
		return this._onDrained.event;
	}

	get size(): number {
		return this._size;
	}

	queue(factory: ITask<Promise<T>>): Promise<T> {
		if (this._isDisposed) {
			throw new Error('Object has been disposed');
		}
		this._size++;

		return new Promise<T>((c, e) => {
			this.outstandingPromises.push({ factory, c, e });
			this.consume();
		});
	}

	private consume(): void {
		while (this.outstandingPromises.length && this.runningPromises < this.maxDegreeOfParalellism) {
			const iLimitedTask = this.outstandingPromises.shift()!;
			this.runningPromises++;

			const promise = iLimitedTask.factory();
			promise.then(iLimitedTask.c, iLimitedTask.e);
			promise.then(() => this.consumed(), () => this.consumed());
		}
	}

	private consumed(): void {
		if (this._isDisposed) {
			return;
		}
		this.runningPromises--;
		if (--this._size === 0) {
			this._onDrained.fire();
		}

		if (this.outstandingPromises.length > 0) {
			this.consume();
		}
	}

	clear(): void {
		if (this._isDisposed) {
			throw new Error('Object has been disposed');
		}
		this.outstandingPromises.length = 0;
		this._size = this.runningPromises;
	}

	dispose(): void {
		this._isDisposed = true;
		this.outstandingPromises.length = 0; // stop further processing
		this._size = 0;
		this._onDrained.dispose();
	}
}

/**
 * A queue is handles one promise at a time and guarantees that at any time only one promise is executing.
 */
export class Queue<T> extends Limiter<T> {

	constructor() {
		super(1);
	}
}

/**
 * Same as `Queue`, ensures that only 1 task is executed at the same time. The difference to `Queue` is that
 * there is only 1 task about to be scheduled next. As such, calling `queue` while a task is executing will
 * replace the currently queued task until it executes.
 *
 * As such, the returned promise may not be from the factory that is passed in but from the next factory that
 * is running after having called `queue`.
 */
export class LimitedQueue {

	private readonly sequentializer = new TaskSequentializer();

	private tasks = 0;

	queue(factory: ITask<Promise<void>>): Promise<void> {
		if (!this.sequentializer.isRunning()) {
			return this.sequentializer.run(this.tasks++, factory());
		}

		return this.sequentializer.queue(() => {
			return this.sequentializer.run(this.tasks++, factory());
		});
	}
}

/**
 * A helper to organize queues per resource. The ResourceQueue makes sure to manage queues per resource
 * by disposing them once the queue is empty.
 */
export class ResourceQueue implements IDisposable {

	private readonly queues = new Map<string, Queue<void>>();

	private readonly drainers = new Set<DeferredPromise<void>>();

	private drainListeners: DisposableMap<number> | undefined = undefined;
	private drainListenerCount = 0;

	async whenDrained(): Promise<void> {
		if (this.isDrained()) {
			return;
		}

		const promise = new DeferredPromise<void>();
		this.drainers.add(promise);

		return promise.p;
	}

	private isDrained(): boolean {
		for (const [, queue] of this.queues) {
			if (queue.size > 0) {
				return false;
			}
		}

		return true;
	}

	queueSize(resource: URI, extUri: IExtUri = defaultExtUri): number {
		const key = extUri.getComparisonKey(resource);

		return this.queues.get(key)?.size ?? 0;
	}

	queueFor(resource: URI, factory: ITask<Promise<void>>, extUri: IExtUri = defaultExtUri): Promise<void> {
		const key = extUri.getComparisonKey(resource);

		let queue = this.queues.get(key);
		if (!queue) {
			queue = new Queue<void>();
			const drainListenerId = this.drainListenerCount++;
			const drainListener = Event.once(queue.onDrained)(() => {
				queue?.dispose();
				this.queues.delete(key);
				this.onDidQueueDrain();

				this.drainListeners?.deleteAndDispose(drainListenerId);

				if (this.drainListeners?.size === 0) {
					this.drainListeners.dispose();
					this.drainListeners = undefined;
				}
			});

			if (!this.drainListeners) {
				this.drainListeners = new DisposableMap();
			}
			this.drainListeners.set(drainListenerId, drainListener);

			this.queues.set(key, queue);
		}

		return queue.queue(factory);
	}

	private onDidQueueDrain(): void {
		if (!this.isDrained()) {
			return; // not done yet
		}

		this.releaseDrainers();
	}

	private releaseDrainers(): void {
		for (const drainer of this.drainers) {
			drainer.complete();
		}

		this.drainers.clear();
	}

	dispose(): void {
		for (const [, queue] of this.queues) {
			queue.dispose();
		}

		this.queues.clear();

		// Even though we might still have pending
		// tasks queued, after the queues have been
		// disposed, we can no longer track them, so
		// we release drainers to prevent hanging
		// promises when the resource queue is being
		// disposed.
		this.releaseDrainers();

		this.drainListeners?.dispose();
	}
}

export type Task<T = void> = () => (Promise<T> | T);

/**
 * Processes tasks in the order they were scheduled.
*/
export class TaskQueue {
	private _runningTask: Task<any> | undefined = undefined;
	private _pendingTasks: { task: Task<any>; deferred: DeferredPromise<any>; setUndefinedWhenCleared: boolean }[] = [];

	/**
	 * Waits for the current and pending tasks to finish, then runs and awaits the given task.
	 * If the task is skipped because of clearPending, the promise is rejected with a CancellationError.
	*/
	public schedule<T>(task: Task<T>): Promise<T> {
		const deferred = new DeferredPromise<T>();
		this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: false });
		this._runIfNotRunning();
		return deferred.p;
	}

	/**
	 * Waits for the current and pending tasks to finish, then runs and awaits the given task.
	 * If the task is skipped because of clearPending, the promise is resolved with undefined.
	*/
	public scheduleSkipIfCleared<T>(task: Task<T>): Promise<T | undefined> {
		const deferred = new DeferredPromise<T>();
		this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: true });
		this._runIfNotRunning();
		return deferred.p;
	}

	private _runIfNotRunning(): void {
		if (this._runningTask === undefined) {
			this._processQueue();
		}
	}

	private async _processQueue(): Promise<void> {
		if (this._pendingTasks.length === 0) {
			return;
		}

		const next = this._pendingTasks.shift();
		if (!next) {
			return;
		}

		if (this._runningTask) {
			throw new BugIndicatingError();
		}

		this._runningTask = next.task;

		try {
			const result = await next.task();
			next.deferred.complete(result);
		} catch (e) {
			next.deferred.error(e);
		} finally {
			this._runningTask = undefined;
			this._processQueue();
		}
	}

	/**
	 * Clears all pending tasks. Does not cancel the currently running task.
	*/
	public clearPending(): void {
		const tasks = this._pendingTasks;
		this._pendingTasks = [];
		for (const task of tasks) {
			if (task.setUndefinedWhenCleared) {
				task.deferred.complete(undefined);
			} else {
				task.deferred.error(new CancellationError());
			}
		}
	}
}

export class TimeoutTimer implements IDisposable {
	private _token: Timeout | undefined;
	private _isDisposed = false;

	constructor();
	constructor(runner: () => void, timeout: number);
	constructor(runner?: () => void, timeout?: number) {
		this._token = undefined;

		if (typeof runner === 'function' && typeof timeout === 'number') {
			this.setIfNotSet(runner, timeout);
		}
	}

	dispose(): void {
		this.cancel();
		this._isDisposed = true;
	}

	cancel(): void {
		if (this._token !== undefined) {
			clearTimeout(this._token);
			this._token = undefined;
		}
	}

	cancelAndSet(runner: () => void, timeout: number): void {
		if (this._isDisposed) {
			throw new BugIndicatingError(`Calling 'cancelAndSet' on a disposed TimeoutTimer`);
		}

		this.cancel();
		this._token = setTimeout(() => {
			this._token = undefined;
			runner();
		}, timeout);
	}

	setIfNotSet(runner: () => void, timeout: number): void {
		if (this._isDisposed) {
			throw new BugIndicatingError(`Calling 'setIfNotSet' on a disposed TimeoutTimer`);
		}

		if (this._token !== undefined) {
			// timer is already set
			return;
		}
		this._token = setTimeout(() => {
			this._token = undefined;
			runner();
		}, timeout);
	}
}

export class IntervalTimer implements IDisposable {

	private disposable: IDisposable | undefined = undefined;
	private isDisposed = false;

	cancel(): void {
		this.disposable?.dispose();
		this.disposable = undefined;
	}

	cancelAndSet(runner: () => void, interval: number, context = globalThis): void {
		if (this.isDisposed) {
			throw new BugIndicatingError(`Calling 'cancelAndSet' on a disposed IntervalTimer`);
		}

		this.cancel();
		const handle = context.setInterval(() => {
			runner();
		}, interval);

		this.disposable = toDisposable(() => {
			context.clearInterval(handle);
			this.disposable = undefined;
		});
	}

	dispose(): void {
		this.cancel();
		this.isDisposed = true;
	}
}

export class RunOnceScheduler implements IDisposable {

	protected runner: ((...args: unknown[]) => void) | null;

	private timeoutToken: Timeout | undefined;
	private timeout: number;
	private timeoutHandler: () => void;

	constructor(runner: (...args: any[]) => void, delay: number) {
		this.timeoutToken = undefined;
		this.runner = runner;
		this.timeout = delay;
		this.timeoutHandler = this.onTimeout.bind(this);
	}

	/**
	 * Dispose RunOnceScheduler
	 */
	dispose(): void {
		this.cancel();
		this.runner = null;
	}

	/**
	 * Cancel current scheduled runner (if any).
	 */
	cancel(): void {
		if (this.isScheduled()) {
			clearTimeout(this.timeoutToken);
			this.timeoutToken = undefined;
		}
	}

	/**
	 * Cancel previous runner (if any) & schedule a new runner.
	 */
	schedule(delay = this.timeout): void {
		this.cancel();
		this.timeoutToken = setTimeout(this.timeoutHandler, delay);
	}

	get delay(): number {
		return this.timeout;
	}

	set delay(value: number) {
		this.timeout = value;
	}

	/**
	 * Returns true if scheduled.
	 */
	isScheduled(): boolean {
		return this.timeoutToken !== undefined;
	}

	flush(): void {
		if (this.isScheduled()) {
			this.cancel();
			this.doRun();
		}
	}

	private onTimeout() {
		this.timeoutToken = undefined;
		if (this.runner) {
			this.doRun();
		}
	}

	protected doRun(): void {
		this.runner?.();
	}
}

/**
 * Same as `RunOnceScheduler`, but doesn't count the time spent in sleep mode.
 * > **NOTE**: Only offers 1s resolution.
 *
 * When calling `setTimeout` with 3hrs, and putting the computer immediately to sleep
 * for 8hrs, `setTimeout` will fire **as soon as the computer wakes from sleep**. But
 * this scheduler will execute 3hrs **after waking the computer from sleep**.
 */
export class ProcessTimeRunOnceScheduler {

	private runner: (() => void) | null;
	private timeout: number;

	private counter: number;
	private intervalToken: Timeout | undefined;
	private intervalHandler: () => void;

	constructor(runner: () => void, delay: number) {
		if (delay % 1000 !== 0) {
			console.warn(`ProcessTimeRunOnceScheduler resolution is 1s, ${delay}ms is not a multiple of 1000ms.`);
		}
		this.runner = runner;
		this.timeout = delay;
		this.counter = 0;
		this.intervalToken = undefined;
		this.intervalHandler = this.onInterval.bind(this);
	}

	dispose(): void {
		this.cancel();
		this.runner = null;
	}

	cancel(): void {
		if (this.isScheduled()) {
			clearInterval(this.intervalToken);
			this.intervalToken = undefined;
		}
	}

	/**
	 * Cancel previous runner (if any) & schedule a new runner.
	 */
	schedule(delay = this.timeout): void {
		if (delay % 1000 !== 0) {
			console.warn(`ProcessTimeRunOnceScheduler resolution is 1s, ${delay}ms is not a multiple of 1000ms.`);
		}
		this.cancel();
		this.counter = Math.ceil(delay / 1000);
		this.intervalToken = setInterval(this.intervalHandler, 1000);
	}

	/**
	 * Returns true if scheduled.
	 */
	isScheduled(): boolean {
		return this.intervalToken !== undefined;
	}

	private onInterval() {
		this.counter--;
		if (this.counter > 0) {
			// still need to wait
			return;
		}

		// time elapsed
		clearInterval(this.intervalToken);
		this.intervalToken = undefined;
		this.runner?.();
	}
}

export class RunOnceWorker<T> extends RunOnceScheduler {

	private units: T[] = [];

	constructor(runner: (units: T[]) => void, timeout: number) {
		super(runner, timeout);
	}

	work(unit: T): void {
		this.units.push(unit);

		if (!this.isScheduled()) {
			this.schedule();
		}
	}

	protected override doRun(): void {
		const units = this.units;
		this.units = [];

		this.runner?.(units);
	}

	override dispose(): void {
		this.units = [];

		super.dispose();
	}
}

export interface IThrottledWorkerOptions {

	/**
	 * maximum of units the worker will pass onto handler at once
	 */
	maxWorkChunkSize: number;

	/**
	 * maximum of units the worker will keep in memory for processing
	 */
	maxBufferedWork: number | undefined;

	/**
	 * delay before processing the next round of chunks when chunk size exceeds limits
	 */
	throttleDelay: number;

	/**
	 * When enabled will guarantee that two distinct calls to `work()` are not executed
	 * without throttle delay between them.
	 * Otherwise if the worker isn't currently throttling it will execute work immediately.
	 */
	waitThrottleDelayBetweenWorkUnits?: boolean;
}

/**
 * The `ThrottledWorker` will accept units of work `T`
 * to handle. The contract is:
 * * there is a maximum of units the worker can handle at once (via `maxWorkChunkSize`)
 * * there is a maximum of units the worker will keep in memory for processing (via `maxBufferedWork`)
 * * after having handled `maxWorkChunkSize` units, the worker needs to rest (via `throttleDelay`)
 */
export class ThrottledWorker<T> extends Disposable {

	private readonly pendingWork: T[] = [];

	private readonly throttler = this._register(new MutableDisposable<RunOnceScheduler>());
	private disposed = false;
	private lastExecutionTime = 0;

	constructor(
		private options: IThrottledWorkerOptions,
		private readonly handler: (units: T[]) => void
	) {
		super();
	}

	/**
	 * The number of work units that are pending to be processed.
	 */
	get pending(): number { return this.pendingWork.length; }

	/**
	 * Add units to be worked on. Use `pending` to figure out
	 * how many units are not yet processed after this method
	 * was called.
	 *
	 * @returns whether the work was accepted or not. If the
	 * worker is disposed, it will not accept any more work.
	 * If the number of pending units would become larger
	 * than `maxPendingWork`, more work will also not be accepted.
	 */
	work(units: readonly T[]): boolean {
		if (this.disposed) {
			return false; // work not accepted: disposed
		}

		// Check for reaching maximum of pending work
		if (typeof this.options.maxBufferedWork === 'number') {

			// Throttled: simple check if pending + units exceeds max pending
			if (this.throttler.value) {
				if (this.pending + units.length > this.options.maxBufferedWork) {
					return false; // work not accepted: too much pending work
				}
			}

			// Unthrottled: same as throttled, but account for max chunk getting
			// worked on directly without being pending
			else {
				if (this.pending + units.length - this.options.maxWorkChunkSize > this.options.maxBufferedWork) {
					return false; // work not accepted: too much pending work
				}
			}
		}

		// Add to pending units first
		for (const unit of units) {
			this.pendingWork.push(unit);
		}

		const timeSinceLastExecution = Date.now() - this.lastExecutionTime;

		if (!this.throttler.value && (!this.options.waitThrottleDelayBetweenWorkUnits || timeSinceLastExecution >= this.options.throttleDelay)) {
			// Work directly if we are not throttling and we are not
			// enforced to throttle between `work()` calls.
			this.doWork();
		} else if (!this.throttler.value && this.options.waitThrottleDelayBetweenWorkUnits) {
			// Otherwise, schedule the throttler to work.
			this.scheduleThrottler(Math.max(this.options.throttleDelay - timeSinceLastExecution, 0));
		} else {
			// Otherwise, our work will be picked up by the running throttler
		}

		return true; // work accepted
	}

	private doWork(): void {
		this.lastExecutionTime = Date.now();

		// Extract chunk to handle and handle it
		this.handler(this.pendingWork.splice(0, this.options.maxWorkChunkSize));

		// If we have remaining work, schedule it after a delay
		if (this.pendingWork.length > 0) {
			this.scheduleThrottler();
		}
	}

	private scheduleThrottler(delay = this.options.throttleDelay): void {
		this.throttler.value = new RunOnceScheduler(() => {
			this.throttler.clear();

			this.doWork();
		}, delay);
		this.throttler.value.schedule();
	}

	override dispose(): void {
		super.dispose();

		this.pendingWork.length = 0;
		this.disposed = true;
	}
}

//#region -- run on idle tricks ------------

export interface IdleDeadline {
	readonly didTimeout: boolean;
	timeRemaining(): number;
}

type IdleApi = Pick<typeof globalThis, 'requestIdleCallback' | 'cancelIdleCallback'>;


/**
 * Execute the callback the next time the browser is idle, returning an
 * {@link IDisposable} that will cancel the callback when disposed. This wraps
 * [requestIdleCallback] so it will fallback to [setTimeout] if the environment
 * doesn't support it.
 *
 * @param callback The callback to run when idle, this includes an
 * [IdleDeadline] that provides the time alloted for the idle callback by the
 * browser. Not respecting this deadline will result in a degraded user
 * experience.
 * @param timeout A timeout at which point to queue no longer wait for an idle
 * callback but queue it on the regular event loop (like setTimeout). Typically
 * this should not be used.
 *
 * [IdleDeadline]: https://developer.mozilla.org/en-US/docs/Web/API/IdleDeadline
 * [requestIdleCallback]: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
 * [setTimeout]: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout
 *
 * **Note** that there is `dom.ts#runWhenWindowIdle` which is better suited when running inside a browser
 * context
 */
export let runWhenGlobalIdle: (callback: (idle: IdleDeadline) => void, timeout?: number) => IDisposable;

export let _runWhenIdle: (targetWindow: IdleApi, callback: (idle: IdleDeadline) => void, timeout?: number) => IDisposable;

(function () {
	const safeGlobal: any = globalThis;
	if (typeof safeGlobal.requestIdleCallback !== 'function' || typeof safeGlobal.cancelIdleCallback !== 'function') {
		_runWhenIdle = (_targetWindow, runner, timeout?) => {
			setTimeout0(() => {
				if (disposed) {
					return;
				}
				const end = Date.now() + 15; // one frame at 64fps
				const deadline: IdleDeadline = {
					didTimeout: true,
					timeRemaining() {
						return Math.max(0, end - Date.now());
					}
				};
				runner(Object.freeze(deadline));
			});
			let disposed = false;
			return {
				dispose() {
					if (disposed) {
						return;
					}
					disposed = true;
				}
			};
		};
	} else {
		_runWhenIdle = (targetWindow: typeof safeGlobal, runner, timeout?) => {
			const handle: number = targetWindow.requestIdleCallback(runner, typeof timeout === 'number' ? { timeout } : undefined);
			let disposed = false;
			return {
				dispose() {
					if (disposed) {
						return;
					}
					disposed = true;
					targetWindow.cancelIdleCallback(handle);
				}
			};
		};
	}
	runWhenGlobalIdle = (runner, timeout) => _runWhenIdle(globalThis, runner, timeout);
})();

export abstract class AbstractIdleValue<T> {

	private readonly _executor: () => void;
	private readonly _handle: IDisposable;

	private _didRun: boolean = false;
	private _value?: T;
	private _error: unknown;

	constructor(targetWindow: IdleApi, executor: () => T) {
		this._executor = () => {
			try {
				this._value = executor();
			} catch (err) {
				this._error = err;
			} finally {
				this._didRun = true;
			}
		};
		this._handle = _runWhenIdle(targetWindow, () => this._executor());
	}

	dispose(): void {
		this._handle.dispose();
	}

	get value(): T {
		if (!this._didRun) {
			this._handle.dispose();
			this._executor();
		}
		if (this._error) {
			throw this._error;
		}
		return this._value!;
	}

	get isInitialized(): boolean {
		return this._didRun;
	}
}

/**
 * An `IdleValue` that always uses the current window (which might be throttled or inactive)
 *
 * **Note** that there is `dom.ts#WindowIdleValue` which is better suited when running inside a browser
 * context
 */
export class GlobalIdleValue<T> extends AbstractIdleValue<T> {

	constructor(executor: () => T) {
		super(globalThis, executor);
	}
}

//#endregion

export async function retry<T>(task: ITask<Promise<T>>, delay: number, retries: number): Promise<T> {
	let lastError: Error | undefined;

	for (let i = 0; i < retries; i++) {
		try {
			return await task();
		} catch (error) {
			lastError = error;

			await timeout(delay);
		}
	}

	throw lastError;
}

//#region Task Sequentializer

interface IRunningTask {
	readonly taskId: number;
	readonly cancel: () => void;
	readonly promise: Promise<void>;
}

interface IQueuedTask {
	readonly promise: Promise<void>;
	readonly promiseResolve: () => void;
	readonly promiseReject: (error: Error) => void;
	run: ITask<Promise<void>>;
}

export interface ITaskSequentializerWithRunningTask {
	readonly running: Promise<void>;
}

export interface ITaskSequentializerWithQueuedTask {
	readonly queued: IQueuedTask;
}

/**
 * @deprecated use `LimitedQueue` instead for an easier to use API
 */
export class TaskSequentializer {

	private _running?: IRunningTask;
	private _queued?: IQueuedTask;

	isRunning(taskId?: number): this is ITaskSequentializerWithRunningTask {
		if (typeof taskId === 'number') {
			return this._running?.taskId === taskId;
		}

		return !!this._running;
	}

	get running(): Promise<void> | undefined {
		return this._running?.promise;
	}

	cancelRunning(): void {
		this._running?.cancel();
	}

	run(taskId: number, promise: Promise<void>, onCancel?: () => void,): Promise<void> {
		this._running = { taskId, cancel: () => onCancel?.(), promise };

		promise.then(() => this.doneRunning(taskId), () => this.doneRunning(taskId));

		return promise;
	}

	private doneRunning(taskId: number): void {
		if (this._running && taskId === this._running.taskId) {

			// only set running to done if the promise finished that is associated with that taskId
			this._running = undefined;

			// schedule the queued task now that we are free if we have any
			this.runQueued();
		}
	}

	private runQueued(): void {
		if (this._queued) {
			const queued = this._queued;
			this._queued = undefined;

			// Run queued task and complete on the associated promise
			queued.run().then(queued.promiseResolve, queued.promiseReject);
		}
	}

	/**
	 * Note: the promise to schedule as next run MUST itself call `run`.
	 *       Otherwise, this sequentializer will report `false` for `isRunning`
	 *       even when this task is running. Missing this detail means that
	 *       suddenly multiple tasks will run in parallel.
	 */
	queue(run: ITask<Promise<void>>): Promise<void> {

		// this is our first queued task, so we create associated promise with it
		// so that we can return a promise that completes when the task has
		// completed.
		if (!this._queued) {
			const { promise, resolve: promiseResolve, reject: promiseReject } = promiseWithResolvers<void>();
			this._queued = {
				run,
				promise,
				promiseResolve: promiseResolve!,
				promiseReject: promiseReject!
			};
		}

		// we have a previous queued task, just overwrite it
		else {
			this._queued.run = run;
		}

		return this._queued.promise;
	}

	hasQueued(): this is ITaskSequentializerWithQueuedTask {
		return !!this._queued;
	}

	async join(): Promise<void> {
		return this._queued?.promise ?? this._running?.promise;
	}
}

//#endregion

//#region

/**
 * The `IntervalCounter` allows to count the number
 * of calls to `increment()` over a duration of
 * `interval`. This utility can be used to conditionally
 * throttle a frequent task when a certain threshold
 * is reached.
 */
export class IntervalCounter {

	private lastIncrementTime = 0;

	private value = 0;

	constructor(private readonly interval: number, private readonly nowFn = () => Date.now()) { }

	increment(): number {
		const now = this.nowFn();

		// We are outside of the range of `interval` and as such
		// start counting from 0 and remember the time
		if (now - this.lastIncrementTime > this.interval) {
			this.lastIncrementTime = now;
			this.value = 0;
		}

		this.value++;

		return this.value;
	}
}

//#endregion

//#region

export type ValueCallback<T = unknown> = (value: T | Promise<T>) => void;

const enum DeferredOutcome {
	Resolved,
	Rejected
}

/**
 * Creates a promise whose resolution or rejection can be controlled imperatively.
 */
export class DeferredPromise<T> {

	private completeCallback!: ValueCallback<T>;
	private errorCallback!: (err: unknown) => void;
	private outcome?: { outcome: DeferredOutcome.Rejected; value: unknown } | { outcome: DeferredOutcome.Resolved; value: T };

	public get isRejected() {
		return this.outcome?.outcome === DeferredOutcome.Rejected;
	}

	public get isResolved() {
		return this.outcome?.outcome === DeferredOutcome.Resolved;
	}

	public get isSettled() {
		return !!this.outcome;
	}

	public get value() {
		return this.outcome?.outcome === DeferredOutcome.Resolved ? this.outcome?.value : undefined;
	}

	public readonly p: Promise<T>;

	constructor() {
		this.p = new Promise<T>((c, e) => {
			this.completeCallback = c;
			this.errorCallback = e;
		});
	}

	public complete(value: T) {
		return new Promise<void>(resolve => {
			this.completeCallback(value);
			this.outcome = { outcome: DeferredOutcome.Resolved, value };
			resolve();
		});
	}

	public error(err: unknown) {
		return new Promise<void>(resolve => {
			this.errorCallback(err);
			this.outcome = { outcome: DeferredOutcome.Rejected, value: err };
			resolve();
		});
	}

	public settleWith(promise: Promise<T>): Promise<void> {
		return promise.then(
			value => this.complete(value),
			error => this.error(error)
		);
	}

	public cancel() {
		return this.error(new CancellationError());
	}
}

//#endregion

//#region Promises

export namespace Promises {

	/**
	 * A drop-in replacement for `Promise.all` with the only difference
	 * that the method awaits every promise to either fulfill or reject.
	 *
	 * Similar to `Promise.all`, only the first error will be returned
	 * if any.
	 */
	export async function settled<T>(promises: Promise<T>[]): Promise<T[]> {
		let firstError: Error | undefined = undefined;

		const result = await Promise.all(promises.map(promise => promise.then(value => value, error => {
			if (!firstError) {
				firstError = error;
			}

			return undefined; // do not rethrow so that other promises can settle
		})));

		if (typeof firstError !== 'undefined') {
			throw firstError;
		}

		return result as unknown as T[]; // cast is needed and protected by the `throw` above
	}

	/**
	 * A helper to create a new `Promise<T>` with a body that is a promise
	 * itself. By default, an error that raises from the async body will
	 * end up as a unhandled rejection, so this utility properly awaits the
	 * body and rejects the promise as a normal promise does without async
	 * body.
	 *
	 * This method should only be used in rare cases where otherwise `async`
	 * cannot be used (e.g. when callbacks are involved that require this).
	 */
	export function withAsyncBody<T, E = Error>(bodyFn: (resolve: (value: T) => unknown, reject: (error: E) => unknown) => Promise<unknown>): Promise<T> {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise<T>(async (resolve, reject) => {
			try {
				await bodyFn(resolve, reject);
			} catch (error) {
				reject(error);
			}
		});
	}
}

export class StatefulPromise<T> {
	private _value: T | undefined = undefined;
	get value(): T | undefined { return this._value; }

	private _error: unknown = undefined;
	get error(): unknown { return this._error; }

	private _isResolved = false;
	get isResolved() { return this._isResolved; }

	public readonly promise: Promise<T>;

	constructor(promise: Promise<T>) {
		this.promise = promise.then(
			value => {
				this._value = value;
				this._isResolved = true;
				return value;
			},
			error => {
				this._error = error;
				this._isResolved = true;
				throw error;
			}
		);
	}

	/**
	 * Returns the resolved value.
	 * Throws if the promise is not resolved yet.
	 */
	public requireValue(): T {
		if (!this._isResolved) {
			throw new BugIndicatingError('Promise is not resolved yet');
		}
		if (this._error) {
			throw this._error;
		}
		return this._value!;
	}
}

export class LazyStatefulPromise<T> {
	private readonly _promise = new Lazy(() => new StatefulPromise(this._compute()));

	constructor(
		private readonly _compute: () => Promise<T>,
	) { }

	/**
	 * Returns the resolved value.
	 * Throws if the promise is not resolved yet.
	 */
	public requireValue(): T {
		return this._promise.value.requireValue();
	}

	/**
	 * Returns the promise (and triggers a computation of the promise if not yet done so).
	 */
	public getPromise(): Promise<T> {
		return this._promise.value.promise;
	}

	/**
	 * Reads the current value without triggering a computation of the promise.
	 */
	public get currentValue(): T | undefined {
		return this._promise.rawValue?.value;
	}
}

//#endregion

//#region

const enum AsyncIterableSourceState {
	Initial,
	DoneOK,
	DoneError,
}

/**
 * An object that allows to emit async values asynchronously or bring the iterable to an error state using `reject()`.
 * This emitter is valid only for the duration of the executor (until the promise returned by the executor settles).
 */
export interface AsyncIterableEmitter<T> {
	/**
	 * The value will be appended at the end.
	 *
	 * **NOTE** If `reject()` has already been called, this method has no effect.
	 */
	emitOne(value: T): void;
	/**
	 * The values will be appended at the end.
	 *
	 * **NOTE** If `reject()` has already been called, this method has no effect.
	 */
	emitMany(values: T[]): void;
	/**
	 * Writing an error will permanently invalidate this iterable.
	 * The current users will receive an error thrown, as will all future users.
	 *
	 * **NOTE** If `reject()` have already been called, this method has no effect.
	 */
	reject(error: Error): void;
}

/**
 * An executor for the `AsyncIterableObject` that has access to an emitter.
 */
export interface AsyncIterableExecutor<T> {
	/**
	 * @param emitter An object that allows to emit async values valid only for the duration of the executor.
	 */
	(emitter: AsyncIterableEmitter<T>): unknown | Promise<unknown>;
}

/**
 * A rich implementation for an `AsyncIterable<T>`.
 */
export class AsyncIterableObject<T> implements AsyncIterable<T> {

	public static fromArray<T>(items: T[]): AsyncIterableObject<T> {
		return new AsyncIterableObject<T>((writer) => {
			writer.emitMany(items);
		});
	}

	public static fromPromise<T>(promise: Promise<T[]>): AsyncIterableObject<T> {
		return new AsyncIterableObject<T>(async (emitter) => {
			emitter.emitMany(await promise);
		});
	}

	public static fromPromisesResolveOrder<T>(promises: Promise<T>[]): AsyncIterableObject<T> {
		return new AsyncIterableObject<T>(async (emitter) => {
			await Promise.all(promises.map(async (p) => emitter.emitOne(await p)));
		});
	}

	public static merge<T>(iterables: AsyncIterable<T>[]): AsyncIterableObject<T> {
		return new AsyncIterableObject(async (emitter) => {
			await Promise.all(iterables.map(async (iterable) => {
				for await (const item of iterable) {
					emitter.emitOne(item);
				}
			}));
		});
	}

	public static EMPTY = AsyncIterableObject.fromArray<any>([]);

	private _state: AsyncIterableSourceState;
	private _results: T[];
	private _error: Error | null;
	private readonly _onReturn?: () => void | Promise<void>;
	private readonly _onStateChanged: Emitter<void>;

	constructor(executor: AsyncIterableExecutor<T>, onReturn?: () => void | Promise<void>) {
		this._state = AsyncIterableSourceState.Initial;
		this._results = [];
		this._error = null;
		this._onReturn = onReturn;
		this._onStateChanged = new Emitter<void>();

		queueMicrotask(async () => {
			const writer: AsyncIterableEmitter<T> = {
				emitOne: (item) => this.emitOne(item),
				emitMany: (items) => this.emitMany(items),
				reject: (error) => this.reject(error)
			};
			try {
				await Promise.resolve(executor(writer));
				this.resolve();
			} catch (err) {
				this.reject(err);
			} finally {
				writer.emitOne = undefined!;
				writer.emitMany = undefined!;
				writer.reject = undefined!;
			}
		});
	}

	[Symbol.asyncIterator](): AsyncIterator<T, undefined, undefined> {
		let i = 0;
		return {
			next: async () => {
				do {
					if (this._state === AsyncIterableSourceState.DoneError) {
						throw this._error;
					}
					if (i < this._results.length) {
						return { done: false, value: this._results[i++] };
					}
					if (this._state === AsyncIterableSourceState.DoneOK) {
						return { done: true, value: undefined };
					}
					await Event.toPromise(this._onStateChanged.event);
				} while (true);
			},
			return: async () => {
				this._onReturn?.();
				return { done: true, value: undefined };
			}
		};
	}

	public static map<T, R>(iterable: AsyncIterable<T>, mapFn: (item: T) => R): AsyncIterableObject<R> {
		return new AsyncIterableObject<R>(async (emitter) => {
			for await (const item of iterable) {
				emitter.emitOne(mapFn(item));
			}
		});
	}

	public map<R>(mapFn: (item: T) => R): AsyncIterableObject<R> {
		return AsyncIterableObject.map(this, mapFn);
	}

	public static filter<T>(iterable: AsyncIterable<T>, filterFn: (item: T) => boolean): AsyncIterableObject<T> {
		return new AsyncIterableObject<T>(async (emitter) => {
			for await (const item of iterable) {
				if (filterFn(item)) {
					emitter.emitOne(item);
				}
			}
		});
	}

	public filter<T2 extends T>(filterFn: (item: T) => item is T2): AsyncIterableObject<T2>;
	public filter(filterFn: (item: T) => boolean): AsyncIterableObject<T>;
	public filter(filterFn: (item: T) => boolean): AsyncIterableObject<T> {
		return AsyncIterableObject.filter(this, filterFn);
	}

	public static coalesce<T>(iterable: AsyncIterable<T | undefined | null>): AsyncIterableObject<T> {
		return <AsyncIterableObject<T>>AsyncIterableObject.filter(iterable, item => !!item);
	}

	public coalesce(): AsyncIterableObject<NonNullable<T>> {
		return AsyncIterableObject.coalesce(this) as AsyncIterableObject<NonNullable<T>>;
	}

	public static async toPromise<T>(iterable: AsyncIterable<T>): Promise<T[]> {
		const result: T[] = [];
		for await (const item of iterable) {
			result.push(item);
		}
		return result;
	}

	public toPromise(): Promise<T[]> {
		return AsyncIterableObject.toPromise(this);
	}

	/**
	 * The value will be appended at the end.
	 *
	 * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
	 */
	private emitOne(value: T): void {
		if (this._state !== AsyncIterableSourceState.Initial) {
			return;
		}
		// it is important to add new values at the end,
		// as we may have iterators already running on the array
		this._results.push(value);
		this._onStateChanged.fire();
	}

	/**
	 * The values will be appended at the end.
	 *
	 * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
	 */
	private emitMany(values: T[]): void {
		if (this._state !== AsyncIterableSourceState.Initial) {
			return;
		}
		// it is important to add new values at the end,
		// as we may have iterators already running on the array
		this._results = this._results.concat(values);
		this._onStateChanged.fire();
	}

	/**
	 * Calling `resolve()` will mark the result array as complete.
	 *
	 * **NOTE** `resolve()` must be called, otherwise all consumers of this iterable will hang indefinitely, similar to a non-resolved promise.
	 * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
	 */
	private resolve(): void {
		if (this._state !== AsyncIterableSourceState.Initial) {
			return;
		}
		this._state = AsyncIterableSourceState.DoneOK;
		this._onStateChanged.fire();
	}

	/**
	 * Writing an error will permanently invalidate this iterable.
	 * The current users will receive an error thrown, as will all future users.
	 *
	 * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
	 */
	private reject(error: Error) {
		if (this._state !== AsyncIterableSourceState.Initial) {
			return;
		}
		this._state = AsyncIterableSourceState.DoneError;
		this._error = error;
		this._onStateChanged.fire();
	}
}


export function createCancelableAsyncIterableProducer<T>(callback: (token: CancellationToken) => AsyncIterable<T>): CancelableAsyncIterableProducer<T> {
	const source = new CancellationTokenSource();
	const innerIterable = callback(source.token);

	return new CancelableAsyncIterableProducer<T>(source, async (emitter) => {
		const subscription = source.token.onCancellationRequested(() => {
			subscription.dispose();
			source.dispose();
			emitter.reject(new CancellationError());
		});
		try {
			for await (const item of innerIterable) {
				if (source.token.isCancellationRequested) {
					// canceled in the meantime
					return;
				}
				emitter.emitOne(item);
			}
			subscription.dispose();
			source.dispose();
		} catch (err) {
			subscription.dispose();
			source.dispose();
			emitter.reject(err);
		}
	});
}

export class AsyncIterableSource<T> {

	private readonly _deferred = new DeferredPromise<void>();
	private readonly _asyncIterable: AsyncIterableObject<T>;

	private _errorFn: (error: Error) => void;
	private _emitOneFn: (item: T) => void;
	private _emitManyFn: (item: T[]) => void;

	/**
	 *
	 * @param onReturn A function that will be called when consuming the async iterable
	 * has finished by the consumer, e.g the for-await-loop has be existed (break, return) early.
	 * This is NOT called when resolving this source by its owner.
	 */
	constructor(onReturn?: () => Promise<void> | void) {
		this._asyncIterable = new AsyncIterableObject(emitter => {

			if (earlyError) {
				emitter.reject(earlyError);
				return;
			}
			if (earlyItems) {
				emitter.emitMany(earlyItems);
			}
			this._errorFn = (error: Error) => emitter.reject(error);
			this._emitOneFn = (item: T) => emitter.emitOne(item);
			this._emitManyFn = (items: T[]) => emitter.emitMany(items);
			return this._deferred.p;
		}, onReturn);

		let earlyError: Error | undefined;
		let earlyItems: T[] | undefined;


		this._errorFn = (error: Error) => {
			if (!earlyError) {
				earlyError = error;
			}
		};
		this._emitOneFn = (item: T) => {
			if (!earlyItems) {
				earlyItems = [];
			}
			earlyItems.push(item);
		};
		this._emitManyFn = (items: T[]) => {
			if (!earlyItems) {
				earlyItems = items.slice();
			} else {
				items.forEach(item => earlyItems!.push(item));
			}
		};
	}

	get asyncIterable(): AsyncIterableObject<T> {
		return this._asyncIterable;
	}

	resolve(): void {
		this._deferred.complete();
	}

	reject(error: Error): void {
		this._errorFn(error);
		this._deferred.complete();
	}

	emitOne(item: T): void {
		this._emitOneFn(item);
	}

	emitMany(items: T[]) {
		this._emitManyFn(items);
	}
}

export function cancellableIterable<T>(iterableOrIterator: AsyncIterator<T> | AsyncIterable<T>, token: CancellationToken): AsyncIterableIterator<T> {
	const iterator = Symbol.asyncIterator in iterableOrIterator ? iterableOrIterator[Symbol.asyncIterator]() : iterableOrIterator;

	return {
		async next(): Promise<IteratorResult<T>> {
			if (token.isCancellationRequested) {
				return { done: true, value: undefined };
			}
			const result = await raceCancellation(iterator.next(), token);
			return result || { done: true, value: undefined };
		},
		throw: iterator.throw?.bind(iterator),
		return: iterator.return?.bind(iterator),
		[Symbol.asyncIterator]() {
			return this;
		}
	};
}

type ProducerConsumerValue<T> = {
	ok: true;
	value: T;
} | {
	ok: false;
	error: Error;
};

class ProducerConsumer<T> {
	private readonly _unsatisfiedConsumers: DeferredPromise<T>[] = [];
	private readonly _unconsumedValues: ProducerConsumerValue<T>[] = [];
	private _finalValue: ProducerConsumerValue<T> | undefined;

	public get hasFinalValue(): boolean {
		return !!this._finalValue;
	}

	produce(value: ProducerConsumerValue<T>): void {
		this._ensureNoFinalValue();
		if (this._unsatisfiedConsumers.length > 0) {
			const deferred = this._unsatisfiedConsumers.shift()!;
			this._resolveOrRejectDeferred(deferred, value);
		} else {
			this._unconsumedValues.push(value);
		}
	}

	produceFinal(value: ProducerConsumerValue<T>): void {
		this._ensureNoFinalValue();
		this._finalValue = value;
		for (const deferred of this._unsatisfiedConsumers) {
			this._resolveOrRejectDeferred(deferred, value);
		}
		this._unsatisfiedConsumers.length = 0;
	}

	private _ensureNoFinalValue(): void {
		if (this._finalValue) {
			throw new BugIndicatingError('ProducerConsumer: cannot produce after final value has been set');
		}
	}

	private _resolveOrRejectDeferred(deferred: DeferredPromise<T>, value: ProducerConsumerValue<T>): void {
		if (value.ok) {
			deferred.complete(value.value);
		} else {
			deferred.error(value.error);
		}
	}

	consume(): Promise<T> {
		if (this._unconsumedValues.length > 0 || this._finalValue) {
			const value = this._unconsumedValues.length > 0 ? this._unconsumedValues.shift()! : this._finalValue!;
			if (value.ok) {
				return Promise.resolve(value.value);
			} else {
				return Promise.reject(value.error);
			}
		} else {
			const deferred = new DeferredPromise<T>();
			this._unsatisfiedConsumers.push(deferred);
			return deferred.p;
		}
	}
}

/**
 * Important difference to AsyncIterableObject:
 * If it is iterated two times, the second iterator will not see the values emitted by the first iterator.
 */
export class AsyncIterableProducer<T> implements AsyncIterable<T> {
	private readonly _producerConsumer = new ProducerConsumer<IteratorResult<T>>();

	constructor(executor: AsyncIterableExecutor<T>, private readonly _onReturn?: () => void) {
		queueMicrotask(async () => {
			const p = executor({
				emitOne: value => this._producerConsumer.produce({ ok: true, value: { done: false, value: value } }),
				emitMany: values => {
					for (const value of values) {
						this._producerConsumer.produce({ ok: true, value: { done: false, value: value } });
					}
				},
				reject: error => this._finishError(error),
			});

			if (!this._producerConsumer.hasFinalValue) {
				try {
					await p;
					this._finishOk();
				} catch (error) {
					this._finishError(error);
				}
			}
		});
	}

	public static fromArray<T>(items: T[]): AsyncIterableProducer<T> {
		return new AsyncIterableProducer<T>((writer) => {
			writer.emitMany(items);
		});
	}

	public static fromPromise<T>(promise: Promise<T[]>): AsyncIterableProducer<T> {
		return new AsyncIterableProducer<T>(async (emitter) => {
			emitter.emitMany(await promise);
		});
	}

	public static fromPromisesResolveOrder<T>(promises: Promise<T>[]): AsyncIterableProducer<T> {
		return new AsyncIterableProducer<T>(async (emitter) => {
			await Promise.all(promises.map(async (p) => emitter.emitOne(await p)));
		});
	}

	public static merge<T>(iterables: AsyncIterable<T>[]): AsyncIterableProducer<T> {
		return new AsyncIterableProducer(async (emitter) => {
			await Promise.all(iterables.map(async (iterable) => {
				for await (const item of iterable) {
					emitter.emitOne(item);
				}
			}));
		});
	}

	public static EMPTY = AsyncIterableProducer.fromArray<any>([]);

	public static map<T, R>(iterable: AsyncIterable<T>, mapFn: (item: T) => R): AsyncIterableProducer<R> {
		return new AsyncIterableProducer<R>(async (emitter) => {
			for await (const item of iterable) {
				emitter.emitOne(mapFn(item));
			}
		});
	}

	public map<R>(mapFn: (item: T) => R): AsyncIterableProducer<R> {
		return AsyncIterableProducer.map(this, mapFn);
	}

	public static coalesce<T>(iterable: AsyncIterable<T | undefined | null>): AsyncIterableProducer<T> {
		return <AsyncIterableProducer<T>>AsyncIterableProducer.filter(iterable, item => !!item);
	}

	public coalesce(): AsyncIterableProducer<NonNullable<T>> {
		return AsyncIterableProducer.coalesce(this) as AsyncIterableProducer<NonNullable<T>>;
	}

	public static filter<T>(iterable: AsyncIterable<T>, filterFn: (item: T) => boolean): AsyncIterableProducer<T> {
		return new AsyncIterableProducer<T>(async (emitter) => {
			for await (const item of iterable) {
				if (filterFn(item)) {
					emitter.emitOne(item);
				}
			}
		});
	}

	public filter<T2 extends T>(filterFn: (item: T) => item is T2): AsyncIterableProducer<T2>;
	public filter(filterFn: (item: T) => boolean): AsyncIterableProducer<T>;
	public filter(filterFn: (item: T) => boolean): AsyncIterableProducer<T> {
		return AsyncIterableProducer.filter(this, filterFn);
	}

	private _finishOk(): void {
		if (!this._producerConsumer.hasFinalValue) {
			this._producerConsumer.produceFinal({ ok: true, value: { done: true, value: undefined } });
		}
	}

	private _finishError(error: Error): void {
		if (!this._producerConsumer.hasFinalValue) {
			this._producerConsumer.produceFinal({ ok: false, error: error });
		}
		// Warning: this can cause to dropped errors.
	}

	private readonly _iterator: AsyncIterator<T, void, void> = {
		next: () => this._producerConsumer.consume(),
		return: () => {
			this._onReturn?.();
			return Promise.resolve({ done: true, value: undefined });
		},
		throw: async (e) => {
			this._finishError(e);
			return { done: true, value: undefined };
		},
	};

	[Symbol.asyncIterator](): AsyncIterator<T, void, void> {
		return this._iterator;
	}
}

export class CancelableAsyncIterableProducer<T> extends AsyncIterableProducer<T> {
	constructor(
		private readonly _source: CancellationTokenSource,
		executor: AsyncIterableExecutor<T>
	) {
		super(executor);
	}

	cancel(): void {
		this._source.cancel();
	}
}

//#endregion

export const AsyncReaderEndOfStream = Symbol('AsyncReaderEndOfStream');

export class AsyncReader<T> {
	private _buffer: T[] = [];
	private _atEnd = false;

	public get endOfStream(): boolean { return this._buffer.length === 0 && this._atEnd; }
	private _extendBufferPromise: Promise<void> | undefined;

	constructor(
		private readonly _source: AsyncIterator<T>
	) {
	}

	public async read(): Promise<T | typeof AsyncReaderEndOfStream> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await this._extendBuffer();
		}
		if (this._buffer.length === 0) {
			return AsyncReaderEndOfStream;
		}
		return this._buffer.shift()!;
	}

	public async readWhile(predicate: (value: T) => boolean, callback: (element: T) => unknown): Promise<void> {
		do {
			const piece = await this.peek();
			if (piece === AsyncReaderEndOfStream) {
				break;
			}
			if (!predicate(piece)) {
				break;
			}
			await this.read(); // consume
			await callback(piece);
		} while (true);
	}

	public readBufferedOrThrow(): T | typeof AsyncReaderEndOfStream {
		const value = this.peekBufferedOrThrow();
		this._buffer.shift();
		return value;
	}

	public async consumeToEnd(): Promise<void> {
		while (!this.endOfStream) {
			await this.read();
		}
	}

	public async peek(): Promise<T | typeof AsyncReaderEndOfStream> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await this._extendBuffer();
		}
		if (this._buffer.length === 0) {
			return AsyncReaderEndOfStream;
		}
		return this._buffer[0];
	}

	public peekBufferedOrThrow(): T | typeof AsyncReaderEndOfStream {
		if (this._buffer.length === 0) {
			if (this._atEnd) {
				return AsyncReaderEndOfStream;
			}
			throw new BugIndicatingError('No buffered elements');
		}

		return this._buffer[0];
	}

	public async peekTimeout(timeoutMs: number): Promise<T | typeof AsyncReaderEndOfStream | undefined> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await raceTimeout(this._extendBuffer(), timeoutMs);
		}
		if (this._atEnd) {
			return AsyncReaderEndOfStream;
		}
		if (this._buffer.length === 0) {
			return undefined;
		}
		return this._buffer[0];
	}

	private _extendBuffer(): Promise<void> {
		if (this._atEnd) {
			return Promise.resolve();
		}

		if (!this._extendBufferPromise) {
			this._extendBufferPromise = (async () => {
				const { value, done } = await this._source.next();
				this._extendBufferPromise = undefined;
				if (done) {
					this._atEnd = true;
				} else {
					this._buffer.push(value);
				}
			})();
		}

		return this._extendBufferPromise;
	}
}
