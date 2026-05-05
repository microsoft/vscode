/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator, tieBreakComparators } from '../../common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../common/cancellation.js';
import { Emitter } from '../../common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../common/lifecycle.js';
import { setTimeout0, setTimeout0IsFaster } from '../../common/platform.js';
import { ROOT_TRACE, Trace, TraceContext } from './traceableTimeApi.js';

export type TimeOffset = number;

export interface Scheduler {
	schedule(task: ScheduledTask): IDisposable;
	get now(): TimeOffset;
}

export interface ScheduledTask {
	readonly time: TimeOffset;
	readonly source: ScheduledTaskSource;
	readonly useRealAnimationFrame?: boolean;
	/**
	 * Causal trace attached at schedule time. Used for attribution in
	 * `toString()` and to re-install the trace when the task runs so that
	 * the task body (and its microtask drain) observes it.
	 */
	readonly trace?: Trace;

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
	originalFunctions?: TimeApi;
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
		return pushGlobalTimeApi(createVirtualTimeApi(this, options));
	}
}

/**
 * Termination policy of a single {@link AsyncSchedulerProcessor.run} call.
 */
export interface RunOptions {
	/**
	 * If set, the run resolves once the token is cancelled AND the virtual queue
	 * has been drained. Tasks scheduled before cancellation are still processed.
	 * If unset, the run resolves as soon as the virtual queue is empty.
	 */
	readonly token?: CancellationToken;
	/**
	 * If set, the run resolves once virtual time has reached this absolute
	 * timestamp, OR there is no scheduled task with `time <= virtualDeadline`
	 * (because then virtual time can never reach the deadline by itself).
	 */
	readonly virtualDeadline?: TimeOffset;
	/**
	 * Maximum number of virtual tasks this run will tolerate executing while
	 * its termination predicate is not yet satisfied. Exceeding this rejects
	 * the run with a debug-friendly overflow error.
	 *
	 * Counted from the moment the run was started, not from processor creation.
	 */
	readonly maxTasks?: number;
	/**
	 * Maximum causal chain depth (via {@link Trace.depth}) the run will
	 * tolerate. If a task is about to execute whose trace depth exceeds this
	 * limit, the run is rejected. Useful for catching runaway self-rescheduling
	 * (a timer that keeps scheduling its own successor indefinitely).
	 */
	readonly maxTaskDepth?: number;
}

type RunStatus = 'continue' | 'done' | { readonly error: Error };

/**
 * Internal record of a single {@link AsyncSchedulerProcessor.run} call.
 *
 * A {@link Run} is purely declarative: its termination predicate
 * ({@link evaluate}) is a pure function over the processor's observable state
 * (`scheduler.now`, `executedTotal`, the next task time, the token state).
 * The processor never mutates a run; it only inspects it and, when done,
 * resolves or rejects its {@link promise}.
 */
class Run {

	private static _idCounter = 0;
	public readonly id = ++Run._idCounter;

	public readonly promise: Promise<void>;
	private _resolve!: () => void;
	private _reject!: (e: Error) => void;
	private _settled = false;
	public get settled(): boolean { return this._settled; }

	constructor(
		public readonly options: RunOptions,
		public readonly tasksExecutedAtStart: number,
		public readonly effectiveMaxTasks: number,
	) {
		this.promise = new Promise<void>((res, rej) => {
			this._resolve = res;
			this._reject = rej;
		});
	}

	settle(error?: Error): void {
		if (this._settled) { return; }
		this._settled = true;
		if (error) { this._reject(error); } else { this._resolve(); }
	}

	evaluate(scheduler: TimeTravelScheduler, executedTotal: number, peekNextTime: TimeOffset | undefined, makeOverflowError: () => Error): RunStatus {
		const localExecuted = executedTotal - this.tasksExecutedAtStart;
		if (localExecuted >= this.effectiveMaxTasks && scheduler.hasScheduledTasks) {
			return { error: makeOverflowError() };
		}

		if (this.options.virtualDeadline !== undefined) {
			if (scheduler.now >= this.options.virtualDeadline) { return 'done'; }
			// Virtual time can only advance by executing tasks. If no scheduled
			// task can advance time up to the deadline, the run is effectively
			// done (otherwise the loop would idle-wait forever).
			if (peekNextTime === undefined || peekNextTime > this.options.virtualDeadline) { return 'done'; }
		}

		if (this.options.token === undefined) {
			return scheduler.hasScheduledTasks ? 'continue' : 'done';
		}

		if (this.options.token.isCancellationRequested && !scheduler.hasScheduledTasks) { return 'done'; }
		return 'continue';
	}

