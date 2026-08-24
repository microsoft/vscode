/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { LogLevel, NullLoggerService } from '../../../log/common/log.js';
import { IAgentHostSharingRequest, ITunnelProcessCoordinator, ITunnelProcessMachineStatus, ITunnelProcessOutput, ITunnelProcessStatus } from '../../../remoteTunnel/node/tunnelProcessCoordinator.js';
import { TunnelMode, TunnelStatus } from '../../../remoteTunnel/common/remoteTunnel.js';
import { TunnelHostMainService } from '../../node/tunnelHostMainService.js';

class TestTunnelProcessCoordinator implements ITunnelProcessCoordinator {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = new Emitter<ITunnelProcessStatus>();
	readonly onDidChangeStatus = this._onDidChangeStatus.event;
	readonly onDidOutput = Event.None as Event<ITunnelProcessOutput>;
	readonly onDidMachineStatus = Event.None as Event<ITunnelProcessMachineStatus>;

	constructor(private _status: ITunnelProcessStatus) {
	}

	lastSharingRequest: IAgentHostSharingRequest | undefined;
	sharingRequests: (IAgentHostSharingRequest | undefined)[] = [];
	failNextSharingRequest = false;

	getStatus(): ITunnelProcessStatus {
		return this._status;
	}

	getIntendedTunnelName(): string {
		return this._status.tunnelName ?? 'test_host';
	}

	setRemoteAccess(_mode: TunnelMode, _logLevel: LogLevel): Promise<void> {
		return Promise.resolve();
	}

	setAgentHostSharing(request: IAgentHostSharingRequest | undefined): Promise<void> {
		this.lastSharingRequest = request;
		this.sharingRequests.push(request);
		if (this.failNextSharingRequest) {
			this.failNextSharingRequest = false;
			return Promise.reject(new Error('coordinator refused the sharing intent'));
		}
		return Promise.resolve();
	}

	restart(): Promise<void> {
		return Promise.resolve();
	}

	setRemoteAccessStatus(_status: TunnelStatus): void {
	}

	setStatus(status: ITunnelProcessStatus): void {
		this._status = status;
		this._onDidChangeStatus.fire(status);
	}

	dispose(): void {
		this._onDidChangeStatus.dispose();
	}
}

