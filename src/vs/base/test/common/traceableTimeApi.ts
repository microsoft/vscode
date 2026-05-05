/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../common/errors.js';
import type { TimeApi } from './timeTravelScheduler.js';

/**
 * # Trace / tracing time api — theory of operation
 *
 * ## The problem
 *
 * In a test runtime where many async activities interleave (parallel fixtures,
 * timers, promise chains), we want to ask of any scheduled action: "who
 * caused this?". Clean causal attribution is useful for:
 *  - debugging ("which fixture left this timer queued?"),
 *  - per-owner termination criteria ("queue drained *for my fixture*"),
 *  - attribution in error messages.
 *
 * ## The model
 *
 * A {@link Trace} is an immutable value identifying a causal chain:
 *
 *   Trace = { id; parent?: Trace; label: string; stack?: string; root: Trace }
 *
 * Roots have no parent. Every non-root trace's `root` points back to the top
 * of its chain. Traces are only created by user code, timer wrappers, or the
 * scheduler — never implicitly.
 *
 * ## The runtime state: {@link TraceContext}
 *
 * A {@link TraceContext} owns the mutable "current frame" slot plus a
 * boolean re-entry guard. Production code uses the shared
 * {@link TraceContext.instance}; tests can construct fresh instances for
 * full isolation. The slot is mutated by two primitives:
 *
 *  - {@link TraceContext.runWithTrace}(t, fn): set current=t, run fn
 *    synchronously, restore previous frame on exit. Nesting is supported.
 *    Microtasks enqueued by fn that run *after* fn returns see the
 *    restored trace. Use only for bounded synchronous regions.
 *
 *  - {@link TraceContext.runAsHandler}(t, fn, resetApi): set current=t,
 *    run fn, and
 *    **do not restore synchronously**. The trace is reset on the next
 *    macrotask via `resetApi.setTimeout(0)`, guarded by a sequence number.
 *    Any microtask drain that follows `fn` — including `await` continuations
 *    inside `fn` — inherits `t`. Throws if called while another runAsHandler
 *    is on the JS call stack. Use for timer callbacks and other async
 *    entry points (e.g. the fixture's render body).
 *
 * ## Why this works for attribution
 *
 * The JS event loop drains microtasks to completion between macrotasks. So
 * any microtask enqueued during a macrotask runs with whatever `_currentTrace`
 * that macrotask left behind. If that macrotask is a timer callback that
 * used `runAsHandler(t, ...)`, every continuation during its drain sees `t`,
 * and any timer scheduled during that drain captures `t` via the tracing
 * TimeApi wrapper.
 *
 * Across macrotasks, the chain is preserved by the wrapper: each call to
 * `setTimeout`/`setInterval`/`requestAnimationFrame` going through
 * {@link createTracingTimeApi} captures the current trace at schedule time
 * and re-installs it (as a child) via `runAsHandler` when the callback fires.
 *
 * ## Why the identity-guarded reset is correct
 *
 * Two macrotasks A, B firing back-to-back:
 *
 *   [A]   runAsHandler(t_A, fnA)    -> _current = frame_A; schedule reset_A
 *   [micro drain]                   -> await continuations see t_A
 *   [B]   runAsHandler(t_B, fnB)    -> _current = frame_B; schedule reset_B
 *   [micro drain]                   -> await continuations see t_B
 *   [reset_A fires]                 -> sees _current !== frame_A -> no-op
 *   [reset_B fires]                 -> _current = frame_A.prev (or its prev)
 *
 * Each `runAsHandler` mints a fresh {@link Frame}, so the active-frame
 * identity check rejects stale resets. This tolerates arbitrary
 * interleaving of concurrent handlers (e.g. parallel fixtures) correctly.
 *
 * ## Caveat: sync re-entry is a bug
 *
 * `runAsHandler` throws if another `runAsHandler` is already on the JS
 * stack. Timer callbacks never run nested on the same stack (the event
 * loop runs one at a time), so this throw only fires for misuse (e.g. a
 * handler synchronously calling another handler). Nested
 * {@link runWithTrace} is always fine — it push/pops synchronously.
 */

export class Trace {
	private static _idCounter = 0;

	public readonly id: number = ++Trace._idCounter;
	public readonly root: Trace;
	public readonly depth: number;
	public readonly createdAt: number = Date.now();

	constructor(
		public readonly parent: Trace | undefined,
		public readonly label: string,
		public readonly stack: string | undefined = undefined,
	) {
		this.root = parent?.root ?? this;
		this.depth = (parent?.depth ?? -1) + 1;
	}

