/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../common/cancellation.js';
import { Disposable, DisposableStore, IDisposable } from '../../../common/lifecycle.js';
import { Embedding, nextMacrotask } from './embedding.js';
import { TimeApi } from './timeApi.js';
import { ROOT_TRACE, TraceContext } from './trace.js';
import { EventSource, VirtualClock, VirtualEvent, VirtualTime } from './virtualClock.js';

// ============================================================================
// Termination policy
// ============================================================================

/**
 * When a {@link Run} should terminate.
 *
 * Greenfield design choice: termination is *always* explicit. There is no
 * "bare run()" that terminates on first empty queue, because that creates a
 * race with the caller's microtask chain (the run can resolve before the
 * caller's `.then` has had a chance to schedule).
 */
export type TerminationPolicy =
	/** Resolve as soon as the virtual queue is empty. */
	| { readonly kind: 'idle' }
	/** Resolve when the token is cancelled AND the queue is empty. */
	| { readonly kind: 'token'; readonly token: CancellationToken }
	/** Resolve when virtual time has reached `time` and all events scheduled
	 *  at or before `time` have been processed. A sentinel event at `time`
	 *  is scheduled by the processor so virtual time always reaches it. */
	| { readonly kind: 'time'; readonly time: VirtualTime };

export const untilIdle: TerminationPolicy = { kind: 'idle' };
export function untilToken(token: CancellationToken): TerminationPolicy { return { kind: 'token', token }; }
export function untilTime(time: VirtualTime): TerminationPolicy { return { kind: 'time', time }; }

export interface RunOptions {
	readonly until: TerminationPolicy;
	/** Maximum number of virtual events this run will execute. Default: 100. */
	readonly maxEvents?: number;
	/** Maximum causal-trace depth this run will tolerate. Useful for catching
	 *  runaway self-rescheduling timers. */
	readonly maxTraceDepth?: number;
}

// ============================================================================
// Run — internal state for a single processor.run() invocation
// ============================================================================

type RunStatus = 'continue' | 'done' | { readonly error: Error };

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
		public readonly executedAtStart: number,
		public readonly maxEvents: number,
	) {
		this.promise = new Promise<void>((res, rej) => { this._resolve = res; this._reject = rej; });
	}

	settle(error?: Error): void {
		if (this._settled) { return; }
		this._settled = true;
		if (error) { this._reject(error); } else { this._resolve(); }
	}

	evaluate(clock: VirtualClock, executedTotal: number, makeOverflow: () => Error): RunStatus {
		const local = executedTotal - this.executedAtStart;
		if (local >= this.maxEvents && clock.hasEvents) {
			return { error: makeOverflow() };
		}

		const u = this.options.until;
		switch (u.kind) {
			case 'idle':
				return clock.hasEvents ? 'continue' : 'done';
			case 'token':
				return u.token.isCancellationRequested && !clock.hasEvents ? 'done' : 'continue';
			case 'time': {
				// Done iff every remaining event is strictly past the deadline.
				// The sentinel guarantees the queue is non-empty until at
				// least the deadline is reached, so we never resolve "early"
				// just because nothing has been scheduled yet.
				const next = clock.peekNext();
				return next === undefined || next.time > u.time ? 'done' : 'continue';
			}
		}
	}
}

// ============================================================================
// Step outcome — what the pure state machine tells the trampoline
// ============================================================================

type StepOutcome =
	/** Either a virtual event was executed, or a run was rejected for a
	 *  bookkeeping reason (depth/event overflow). The trampoline should let
	 *  the embedding decide how to reach the next step. */
	| 'progress'
	/** No actionable event under any active deadline. The trampoline should
	 *  park until something wakes the processor. */
	| 'park'
	/** No active runs. The trampoline should stop driving. */
	| 'quiesce';

// ============================================================================
// VirtualTimeProcessor
// ============================================================================

export interface VirtualTimeProcessorOptions {
	readonly defaultMaxEvents?: number;
}