	describe(executedTotal: number, startTime: TimeOffset): string {
		const parts: string[] = [`#${this.id}`];
		if (this.options.token) {
			parts.push(this.options.token.isCancellationRequested ? 'token=cancelled' : 'token=pending');
		}
		if (this.options.virtualDeadline !== undefined) {
			const delta = this.options.virtualDeadline - startTime;
			const sign = delta < 0 ? '-' : '+';
			parts.push(`virtualDeadline=${sign}${Math.abs(delta)}ms`);
		}
		const localExecuted = executedTotal - this.tasksExecutedAtStart;
		parts.push(`executed=${localExecuted}/${this.effectiveMaxTasks}`);
		return parts.join(' ');
	}
}

/**
 * Drives a {@link TimeTravelScheduler} from the real microtask/macrotask queue,
 * yielding back to real time between virtual tasks so that promise callbacks
 * can run and (re)schedule virtual tasks before the next one is executed.
 *
 * # Invariants
 *
 * 1. **Single physical loop.** At any moment at most one async loop iterates
 *    the virtual queue. Concurrent {@link run} calls compose by registering
 *    additional {@link Run}s on the same loop.
 *
 * 2. **Yield-then-execute.** Each loop iteration yields to real time before
 *    executing the next virtual task. No two virtual tasks run back-to-back
 *    without a yield. Termination is re-evaluated after each yield.
 *
 * 3. **Termination is per-run and pure.** Each run carries its own termination
 *    options ({@link RunOptions}); deadlines, tokens and maxTasks are never
 *    stored as mutable processor state. This is what makes parallel runs with
 *    different deadlines compose cleanly.
 *
 * 4. **Loop respects the strictest deadline.** The loop never advances virtual
 *    time past `min(virtualDeadline of all active runs)`. Past-deadline runs
 *    are settled before the loop attempts the next yield.
 *
 * 5. **Idle waits are explicit and breakable.** When the queue is empty (or
 *    the next task is past every active deadline) the loop awaits a single
 *    composite signal: a new task being scheduled, a run being added, or a
 *    token being cancelled. It never busy-loops.
 *
 * 6. **Errors propagate via promise rejection.** A throwing virtual task or a
 *    {@link RunOptions.maxTasks} overflow rejects the relevant run(s). No
 *    sticky `_lastError` flag is left for the next caller.
 *
 * 7. **Disposal settles all runs.** {@link dispose} rejects every active run
 *    with a disposal error and lets the loop drain naturally.
 */
export class AsyncSchedulerProcessor extends Disposable {

	private readonly _runs = new Map<Run, IDisposable>();
	private readonly _history: ScheduledTask[] = [];
	private _executedTotal = 0;

	private _loopRunning = false;
	private _wakeup: (() => void) | undefined;

	private readonly _defaultMaxTasks: number;
	private readonly _useSetImmediate: boolean;
	private readonly _realTimeApi: TimeApi;
	private readonly _startTime: TimeOffset;

	public get history(): readonly ScheduledTask[] { return this._history; }

	constructor(
		private readonly scheduler: TimeTravelScheduler,
		options?: { useSetImmediate?: boolean; maxTaskCount?: number; realTimeApi?: TimeApi }
	) {
		super();
		this._defaultMaxTasks = options?.maxTaskCount ?? 100;
		this._useSetImmediate = options?.useSetImmediate ?? false;
		this._realTimeApi = options?.realTimeApi ?? originalGlobalValues;
		this._startTime = scheduler.now;

		this._register({ dispose: () => this._disposeAllRuns() });
	}

	/**
	 * Start a run with the given termination policy.
	 *
	 * - With no options: resolves when the virtual queue is empty.
	 * - With `token`: resolves when the token is cancelled AND the queue is
	 *   drained. Tasks scheduled before cancellation are still processed.
	 * - With `virtualDeadline`: resolves when virtual time reaches the deadline,
	 *   or when no scheduled task remains within it.
	 * - With `maxTasks`: rejects if the run executes more than that many virtual
	 *   tasks before its other termination conditions are satisfied.
	 *
	 * Multiple parallel runs share the same processing loop; each resolves
	 * independently when its own predicate fires.
	 */
	run(options: RunOptions = {}): Promise<void> {
		return this._startRun(options);
	}

