/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { GPUFeatureStatus } from 'electron';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IGPULogMessage } from '../../../diagnostics/common/diagnostics.js';
import { ITelemetryData, ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { GPUProcessMainService } from '../../electron-main/gpuProcessMainService.js';
import { GPUProcessTelemetry } from '../../electron-main/gpuProcessTelemetry.js';
import { createFeatureStatus, TestApp } from './gpuProcessTestUtils.js';

suite('GPUProcessTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const graphiteStatus = { ...createFeatureStatus(), skia_graphite: 'enabled' };
	const fallbackStatus = { ...graphiteStatus, gpu_compositing: 'disabled_software', rasterization: 'disabled_software' };

	function createTelemetry(service: GPUProcessMainService, logs: readonly IGPULogMessage[] = []) {
		const events: { name: string; data: ITelemetryData | undefined }[] = [];
		let logReads = 0;
		const telemetryService = new class extends mock<ITelemetryService>() {
			override publicLog2(name: string, data?: ITelemetryData): void {
				events.push({ name, data });
			}
		}();
		const telemetry = store.add(new GPUProcessTelemetry(() => {
			logReads++;
			return logs;
		}, service, telemetryService));
		return { telemetry, events, get logReads() { return logReads; } };
	}

	function fallbackEvent(status = fallbackStatus, messages: readonly string[] = []) {
		return {
			name: 'gpu.crash.fallback',
			data: { gpuFeatureStatus: JSON.stringify(status), gpuLogMessages: JSON.stringify(messages) },
		};
	}

	test('reports only refreshed fallback capabilities and the last ten log messages', () => {
		const app = new TestApp(graphiteStatus);
		const service = store.add(new GPUProcessMainService(app));
		const logs = Array.from({ length: 12 }, (_, index) => ({ header: 'private header', message: `message ${index}` }));
		const capture = createTelemetry(service, logs);

		app.emitProcessExit('crashed');
		const beforeRefresh = [...capture.events];
		app.update(fallbackStatus);
		app.update(fallbackStatus);

		assert.deepStrictEqual({ beforeRefresh, events: capture.events, logReads: capture.logReads }, {
			beforeRefresh: [],
			events: [fallbackEvent(fallbackStatus, logs.slice(-10).map(log => log.message))],
			logReads: 1,
		});
	});

	for (const initialState of ['starting', 'recovering']) {
		test(`waits for valid capabilities when telemetry starts while the GPU is ${initialState}`, () => {
			const app = new TestApp(initialState === 'starting' ? upcastPartial<GPUFeatureStatus>({}) : graphiteStatus);
			const service = store.add(new GPUProcessMainService(app));
			if (initialState === 'recovering') {
				app.emitProcessExit('crashed');
			}
			const capture = createTelemetry(service);

			app.emitProcessExit('launch-failed');
			app.update(graphiteStatus);
			const afterInitialization = [...capture.events];
			app.emitProcessExit('crashed');
			app.update(fallbackStatus);
			assert.deepStrictEqual({ afterInitialization, events: capture.events }, {
				afterInitialization: [],
				events: [fallbackEvent()],
			});
		});
	}

	test('does not report when Graphite is disabled in the first valid snapshot', () => {
		const app = new TestApp(upcastPartial<GPUFeatureStatus>({}));
		const service = store.add(new GPUProcessMainService(app));
		const capture = createTelemetry(service);

		const disabledGraphiteStatus = { ...graphiteStatus, skia_graphite: 'disabled_off' };
		app.update(disabledGraphiteStatus);
		app.update(graphiteStatus);
		app.emitProcessExit('crashed');
		app.update(fallbackStatus);
		assert.deepStrictEqual({ events: capture.events, logReads: capture.logReads }, { events: [], logReads: 0 });
	});

	test('does not report healthy recovery or a later unrelated capability change', () => {
		const app = new TestApp(graphiteStatus);
		const service = store.add(new GPUProcessMainService(app));
		const capture = createTelemetry(service);

		app.emitProcessExit('crashed');
		app.update(graphiteStatus);
		app.update(fallbackStatus);
		assert.deepStrictEqual({ events: capture.events, logReads: capture.logReads }, { events: [], logReads: 0 });
	});

	test('coalesces repeated crashes while waiting for refreshed capabilities', () => {
		const app = new TestApp(graphiteStatus);
		const service = store.add(new GPUProcessMainService(app));
		const capture = createTelemetry(service);

		app.emitProcessExit('crashed');
		app.emitProcessExit('crashed');
		app.emitProcessExit('launch-failed');
		app.update(fallbackStatus);
		assert.deepStrictEqual(capture.events, [fallbackEvent()]);
	});

	test('ignores non-crash exits', () => {
		const app = new TestApp(graphiteStatus);
		const service = store.add(new GPUProcessMainService(app));
		const capture = createTelemetry(service);

		for (const reason of ['clean-exit', 'abnormal-exit', 'killed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction'] as const) {
			app.emitProcessExit(reason);
			app.update(fallbackStatus);
		}
		assert.deepStrictEqual({ events: capture.events, logReads: capture.logReads }, { events: [], logReads: 0 });
	});

	for (const phase of ['initialization', 'recovery']) {
		test(`disposes pending ${phase} listeners`, () => {
			const app = new TestApp(phase === 'initialization' ? upcastPartial<GPUFeatureStatus>({}) : graphiteStatus);
			const service = store.add(new GPUProcessMainService(app));
			const capture = createTelemetry(service);
			app.emitProcessExit('crashed');
			capture.telemetry.dispose();

			app.update(graphiteStatus);
			app.emitProcessExit('crashed');
			app.update(fallbackStatus);
			assert.deepStrictEqual({ events: capture.events, logReads: capture.logReads }, { events: [], logReads: 0 });
		});
	}
});
