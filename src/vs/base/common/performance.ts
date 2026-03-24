/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from './lifecycle.js';
import type { INodeProcess } from './platform.js';

function _definePolyfillMarks(timeOrigin?: number) {
	const _data: Array<{ name: string; startTime: number; detail?: unknown }> = [];
	if (typeof timeOrigin === 'number') {
		_data.push({ name: 'code/timeOrigin', startTime: timeOrigin });
	}

	function mark(name: string, markOptions?: { startTime?: number; detail?: unknown }) {
		_data.push({ name, startTime: markOptions?.startTime ?? Date.now(), detail: markOptions?.detail });
	}
	function getMarks() {
		return _data.slice();
	}
	function clearMarks(prefix: string, details?: Record<string, unknown>[]) {
		for (let i = _data.length - 1; i >= 0; i--) {
			const entry = _data[i];
			if (entry.name.startsWith(prefix) && _detailMatchesAny(entry.detail, details)) {
				_data.splice(i, 1);
			}
		}
	}
	return { mark, getMarks, clearMarks };
}

declare const process: INodeProcess;

function _detailMatchesAny(entryDetail: unknown, filters?: Record<string, unknown>[]): boolean {
	if (!filters || filters.length === 0) {
		return true;
	}
	if (entryDetail === undefined || entryDetail === null || typeof entryDetail !== 'object') {
		return false;
	}
	const detail = entryDetail as Record<string, unknown>;
	return filters.some(filter => {
		for (const key of Object.keys(filter)) {
			if (detail[key] !== filter[key]) {
				return false;
			}
		}
		return true;
	});
}

interface IPerformanceEntry {
	readonly name: string;
	readonly startTime: number;
}

interface IPerformanceTiming {
	readonly navigationStart?: number;
	readonly redirectStart?: number;
	readonly fetchStart?: number;
}

interface IPerformance {
	mark(name: string, markOptions?: { startTime?: number; detail?: unknown }): void;
	clearMarks(name?: string): void;
	getEntriesByType(type: string): IPerformanceEntry[];
	readonly timeOrigin: number;
	readonly timing: IPerformanceTiming;
	readonly nodeTiming?: any;
}

declare const performance: IPerformance;

function _define() {

	// Identify browser environment when following property is not present
	// https://nodejs.org/dist/latest-v16.x/docs/api/perf_hooks.html#performancenodetiming
	// @ts-ignore
	if (typeof performance === 'object' && typeof performance.mark === 'function' && !performance.nodeTiming) {
		// in a browser context, reuse performance-util

		if (typeof performance.timeOrigin !== 'number' && !performance.timing) {
			// safari & webworker: because there is no timeOrigin and no workaround
			// we use the `Date.now`-based polyfill.
			return _definePolyfillMarks();

		} else {
			// use "native" performance for mark and getMarks
			return {
				mark(name: string, markOptions?: { startTime?: number; detail?: unknown }) {
					performance.mark(name, markOptions);
				},
				clearMarks(prefix: string, details?: Record<string, unknown>[]) {
					const toRemove = new Set<string>();
					for (const entry of performance.getEntriesByType('mark')) {
						if (entry.name.startsWith(prefix) && _detailMatchesAny((entry as unknown as { detail?: unknown }).detail, details)) {
							toRemove.add(entry.name);
						}
					}
					for (const name of toRemove) {
						performance.clearMarks(name);
					}
				},
				getMarks() {
					let timeOrigin = performance.timeOrigin;
					if (typeof timeOrigin !== 'number') {
						// safari: there is no timerOrigin but in renderers there is the timing-property
						// see https://bugs.webkit.org/show_bug.cgi?id=174862
						timeOrigin = (performance.timing.navigationStart || performance.timing.redirectStart || performance.timing.fetchStart) ?? 0;
					}
					const result: PerformanceMark[] = [{ name: 'code/timeOrigin', startTime: Math.round(timeOrigin) }];
					for (const entry of performance.getEntriesByType('mark')) {
						result.push({
							name: entry.name,
							startTime: Math.round(timeOrigin + entry.startTime),
							detail: (entry as unknown as { detail?: unknown }).detail,
						});
					}
					return result;
				}
			};
		}

	} else if (typeof process === 'object') {
		// node.js: use the normal polyfill but add the timeOrigin
		// from the node perf_hooks API as very first mark
		const timeOrigin = performance?.timeOrigin;
		return _definePolyfillMarks(timeOrigin);

	} else {
		// unknown environment
		console.trace('perf-util loaded in UNKNOWN environment');
		return _definePolyfillMarks();
	}
}