	private _startRun(options: RunOptions): Promise<void> {
		const run = new Run(options, this._executedTotal, options.maxTasks ?? this._defaultMaxTasks);
		const cleanup = new DisposableStore();
		if (options.token) {
			cleanup.add(options.token.onCancellationRequested(() => this._wake()));
		}
		this._runs.set(run, cleanup);
		this._wake();
		void this._ensureLoopRunning();
		return run.promise;
	}

	private _settleRun(run: Run, error?: Error): void {
		const cleanup = this._runs.get(run);
		if (!cleanup) { return; }
		this._runs.delete(run);
		cleanup.dispose();
		run.settle(error);
	}

	private _disposeAllRuns(): void {
		const err = new Error('AsyncSchedulerProcessor disposed');
		for (const run of [...this._runs.keys()]) {
			this._settleRun(run, err);
		}
		this._wake();
	}

	private _wake(): void {
		const w = this._wakeup;
		this._wakeup = undefined;
		w?.();
	}

	private async _ensureLoopRunning(): Promise<void> {
		if (this._loopRunning) { return; }
		this._loopRunning = true;
		try {
			await this._loop();
		} finally {
			this._loopRunning = false;
		}
	}

	private async _loop(): Promise<void> {
		while (true) {
			this._settleFinishedRuns();
			if (this._runs.size === 0) { return; }

			const next = this.scheduler.peekNext();
			const minDeadline = this._minDeadline();

			if (!next || next.time > minDeadline) {
				// Nothing actionable. Wait for a new task to be scheduled, a
				// token to be cancelled, a new run to be added, or disposal.
				await this._waitForChange();
				continue;
			}

			// Invariant 2: yield to real time before each virtual execution.
			await this._yieldToReal(next);

			// Re-check after yielding: anything could have changed.
			this._settleFinishedRuns();
			if (this._runs.size === 0) { return; }

			const stillNext = this.scheduler.peekNext();
			if (!stillNext || stillNext.time > this._minDeadline()) { continue; }

			// Check per-run maxTaskDepth: if this task's causal depth exceeds
			// any active run's limit, reject that run before executing.
			const taskDepth = stillNext.trace?.depth ?? 0;
			let overflowed = false;
			for (const run of [...this._runs.keys()]) {
				const limit = run.options.maxTaskDepth;
				if (limit !== undefined && taskDepth > limit) {
					this._settleRun(run, this._buildDepthOverflowError(run, taskDepth));
					overflowed = true;
				}
			}
			if (overflowed) { continue; }

			try {
				// Execute the task under its causal trace so that its body
				// and subsequent microtask drain observe it. `runAsHandler`
				// keeps the trace in place across the microtask drain by
				// scheduling a seq-guarded reset on the next real-time tick.
				TraceContext.instance.runAsHandler(stillNext.trace ?? ROOT_TRACE, () => {
					const executed = this.scheduler.runNext();
					if (executed) {
						this._history.push(executed);
						this._executedTotal++;
					}
				}, this._realTimeApi);
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				// We can't tell which run "owned" the throwing task. Reject all
				// active runs so the failure is observed exactly once per caller.
				for (const run of [...this._runs.keys()]) {
					this._settleRun(run, err);
				}
			}
		}
	}

	private _settleFinishedRuns(): void {
		const peekNextTime = this.scheduler.peekNext()?.time;
		for (const run of [...this._runs.keys()]) {
			if (run.settled) { continue; }
			const status = run.evaluate(this.scheduler, this._executedTotal, peekNextTime, () => this._buildOverflowError(run));
			if (status === 'done') {
				this._settleRun(run);
			} else if (typeof status === 'object') {
				this._settleRun(run, status.error);
			}
		}
	}

	private _minDeadline(): TimeOffset {
		let m = Number.MAX_SAFE_INTEGER;
		for (const run of this._runs.keys()) {
			if (run.options.virtualDeadline !== undefined && run.options.virtualDeadline < m) {
				m = run.options.virtualDeadline;
			}
		}
		return m;
	}

