/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { runWhenWindowIdle } from '../../../../base/browser/dom.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export interface IHeapUsageSample {
	readonly usedJSHeapSize: number;
	readonly jsHeapSizeLimit: number;
}

export interface IHeapUsageLevelCrossing {
	readonly level: number;
	readonly sample: IHeapUsageSample;
}

/**
 * Heap usage levels, as a fraction of the heap size limit, at which a warning is logged.
 */
export const heapUsageWarningLevels: readonly number[] = [0.8, 0.9];

/**
 * Samples the heap and returns the highest level from `levels` that is crossed and that is
 * above `lastReportedLevel`, or `undefined` if no new level has been crossed or the sample is
 * unavailable.
 */
export function findCrossedHeapUsageLevel(sampler: () => IHeapUsageSample | undefined, levels: readonly number[], lastReportedLevel: number): IHeapUsageLevelCrossing | undefined {
	const sample = sampler();
	if (!sample || sample.usedJSHeapSize < 0 || sample.jsHeapSizeLimit <= 0) {
		return undefined;
	}

	const ratio = sample.usedJSHeapSize / sample.jsHeapSizeLimit;
	let crossed: number | undefined;
	for (const level of levels) {
		if (level > lastReportedLevel && ratio >= level && (crossed === undefined || level > crossed)) {
			crossed = level;
		}
	}

	return crossed === undefined ? undefined : { level: crossed, sample };
}

function sampleRendererHeap(): IHeapUsageSample | undefined {
	const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory; // https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory
	if (typeof memory?.usedJSHeapSize !== 'number' || typeof memory.jsHeapSizeLimit !== 'number') {
		return undefined;
	}
	return { usedJSHeapSize: memory.usedJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit };
}

/**
 * Test seams for {@link RendererMemoryUsageLogger}.
 */
export interface IRendererMemoryUsageLoggerOptions {
	/** Samples the heap. Defaults to reading `performance.memory`. */
	readonly sampleHeap?: () => IHeapUsageSample | undefined;
	/** Schedules a callback for when the window is idle. Defaults to `runWhenWindowIdle(mainWindow, ...)`. */
	readonly scheduleWhenIdle?: (callback: () => void) => IDisposable;
}

export class RendererMemoryUsageLogger extends Disposable implements IWorkbenchContribution {

	static readonly sampleInterval = 60 * 1000;

	private readonly _timer = this._register(new IntervalTimer());
	private readonly _idleSample = this._register(new MutableDisposable());
	private readonly _sampleHeap: () => IHeapUsageSample | undefined;
	private _lastReportedLevel = 0;

	constructor(
		@ILogService private readonly _logService: ILogService,
		options?: IRendererMemoryUsageLoggerOptions,
	) {
		super();

		this._sampleHeap = options?.sampleHeap ?? sampleRendererHeap;
		const scheduleWhenIdle = options?.scheduleWhenIdle ?? (callback => runWhenWindowIdle(mainWindow, callback));

		this._timer.cancelAndSet(() => {
			this._idleSample.value = scheduleWhenIdle(() => this._sample());
		}, RendererMemoryUsageLogger.sampleInterval);
	}

	private _sample(): void {
		const crossing = findCrossedHeapUsageLevel(this._sampleHeap, heapUsageWarningLevels, this._lastReportedLevel);
		if (!crossing) {
			return;
		}

		this._lastReportedLevel = crossing.level;
		const toMB = (bytes: number) => Math.round(bytes / (1024 * 1024));
		this._logService.warn(`[perf] Renderer JS heap usage crossed ${Math.round(crossing.level * 100)}% of its limit (${toMB(crossing.sample.usedJSHeapSize)}MB of ${toMB(crossing.sample.jsHeapSizeLimit)}MB)`);

		if (crossing.level >= Math.max(...heapUsageWarningLevels)) {
			this._timer.cancel();
		}
	}
}