/**
 * # VirtualTimeProcessor
 *
 * Drives a {@link VirtualClock} from the host event loop. This is the
 * **embedding** of a small virtual event loop into the host event loop.
 *
 * ## Responsibilities, separated
 *
 *  - {@link _step} is a *pure* state-machine advance. It reads the clock,
 *    decides what to do, optionally executes one virtual event, and returns
 *    a {@link StepOutcome}. It never touches host time.
 *
 *  - {@link _drive} is the *trampoline*. It calls `_step` and lets the
 *    {@link Embedding} decide whether to loop in place (`'continueSync'`)
 *    or schedule the next iteration on the host (`'cbScheduled'`). It is
 *    the only code that touches host time.
 *
 *  - {@link Run} carries the user's termination predicate. Runs are pure
 *    over `_step`'s observations; they never schedule.
 *
 * ## Invariants
 *
 *  1. **Single driver.** At any moment at most one `_drive` invocation is
 *     active per processor (the `_inDrive` guard).
 *
 *  2. **Step is pure w.r.t. host time.** `_step` only reads the clock,
 *     mutates the run set via settling, and synchronously runs at most one
 *     virtual event. It never calls into a host time API.
 *
 *  3. **Embedding chooses the host primitive.** Whether the next step runs
 *     inline, after a microtask drain, or on a paint frame is entirely the
 *     embedding's decision — *per event*.
 *
 *  4. **Park is breakable.** While parked, the processor wakes on
 *     {@link VirtualClock.onEventScheduled}, on a token cancellation, and
 *     on a new run being added.
 *
 *  5. **Disposal is terminal.** After dispose, all runs are rejected and
 *     `_step`/`_drive` short-circuit to `'quiesce'`.
 *
 * ## On the trace-reset sink
 *
 * The trace context's deferred reset (see {@link TraceContext.runAsHandler})
 * needs a "fire after the microtask closure" primitive. The processor passes
 * its *own* {@link nextMacrotask} as that sink, so the reset goes through
 * the same primitive the embedding uses for its own host hops. This removes
 * any race between the processor's hops and the trace-reset timer.
 */
export class VirtualTimeProcessor extends Disposable {

	private readonly _runs = new Map<Run, IDisposable>();
	private readonly _history: VirtualEvent[] = [];
	private _executedTotal = 0;
	private _disposed = false;

	private _inDrive = false;
	private _parkCleanup: IDisposable | undefined;

	private readonly _defaultMaxEvents: number;

	public get history(): readonly VirtualEvent[] { return this._history; }
	public get executedTotal(): number { return this._executedTotal; }

	constructor(
		private readonly _clock: VirtualClock,
		private readonly _embedding: Embedding,
		private readonly _realApi: TimeApi,
		opts: VirtualTimeProcessorOptions = {},
	) {
		super();
		this._defaultMaxEvents = opts.defaultMaxEvents ?? 100;
		this._register({ dispose: () => this._onDispose() });
	}

	// ---- Public API -----------------------------------------------------

	/** Start a run with the given termination policy. */
	run(options: RunOptions): Promise<void> {
		const run = new Run(options, this._executedTotal, options.maxEvents ?? this._defaultMaxEvents);
		const cleanup = new DisposableStore();

		// Wake the loop on token cancellation so the run can re-evaluate.
		if (options.until.kind === 'token') {
			cleanup.add(options.until.token.onCancellationRequested(() => this._wake()));
		}

		// For time-based termination, schedule a sentinel event at the
		// deadline. This guarantees virtual time reaches the deadline even if
		// the user never schedules anything else, and that the run does not
		// resolve early just because the queue happens to be empty *now*.
		if (options.until.kind === 'time' && options.until.time > this._clock.now) {
			const source: EventSource = { toString: () => `<deadline of run #${run.id}>` };
			cleanup.add(this._clock.schedule({
				time: options.until.time,
				source,
				run: () => { /* sentinel: no-op */ },
			}));
		}

		this._runs.set(run, cleanup);
		this._wake();
		return run.promise;
	}

	// ---- The pure step --------------------------------------------------

	private _step(): StepOutcome {
		if (this._disposed) { return 'quiesce'; }

		this._settleFinishedRuns();
		if (this._runs.size === 0) { return 'quiesce'; }

		const next = this._clock.peekNext();
		if (next === undefined) { return 'park'; }

		// Per-run trace-depth check: reject any run whose limit this event
		// would exceed, before executing.
		const traceDepth = next.trace?.depth ?? 0;
		let depthOverflow = false;
		for (const run of [...this._runs.keys()]) {
			const limit = run.options.maxTraceDepth;
			if (limit !== undefined && traceDepth > limit) {
				this._settleRun(run, this._buildDepthOverflow(run, traceDepth));
				depthOverflow = true;
			}
		}
		if (depthOverflow) { return 'progress'; }

		this._executeOne(next);
		return 'progress';
	}