	private _waitForChange(): Promise<void> {
		return new Promise<void>(resolve => {
			const store = new DisposableStore();
			const fire = () => {
				if (this._wakeup === fire) { this._wakeup = undefined; }
				store.dispose();
				resolve();
			};
			this._wakeup = fire;
			store.add(this.scheduler.onTaskScheduled(fire));
		});
	}

	private _yieldToReal(next: ScheduledTask): Promise<void> {
		return new Promise<void>(resolve => {
			// Drain microtasks first so promises chained to the previous task
			// can settle and schedule virtual tasks before the next runs.
			Promise.resolve().then(() => {
				if (next.useRealAnimationFrame && this._realTimeApi.requestAnimationFrame) {
					this._realTimeApi.requestAnimationFrame(() => resolve());
				} else if (this._useSetImmediate && this._realTimeApi.setImmediate) {
					this._realTimeApi.setImmediate(() => resolve());
				} else if (setTimeout0IsFaster) {
					setTimeout0(() => resolve());
				} else {
					this._realTimeApi.setTimeout(() => resolve());
				}
			});
		});
	}

	private _buildOverflowError(run: Run): Error {
		const localExecuted = this._executedTotal - run.tasksExecutedAtStart;
		const limit = run.effectiveMaxTasks;
		return new Error(
			`[AsyncSchedulerProcessor] Run #${run.id} exceeded maxTasks (${limit}) — ` +
			`executed ${localExecuted} virtual task(s) and the queue is still not empty.\n\n` +
			this.toString()
		);
	}

	private _buildDepthOverflowError(run: Run, taskDepth: number): Error {
		const limit = run.options.maxTaskDepth!;
		return new Error(
			`[AsyncSchedulerProcessor] Run #${run.id} exceeded maxTaskDepth (${limit}) — ` +
			`next task has causal depth ${taskDepth}. This usually indicates ` +
			`a runaway self-rescheduling timer.\n\n` +
			this.toString()
		);
	}

	/**
	 * A debug-friendly snapshot of the processor: virtual time, active runs,
	 * recent history (with stack traces) and currently queued tasks.
	 */
	override toString(): string {
		const queued = this.scheduler.getScheduledTasks();
		const lines: string[] = [];
		const fmt = (task: ScheduledTask, indent: string) => formatScheduledTask(task, indent, this._startTime);

		lines.push(
			`AsyncSchedulerProcessor { ` +
			`now=+${this.scheduler.now - this._startTime}ms, ` +
			`executed=${this._executedTotal}, ` +
			`queued=${queued.length}, ` +
			`runs=${this._runs.size}, ` +
			`loopRunning=${this._loopRunning} }`
		);

		if (this._runs.size > 0) {
			lines.push('');
			lines.push('Active runs:');
			for (const run of this._runs.keys()) {
				lines.push(`  ${run.describe(this._executedTotal, this._startTime)}`);
			}
		}

		const HISTORY_LIMIT = 10;
		if (this._history.length > 0) {
			const recent = this._history.slice(-HISTORY_LIMIT);
			lines.push('');
			const omitted = this._history.length - recent.length;
			lines.push(`History (${recent.length}${omitted > 0 ? ` of ${this._history.length}` : ''}):`);
			for (const t of recent) {
				lines.push(fmt(t, '  '));
			}
		}

		if (queued.length > 0) {
			const QUEUE_LIMIT = 20;
			const shown = queued.slice(0, QUEUE_LIMIT);
			lines.push('');
			lines.push(`Queued (${queued.length}):`);
			for (const t of shown) {
				lines.push(fmt(t, '  '));
			}
			if (queued.length > shown.length) {
				lines.push(`  ... and ${queued.length - shown.length} more`);
			}
		}

		return lines.join('\n');
	}
}