function _factory(sharedObj: any) {
	if (!sharedObj.MonacoPerformanceMarks) {
		sharedObj.MonacoPerformanceMarks = _define();
	}
	return sharedObj.MonacoPerformanceMarks;
}

const perf = _factory(globalThis);

export const mark: (name: string, markOptions?: { startTime?: number; detail?: unknown }) => void = perf.mark;

/**
 * Clears all marks whose name starts with the given prefix.
 * If `details` is provided, only clears marks whose detail matches any of the given filters.
 */
export const clearMarks: (prefix: string, details?: Record<string, unknown>[]) => void = perf.clearMarks;

export interface PerformanceMark {
	readonly name: string;
	readonly startTime: number;
	readonly detail?: unknown;
}

/**
 * Returns all marks, sorted by `startTime`.
 */
export const getMarks: () => PerformanceMark[] = perf.getMarks;

const _tracers = new Map<string, IPerfTracer>();

/**
 * A reusable performance tracer that manages mark lifecycle within a prefix namespace.
 * Created via {@link createPerfTracer}.
 */
export interface IPerfTracer extends IDisposable {
	/**
	 * Starts a new trace. Clears marks from any previously completed traces.
	 * Returns an {@link IPerfTrace} that can be used to emit marks and signal completion.
	 */
	start(detail?: Record<string, unknown>): IPerfTrace;

	/**
	 * Finds an active trace registered with the given key/value pair.
	 * Returns `undefined` if no matching trace is found or if the value is not a string.
	 */
	findTraceByCorrelation(key: string, value: unknown): IPerfTrace | undefined;
}

/**
 * A single performance trace within a {@link IPerfTracer}.
 * Created via {@link IPerfTracer.start}.
 */
export interface IPerfTrace extends IDisposable {
	/**
	 * Registers this trace so downstream code can find it via
	 * `tracer.findTraceByCorrelation(key, value)`.
	 */
	registerCorrelation(key: string, value: string): void;

	/**
	 * Emits a performance mark with the trace's prefix, traceId, and any additional detail.
	 * No-op after {@link done} has been called.
	 */
	mark(name: string, detail?: Record<string, unknown>): void;

	/**
	 * Marks this trace as done. Its marks will be cleared when the next trace starts.
	 * Also unregisters this trace from the lookup map. Idempotent.
	 */
	done(): void;
}

/**
 * Creates a new {@link IPerfTracer} with the given prefix.
 * A trailing `/` is appended to the prefix automatically (e.g. `'code/chat'` → `'code/chat/'`).
 *
 * By default, the tracer is registered in the global registry so that downstream code can
 * look it up via {@link getPerfTracer}. If a tracer with the same prefix already exists,
 * it is disposed and replaced.
 *
 * When `local` is `true`, the tracer is not registered globally. Use this for multi-instance
 * components (e.g. widgets) where multiple tracers may share the same prefix.
 *
 * `maxDoneTraces` controls how many completed traces' marks are retained (default `0`).
 * When a new trace starts, only the oldest completed traces beyond this limit are cleared.
 */
export function createPerfTracer(prefix: string, options?: { local?: boolean; maxDoneTraces?: number }): IPerfTracer {
	const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
	const tracer = new PerfTracer(normalizedPrefix, options?.maxDoneTraces ?? 0);
	if (!options?.local) {
		_tracers.get(normalizedPrefix)?.dispose();
		_tracers.set(normalizedPrefix, tracer);
	}
	return tracer;
}

/**
 * Returns the globally registered {@link IPerfTracer} for the given prefix, or `undefined` if none exists.
 * A trailing `/` is appended to the prefix automatically.
 */
