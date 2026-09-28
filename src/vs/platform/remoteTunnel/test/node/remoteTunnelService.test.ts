/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ISharedProcessLifecycleService } from '../../../lifecycle/node/sharedProcessLifecycleService.js';
import { LogLevel, NullLoggerService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ActiveTunnelMode, TunnelMode, TunnelStatus } from '../../common/remoteTunnel.js';
import { TunnelMachineStatus } from '../../common/tunnelMachineStatus.js';
import { RemoteTunnelService } from '../../node/remoteTunnelService.js';
import { ITunnelProcessCoordinator, ITunnelProcessMachineStatus, ITunnelProcessOutput, ITunnelProcessStatus, TunnelProcessConnectionState, TunnelProcessMode } from '../../node/tunnelProcessCoordinator.js';
import sinon from 'sinon';

class TestTunnelProcessCoordinator implements ITunnelProcessCoordinator {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = new Emitter<ITunnelProcessStatus>();
	readonly onDidChangeStatus = this._onDidChangeStatus.event;
	private readonly _onDidOutput = new Emitter<ITunnelProcessOutput>();
	readonly onDidOutput = this._onDidOutput.event;
	private readonly _onDidMachineStatus = new Emitter<ITunnelProcessMachineStatus>();
	readonly onDidMachineStatus = this._onDidMachineStatus.event;
	private _status: ITunnelProcessStatus = { mode: 'remoteAccess', tunnelName: 'test_host', connectionState: 'connecting', serviceInstallFailed: false };

	/** Models the coordinator having no tunnel running, where `getStatus().tunnelName` is undefined. */
	setIdle(): void {
		this._status = { mode: 'none', tunnelName: undefined, connectionState: 'disconnected', serviceInstallFailed: false };
	}

	getStatus(): ITunnelProcessStatus {
		return this._status;
	}

	getIntendedTunnelName(): string {
		return 'test_host';
	}

	setRemoteAccess(_mode: TunnelMode, _logLevel: LogLevel): Promise<void> {
		return Promise.resolve();
	}

	restart(): Promise<void> {
		return Promise.resolve();
	}

	setRemoteAccessStatus(status: TunnelStatus): void {
		const connectionState: TunnelProcessConnectionState = status.type === 'connected' ? 'connected' : status.type === 'connecting' ? 'connecting' : 'disconnected';
		if (this._status.connectionState === connectionState) {
			return;
		}
		this._status = { ...this._status, connectionState };
		this._onDidChangeStatus.fire(this._status);
	}

	fireMachineStatus(mode: TunnelProcessMode, status: TunnelMachineStatus, cancel = () => { }): void {
		this._onDidMachineStatus.fire({ mode, status, cancel });
	}

	dispose(): void {
		this._onDidChangeStatus.dispose();
		this._onDidOutput.dispose();
		this._onDidMachineStatus.dispose();
	}
}

