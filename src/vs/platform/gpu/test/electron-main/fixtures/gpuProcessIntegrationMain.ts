/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { app, BrowserWindow, Details, GPUFeatureStatus, ipcMain } from 'electron';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { join } from '../../../../../base/common/path.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { Server } from '../../../../../base/parts/ipc/electron-main/ipc.electron.js';
import { GPUCompositingState } from '../../../../native/electron-main/gpuCompositingState.js';
import { GPUProcessMainService } from '../../../electron-main/gpuProcessMainService.js';

const userData = app.commandLine.getSwitchValue('gpu-test-user-data');
assert.ok(userData, 'The GPU test must use an isolated profile');
app.setPath('userData', userData);
app.setPath('crashDumps', userData);
const mode = app.commandLine.getSwitchValue('gpu-test-mode');
const software = mode === 'software';
if (software) {
	app.disableHardwareAcceleration();
}

let phase = 'startup';
const trace: { event: string; status?: GPUFeatureStatus; enabled?: boolean; reason?: Details['reason'] }[] = [];
const watchdog = setTimeout(() => {
	console.error(`GPU process integration timed out during ${phase}\n${JSON.stringify(trace)}`);
	app.exit(1);
}, 60_000);

async function run(): Promise<void> {
	const store = new DisposableStore();
	const windows = store.add(new DisposableStore());
	const originalListenerCounts = ['gpu-info-update', 'child-process-gone'].map(event => app.listenerCount(event));
	const firstGPUInfo = new Promise<void>(resolve => {
		store.add(Event.once(Event.fromNodeEventEmitter(app, 'gpu-info-update'))(() => resolve()));
	});
	const keepAlive = () => { };
	app.on('window-all-closed', keepAlive);
	store.add(toDisposable(() => app.removeListener('window-all-closed', keepAlive)));

	try {
		await app.whenReady();

		async function createWindow(): Promise<BrowserWindow> {
			const ready = new Promise<void>(resolve => {
				store.add(Event.once(Event.fromNodeEventEmitter(ipcMain, 'vscode:gpu-test-ready'))(() => resolve()));
			});
			const window = new BrowserWindow({
				show: false,
				webPreferences: {
					preload: join(userData, 'preload.mjs'),
					sandbox: false,
					contextIsolation: true,
					backgroundThrottling: false,
				},
			});
			windows.add(toDisposable(() => {
				if (!window.isDestroyed()) {
					window.destroy();
				}
			}));
			await window.loadURL('about:blank');
			await ready;
			return window;
		}

		let window: BrowserWindow | undefined;
		if (mode === 'late') {
			window = await createWindow();
			await firstGPUInfo;
		}
		const gpu = store.add(new GPUProcessMainService(app));
		const compositing = store.add(new GPUCompositingState(gpu));
		trace.push({ event: 'initial', status: gpu.featureStatus, enabled: compositing.enabled });
		const server = store.add(new Server());
		server.registerChannel('nativeHost', ProxyChannel.fromService({
			onDidChangeGPUCompositing: compositing.onDidChange,
			isGPUCompositingEnabled: async () => compositing.enabled,
		}, store, { unbufferedEvents: ['onDidChangeGPUCompositing'] }));

		const nativeExits: Details['reason'][] = [];
		store.add(Event.fromNodeEventEmitter<Details>(app, 'child-process-gone', (_event: Electron.Event, details: Details) => details)(details => {
			if (details.type === 'GPU') {
				nativeExits.push(details.reason);
			}
		}));
		const updates: (GPUFeatureStatus | undefined)[] = [];
		store.add(gpu.onDidUpdateFeatureStatus(status => {
			updates.push(status);
			trace.push({ event: 'status', status, enabled: compositing.enabled });
		}));
		const exits: { reason: Details['reason']; status: GPUFeatureStatus | undefined; enabled: boolean }[] = [];
		store.add(gpu.onDidExitProcess(({ reason }) => {
			exits.push({ reason, status: gpu.featureStatus, enabled: compositing.enabled });
			trace.push({ event: 'exit', reason, enabled: compositing.enabled });
		}));

		async function waitForStatus(): Promise<GPUFeatureStatus> {
			if (gpu.featureStatus) {
				return gpu.featureStatus;
			}
			return new Promise(resolve => {
				store.add(Event.onceIf(gpu.onDidUpdateFeatureStatus, status => status !== undefined)(status => {
					assert.ok(status);
					resolve(status);
				}));
			});
		}

		async function connect(window: BrowserWindow): Promise<void> {
			await window.webContents.executeJavaScript('window.gpuProcessTest.connect()');
			await checkRenderer(window);
		}

		async function checkRenderer(window: BrowserWindow): Promise<void> {
			const snapshot: { enabled: boolean; mainEnabled: boolean; updates: boolean[] } = await window.webContents.executeJavaScript('window.gpuProcessTest.snapshot()');
			const enabled = gpu.featureStatus?.gpu_compositing === 'enabled';
			assert.deepStrictEqual({ renderer: snapshot.enabled, main: snapshot.mainEnabled, cache: compositing.enabled }, { renderer: enabled, main: enabled, cache: enabled });
			for (let index = 1; index < snapshot.updates.length; index++) {
				assert.notStrictEqual(snapshot.updates[index], snapshot.updates[index - 1], 'Compositing notifications must be deduplicated');
			}
		}

		async function disconnect(window: BrowserWindow): Promise<void> {
			const disconnected = new Promise<void>(resolve => store.add(Event.once(server.onDidRemoveConnection)(() => resolve())));
			await window.webContents.executeJavaScript('window.gpuProcessTest.disconnect()');
			await disconnected;
			assert.strictEqual(server.connections.length, 0);
		}

		window ??= await createWindow();
		await firstGPUInfo;
		await waitForStatus();
		assert.deepStrictEqual(gpu.featureStatus, app.getGPUFeatureStatus());
		await connect(window);

		if (!software) {
			for (let crash = 0; crash < 3; crash++) {
				phase = `GPU crash ${crash + 1}`;
				if (crash === 1) {
					await disconnect(window);
				}
				const exited = new Promise<void>(resolve => store.add(Event.once(gpu.onDidExitProcess)(() => resolve())));
				window.webContents.debugger.attach();
				try {
					await window.webContents.debugger.sendCommand('Browser.crashGpuProcess');
					await exited;
					const recovered = await waitForStatus();
					assert.deepStrictEqual(recovered, app.getGPUFeatureStatus());
				} finally {
					window.webContents.debugger.detach();
				}
				if (crash === 1) {
					window.destroy();
					window = await createWindow();
					await connect(window);
				}
				await checkRenderer(window);
			}
		} else {
			assert.strictEqual(compositing.enabled, false);
			await disconnect(window);
			window.destroy();
			window = await createWindow();
			await connect(window);
		}

		phase = 'assertions';
		assert.deepStrictEqual(exits, nativeExits.map(reason => ({ reason, status: undefined, enabled: false })));
		assert.deepStrictEqual(nativeExits, software ? [] : ['crashed', 'crashed', 'crashed']);
		for (let index = 1; index < updates.length; index++) {
			assert.ok(!equals(updates[index], updates[index - 1]), 'Feature notifications must be deduplicated');
		}

		await disconnect(window);
	} finally {
		store.dispose();
	}
	assert.deepStrictEqual(['gpu-info-update', 'child-process-gone'].map(event => app.listenerCount(event)), originalListenerCounts);
}

void run().then(() => {
	clearTimeout(watchdog);
	console.log('GPU process integration passed');
	app.exit(0);
}, error => {
	clearTimeout(watchdog);
	console.error(error, JSON.stringify(trace));
	app.exit(1);
});