	child(label: string, stack?: string): Trace {
		return new Trace(this, label, stack);
	}

	/**
	 * Renders the causal chain as "#id label ← #id label ← … ← #id label".
	 */
	describe(): string {
		const parts: string[] = [];
		for (let t: Trace | undefined = this; t; t = t.parent) {
			parts.push(`#${t.id} ${t.label}`);
		}
		return parts.join(' ← ');
	}

	toString(): string { return this.describe(); }
}

/** Sentinel root for "no known provenance". */
export const ROOT_TRACE: Trace = new Trace(undefined, '<root>');

export function createTraceRoot(label: string, stack?: string): Trace {
	return new Trace(undefined, label, stack);
}

// ============================================================================
// TraceContext: encapsulated trace state
// ============================================================================

export interface TracingTimeApiOptions {
	/** Capture a stack trace on every schedule call. Expensive; enable for
	 *  debugging only. */
	readonly captureStacks?: boolean;
	/** Observer hook. Called synchronously on schedule and on fire. */
	readonly onEvent?: (event: TracingTimeEvent) => void;
}

export type TracingTimeEvent =
	| { readonly kind: 'schedule'; readonly api: string; readonly trace: Trace; readonly delayMs?: number }
	| { readonly kind: 'fire'; readonly api: string; readonly trace: Trace }
	| { readonly kind: 'throw'; readonly api: string; readonly trace: Trace; readonly error: unknown };

/**
 * A pushed/popped trace activation. A fresh `Frame` is minted by every
 * `runWithTrace` / `runAsHandler` call; identity is what the deferred
 * reset in `runAsHandler` uses to detect that it's stale.
 */
interface Frame {
	readonly trace: Trace;
	readonly prev: Frame | undefined;
}

const ROOT_FRAME: Frame = { trace: ROOT_TRACE, prev: undefined };

/**
 * Holds the mutable "current frame" slot and exposes the trace propagation
 * primitives as methods.
 *
 * Invariants:
 *  - Reads (`currentTrace()`) are pure.
 *  - Writes happen only inside `runWithTrace` / `runAsHandler` bodies.
 *  - Each call mints a fresh {@link Frame} object. A scheduled reset only
 *    fires if `_current` still points at *its* frame — preventing a stale
 *    reset from clobbering a newer installation.
 *  - `_isHandlerRunning` is true iff a `runAsHandler` frame is on the JS
 *    call stack. It returns to false between macrotasks.
 *
 * Production callers go through {@link TraceContext.instance}. Tests may
 * construct fresh instances to get full isolation.
 */
export class TraceContext {
	/** Shared default context. Production callers use this. */
	public static readonly instance = new TraceContext();

	private _current: Frame = ROOT_FRAME;
	private _isHandlerRunning: boolean = false;
	private _log: { trace: Trace; message: string }[] = [];

	currentTrace(): Trace { return this._current.trace; }

	/**
	 * Append `message` to an in-memory log, tagged with the current trace.
	 * Useful for tests that want to assert the interleaving of work across
	 * causally distinct roots. Drain via {@link takeLog}.
	 */
	log(message: string): void {
		this._log.push({ trace: this._current.trace, message });
	}

	/** Drain and return all entries logged via {@link log}. */
	takeLog(): readonly { trace: Trace; message: string }[] {
		const entries = this._log;
		this._log = [];
		return entries;
	}

	/**
	 * Install `t` as the current trace for the synchronous duration of `fn`,
	 * then restore the previous trace. Nestable. Does NOT propagate `t` into
	 * microtasks enqueued by fn that run *after* fn returns.
	 *
	 * Use for bounded synchronous scopes (e.g. iterating a batch of tagged
	 * callbacks within a single tick).
	 */
	runWithTrace<T>(t: Trace, fn: () => T): T {
		const prev = this._current;
		const next = { trace: t, prev };
		this._current = next;
		try {
			return fn();
		} finally {
			if (this._current !== next) {
				// eslint-disable-next-line no-unsafe-finally
				throw new BugIndicatingError(
					`traceableTimeApi: runWithTrace detected unexpected mutation. ` +
					`current=${this._current.trace.describe()}, expected=${t.describe()}`
				);
			}
			this._current = prev;
		}
	}