export function getPerfTracer(prefix: string): IPerfTracer | undefined {
	const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
	return _tracers.get(normalizedPrefix);
}

/**
 * A reusable performance tracing helper that manages mark lifecycle within a given prefix namespace.
 * Use {@link createPerfTracer} to create an instance (globally registered or local).
 *
 * Lifecycle:
 * - The **owner** calls `tracer.start(detail?)` to create a new trace (and clean up completed ones).
 * - The owner calls `trace.registerCorrelation(key, value)` once a correlation ID is known (e.g., requestId).
 * - **Downstream code** calls `getPerfTracer(prefix)?.findTraceByCorrelation(key, value)` to join an existing trace and emit marks to it.
 * - The owner calls `trace.done()` when the operation completes. Marks are cleaned on the next `start()`.
 * - The owner calls `tracer.dispose()` when the component is torn down, clearing all remaining marks.
 *
 * ```
 * // Owner (e.g. chatServiceImpl)
 * const tracer = createPerfTracer('code/chat');
 * const trace = tracer.start({ sessionResource: '...' });
 * trace.mark('willSendRequest');
 * trace.registerCorrelation('requestId', request.id);
 * // ...
 * trace.done();
 * tracer.dispose(); // on component teardown
 *
 * // Downstream (e.g. chatAgents)
 * const trace = getPerfTracer('code/chat')?.findTraceByCorrelation('requestId', id);
 * trace?.mark('willInvokeAgent');
 * trace?.mark('didInvokeAgent');
 * // NO .done() — doesn't own the lifecycle
 * ```
 */
class PerfTracer implements IPerfTracer {

	private static _nextTraceId = 0;

	private readonly _doneTraceIds: string[] = [];
	private readonly _activeTraces = new Map<string, PerfTrace>();
	private _disposed = false;

	constructor(
		private readonly _prefix: string,
		private readonly _maxDoneTraces: number,
	) { }

	start(detail?: Record<string, unknown>): IPerfTrace {
		if (this._disposed) {
			throw new Error('PerfTracer is disposed');
		}
		// Evict oldest completed traces beyond the retention limit
		const evictCount = this._doneTraceIds.length - this._maxDoneTraces;
		if (evictCount > 0) {
			const toEvict = this._doneTraceIds.splice(0, evictCount);
			clearMarks(this._prefix, toEvict.map(traceId => ({ traceId })));
		}
		const traceId = String(PerfTracer._nextTraceId++);
		return new PerfTrace(this._prefix, traceId, detail, this._doneTraceIds, this._activeTraces);
	}

	findTraceByCorrelation(key: string, value: unknown): IPerfTrace | undefined {
		if (this._disposed || typeof value !== 'string') {
			return undefined;
		}
		return this._activeTraces.get(`${key}\0${value}`);
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		clearMarks(this._prefix);
		this._doneTraceIds.length = 0;
		this._activeTraces.clear();
		if (_tracers.get(this._prefix) === this) {
			_tracers.delete(this._prefix);
		}
	}
}

class PerfTrace implements IPerfTrace {

	private readonly _registrations: string[] = [];
	private _isDone = false;

	constructor(
		private readonly _prefix: string,
		private readonly _traceId: string,
		private readonly _detail: Record<string, unknown> | undefined,
		private readonly _doneTraceIds: string[],
		private readonly _activeTraces: Map<string, PerfTrace>,
	) { }

	registerCorrelation(key: string, value: string): void {
		const registrationKey = `${key}\0${value}`;
		this._registrations.push(registrationKey);
		this._activeTraces.set(registrationKey, this);
	}

	mark(name: string, detail?: Record<string, unknown>): void {
		if (this._isDone) {
			return;
		}
		mark(this._prefix + name, { detail: { traceId: this._traceId, ...this._detail, ...detail } });
	}

	done(): void {
		if (this._isDone) {
			return;
		}
		this._isDone = true;
		this._doneTraceIds.push(this._traceId);
		for (const key of this._registrations) {
			this._activeTraces.delete(key);
		}
		this._registrations.length = 0;
	}

	dispose(): void {
		this.done();
	}
}
