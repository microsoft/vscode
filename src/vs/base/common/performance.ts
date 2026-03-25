/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
