/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import {
	IRemoteAgentHostConnectionInfo,
	IRemoteAgentHostService,
	RemoteAgentHostConnectionStatus,
	RemoteAgentHostsEnabledSettingId,
} from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import {
	ICachedTunnel,
	ITunnelAgentHostService,
	TUNNEL_ADDRESS_PREFIX,
} from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostFilterService } from '../../common/agentHostFilter.js';
import { RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';
import { TunnelAgentHostContribution } from '../../browser/tunnelAgentHost.contribution.js';

class StubProvider extends mock<RemoteAgentHostSessionsProvider>() {
	readonly setConnectionCalls: Array<{ connection: IAgentConnection; defaultDirectory: string | undefined }> = [];

	override readonly id: string;
	override readonly remoteAddress: string;
	override readonly label: string;

	private readonly _status = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.connecting);
	override readonly connectionStatus = this._status;

	constructor(address: string, name: string) {
		super();
		this.id = `agenthost-${address}`;
		this.remoteAddress = address;
		this.label = name;
	}

	override setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this._status.set(status, undefined);
	}

	override setConnection(connection: IAgentConnection, defaultDirectory?: string): void {
		this.setConnectionCalls.push({ connection, defaultDirectory });
	}

	override unpublishCachedSessions(): void { /* noop */ }

	override dispose(): void { /* noop */ }
}

class StubTunnelService extends Disposable {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeTunnels = this._register(new Emitter<void>());
	readonly onDidChangeTunnels = this._onDidChangeTunnels.event;

	private _cached: ICachedTunnel[] = [];
	private readonly _suppressed = new Set<string>();

	setCached(tunnels: ICachedTunnel[]): void {
		this._cached = tunnels;
		this._onDidChangeTunnels.fire();
	}

	getCachedTunnels(): ICachedTunnel[] { return this._cached; }
	isAutoConnectSuppressed(id: string): boolean { return this._suppressed.has(id); }
	suppressAutoConnect(id: string): void { this._suppressed.add(id); }
	clearAutoConnectSuppression(id: string): void { this._suppressed.delete(id); }
}

class StubRemoteAgentHostService extends Disposable {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private readonly _connections: IRemoteAgentHostConnectionInfo[] = [];
	private readonly _agentConnections = new Map<string, IAgentConnection>();

	get connections(): readonly IRemoteAgentHostConnectionInfo[] { return this._connections; }

	getConnection(address: string): IAgentConnection | undefined {
		return this._agentConnections.get(address);
	}

	addConnection(info: IRemoteAgentHostConnectionInfo, connection: IAgentConnection): void {
		this._connections.push(info);
		this._agentConnections.set(info.address, connection);
		this._onDidChangeConnections.fire();
	}
}

class StubSessionsProvidersService extends Disposable {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<ISessionsProvidersChangeEvent>());
	readonly onDidChangeProviders = this._onDidChange.event;

	private readonly _providers = new Map<string, ISessionsProvider>();

	registerProvider(provider: ISessionsProvider): IDisposable {
		this._providers.set(provider.id, provider);
		this._onDidChange.fire({ added: [provider], removed: [] });
		return toDisposable(() => {
			if (this._providers.delete(provider.id)) {
				this._onDidChange.fire({ added: [], removed: [provider] });
			}
		});
	}

	getProviders(): ISessionsProvider[] {
		return [...this._providers.values()];
	}
}

class StubFilterService {
	declare readonly _serviceBrand: undefined;
	registerDiscoveryHandler(_handler: () => Promise<void>): IDisposable { return toDisposable(() => { }); }
	async rediscover(): Promise<void> { /* noop — production routes through the discovery handler */ }
}

class TestTunnelContribution extends TunnelAgentHostContribution {
	readonly stubProviders = new Map<string, StubProvider>();

	protected override _instantiateProvider(address: string, name: string): RemoteAgentHostSessionsProvider {
		const stub = new StubProvider(address, name);
		this.stubProviders.set(address, stub);
		return stub as unknown as RemoteAgentHostSessionsProvider;
	}
}

suite('TunnelAgentHostContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('newly-cached tunnel binds to subsequent live connection', () => {
		// Regression guard for the picker flow: `tunnelService.connect()` is
		// contractually obligated to cache the tunnel BEFORE announcing the
		// live connection via `addManagedConnection`. That ordering lets the
		// `onDidChangeTunnels` handler create the provider first, so the
		// `onDidChangeConnections` handler can wire it. Both halves are
		// exercised here.
		const tunnelService = store.add(new StubTunnelService());
		const remoteService = store.add(new StubRemoteAgentHostService());
		const providersService = store.add(new StubSessionsProvidersService());

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITunnelAgentHostService, tunnelService as unknown as ITunnelAgentHostService);
		instantiationService.stub(IRemoteAgentHostService, remoteService as unknown as IRemoteAgentHostService);
		instantiationService.stub(ISessionsProvidersService, providersService as unknown as ISessionsProvidersService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }));
		instantiationService.stub(INotificationService, { notify: () => ({ close() { } }) } as unknown as INotificationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None } as unknown as IAuthenticationService);
		instantiationService.stub(ITelemetryService, { publicLog2: () => { } } as unknown as ITelemetryService);
		instantiationService.stub(IAgentHostFilterService, new StubFilterService() as unknown as IAgentHostFilterService);

		const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));

		const tunnelId = 'tunnel-abc';
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
		const fakeConnection = {} as IAgentConnection;

		// Step 1: cache the tunnel — creates the provider via `_reconcileProviders`.
		tunnelService.setCached([{ tunnelId, clusterId: 'use', name: 'My Tunnel' }]);
		const provider = contribution.stubProviders.get(address);
		assert.ok(provider, 'provider should be created for the cached tunnel');
		assert.strictEqual(provider!.setConnectionCalls.length, 0, 'no live connection yet — wire-up must wait');

		// Step 2: announce the live connection — `_wireConnections` should bind it.
		remoteService.addConnection({
			address,
			name: 'My Tunnel',
			clientId: 'client-1',
			status: RemoteAgentHostConnectionStatus.connected,
		}, fakeConnection);

		assert.deepStrictEqual(provider!.setConnectionCalls.map(c => c.connection), [fakeConnection]);
	});
});