function formatScheduledTask(task: ScheduledTask, indent: string, startTime: TimeOffset): string {
	const delta = task.time - startTime;
	const sign = delta < 0 ? '-' : '+';
	const time = `${sign}${Math.abs(delta)}ms`.padStart(8);
	const head = `${indent}[${time}] ${task.source.toString()}`;
	const lines: string[] = [head];
	if (task.trace) {
		lines.push(`${indent}    trace: ${task.trace.describe()}`);
	}
	const stack = task.source.stackTrace;
	if (stack) {
		const stackLines = stack.split('\n').map(l => l.trim()).filter(l => l.length > 0);
		// Drop the leading "Error" line that `new Error().stack` produces,
		// then keep a few useful frames.
		const frames = (stackLines[0]?.startsWith('Error') ? stackLines.slice(1) : stackLines).slice(0, 5);
		for (const f of frames) {
			lines.push(`${indent}    ${f}`);
		}
	}
	return lines.join('\n');
}

export async function runWithFakedTimers<T>(options: { startTime?: number; useFakeTimers?: boolean; useSetImmediate?: boolean; maxTaskCount?: number }, fn: () => Promise<T>): Promise<T> {
	const useFakeTimers = options.useFakeTimers === undefined ? true : options.useFakeTimers;
	if (!useFakeTimers) {
		return fn();
	}

	const scheduler = new TimeTravelScheduler(options.startTime ?? 0);
	const schedulerProcessor = new AsyncSchedulerProcessor(scheduler, { useSetImmediate: options.useSetImmediate, maxTaskCount: options.maxTaskCount });
	const globalInstallDisposable = scheduler.installGlobally();

	// Start processing. With a token, run() keeps processing tasks until the
	// token is cancelled and the queue is drained, so tasks scheduled during
	// fn() are processed concurrently.
	const cts = new CancellationTokenSource();
	const runPromise = schedulerProcessor.run({ token: cts.token });

	let didThrow = true;
	let result: T;
	try {
		result = await fn();
		didThrow = false;
	} finally {
		globalInstallDisposable.dispose();

		// Signal that fn() is done: run() should drain the queue (for success)
		// or stop immediately (for error) and then resolve.
		// Since the global override is already disposed, no more tasks will be
		// scheduled during the final drain.
		cts.cancel();

		try {
			if (!didThrow) {
				await runPromise;
			} else {
				// Avoid an unhandled rejection when disposal below rejects the run.
				runPromise.catch(() => { /* swallowed: fn() already failed */ });
			}
		} finally {
			cts.dispose();
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
		originalFunctions: {
			setTimeout: globalThis.setTimeout,
			clearTimeout: globalThis.clearTimeout,
			setInterval: globalThis.setInterval,
			clearInterval: globalThis.clearInterval,
			setImmediate: globalThis.setImmediate,
			clearImmediate: globalThis.clearImmediate,
			requestAnimationFrame: globalThis.requestAnimationFrame,
			cancelAnimationFrame: globalThis.cancelAnimationFrame,
			Date: globalThis.Date,
		},
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
		const stackTrace = new Error().stack;
		const trace = TraceContext.instance.currentTrace().child(`setTimeout(${timeout}ms)`, stackTrace);
		return scheduler.schedule({
			time: scheduler.now + timeout,
			run: () => { handler(); },
			source: {
				toString() { return 'setTimeout'; },
				stackTrace,
			},
			trace,
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
		const baseTrace = TraceContext.instance.currentTrace().child(`setInterval(${interval}ms)`, stackTrace);
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
				},
				trace: baseTrace.child(`tick #${curIter}`),
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

	// Expose the real setTimeout as `originalFn` on the virtual one. The component-explorer
	// host's polling loop reads `globalThis.setTimeout.originalFn` to escape virtual time
	// when waiting for renders to settle. Without this, the host's poll re-arms inside
	// virtual time and triggers the AsyncSchedulerProcessor's depth-overflow guard.
	// eslint-disable-next-line local/code-no-any-casts
	(api.setTimeout as any).originalFn = originalGlobalValues.setTimeout;

	if (options?.fakeRequestAnimationFrame) {
		let rafIdCounter = 0;
		const rafDisposables = new Map<number, IDisposable>();

		api.requestAnimationFrame = (callback: (time: number) => void) => {
			const id = ++rafIdCounter;
			const stackTrace = new Error().stack;
			const trace = TraceContext.instance.currentTrace().child('requestAnimationFrame', stackTrace);
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
					stackTrace,
				},
				trace,
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

export function pushGlobalTimeApi(api: TimeApi): IDisposable {
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
			Object.assign(globalThis, captured.originalFunctions ?? captured);
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
