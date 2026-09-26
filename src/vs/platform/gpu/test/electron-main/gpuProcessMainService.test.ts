/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Details, GPUFeatureStatus } from 'electron';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GPUProcessMainService } from '../../electron-main/gpuProcessMainService.js';
import { createFeatureStatus, TestApp } from './gpuProcessTestUtils.js';

suite('GPUProcessMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares one cached snapshot and one pair of Electron listeners across consumers', () => {
		const app = new TestApp();
		const service = store.add(new GPUProcessMainService(app));
		store.add(service.onDidUpdateFeatureStatus(() => { }));
		store.add(service.onDidUpdateFeatureStatus(() => { }));
		store.add(service.onDidExitProcess(() => { }));
		store.add(service.onDidExitProcess(() => { }));

		assert.deepStrictEqual({
			first: service.featureStatus,
			second: service.featureStatus,
			reads: app.reads,
			updateListeners: app.events.listenerCount('gpu-info-update'),
			exitListeners: app.events.listenerCount('child-process-gone'),
		}, {
			first: app.status,
			second: app.status,
			reads: 1,
			updateListeners: 1,
			exitListeners: 1,
		});
	});

	test('keeps startup capabilities unavailable until Electron supplies feature information', () => {
		const app = new TestApp(upcastPartial<GPUFeatureStatus>({}));
		const service = store.add(new GPUProcessMainService(app));
		const initial = service.featureStatus;
		const updates: (GPUFeatureStatus | undefined)[] = [];
		store.add(service.onDidUpdateFeatureStatus(status => updates.push(status)));

		app.update();
		app.update(createFeatureStatus());
		assert.deepStrictEqual({ initial, updates, current: service.featureStatus }, {
			initial: undefined,
			updates: [app.status],
			current: app.status,
		});
	});

	test('deduplicates complete feature snapshots without missing non-compositing changes', () => {
		const app = new TestApp();
		const service = store.add(new GPUProcessMainService(app));
		const updates: (GPUFeatureStatus | undefined)[] = [];
		store.add(service.onDidUpdateFeatureStatus(status => updates.push(status)));

		app.update(createFeatureStatus());
		app.update({ ...app.status, rasterization: 'disabled_software' });
		app.update({ ...app.status });

		assert.deepStrictEqual({ updates, current: service.featureStatus }, {
			updates: [app.status],
			current: app.status,
		});
	});

	test('does not retain a mutable Electron feature snapshot', () => {
		const app = new TestApp();
		const service = store.add(new GPUProcessMainService(app));
		const updates: (GPUFeatureStatus | undefined)[] = [];
		store.add(service.onDidUpdateFeatureStatus(status => updates.push(status)));

		app.status.gpu_compositing = 'disabled_software';
		const beforeUpdate = service.featureStatus?.gpu_compositing;
		app.update();

		assert.deepStrictEqual({ beforeUpdate, updates }, {
			beforeUpdate: 'enabled',
			updates: [app.status],
		});
	});

	for (const reason of ['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction'] as const) {
		test(`invalidates capabilities before reporting ${reason} and recovers on a fresh update`, () => {
			const app = new TestApp();
			const service = store.add(new GPUProcessMainService(app));
			const events: { kind: string; available: boolean; reason?: Details['reason'] }[] = [];
			store.add(service.onDidUpdateFeatureStatus(status => events.push({ kind: 'status', available: status !== undefined })));
			store.add(service.onDidExitProcess(exit => events.push({ kind: 'exit', available: service.featureStatus !== undefined, reason: exit.reason })));

			app.emitProcessExit(reason);
			const duringRecovery = service.featureStatus;
			const readsAfterExit = app.reads;
			app.update();
			app.update();

			assert.deepStrictEqual({ duringRecovery, readsAfterExit, events, recovered: service.featureStatus }, {
				duringRecovery: undefined,
				readsAfterExit: 1,
				events: [
					{ kind: 'status', available: false },
					{ kind: 'exit', available: false, reason },
					{ kind: 'status', available: true },
				],
				recovered: app.status,
			});
		});
	}

	test('new consumers during recovery do not read pre-crash capabilities', () => {
		const app = new TestApp();
		const service = store.add(new GPUProcessMainService(app));
		app.emitProcessExit('crashed');
		const initial = service.featureStatus;
		const updates: (GPUFeatureStatus | undefined)[] = [];
		store.add(service.onDidUpdateFeatureStatus(status => updates.push(status)));

		app.update();
		assert.deepStrictEqual({ initial, updates }, { initial: undefined, updates: [app.status] });
	});

	test('reports repeated exits without duplicate unavailable snapshots', () => {
		const app = new TestApp();
		const service = store.add(new GPUProcessMainService(app));
		const updates: (GPUFeatureStatus | undefined)[] = [];
		const reasons: Details['reason'][] = [];
		store.add(service.onDidUpdateFeatureStatus(status => updates.push(status)));
		store.add(service.onDidExitProcess(exit => reasons.push(exit.reason)));

		app.emitProcessExit('crashed');
		app.emitProcessExit('launch-failed');
		app.update({ ...app.status, gpu_compositing: 'disabled_software', rasterization: 'disabled_software' });
		assert.deepStrictEqual({ updates, reasons, current: service.featureStatus }, {
			updates: [undefined, app.status],
			reasons: ['crashed', 'launch-failed'],
			current: app.status,
		});
	});

	test('ignores non-GPU process exits', () => {
		const app = new TestApp();
		const service = store.add(new GPUProcessMainService(app));
		const updates: (GPUFeatureStatus | undefined)[] = [];
		const reasons: Details['reason'][] = [];
		store.add(service.onDidUpdateFeatureStatus(status => updates.push(status)));
		store.add(service.onDidExitProcess(exit => reasons.push(exit.reason)));

		app.emitProcessExit('crashed', 'Utility');
		assert.deepStrictEqual({ updates, reasons, current: service.featureStatus, reads: app.reads }, {
			updates: [],
			reasons: [],
			current: app.status,
			reads: 1,
		});
	});

	test('disposes both Electron listeners', () => {
		const app = new TestApp();
		const service = store.add(new GPUProcessMainService(app));
		service.dispose();
		app.emitProcessExit('crashed');
		app.update();

		assert.deepStrictEqual({
			reads: app.reads,
			updateListeners: app.events.listenerCount('gpu-info-update'),
			exitListeners: app.events.listenerCount('child-process-gone'),
		}, {
			reads: 1,
			updateListeners: 0,
			exitListeners: 0,
		});
	});
});