suite('TunnelHostMainService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('becomes ready when the coordinator reports a connected tunnel', async () => {
		const coordinator = new TestTunnelProcessCoordinator({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connecting', serviceInstallFailed: false });
		const loggerService = new NullLoggerService();
		const service = new TunnelHostMainService(
			loggerService,
			{ logsHome: URI.file('logs') } as INativeEnvironmentService,
			coordinator,
		);
		try {
			const startHosting = service.startHosting('token', 'github');
			coordinator.setStatus({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connected', serviceInstallFailed: false });
			assert.deepStrictEqual(await startHosting, { tunnelName: 'agent' });
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
		}
	});

	test('forwards the auth provider so Microsoft accounts can host', async () => {
		const coordinator = new TestTunnelProcessCoordinator({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connecting', serviceInstallFailed: false });
		const loggerService = new NullLoggerService();
		const service = new TunnelHostMainService(
			loggerService,
			{ logsHome: URI.file('logs') } as INativeEnvironmentService,
			coordinator,
		);
		try {
			const startHosting = service.startHosting('token', 'microsoft');
			coordinator.setStatus({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connected', serviceInstallFailed: false });
			await startHosting;
			assert.deepStrictEqual(
				{ token: coordinator.lastSharingRequest?.token, authProvider: coordinator.lastSharingRequest?.authProvider },
				{ token: 'token', authProvider: 'microsoft' },
			);
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
		}
	});

	test('fails when the agent host exits before reporting connected', async () => {
		const coordinator = new TestTunnelProcessCoordinator({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connecting', serviceInstallFailed: false });
		const loggerService = new NullLoggerService();
		const service = new TunnelHostMainService(
			loggerService,
			{ logsHome: URI.file('logs') } as INativeEnvironmentService,
			coordinator,
		);
		try {
			const startHosting = service.startHosting('token', 'github');
			coordinator.setStatus({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'disconnected', serviceInstallFailed: false });
			await assert.rejects(startHosting, /exited before it became ready/);
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
		}
	});

	test('clears the sharing intent when the agent host fails to start', async () => {
		const coordinator = new TestTunnelProcessCoordinator({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connecting', serviceInstallFailed: false });
		const loggerService = new NullLoggerService();
		const service = new TunnelHostMainService(
			loggerService,
			{ logsHome: URI.file('logs') } as INativeEnvironmentService,
			coordinator,
		);
		try {
			const startHosting = service.startHosting('token', 'github');
			coordinator.setStatus({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'disconnected', serviceInstallFailed: false });
			await assert.rejects(startHosting, /exited before it became ready/);

			// A stale intent would let a later reconcile bring hosting online
			// even though the caller was told it failed.
			assert.deepStrictEqual(coordinator.sharingRequests.at(-1), undefined);
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
		}
	});

	test('clears the sharing intent when the coordinator rejects the request', async () => {
		const coordinator = new TestTunnelProcessCoordinator({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connecting', serviceInstallFailed: false });
		const loggerService = new NullLoggerService();
		const service = new TunnelHostMainService(
			loggerService,
			{ logsHome: URI.file('logs') } as INativeEnvironmentService,
			coordinator,
		);
		try {
			coordinator.failNextSharingRequest = true;
			await assert.rejects(service.startHosting('token', 'github'), /refused the sharing intent/);
			assert.deepStrictEqual(coordinator.sharingRequests.at(-1), undefined);
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
		}
	});

	test('derives public status from sharing intent and coordinator state', async () => {
		const coordinator = new TestTunnelProcessCoordinator({ mode: 'remoteAccess', tunnelName: 'remote', connectionState: 'connected', serviceInstallFailed: false });
		const loggerService = new NullLoggerService();
		const service = new TunnelHostMainService(
			loggerService,
			{ logsHome: URI.file('logs') } as INativeEnvironmentService,
			coordinator,
		);
		try {
			const withoutRequest = await service.getStatus();
			coordinator.setStatus({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connected', serviceInstallFailed: false });
			await service.startHosting('token', 'github');
			const requestedAgentHost = await service.getStatus();
			coordinator.setStatus({ mode: 'agentHost', tunnelName: 'agent', connectionState: 'connecting', serviceInstallFailed: false });
			const requestedConnecting = await service.getStatus();
			coordinator.setStatus({ mode: 'agentHost', tunnelName: undefined, connectionState: 'connected', serviceInstallFailed: false });
			const requestedWithoutName = await service.getStatus();
			coordinator.setStatus({ mode: 'remoteAccess', tunnelName: 'remote', connectionState: 'connected', serviceInstallFailed: false });
			const requestedRemoteAccess = await service.getStatus();
			coordinator.setStatus({ mode: 'service', tunnelName: 'service', connectionState: 'connected', serviceInstallFailed: false });
			const requestedService = await service.getStatus();

			assert.deepStrictEqual({
				withoutRequest,
				requestedConnecting,
				requestedWithoutName,
				requestedAgentHost,
				requestedRemoteAccess,
				requestedService,
			}, {
				withoutRequest: { active: false },
				requestedConnecting: { active: false },
				requestedWithoutName: { active: false },
				requestedAgentHost: { active: true, info: { tunnelName: 'agent' } },
				requestedRemoteAccess: { active: true, info: { tunnelName: 'remote', viaRemoteTunnelAccess: true } },
				requestedService: { active: true, info: { tunnelName: 'service', viaRemoteTunnelAccess: true } },
			});
		} finally {
			service.dispose();
			coordinator.dispose();
			loggerService.dispose();
		}
	});
});