suite('Remote tunnel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('handles machine-status events through coordinator fan-out', async () => {
		const coordinator = new TestTunnelProcessCoordinator();
		const loggerService = new NullLoggerService();
		const storageService = new InMemoryStorageService();
		const publicLog2 = sinon.spy(NullTelemetryService, 'publicLog2');
		const service = new RemoteTunnelService(
			NullTelemetryService,
			{ tunnelApplicationName: 'code-tunnel' } as IProductService,
			{ appRoot: 'installation', isBuilt: true, logsHome: URI.file('logs'), userDataPath: 'custom-user-data' } as INativeEnvironmentService,
			loggerService,
			{ _serviceBrand: undefined, onWillShutdown: Event.None } as ISharedProcessLifecycleService,
			new TestConfigurationService(),
			storageService,
			coordinator,
		);
		const mode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'account' },
		};
		const tokenFailures: (typeof mode.session | undefined)[] = [];
		const tokenFailureListener = service.onDidTokenFailed(session => tokenFailures.push(session));
		const statusChanges: TunnelStatus[] = [];
		let statusChangeListener: IDisposable | undefined;
		try {
			await service.initialize(mode);
			statusChangeListener = service.onDidChangeTunnelStatus(status => statusChanges.push(status));
			let didCancel = false;
			coordinator.fireMachineStatus('remoteAccess', { type: 'connected', tunnelName: 'test_host', tunnelId: 'tunnel-id', isAttached: true, link: 'https://vscode.dev/tunnel/test_host', domain: 'vscode.dev' });
			const linkedStatus = await service.getTunnelStatus();
			coordinator.fireMachineStatus('remoteAccess', { type: 'connected', tunnelName: 'test_host', isAttached: false });
			const noLinkStatus = await service.getTunnelStatus();
			coordinator.fireMachineStatus('remoteAccess', { type: 'tokenError', message: 'token expired' }, () => didCancel = true);
			const disconnectedStatus = await service.getTunnelStatus();

			assert.deepStrictEqual({
				linkedStatus,
				noLinkStatus,
				disconnectedStatus,
				statusChanges,
				tokenFailures,
				didCancel,
				telemetryCallCount: publicLog2.callCount,
			}, {
				linkedStatus: {
					type: 'connected',
					info: {
						link: 'https://vscode.dev/tunnel/test_host',
						domain: 'vscode.dev',
						tunnelName: 'test_host',
						tunnelId: 'tunnel-id',
						isAttached: true,
					},
					serviceInstallFailed: false,
				},
				noLinkStatus: {
					type: 'connected',
					info: {
						tunnelName: 'test_host',
						isAttached: false,
					},
					serviceInstallFailed: false,
				},
				disconnectedStatus: {
					type: 'disconnected',
					onTokenFailed: mode.session,
				},
				statusChanges: [
					{
						type: 'connected',
						info: {
							link: 'https://vscode.dev/tunnel/test_host',
							domain: 'vscode.dev',
							tunnelName: 'test_host',
							tunnelId: 'tunnel-id',
							isAttached: true,
						},
						serviceInstallFailed: false,
					},
					{
						type: 'connected',
						info: {
							tunnelName: 'test_host',
							isAttached: false,
						},
						serviceInstallFailed: false,
					},
					{
						type: 'disconnected',
						onTokenFailed: mode.session,
					},
				],
				tokenFailures: [mode.session],
				didCancel: true,
				telemetryCallCount: 3,
			});
		} finally {
			statusChangeListener?.dispose();
			tokenFailureListener.dispose();
			publicLog2.restore();
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
			storageService.dispose();
		}
	});

	test('reaches connected from service-mode machine status', async () => {
		const coordinator = new TestTunnelProcessCoordinator();
		const loggerService = new NullLoggerService();
		const storageService = new InMemoryStorageService();
		const service = new RemoteTunnelService(
			NullTelemetryService,
			{ tunnelApplicationName: 'code-tunnel' } as IProductService,
			{ appRoot: 'installation', isBuilt: true, logsHome: URI.file('logs'), userDataPath: 'custom-user-data' } as INativeEnvironmentService,
			loggerService,
			{ _serviceBrand: undefined, onWillShutdown: Event.None } as ISharedProcessLifecycleService,
			new TestConfigurationService(),
			storageService,
			coordinator,
		);
		try {
			await service.initialize({
				active: true,
				asService: true,
				session: { providerId: 'github', sessionId: 'session', accountLabel: 'account' },
			});

			// The session process that attaches to the installed service reports
			// under `service`; dropping those events left the UI on "connecting".
			coordinator.fireMachineStatus('service', { type: 'connected', tunnelName: 'test_host', isAttached: true });

			assert.deepStrictEqual(await service.getTunnelStatus(), {
				type: 'connected',
				info: { tunnelName: 'test_host', isAttached: true },
				serviceInstallFailed: false,
			});
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
			storageService.dispose();
		}
	});

	test('reports the intended tunnel name while access is inactive', async () => {
		const coordinator = new TestTunnelProcessCoordinator();
		const loggerService = new NullLoggerService();
		const storageService = new InMemoryStorageService();
		const service = new RemoteTunnelService(
			NullTelemetryService,
			{ tunnelApplicationName: 'code-tunnel' } as IProductService,
			{ appRoot: 'installation', isBuilt: true, logsHome: URI.file('logs'), userDataPath: 'custom-user-data' } as INativeEnvironmentService,
			loggerService,
			{ _serviceBrand: undefined, onWillShutdown: Event.None } as ISharedProcessLifecycleService,
			new TestConfigurationService(),
			storageService,
			coordinator,
		);
		try {
			coordinator.setIdle();
			// The remote-extension recommendation compares the name this machine
			// would use against a previously used one, and asks while no tunnel
			// is running.
			assert.strictEqual(await service.getTunnelName(), 'test_host');
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
			storageService.dispose();
		}
	});
});
