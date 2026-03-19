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
	if (entryDetail === undefined || entryDetail === null) {
		return true; // marks with no detail are always cleared when the prefix matches
	}
	if (typeof entryDetail !== 'object') {
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

const _tracers = new Map<string, PerfTracer>();

/**
 * Creates a new {@link PerfTracer} with the given prefix but does **not** register it in the global registry.
 * Use this for multi-instance components (e.g. widgets) where multiple tracers share the same prefix.
 * A trailing `/` is appended to the prefix automatically.
 */
export function createLocalPerfTracer(prefix: string): PerfTracer {
	const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
	return new PerfTracer(normalizedPrefix);
}

/**
 * Creates a new {@link PerfTracer} with the given prefix and registers it in the global registry.
 * If a tracer with the same prefix already exists, it is disposed and replaced.
 * A trailing `/` is appended to the prefix automatically (e.g. `'code/chat'` → `'code/chat/'`).
 * Use {@link getPerfTracer} to look up a registered tracer from downstream code.
 */
export function createPerfTracer(prefix: string): PerfTracer {
	const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
	_tracers.get(normalizedPrefix)?.dispose();
	const tracer = new PerfTracer(normalizedPrefix);
	_tracers.set(normalizedPrefix, tracer);
	return tracer;
}

/**
 * Returns the globally registered {@link PerfTracer} for the given prefix, or `undefined` if none exists.
 * A trailing `/` is appended to the prefix automatically.
 */
export function getPerfTracer(prefix: string): PerfTracer | undefined {
	const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
	return _tracers.get(normalizedPrefix);
}

/**
 * A reusable performance tracing helper that manages mark lifecycle within a given prefix namespace.
 * Use {@link createPerfTracer} to create a globally registered instance,
 * or `new PerfTracer(prefix)` for a local instance that is not in the global registry.
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
class PerfTracer implements IDisposable {

	private static _nextTraceId = 0;

	private readonly _doneTraceIds = new Set<string>();
	private readonly _activeTraces = new Map<string, PerfTrace>(); // "key:value" -> trace
	private _disposed = false;

	constructor(private readonly _prefix: string) { }

	/**
	 * Starts a new trace. Clears marks from any previously completed traces.
	 * Returns a {@link PerfTrace} that can be used to emit marks and signal completion.
	 */
	start(detail?: Record<string, unknown>): PerfTrace {
		if (this._disposed) {
			throw new Error('PerfTracer is disposed');
		}
		if (this._doneTraceIds.size > 0) {
			clearMarks(this._prefix, [...this._doneTraceIds].map(traceId => ({ traceId })));
			this._doneTraceIds.clear();
		}
		const traceId = String(PerfTracer._nextTraceId++);
		return new PerfTrace(this._prefix, traceId, detail, this._doneTraceIds, this._activeTraces);
	}

	/**
	 * Finds an active trace registered with the given key/value pair.
	 * Returns `undefined` if no matching trace is found or if the value is not a string.
	 */
	findTraceByCorrelation(key: string, value: unknown): PerfTrace | undefined {
		if (this._disposed || typeof value !== 'string') {
			return undefined;
		}
		return this._activeTraces.get(`${key}:${value}`);
	}

	/**
	 * Disposes this tracer: clears all marks with this prefix, unregisters all active traces,
	 * and removes the tracer from the global registry (if registered via {@link createPerfTracer}).
	 */
	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		clearMarks(this._prefix);
		this._doneTraceIds.clear();
		this._activeTraces.clear();
		if (_tracers.get(this._prefix) === this) {
			_tracers.delete(this._prefix);
		}
	}
}

export class PerfTrace implements IDisposable {

	private readonly _registrations: string[] = [];

	constructor(
		private readonly _prefix: string,
		private readonly _traceId: string,
		private readonly _detail: Record<string, unknown> | undefined,
		private readonly _doneTraceIds: Set<string>,
		private readonly _activeTraces: Map<string, PerfTrace>,
	) { }

	/**
	 * Registers this trace so downstream code can find it via `tracer.findTraceByCorrelation(key, value)`.
	 */
	registerCorrelation(key: string, value: string): void {
		const registrationKey = `${key}:${value}`;
		this._registrations.push(registrationKey);
		this._activeTraces.set(registrationKey, this);
	}

	/**
	 * Emits a performance mark with the trace's prefix, traceId, and any additional detail.
	 */
	mark(name: string, detail?: Record<string, unknown>): void {
		mark(this._prefix + name, { detail: { traceId: this._traceId, ...this._detail, ...detail } });
	}

	/**
	 * Marks this trace as done. Its marks will be cleared when the next trace starts.
	 * Also unregisters this trace from the lookup map.
	 */
	done(): void {
		this._doneTraceIds.add(this._traceId);
		for (const key of this._registrations) {
			this._activeTraces.delete(key);
		}
		this._registrations.length = 0;
	}

	dispose(): void {
		this.done();
	}
}