	private _executeOne(event: VirtualEvent): void {
		try {
			TraceContext.instance.runAsHandler(
				event.trace ?? ROOT_TRACE,
				() => {
					const e = this._clock.runNext();
					if (e) {
						this._history.push(e);
						this._executedTotal++;
					}
				},
				{
					// Route the trace-reset through the same host primitive
					// the embedding uses, so there is no race between this
					// timer and the embedding's next hop.
					afterMicrotaskClosure: cb => nextMacrotask(this._realApi, cb),
				},
			);
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			// We can't tell which run "owned" the throwing event. Reject all
			// active runs so the failure is observed exactly once per caller.
			for (const run of [...this._runs.keys()]) { this._settleRun(run, err); }
		}
	}

	// ---- The trampoline -------------------------------------------------

	private readonly _drive = (): void => {
		if (this._inDrive) { return; }
		this._inDrive = true;
		try {
			while (true) {
				const outcome = this._step();
				if (outcome === 'quiesce') { return; }
				if (outcome === 'park') { this._park(); return; }

				// 'progress': read the next event so the embedding can pick a
				// per-event primitive. If there is none, loop and let the next
				// `_step` decide between 'park' and 'quiesce'.
				const next = this._clock.peekNext();
				if (next === undefined) { continue; }

				const choice = this._embedding(next, this._drive);
				if (choice === 'cbScheduled') { return; }
				// 'continueSync': loop in place.
			}
		} finally {
			this._inDrive = false;
		}
	};

	// ---- Park & wake ----------------------------------------------------

	private _park(): void {
		this._unpark();
		const store = new DisposableStore();
		store.add(this._clock.onEventScheduled(() => this._wake()));
		this._parkCleanup = store;
	}

	private _unpark(): void {
		this._parkCleanup?.dispose();
		this._parkCleanup = undefined;
	}

	private _wake(): void {
		if (this._disposed) { return; }
		this._unpark();
		// Re-enter the trampoline on a host macrotask, NOT a microtask. This:
		//  - coalesces multiple wake() calls in the same tick,
		//  - keeps the driver off the caller's stack frame, and
		//  - lets the entire pending microtask closure (including microtasks
		//    enqueued AFTER this `_wake` call within the same outer microtask
		//    -- e.g. `queueMicrotask(...)` calls inside an `AsyncIterable`
		//    constructor that runs after `clock.schedule` triggered the wake)
		//    drain before the next `_step`. A microtask hop here would queue
		//    the driver in FIFO order with those subsequent microtasks, so the
		//    driver could run a virtual event before the consumer-side promise
		//    chain that depends on it has settled.
		nextMacrotask(this._realApi, this._drive);
	}

	// ---- Run lifecycle --------------------------------------------------

	private _settleFinishedRuns(): void {
		for (const run of [...this._runs.keys()]) {
			if (run.settled) { continue; }
			const status = run.evaluate(this._clock, this._executedTotal, () => this._buildOverflow(run));
			if (status === 'done') {
				this._settleRun(run);
			} else if (typeof status === 'object') {
				this._settleRun(run, status.error);
			}
		}
	}

	private _settleRun(run: Run, error?: Error): void {
		const cleanup = this._runs.get(run);
		if (!cleanup) { return; }
		this._runs.delete(run);
		cleanup.dispose();
		run.settle(error);
	}

	private _buildOverflow(run: Run): Error {
		const local = this._executedTotal - run.executedAtStart;
		return new Error(
			`[VirtualTimeProcessor] Run #${run.id} exceeded maxEvents (${run.maxEvents}) — ` +
			`executed ${local} virtual event(s) and the queue is still not empty.`
		);
	}

	private _buildDepthOverflow(run: Run, depth: number): Error {
		return new Error(
			`[VirtualTimeProcessor] Run #${run.id} exceeded maxTraceDepth (${run.options.maxTraceDepth}) — ` +
			`next event has trace depth ${depth}. ` +
			`This usually indicates a runaway self-rescheduling timer.`
		);
	}

	private _onDispose(): void {
		this._disposed = true;
		this._unpark();
		const err = new Error('VirtualTimeProcessor disposed');
		for (const run of [...this._runs.keys()]) { this._settleRun(run, err); }
	}
}
