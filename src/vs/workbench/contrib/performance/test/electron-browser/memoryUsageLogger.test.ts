/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { findCrossedHeapUsageLevel, heapUsageWarningLevels, IHeapUsageSample, RendererMemoryUsageLogger } from '../../electron-browser/memoryUsageLogger.js';

const MB = 1024 * 1024;

function sampleOf(usedJSHeapSize: number, jsHeapSizeLimit: number): () => IHeapUsageSample {
	return () => ({ usedJSHeapSize, jsHeapSizeLimit });
}

suite('findCrossedHeapUsageLevel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const levels = [0.8, 0.9];

	test('returns undefined when the sampler returns undefined', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(() => undefined, levels, 0), undefined);
	});

	test('returns undefined when the heap size limit is zero or negative', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(100, 0), levels, 0), undefined);
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(100, -1), levels, 0), undefined);
	});

	test('returns undefined when the used heap size is negative', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(-1, 100), levels, 0), undefined);
	});

	test('returns undefined when usage is below every level', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(79, 100), levels, 0), undefined);
	});

	test('treats reaching a level exactly as crossing it', () => {
		const sample = { usedJSHeapSize: 80, jsHeapSizeLimit: 100 };
		assert.deepStrictEqual(findCrossedHeapUsageLevel(() => sample, levels, 0), { level: 0.8, sample });
	});

	test('returns the highest crossed level', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(95, 100), levels, 0)?.level, 0.9);
	});

	test('returns the highest crossed level regardless of level order', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(95, 100), [0.9, 0.5, 0.8], 0)?.level, 0.9);
	});

	test('does not report a level that was already reported', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(85, 100), levels, 0.8), undefined);
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(99, 100), levels, 0.9), undefined);
	});

	test('reports a higher level after a lower one was reported', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(91, 100), levels, 0.8)?.level, 0.9);
	});

	test('returns the sample that was taken', () => {
		const sample = { usedJSHeapSize: 950 * MB, jsHeapSizeLimit: 1000 * MB };
		assert.strictEqual(findCrossedHeapUsageLevel(() => sample, levels, 0)?.sample, sample);
	});

	test('returns undefined for empty levels', () => {
		assert.strictEqual(findCrossedHeapUsageLevel(sampleOf(100, 100), [], 0), undefined);
	});

	test('default warning levels are 80% and 90%', () => {
		assert.deepStrictEqual(heapUsageWarningLevels, [0.8, 0.9]);
	});
});

