/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { INodeProcess } from './platform.js';

function _definePolyfillMarks(timeOrigin?: number) {
	const _data: [string?, number?] = [];
	if (typeof timeOrigin === 'number') {
		_data.push('code/timeOrigin', timeOrigin);
	}

	function mark(name: string, markOptions?: { startTime?: number }) {
		_data.push(name, markOptions?.startTime ?? Date.now());
	}
	function getMarks() {
		const result = [];
		for (let i = 0; i < _data.length; i += 2) {
			result.push({
				name: _data[i],
				startTime: _data[i + 1],
			});
		}
		return result;
	}
	return { mark, getMarks };
}

declare const process: INodeProcess;

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
	mark(name: string, markOptions?: { startTime?: number }): void;
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
				mark(name: string, markOptions?: { startTime?: number }) {
					performance.mark(name, markOptions);
				},
				getMarks() {
					let timeOrigin = performance.timeOrigin;
					if (typeof timeOrigin !== 'number') {
						// safari: there is no timerOrigin but in renderers there is the timing-property
						// see https://bugs.webkit.org/show_bug.cgi?id=174862
						timeOrigin = (performance.timing.navigationStart || performance.timing.redirectStart || performance.timing.fetchStart) ?? 0;
					}
					const result = [{ name: 'code/timeOrigin', startTime: Math.round(timeOrigin) }];
					for (const entry of performance.getEntriesByType('mark')) {
						result.push({
							name: entry.name,
							startTime: Math.round(timeOrigin + entry.startTime)
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

export const mark: (name: string, markOptions?: { startTime?: number }) => void = perf.mark;

export interface PerformanceMark {
	readonly name: string;
	readonly startTime: number;
}

/**
 * Returns all marks, sorted by `startTime`.
 */
export const getMarks: () => PerformanceMark[] = perf.getMarks;
