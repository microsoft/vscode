/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { type ITunnelConnectResult, type ITunnelGatewaySelection, type ITunnelGatewaySelectionSession, type ITunnelInfo } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { resolveGatewaySelection, type IGatewaySelectionRequest } from '../../../../../../platform/agentHost/common/tunnelGatewaySelection.js';
import type { ITunnelDuplexStream } from '../../../../../../platform/agentHost/common/tunnelMessageSocket.js';
import type { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import {
	BrowserTunnelRelayClientFactory,
	connectThroughTunnelGateway,
	filterBrowserTunnelInfos,
	type ITunnelAgentHostConnector,
} from '../../browser/browserTunnelAgentHostService.js';
import {
	type IDevTunnelsWeb,
	type IDevTunnelsWebManagementClient,
	type IDevTunnelsWebRelayClient,
	type IDevTunnelsWebRequestOptions,
	type IDevTunnelsWebTunnel,
} from '../../browser/devTunnelsWebLoader.js';

const tunnel: ITunnelInfo = {
	tunnelId: 'tunnel-id',
	clusterId: 'cluster-id',
	name: 'Remote tunnel',
	tags: ['vscode-server-launcher', 'protocolv6'],
	protocolVersion: 6,
	hostConnectionCount: 1,
};

const connection: ITunnelConnectResult = {
	connectionId: 'connection-id',
	address: 'tunnel:tunnel-id',
	name: 'Remote tunnel',
	connectionToken: 'token',
	selected: { serverType: 'editor', instanceId: 'editor-id', role: 'primary', lifecycle: 'external' },
};

class FakeSocket {
	closed = false;

	close(): void {
		this.closed = true;
	}
}

class FakeConnector implements ITunnelAgentHostConnector {
	readonly onDidRelayMessage = Event.None;
	readonly onDidRelayClose = Event.None;
	readonly socket = new FakeSocket();
	readonly completeCalls: { selectionId: string; selection: ITunnelGatewaySelection }[] = [];
	readonly cancelCalls: string[] = [];

	constructor(
		private readonly _session: ITunnelGatewaySelectionSession | undefined,
	) {
	}

	connect(): Promise<ITunnelConnectResult> {
		return Promise.resolve(connection);
	}

	prepareSelection(): Promise<ITunnelGatewaySelectionSession | undefined> {
		return Promise.resolve(this._session);
	}

	completeSelection(selectionId: string, selection: ITunnelGatewaySelection): Promise<ITunnelConnectResult> {
		this.completeCalls.push({ selectionId, selection });
		return Promise.resolve(connection);
	}

	cancelSelection(selectionId: string): Promise<void> {
		this.cancelCalls.push(selectionId);
		this.socket.close();
		return Promise.resolve();
	}

	relaySend(): Promise<void> {
		return Promise.resolve();
	}

	disconnect(): Promise<void> {
		return Promise.resolve();
	}
}

suite('BrowserTunnelAgentHostService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('filters discovered tunnels below the supported protocol version', () => {
		const results = filterBrowserTunnelInfos([
			{ tunnelId: 'v6', clusterId: 'cluster', labels: ['vscode-server-launcher', 'protocolv6'] },
			{ tunnelId: 'v4', clusterId: 'cluster', labels: ['vscode-server-launcher', 'protocolv4'] },
			{ tunnelId: 'missing-cluster', labels: ['vscode-server-launcher', 'protocolv6'] },
		]);

		assert.deepStrictEqual(results, [{
			tunnelId: 'v6',
			clusterId: 'cluster',
			name: 'v6',
			tags: ['vscode-server-launcher', 'protocolv6'],
			protocolVersion: 6,
			hostConnectionCount: 0,
		}]);
	});

	test('completes the version-six gateway selection returned by the browser picker', async () => {
		const connector = new FakeConnector({
			selectionId: 'selection-id',
			inventory: {
				userDataPath: '/data',
				endpoints: [{ type: 'editor', pid: 1, instanceId: 'editor-id', endpointKind: 'socket', endpointLabel: '/tmp/editor.sock' }],
			},
		});
		const calls: { productName: string; userInitiated: boolean }[] = [];
		const resolveSelection: typeof resolveGatewaySelection = async (
			_locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
			_dialogService: IDialogService,
			request: IGatewaySelectionRequest,
		): Promise<ITunnelGatewaySelection> => {
			calls.push({ productName: request.productName, userInitiated: request.userInitiated });
			return { instanceId: 'editor-id' };
		};

		const result = await connectThroughTunnelGateway(
			connector,
			resolveSelection,
			{} as IRemoteAgentHostLocationPreferenceService,
			{} as IDialogService,
			'VS Code',
			{ token: 'token', provider: 'github' },
			tunnel,
			true,
		);

		assert.deepStrictEqual({ result, calls, completeCalls: connector.completeCalls, cancelCalls: connector.cancelCalls }, {
			result: connection,
			calls: [{ productName: 'VS Code', userInitiated: true }],
			completeCalls: [{ selectionId: 'selection-id', selection: { instanceId: 'editor-id' } }],
			cancelCalls: [],
		});
	});

	test('cancels the pending gateway selection when the browser picker is dismissed', async () => {
		const connector = new FakeConnector({ selectionId: 'selection-id', inventory: { userDataPath: '/data', endpoints: [] } });
		const result = await connectThroughTunnelGateway(
			connector,
			async () => undefined,
			{} as IRemoteAgentHostLocationPreferenceService,
			{} as IDialogService,
			'VS Code',
			{ token: 'token', provider: 'github' },
			tunnel,
			true,
		);

		assert.deepStrictEqual({ result, completeCalls: connector.completeCalls, cancelCalls: connector.cancelCalls, socketClosed: connector.socket.closed }, {
			result: undefined,
			completeCalls: [],
			cancelCalls: ['selection-id'],
			socketClosed: true,
		});
	});

	test('configures the browser SDK relay client without local forwarded ports', async () => {
		const requests: IDevTunnelsWebRequestOptions[] = [];
		let authorization = '';
		let relay: FakeRelayClient | undefined;

		class FakeManagementClient implements IDevTunnelsWebManagementClient {
			private readonly _userTokenCallback: () => Promise<string>;

			constructor(_userAgent: string, _apiVersion: object, userTokenCallback: () => Promise<string>) {
				this._userTokenCallback = userTokenCallback;
			}

			listTunnels(): Promise<readonly IDevTunnelsWebTunnel[]> {
				return Promise.resolve([]);
			}

			async getTunnel(_tunnel: Pick<IDevTunnelsWebTunnel, 'tunnelId' | 'clusterId'>, options: IDevTunnelsWebRequestOptions): Promise<IDevTunnelsWebTunnel> {
				authorization = await this._userTokenCallback();
				requests.push(options);
				return Promise.resolve({ tunnelId: 'tunnel-id', clusterId: 'cluster-id', labels: ['vscode-server-launcher', 'protocolv6'], endpoints: { relay: 'endpoint' } });
			}

			deleteTunnel(): Promise<boolean> {
				return Promise.resolve(true);
			}
		}

		class FakeRelayClient implements IDevTunnelsWebRelayClient {
			acceptLocalConnectionsForForwardedPorts = true;
			endpoints: object | undefined;

			constructor(_managementClient: IDevTunnelsWebManagementClient) {
				relay = this;
			}

			connect(_tunnel: IDevTunnelsWebTunnel): Promise<void> {
				return Promise.resolve();
			}

			waitForForwardedPort(): Promise<void> {
				return Promise.resolve();
			}

			connectToForwardedPort(): Promise<ITunnelDuplexStream> {
				throw new Error('Not used by this adapter test');
			}

			dispose(): void {
			}
		}

		const bundle: IDevTunnelsWeb = {
			TunnelManagementHttpClient: FakeManagementClient,
			ManagementApiVersions: { Version20230927preview: {} },
			TunnelRelayTunnelClient: FakeRelayClient,
			TunnelAccessScopes: {},
		};
		const session = await new BrowserTunnelRelayClientFactory(async () => bundle).getTunnel('tunnel-id', 'cluster-id', 'github', 'token');
		await session!.createRelayClient();

		assert.deepStrictEqual({ authorization, requests, acceptsLocal: relay?.acceptLocalConnectionsForForwardedPorts, endpoints: relay?.endpoints }, {
			authorization: 'github token',
			requests: [{ includePorts: true, tokenScopes: ['connect'] }],
			acceptsLocal: false,
			endpoints: { relay: 'endpoint' },
		});
	});
});