suite('RendererMemoryUsageLogger', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestLogService extends NullLogService {
		readonly warnings: string[] = [];
		override warn(message: string): void {
			this.warnings.push(message);
		}
	}

	class TestIdleScheduler {
		readonly pending: (() => void)[] = [];

		readonly schedule = (callback: () => void): IDisposable => {
			this.pending.push(callback);
			return toDisposable(() => {
				const index = this.pending.indexOf(callback);
				if (index >= 0) {
					this.pending.splice(index, 1);
				}
			});
		};

		runPending(): void {
			for (const callback of this.pending.splice(0)) {
				callback();
			}
		}
	}

	let memory: IHeapUsageSample | undefined;
	let idleScheduler: TestIdleScheduler;

	setup(() => {
		memory = undefined;
		idleScheduler = new TestIdleScheduler();
	});

	function createLogger(): { logger: RendererMemoryUsageLogger; logService: TestLogService } {
		const logService = new TestLogService();
		const logger = disposables.add(new RendererMemoryUsageLogger(logService, {
			sampleHeap: () => memory,
			scheduleWhenIdle: idleScheduler.schedule,
		}));
		return { logger, logService };
	}

	function sample(logger: RendererMemoryUsageLogger): void {
		(logger as unknown as { _sample(): void })._sample();
	}

	function isTimerActive(logger: RendererMemoryUsageLogger): boolean {
		return (logger as unknown as { _timer: { disposable: unknown } })._timer.disposable !== undefined;
	}

	test('starts the sampling timer on construction', () => {
		const { logger } = createLogger();
		assert.strictEqual(isTimerActive(logger), true);
	});

	test('samples the heap when the window is idle after each interval', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { logger, logService } = createLogger();
		memory = { usedJSHeapSize: 820 * MB, jsHeapSizeLimit: 1000 * MB };

		await timeout(RendererMemoryUsageLogger.sampleInterval - 1);
		const pendingBeforeInterval = idleScheduler.pending.length;

		await timeout(1);
		const pendingAfterInterval = idleScheduler.pending.length;
		const warningsBeforeIdle = [...logService.warnings];

		idleScheduler.runPending();
		logger.dispose();

		assert.deepStrictEqual({ pendingBeforeInterval, pendingAfterInterval, warningsBeforeIdle, warnings: logService.warnings }, {
			pendingBeforeInterval: 0,
			pendingAfterInterval: 1,
			warningsBeforeIdle: [],
			warnings: ['[perf] Renderer JS heap usage crossed 80% of its limit (820MB of 1000MB)'],
		});
	}));

	test('dispose cancels a pending idle sample', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { logger, logService } = createLogger();
		memory = { usedJSHeapSize: 820 * MB, jsHeapSizeLimit: 1000 * MB };

		await timeout(RendererMemoryUsageLogger.sampleInterval);
		const pendingBeforeDispose = idleScheduler.pending.length;

		logger.dispose();
		idleScheduler.runPending();

		assert.deepStrictEqual({ pendingBeforeDispose, pendingAfterDispose: idleScheduler.pending.length, warnings: logService.warnings }, {
			pendingBeforeDispose: 1,
			pendingAfterDispose: 0,
			warnings: [],
		});
	}));

	test('does not log when the heap sample is unavailable', () => {
		const { logger, logService } = createLogger();
		sample(logger);
		assert.deepStrictEqual(logService.warnings, []);
		assert.strictEqual(isTimerActive(logger), true);
	});

	test('does not log when usage is below the first level', () => {
		const { logger, logService } = createLogger();
		memory = { usedJSHeapSize: 500 * MB, jsHeapSizeLimit: 1000 * MB };
		sample(logger);
		assert.deepStrictEqual(logService.warnings, []);
		assert.strictEqual(isTimerActive(logger), true);
	});

	test('logs a warning once the first level is crossed and keeps sampling', () => {
		const { logger, logService } = createLogger();
		memory = { usedJSHeapSize: 820 * MB, jsHeapSizeLimit: 1000 * MB };
		sample(logger);
		assert.deepStrictEqual(logService.warnings, ['[perf] Renderer JS heap usage crossed 80% of its limit (820MB of 1000MB)']);
		assert.strictEqual(isTimerActive(logger), true);
	});

	test('does not log the same level twice', () => {
		const { logger, logService } = createLogger();
		memory = { usedJSHeapSize: 820 * MB, jsHeapSizeLimit: 1000 * MB };
		sample(logger);
		sample(logger);
		memory = { usedJSHeapSize: 850 * MB, jsHeapSizeLimit: 1000 * MB };
		sample(logger);
		assert.strictEqual(logService.warnings.length, 1);
	});

	test('logs the higher level after the lower one and stops sampling', () => {
		const { logger, logService } = createLogger();
		memory = { usedJSHeapSize: 820 * MB, jsHeapSizeLimit: 1000 * MB };
		sample(logger);
		memory = { usedJSHeapSize: 910 * MB, jsHeapSizeLimit: 1000 * MB };
		sample(logger);
		assert.deepStrictEqual(logService.warnings, [
			'[perf] Renderer JS heap usage crossed 80% of its limit (820MB of 1000MB)',
			'[perf] Renderer JS heap usage crossed 90% of its limit (910MB of 1000MB)',
		]);
		assert.strictEqual(isTimerActive(logger), false);
	});

	test('jumping straight to the highest level logs once and stops sampling', () => {
		const { logger, logService } = createLogger();
		memory = { usedJSHeapSize: 990 * MB, jsHeapSizeLimit: 1000 * MB };
		sample(logger);
		sample(logger);
		assert.deepStrictEqual(logService.warnings, ['[perf] Renderer JS heap usage crossed 90% of its limit (990MB of 1000MB)']);
		assert.strictEqual(isTimerActive(logger), false);
	});

	test('dispose stops the sampling timer', () => {
		const logger = new RendererMemoryUsageLogger(new TestLogService(), { sampleHeap: () => memory, scheduleWhenIdle: idleScheduler.schedule });
		logger.dispose();
		assert.strictEqual(isTimerActive(logger), false);
	});
});