	/**
	 * Install `t` as the current trace, run `fn`, and keep `t` installed
	 * through the microtask drain that follows. Restore the previous trace
	 * via an identity-guarded `resetApi.setTimeout(0)` so that awaited
	 * continuations within `fn` observe `t`.
	 *
	 * Throws if called while another `runAsHandler` frame is on the JS call
	 * stack (synchronous re-entry is a bug).
	 */
	runAsHandler<T>(t: Trace, fn: () => T, resetApi: TimeApi): T {
		if (this._isHandlerRunning) {
			throw new Error(
				`traceableTimeApi: re-entrant runAsHandler detected. ` +
				`current=${this._current.trace.describe()}, incoming=${t.describe()}`
			);
		}
		const prev = this._current;
		const next: Frame = { trace: t, prev };
		this._current = next;
		this._isHandlerRunning = true;
		try {
			return fn();
		} finally {
			this._isHandlerRunning = false;
			// Do NOT restore synchronously: microtasks enqueued by fn (including
			// awaited continuations) must observe `t`. Schedule an
			// identity-guarded reset on the next macrotask via the raw
			// real-time API.
			//
			// `_current !== next` is the normal case when handlers
			// interleave: another `runAsHandler` ran between us scheduling
			// this reset and it firing, so it pushed its own frame and
			// queued its own reset that will do the restoring. Skipping
			// here is correct — see the class doc "identity-guarded reset".
			resetApi.setTimeout(() => {
				if (this._current === next) {
					this._current = prev;
				}
			}, 0);
		}
	}

	/**
	 * Wrap `wrapped` so that every scheduled callback is tagged with the
	 * current trace at schedule time, and re-installed via
	 * {@link runAsHandler} when it fires. `resetApi` is used to schedule
	 * trace resets and must be a real-time API (pointing it at a virtual
	 * API would prevent resets from ever firing).
	 *
	 * Re-entrancy with a virtual-time scheduler: do NOT stack this wrapper
	 * over a virtual-time `TimeApi`. The scheduler already installs traces
	 * via `runAsHandler` when it runs each task, and a second
	 * `runAsHandler` from this wrapper would trip the sync re-entry guard.
	 */
	createTracingTimeApi(
		wrapped: TimeApi,
		resetApi: TimeApi,
		options: TracingTimeApiOptions = {},
	): TimeApi {
		const captureStacks = options.captureStacks ?? false;
		const onEvent = options.onEvent;

		const capture = (label: string, delayMs?: number): Trace => {
			const stack = captureStacks ? new Error().stack : undefined;
			const t = this._current.trace.child(label, stack);
			onEvent?.({ kind: 'schedule', api: label, trace: t, delayMs });
			return t;
		};

		const invoke = (trace: Trace, api: string, body: () => void): void => {
			onEvent?.({ kind: 'fire', api, trace });
			try {
				this.runAsHandler(trace, body, resetApi);
			} catch (e) {
				onEvent?.({ kind: 'throw', api, trace, error: e });
				throw e;
			}
		};

		const api: TimeApi = {
			Date: wrapped.Date,
			setTimeout: (handler: () => void, ms?: number) => {
				const t = capture(`setTimeout(${ms ?? 0}ms)`, ms);
				return wrapped.setTimeout(() => invoke(t, 'setTimeout', handler), ms);
			},
			clearTimeout: (id: unknown) => wrapped.clearTimeout(id),
			setInterval: (handler: () => void, interval: number) => {
				const base = capture(`setInterval(${interval}ms)`, interval);
				let tickIdx = 0;
				return wrapped.setInterval(() => {
					const tickTrace = base.child(`tick #${++tickIdx}`);
					invoke(tickTrace, 'setInterval', handler);
				}, interval);
			},
			clearInterval: (id: unknown) => wrapped.clearInterval(id),
		};

		if (wrapped.setImmediate) {
			api.setImmediate = (handler: () => void) => {
				const t = capture('setImmediate');
				return wrapped.setImmediate!(() => invoke(t, 'setImmediate', handler));
			};
			api.clearImmediate = (id: unknown) => wrapped.clearImmediate?.(id);
		}

		if (wrapped.requestAnimationFrame) {
			api.requestAnimationFrame = (cb: (time: number) => void) => {
				const t = capture('requestAnimationFrame');
				return wrapped.requestAnimationFrame!(time => invoke(t, 'requestAnimationFrame', () => cb(time)));
			};
			api.cancelAnimationFrame = (id: number) => wrapped.cancelAnimationFrame?.(id);
		}

		api.originalFunctions = wrapped.originalFunctions ?? wrapped;
		return api;
	}

	/** Reset state. Only intended for tests. */
	_resetForTesting(): void {
		this._current = ROOT_FRAME;
		this._isHandlerRunning = false;
		this._log = [];
	}
}
