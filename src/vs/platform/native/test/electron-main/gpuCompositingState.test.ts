/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GPUProcessMainService } from '../../../gpu/electron-main/gpuProcessMainService.js';
import { TestApp } from '../../../gpu/test/electron-main/gpuProcessTestUtils.js';
import { GPUCompositingState } from '../../electron-main/gpuCompositingState.js';

suite('GPUCompositingState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService() {
		const app = new TestApp();
		const gpuService = store.add(new GPUProcessMainService(app));
		const state = store.add(new GPUCompositingState(gpuService));
		return { app, state };
	}

	function createChannel(state: GPUCompositingState) {
		return ProxyChannel.fromService({
			onDidChangeGPUCompositing: state.onDidChange,
			isGPUCompositingEnabled: async () => state.enabled,
		}, store.add(new DisposableStore()), { unbufferedEvents: ['onDidChangeGPUCompositing'] });
	}

	test('reports GPU loss after the last IPC listener disconnects during recovery', async () => {
		const { app, state } = createService();
		const channel = createChannel(state);
		const firstEvents: boolean[] = [];
		const firstListener = store.add(channel.listen<boolean>(undefined, 'onDidChangeGPUCompositing', undefined)(enabled => firstEvents.push(enabled)));
		await timeout(0);
		app.emitProcessExit('crashed');
		firstListener.dispose();
		app.update();

		const reopenedEvents: boolean[] = [];
		let rendererEnabled = false;
		store.add(channel.listen<boolean>(undefined, 'onDidChangeGPUCompositing', undefined)(enabled => {
			reopenedEvents.push(enabled);
			rendererEnabled = enabled;
		}));
		rendererEnabled = await channel.call(undefined, 'isGPUCompositingEnabled');
		const initial = rendererEnabled;
		app.emitProcessExit('crashed');
		app.update({ ...app.status, gpu_compositing: 'disabled_software' });

		assert.deepStrictEqual({ firstEvents, initial, reopenedEvents, rendererEnabled, current: state.enabled }, {
			firstEvents: [false],
			initial: true,
			reopenedEvents: [false],
			rendererEnabled: false,
			current: false,
		});
	});

	test('does not replay stale GPU state after reconnecting before the first IPC buffer flush', async () => {
		const { app, state } = createService();
		const channel = createChannel(state);
		app.emitProcessExit('crashed');
		app.update();

		const firstListener = store.add(channel.listen<boolean>(undefined, 'onDidChangeGPUCompositing', undefined)(() => { }));
		firstListener.dispose();
		app.emitProcessExit('crashed');
		app.update({ ...app.status, gpu_compositing: 'disabled_software' });

		const events: boolean[] = [];
		let rendererEnabled = false;
		store.add(channel.listen<boolean>(undefined, 'onDidChangeGPUCompositing', undefined)(enabled => {
			events.push(enabled);
			rendererEnabled = enabled;
		}));
		rendererEnabled = await channel.call(undefined, 'isGPUCompositingEnabled');
		const initial = rendererEnabled;
		await timeout(0);

		assert.deepStrictEqual({ initial, events, rendererEnabled, current: state.enabled }, {
			initial: false,
			events: [],
			rendererEnabled: false,
			current: false,
		});
	});

	test('deduplicates compositing changes without emitting unrelated feature changes', () => {
		const { app, state } = createService();
		const events: boolean[] = [];
		store.add(state.onDidChange(enabled => events.push(enabled)));

		app.update({ ...app.status, rasterization: 'disabled_software' });
		app.emitProcessExit('crashed');
		app.emitProcessExit('crashed');
		app.update({ ...app.status, gpu_compositing: 'disabled_software' });
		app.update({ ...app.status, gpu_compositing: 'enabled' });
		assert.deepStrictEqual({ events, enabled: state.enabled }, { events: [false, true], enabled: true });
	});

	test('does not keep broadcasting after the native host is disposed', () => {
		const { app, state } = createService();
		const events: boolean[] = [];
		store.add(state.onDidChange(enabled => events.push(enabled)));
		state.dispose();

		app.emitProcessExit('crashed');
		app.update();
		assert.deepStrictEqual(events, []);
	});
});
