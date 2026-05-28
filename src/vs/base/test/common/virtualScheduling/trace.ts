/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../common/errors.js';

/**
 * # Trace — causal-chain attribution for scheduled work
 *
 * A {@link Trace} is an immutable value identifying a causal chain. Every
 * non-root trace carries a `parent`; the head of the chain has no parent.
 * Use {@link child} to extend a chain when scheduling follow-up work.
 *
 * Traces are used to answer "who caused this?" for any virtual event:
 * useful for debugging, for per-owner termination, and for attribution in
 * error messages.
 */
export class Trace {
	private static _idCounter = 0;
	public readonly id: number = ++Trace._idCounter;
	public readonly root: Trace;
	public readonly depth: number;

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

	/** "#id label ← #id label ← … ← #id label" */
	describe(): string {
		const parts: string[] = [];
		for (let t: Trace | undefined = this; t; t = t.parent) {
			parts.push(`#${t.id} ${t.label}`);
		}
		return parts.join(' ← ');
	}

	toString(): string { return this.describe(); }
}

/** Sentinel for "no known causal predecessor". */
export const ROOT_TRACE: Trace = new Trace(undefined, '<root>');

export function createTraceRoot(label: string, stack?: string): Trace {
	return new Trace(undefined, label, stack);
}

interface Frame {
	readonly trace: Trace;
	readonly prev: Frame | undefined;
}

const ROOT_FRAME: Frame = { trace: ROOT_TRACE, prev: undefined };

/**
 * Options for {@link TraceContext.runAsHandler}.
 *
 * # Why this is a per-call option
 *
 * `runAsHandler` cannot restore the previous trace synchronously: microtasks
 * enqueued by `fn` (including awaited continuations) must observe the new
 * trace. So the reset is deferred — but it must fire after the *closure* of
 * the microtask queue (the current microtask plus every microtask it
 * recursively enqueues), not just one drain.
 *
 * Per spec, the host doesn't run a macrotask until the microtask queue is
 * empty, so any macrotask primitive (`setTimeout(0)`, `setImmediate`, the
 * `setTimeout0` shim) achieves this. Letting the *caller* supply the sink
 * means:
 *
 *   - the {@link VirtualTimeProcessor} can route the reset through the same
 *     primitive its embedding uses for its own host hops, eliminating any
 *     race between the processor's hops and the trace-reset timer;
 *
 *   - production code without a processor can still use a real
 *     `setTimeout(0)`-based sink and get the same semantics;
 *
 *   - tests can install a deterministic sink (e.g. a hand-driven queue) for
 *     fully synchronous assertions.
 */
export interface RunAsHandlerOptions {
	/**
	 * Sink for the deferred trace-reset.
	 *
	 * Must invoke `reset` after the microtask closure that follows the
	 * `runAsHandler` call returns — i.e. on the next host macrotask.
	 */
	readonly afterMicrotaskClosure: (reset: () => void) => void;
}

/**
 * Holds the mutable "current trace frame" slot. Construct fresh instances
 * for test isolation, or use {@link TraceContext.instance} for shared state.
 */
export class TraceContext {
	public static readonly instance = new TraceContext();

	private _current: Frame = ROOT_FRAME;
	private _isHandlerRunning = false;

	currentTrace(): Trace { return this._current.trace; }

	/**
	 * Install `t` as current for the synchronous duration of `fn`, then
	 * restore. Nestable. Microtasks enqueued by fn that run after fn returns
	 * see the *restored* trace — use {@link runAsHandler} when continuation
	 * inheritance is wanted.
	 */
	runWithTrace<T>(t: Trace, fn: () => T): T {
		const prev = this._current;
		const next: Frame = { trace: t, prev };
		this._current = next;
		try {
			return fn();
		} finally {
			if (this._current !== next) {
				// eslint-disable-next-line no-unsafe-finally
				throw new BugIndicatingError(
					`runWithTrace: unexpected mutation of current frame.`
				);
			}
			this._current = prev;
		}
	}

	/**
	 * Install `t` as current and run `fn`. The trace stays current through
	 * the microtask closure that follows `fn`, so awaited continuations
	 * inside fn observe `t`. The reset is dispatched via
	 * `opts.afterMicrotaskClosure`.
	 *
	 * Throws on synchronous re-entry: timer callbacks never nest on the
	 * same JS stack frame, so this only fires for misuse.
	 */
	runAsHandler<T>(t: Trace, fn: () => T, opts: RunAsHandlerOptions): T {
		if (this._isHandlerRunning) {
			throw new Error(
				`runAsHandler: re-entrant invocation. ` +
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
			opts.afterMicrotaskClosure(() => {
				// Identity guard: another handler may have run between us
				// queuing this reset and it firing. Each runAsHandler mints
				// a fresh frame, so reference-equality detects staleness.
				if (this._current === next) { this._current = prev; }
			});
		}
	}

	_resetForTesting(): void {
		this._current = ROOT_FRAME;
		this._isHandlerRunning = false;
	}
}
