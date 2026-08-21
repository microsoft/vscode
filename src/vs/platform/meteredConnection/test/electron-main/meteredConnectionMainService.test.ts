/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MeteredConnectionMonitor, MeteredConnectionState } from '@vscode/metered';
import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { MeteredConnectionMainService } from '../../electron-main/meteredConnectionMainService.js';

class TestMeteredConnectionMonitor implements MeteredConnectionMonitor {
	private readonly onDidChangeEmitter = new Emitter<MeteredConnectionState>();
	readonly onDidChange = this.onDidChangeEmitter.event;
	private resolveReady!: (state: MeteredConnectionState) => void;
	readonly ready = new Promise<MeteredConnectionState>(resolve => this.resolveReady = resolve);
	current: MeteredConnectionState | undefined;
	disposeCount = 0;

	setInitialState(state: MeteredConnectionState): void {
		this.current = state;
		this.resolveReady(state);
	}

	setState(state: MeteredConnectionState): void {
		this.current = state;
		this.onDidChangeEmitter.fire(state);
	}

	dispose(): void {
		this.disposeCount++;
		this.onDidChangeEmitter.dispose();
	}
}

suite('MeteredConnectionMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('initialization waits for the initial native connection state', async () => {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const monitor = new TestMeteredConnectionMonitor();
		const service = store.add(new MeteredConnectionMainService({ monitorFactory: async () => monitor }, configurationService, new NullLogService()));
		service.setTelemetryService(NullTelemetryService);
		let initialized = false;
		void service.whenConnectionStateInitialized.then(() => initialized = true);

		await timeout(0);
		assert.strictEqual(initialized, false);

		monitor.setInitialState({
			status: 'metered',
			source: 'windows-network-cost-manager',
		});
		await service.whenConnectionStateInitialized;

		assert.deepStrictEqual({
			initialized,
			isConnectionMetered: service.isConnectionMetered,
		}, {
			initialized: true,
			isConnectionMetered: true,
		});
	});

	test('reacts to native connection state changes', async () => {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const monitor = new TestMeteredConnectionMonitor();
		const service = store.add(new MeteredConnectionMainService({ monitorFactory: async () => monitor }, configurationService, new NullLogService()));
		service.setTelemetryService(NullTelemetryService);
		const changes: boolean[] = [];
		store.add(service.onDidChangeIsConnectionMetered(state => changes.push(state)));

		monitor.setInitialState({
			status: 'unmetered',
			source: 'linux-network-manager',
			details: { meteredState: 'no' },
		});
		await service.whenConnectionStateInitialized;
		monitor.setState({
			status: 'metered',
			source: 'linux-network-manager',
			details: { meteredState: 'guessYes' },
		});
		monitor.setState({
			status: 'unknown',
			source: 'unsupported',
			reason: 'serviceUnavailable',
		});

		assert.deepStrictEqual({
			isConnectionMetered: service.isConnectionMetered,
			changes,
		}, {
			isConnectionMetered: false,
			changes: [true, false],
		});
	});

	test('completes initialization on timeout and accepts the late native state', async () => {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const monitor = new TestMeteredConnectionMonitor();
		const service = store.add(new MeteredConnectionMainService({
			monitorFactory: async () => monitor,
			initializationTimeout: 0,
		}, configurationService, new NullLogService()));
		service.setTelemetryService(NullTelemetryService);

		await service.whenConnectionStateInitialized;
		monitor.setInitialState({
			status: 'metered',
			source: 'macos-network-framework',
			available: true,
			details: { expensive: false, constrained: true },
		});
		await timeout(0);

		assert.strictEqual(service.isConnectionMetered, true);
	});

	test('disposes a monitor created after the service was disposed', async () => {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const monitor = new TestMeteredConnectionMonitor();
		const monitorPromise = new DeferredPromise<MeteredConnectionMonitor>();
		const service = store.add(new MeteredConnectionMainService({ monitorFactory: () => monitorPromise.p }, configurationService, new NullLogService()));
		service.setTelemetryService(NullTelemetryService);

		service.dispose();
		monitorPromise.complete(monitor);
		await service.whenConnectionStateInitialized;

		assert.strictEqual(monitor.disposeCount, 1);
	});
});
