/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../common/lifecycle.js';
import { realTimeApi, TimeApi } from './timeApi.js';
import { ROOT_TRACE, TraceContext } from './trace.js';
import { VirtualClock } from './virtualClock.js';

// V8 default `Error.stackTraceLimit` of 10 swallows everything past the
// first async boundary in the stacks we capture for trace diagnostics.
// Bump it so swimlane callers actually see the user code that scheduled a
// timer rather than just the Promise wrapper.
if (typeof Error.stackTraceLimit === 'number' && Error.stackTraceLimit < 50) {
	Error.stackTraceLimit = 50;
}

/** Virtual timer IDs are `IDisposable`s. Recover one from an opaque id. */
function asDisposable(id: unknown): IDisposable | undefined {
	if (id === null || typeof id !== 'object') { return undefined; }
	const maybe = id as Partial<IDisposable>;
	return typeof maybe.dispose === 'function' ? id as IDisposable : undefined;
}

export interface CreateVirtualTimeApiOptions {
	/**
	 * If `true`, `requestAnimationFrame` is faked: callbacks are scheduled
	 * onto the virtual queue at `now + 16ms` and the resulting event hints
	 * the embedding to use a real `requestAnimationFrame` so the host can
	 * reflow before the callback runs. Useful for fixtures that need DOM
	 * measurements after rAF callbacks.
	 *
	 * If `false` (default), `requestAnimationFrame` is left to the host.
	 */
	readonly fakeRequestAnimationFrame?: boolean;
}

/**
 * Build a {@link TimeApi} that schedules every timer call into `clock`'s
 * virtual queue, capturing the current trace at schedule time so that
 * causal chains (`setTimeout` → `setTimeout`, etc.) are preserved.
 *
 * The returned API is suitable to install with {@link pushGlobalTimeApi},
 * which is what {@link runWithFakedTimers} does internally.
 */
export function createVirtualTimeApi(
	clock: VirtualClock,
	options?: CreateVirtualTimeApiOptions,
): TimeApi {

	function virtualSetTimeout(handler: () => void, timeout: number = 0): IDisposable {
		const stack = new Error().stack;
		const trace = TraceContext.instance.currentTrace().child(`setTimeout(${timeout}ms)`, stack);
		return clock.schedule({
			time: clock.now + timeout,
			run: handler,
			source: { toString: () => 'setTimeout', stackTrace: stack },
			trace,
		});
	}

	function virtualClearTimeout(id: unknown): void {
		asDisposable(id)?.dispose();
	}

	function virtualSetInterval(handler: () => void, interval: number): IDisposable {
		const stack = new Error().stack;
		const baseTrace = TraceContext.instance.currentTrace().child(`setInterval(${interval}ms)`, stack);
		let iter = 0;
		let disposed = false;
		let lastDisposable: IDisposable;

		const arm = (): void => {
			iter++;
			const myIter = iter;
			lastDisposable = clock.schedule({
				time: clock.now + interval,
				run: () => {
					if (disposed) { return; }
					arm();          // schedule the next tick first, so a throwing
					handler();      // handler doesn't kill the interval
				},
				source: { toString: () => `setInterval (iteration ${myIter})`, stackTrace: stack },
				trace: baseTrace.child(`tick #${myIter}`),
			});
		};

		arm();
		return {
			dispose: () => {
				if (disposed) { return; }
				disposed = true;
				lastDisposable.dispose();
			},
		};
	}

	function virtualClearInterval(id: unknown): void {
		asDisposable(id)?.dispose();
	}

	// A faux `Date` that returns virtual time from `now()` and uses virtual
	// time as the default constructor argument; everything else delegates.
	// The `Date` constructor is an exotic object whose call/construct
	// signatures aren't expressible without a structural mismatch — we go
	// through `unknown` for the tagging mutations rather than widening to
	// `any`.
	const OriginalDate = realTimeApi.Date;
	// `Date` is overloaded (zero-arg, one-arg, multi-arg). `ConstructorParameters`
	// only sees the last overload, so we type args as `unknown[]` and forward
	// them through a typed cast at the call site.
	function VirtualDate(this: unknown, ...args: unknown[]): unknown {
		if (!(this instanceof VirtualDate)) {
			return new OriginalDate(clock.now).toString();
		}
		if (args.length === 0) {
			return new OriginalDate(clock.now);
		}
		return new (OriginalDate as new (...a: unknown[]) => Date)(...args);
	}
	// Static-property tagging. Use a typed `Record` view of the function
	// rather than `any`. We skip non-writable own properties (`length`,
	// `name` on a function would throw) and then explicitly set the few
	// statics callers reach for.
	const dateStatics = VirtualDate as unknown as Record<string, unknown>;
	const originalStatics = OriginalDate as unknown as Record<string, unknown>;
	for (const key of Object.getOwnPropertyNames(OriginalDate)) {
		const desc = Object.getOwnPropertyDescriptor(OriginalDate, key);
		if (desc && (desc.writable || desc.set)) {
			dateStatics[key] = originalStatics[key];
		}
	}
	dateStatics.now = () => clock.now;
	dateStatics.parse = OriginalDate.parse;
	dateStatics.UTC = OriginalDate.UTC;
	VirtualDate.prototype = OriginalDate.prototype;

	const api: TimeApi = {
		setTimeout: virtualSetTimeout as unknown as TimeApi['setTimeout'],
		clearTimeout: virtualClearTimeout,
		setInterval: virtualSetInterval as unknown as TimeApi['setInterval'],
		clearInterval: virtualClearInterval,
		Date: VirtualDate as unknown as DateConstructor,
	};

	// Expose the real setTimeout as `originalFn` on the virtual one. The
	// component-explorer host's polling loop reads this to escape virtual
	// time when waiting for renders to settle.
	(api.setTimeout as unknown as { originalFn: TimeApi['setTimeout'] }).originalFn = realTimeApi.setTimeout;

	if (options?.fakeRequestAnimationFrame) {
		let rafIdCounter = 0;
		const rafDisposables = new Map<number, IDisposable>();

		api.requestAnimationFrame = ((callback: (time: number) => void) => {
			const id = ++rafIdCounter;
			const stack = new Error().stack;
			const trace = TraceContext.instance.currentTrace().child('requestAnimationFrame', stack);
			const d = clock.schedule({
				time: clock.now + 16,
				preferRealAnimationFrame: true,
				run: () => {
					rafDisposables.delete(id);
					callback(clock.now);
				},
				source: { toString: () => 'requestAnimationFrame', stackTrace: stack },
				trace,
			});
			rafDisposables.set(id, d);
			return id;
		}) as TimeApi['requestAnimationFrame'];

		api.cancelAnimationFrame = ((id: number) => {
			const d = rafDisposables.get(id);
			if (d) {
				d.dispose();
				rafDisposables.delete(id);
			}
		}) as TimeApi['cancelAnimationFrame'];
	}

	// Trace defaults: ensure handlers fired inside virtual time get the
	// current trace at *schedule* time, not at fire time. The processor
	// already wraps execution in `runAsHandler`, so when virtual events
	// fire inside the processor the trace is set correctly. This block is
	// just a safety net for callers that step the clock manually.
	void ROOT_TRACE;

	return api;
}

// Re-exported for convenience: many tests want to install both at once.
export { pushGlobalTimeApi } from './globalTimeApi.js';
