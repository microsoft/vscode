/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentHostTransportFailureReason } from '../../../../../../platform/agentHost/common/state/sessionTransport.js';
import { shouldPauseWSLReconnectAfterFailure, WSLAgentHostContribution } from '../../browser/wslAgentHost.contribution.js';

suite('shouldPauseWSLReconnectAfterFailure', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pauses reconnect after cancellation but not after regular failures', () => {
		assert.deepStrictEqual({
			cancellation: shouldPauseWSLReconnectAfterFailure(new CancellationError()),
			regularError: shouldPauseWSLReconnectAfterFailure(new Error('boom')),
		}, {
			cancellation: true,
			regularError: false,
		});
	});
});

interface IWSLDisconnectHarness {
	_reconnectStates: { deleteAndDispose(key: string): void };
	_wslService: { disconnect(distro: string): Promise<void> };
	_remoteAgentHostService: { removeRemoteAgentHost(address: string): Promise<void> };
	_reconcile(): void;
	_disconnectWSLOnDemand(distro: string, address: string): Promise<void>;
}

interface IWSLConnectionWiringHarness {
	_remoteAgentHostService: {
		readonly connections: readonly {
			readonly address: string;
			readonly defaultDirectory?: string;
			readonly status: RemoteAgentHostConnectionStatus;
		}[];
		getConnection(address: string): IAgentConnection | undefined;
	};
	_providerInstances: Map<string, {
		setConnection(connection: IAgentConnection, defaultDirectory?: string): void;
		clearConnection(): void;
	}>;
	_wiredAddresses: Set<string>;
	_wireConnections(): void;
}

interface IWSLConnectionStatusHarness {
	_remoteAgentHostService: {
		readonly connections: readonly {
			readonly address: string;
			readonly status: RemoteAgentHostConnectionStatus;
		}[];
	};
	_providerInstances: Map<string, {
		readonly connectionStatus: { get(): RemoteAgentHostConnectionStatus };
		setConnectionStatus(status: RemoteAgentHostConnectionStatus): void;
	}>;
	_updateConnectionStatuses(): void;
}

suite('WSLAgentHostContribution disconnect', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('drops the cached distro before tearing down the connection', async () => {
		const calls: string[] = [];
		const disconnected = new DeferredPromise<void>();
		const contribution = Object.create(WSLAgentHostContribution.prototype) as IWSLDisconnectHarness;
		contribution._reconnectStates = { deleteAndDispose: key => { calls.push(`state:${key}`); } };
		// `disconnect` is what removes the cached distro. It has to land before
		// the connection is torn down, or reconciliation still sees the host as
		// desired and re-dials it.
		contribution._wslService = {
			disconnect: async distro => {
				calls.push(`wsl:${distro}`);
				await disconnected.p;
			},
		};
		contribution._remoteAgentHostService = {
			removeRemoteAgentHost: async address => { calls.push(`remove:${address}`); },
		};
		contribution._reconcile = () => { calls.push('reconcile'); };

		const pending = contribution._disconnectWSLOnDemand('Ubuntu', 'wsl:Ubuntu');
		await timeout(0);
		assert.deepStrictEqual(calls, ['state:Ubuntu', 'wsl:Ubuntu']);

		disconnected.complete();
		await pending;
		assert.deepStrictEqual(calls, ['state:Ubuntu', 'wsl:Ubuntu', 'remove:wsl:Ubuntu', 'reconcile']);
	});
});

suite('WSLAgentHostContribution connection wiring', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('clears a wired provider when its connection disconnects or vanishes without clearing an unwired provider', () => {
		const address = 'wsl:Ubuntu';
		const connection = {} as IAgentConnection;
		const calls: string[] = [];
		let connections: { address: string; defaultDirectory?: string; status: RemoteAgentHostConnectionStatus }[] = [{
			address,
			status: RemoteAgentHostConnectionStatus.connected,
		}];
		const contribution = Object.create(WSLAgentHostContribution.prototype) as IWSLConnectionWiringHarness;
		contribution._remoteAgentHostService = {
			get connections() { return connections; },
			getConnection: requestedAddress => requestedAddress === address ? connection : undefined,
		};
		contribution._providerInstances = new Map([
			[address, {
				setConnection: () => calls.push('wired:set'),
				clearConnection: () => calls.push('wired:clear'),
			}],
			['wsl:unwired', {
				setConnection: () => calls.push('unwired:set'),
				clearConnection: () => calls.push('unwired:clear'),
			}],
		]);
		contribution._wiredAddresses = new Set();

		contribution._wireConnections();
		connections = [{ address, defaultDirectory: '/home/ubuntu', status: RemoteAgentHostConnectionStatus.disconnected }];
		contribution._wireConnections();
		connections = [];
		contribution._wireConnections();

		assert.deepStrictEqual({ calls, wiredAddresses: [...contribution._wiredAddresses] }, {
			calls: ['wired:set', 'wired:clear'],
			wiredAddresses: [],
		});
	});

	test('propagates the status of a failed WSL connection entry', () => {
		const address = 'wsl:Ubuntu';
		let status = RemoteAgentHostConnectionStatus.connecting;
		const contribution = Object.create(WSLAgentHostContribution.prototype) as IWSLConnectionStatusHarness;
		contribution._remoteAgentHostService = {
			connections: [{ address, status: RemoteAgentHostConnectionStatus.disconnectedBecause(AgentHostTransportFailureReason.HostNotRunning) }],
		};
		contribution._providerInstances = new Map([[
			address,
			{
				connectionStatus: { get: () => status },
				setConnectionStatus: nextStatus => { status = nextStatus; },
			},
		]]);

		contribution._updateConnectionStatuses();

		assert.deepStrictEqual(status, RemoteAgentHostConnectionStatus.disconnectedBecause(AgentHostTransportFailureReason.HostNotRunning));
	});
});
