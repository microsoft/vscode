/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import {
	IRemoteAgentHostConnectionInfo,
	IRemoteAgentHostService,
	RemoteAgentHostConnectionStatus,
	RemoteAgentHostsEnabledSettingId,
} from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import {
	ICachedTunnel,
	ITunnelAgentHostService,
	TUNNEL_ADDRESS_PREFIX,
	type ITunnelHostInfo,
	type ITunnelInfo,
	type TunnelAutoConnectMode,
} from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { IHostService } from '../../../../../../workbench/services/host/browser/host.js';
import { ITunnelHostService } from '../../../../../../workbench/contrib/chat/common/tunnelHost.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';
import { TunnelAgentHostContribution } from '../../browser/tunnelAgentHost.contribution.js';

class StubProvider extends mock<RemoteAgentHostSessionsProvider>() {
	readonly setConnectionCalls: Array<{ connection: IAgentConnection; defaultDirectory: string | undefined }> = [];
	readonly clearConnectionCalls: undefined[] = [];

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
	override clearConnection(): void { this.clearConnectionCalls.push(undefined); }

	override dispose(): void { /* noop */ }
}

class StubTunnelService extends Disposable implements ITunnelAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeTunnels = this._register(new Emitter<void>());
	readonly onDidChangeTunnels = this._onDidChangeTunnels.event;

	private _cached: ICachedTunnel[] = [];
	private _listed: ITunnelInfo[] | undefined;
	private readonly _dismissed = new Set<string>();
	private readonly _suppressed = new Set<string>();
	autoConnectMode: TunnelAutoConnectMode = 'background';

	/** Records every `connect()` call for assertions on the `userInitiated` threading. */
	readonly connectCalls: Array<{ tunnel: ITunnelInfo; authProvider: string | undefined; options: { readonly userInitiated?: boolean } | undefined }> = [];
	readonly disconnectCalls: string[] = [];

	setCached(tunnels: ICachedTunnel[]): void {
		this._cached = tunnels;
		this._onDidChangeTunnels.fire();
	}

	getCachedTunnels(): ICachedTunnel[] { return this._cached; }
	setListed(tunnels: ITunnelInfo[] | undefined): void { this._listed = tunnels; }
	async listTunnels(_options?: { silent?: boolean }): Promise<ITunnelInfo[]> { return this._listed ?? []; }
	getAutoConnectMode(_tunnel: ITunnelInfo): TunnelAutoConnectMode { return this.autoConnectMode; }
	readonly canDeleteTunnels = true;
	async deleteTunnel(tunnel: ITunnelInfo): Promise<void> { this.removeCachedTunnel(tunnel.tunnelId); }
	cacheTunnel(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): void {
		this._cached = [{ tunnelId: tunnel.tunnelId, clusterId: tunnel.clusterId, name: tunnel.name, authProvider }, ...this._cached.filter(cached => cached.tunnelId !== tunnel.tunnelId)];
		this._onDidChangeTunnels.fire();
	}
	removeCachedTunnel(tunnelId: string): void {
		this._cached = this._cached.filter(tunnel => tunnel.tunnelId !== tunnelId);
		this._onDidChangeTunnels.fire();
	}
	isTunnelDismissed(id: string): boolean { return this._dismissed.has(id); }
	dismissTunnel(id: string): void {
		this._dismissed.add(id);
		this._onDidChangeTunnels.fire();
	}
	clearTunnelDismissal(id: string): void {
		if (this._dismissed.delete(id)) {
			this._onDidChangeTunnels.fire();
		}
	}
	isAutoConnectSuppressed(id: string): boolean { return this._suppressed.has(id); }
	suppressAutoConnect(id: string): void { this._suppressed.add(id); }
	clearAutoConnectSuppression(id: string): void { this._suppressed.delete(id); }
	async getAuthProvider(_options?: { silent?: boolean }): Promise<'github' | 'microsoft' | undefined> { return undefined; }

	async connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft', options?: { readonly userInitiated?: boolean }): Promise<void> {
		this.connectCalls.push({ tunnel, authProvider, options });
	}

	async disconnect(address: string): Promise<void> { this.disconnectCalls.push(address); }
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

	setConnectionStatus(address: string, status: RemoteAgentHostConnectionStatus): void {
		const index = this._connections.findIndex(connection => connection.address === address);
		if (index >= 0) {
			this._connections[index] = { ...this._connections[index], status };
			this._onDidChangeConnections.fire();
		}
	}

	fireConnectionChange(): void {
		this._onDidChangeConnections.fire();
	}
}

class StubHostService extends mock<IHostService>() {
	private readonly _onDidChangeFocus = new Emitter<boolean>();
	override readonly onDidChangeFocus = this._onDidChangeFocus.event;

	fireFocus(focused: boolean): void {
		this._onDidChangeFocus.fire(focused);
	}
}

class StubTunnelHostService extends Disposable implements ITunnelHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<void>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private _sharingInfo: ITunnelHostInfo | undefined;

	get isSharing(): boolean {
		return this._sharingInfo !== undefined;
	}

	get isConnecting(): boolean {
		return false;
	}

	get sharingInfo(): ITunnelHostInfo | undefined {
		return this._sharingInfo;
	}

	setSharingInfo(tunnelName: string | undefined): void {
		this._sharingInfo = tunnelName ? { tunnelName } : undefined;
		this._onDidChangeStatus.fire();
	}

	async startSharing(): Promise<void> { throw new Error('Not implemented'); }
	async stopSharing(): Promise<void> { this.setSharingInfo(undefined); }
	async restartSharing(): Promise<void> { throw new Error('Not implemented'); }
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

	test('newly-cached tunnel binds to subsequent live connection', async () => {
		// Tunnel connection staging caches the tunnel before the remote service
		// announces its live connection. That ordering lets the cache-change
		// handler create the provider first, so the connection-change handler
		// can wire it.
		const tunnelService = store.add(new StubTunnelService());
		const remoteService = store.add(new StubRemoteAgentHostService());
		const providersService = store.add(new StubSessionsProvidersService());
		const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		const hostService = new StubHostService();

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITunnelAgentHostService, tunnelService);
		instantiationService.stub(IRemoteAgentHostService, remoteService as unknown as IRemoteAgentHostService);
		instantiationService.stub(ISessionsProvidersService, providersService as unknown as ISessionsProvidersService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(INotificationService, { notify: () => ({ close() { } }) } as unknown as INotificationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None } as unknown as IAuthenticationService);
		instantiationService.stub(ITelemetryService, { publicLog2: () => { } } as unknown as ITelemetryService);
		instantiationService.stub(IHostService, hostService);
		instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
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

		await configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === RemoteAgentHostsEnabledSettingId,
			affectedKeys: new Set([RemoteAgentHostsEnabledSettingId]),
			change: { keys: [RemoteAgentHostsEnabledSettingId], overrides: [] },
			source: ConfigurationTarget.USER,
		});

		assert.deepStrictEqual(providersService.getProviders(), []);
	});

	test('on-demand connect threads userInitiated to tunnelService.connect', async () => {
		const tunnelService = store.add(new StubTunnelService());
		const remoteService = store.add(new StubRemoteAgentHostService());
		const providersService = store.add(new StubSessionsProvidersService());
		const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		const hostService = new StubHostService();

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITunnelAgentHostService, tunnelService);
		instantiationService.stub(IRemoteAgentHostService, remoteService as unknown as IRemoteAgentHostService);
		instantiationService.stub(ISessionsProvidersService, providersService as unknown as ISessionsProvidersService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(INotificationService, { notify: () => ({ close() { } }) } as unknown as INotificationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None } as unknown as IAuthenticationService);
		instantiationService.stub(ITelemetryService, { publicLog2: () => { } } as unknown as ITelemetryService);
		instantiationService.stub(IHostService, hostService);
		instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
		instantiationService.stub(IAgentHostFilterService, new StubFilterService() as unknown as IAgentHostFilterService);

		const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));

		const tunnelId = 'tunnel-bg';
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
		tunnelService.setCached([{ tunnelId, clusterId: 'use', name: 'Background Tunnel' }]);

		// Access the private on-demand orchestration method via a typed seam.
		const testable = contribution as unknown as {
			_connectTunnel(address: string, options: { readonly userInitiated: boolean }): Promise<void>;
		};

		tunnelService.dismissTunnel(tunnelId);
		await testable._connectTunnel(address, { userInitiated: true });
		assert.deepStrictEqual({
			dismissed: tunnelService.isTunnelDismissed(tunnelId),
			connectCalls: tunnelService.connectCalls.map(call => call.options?.userInitiated),
			providers: providersService.getProviders().map(provider => provider.id),
		}, {
			dismissed: false,
			connectCalls: [true],
			providers: [`agenthost-${address}`],
		});
	});

	test('suppresses a locally hosted tunnel without removing its provider', () => {
		const tunnelService = store.add(new StubTunnelService());
		const remoteService = store.add(new StubRemoteAgentHostService());
		const providersService = store.add(new StubSessionsProvidersService());
		const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		const tunnelHostService = store.add(new StubTunnelHostService());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITunnelAgentHostService, tunnelService);
		instantiationService.stub(IRemoteAgentHostService, remoteService as unknown as IRemoteAgentHostService);
		instantiationService.stub(ISessionsProvidersService, providersService as unknown as ISessionsProvidersService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(INotificationService, { notify: () => ({ close() { } }) } as unknown as INotificationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None } as unknown as IAuthenticationService);
		instantiationService.stub(ITelemetryService, { publicLog2: () => { } } as unknown as ITelemetryService);
		instantiationService.stub(IHostService, new StubHostService());
		instantiationService.stub(ITunnelHostService, tunnelHostService);
		instantiationService.stub(IAgentHostFilterService, new StubFilterService() as unknown as IAgentHostFilterService);
		const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
		const tunnelId = 'tunnel-hosted';
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;

		tunnelHostService.setSharingInfo('Hosted Tunnel');
		tunnelService.setCached([{ tunnelId, clusterId: 'use', name: 'Hosted Tunnel' }]);

		assert.deepStrictEqual({
			isSuppressed: tunnelService.isAutoConnectSuppressed(tunnelId),
			isDismissed: tunnelService.isTunnelDismissed(tunnelId),
			hasProvider: contribution.stubProviders.has(address),
		}, {
			isSuppressed: true,
			isDismissed: false,
			hasProvider: true,
		});

		tunnelHostService.setSharingInfo(undefined);
		assert.strictEqual(tunnelService.isAutoConnectSuppressed(tunnelId), false);
	});

	test('dismissed tunnel stays removed through discovery until explicitly restored', async () => {
		const tunnelService = store.add(new StubTunnelService());
		const remoteService = store.add(new StubRemoteAgentHostService());
		const providersService = store.add(new StubSessionsProvidersService());
		const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITunnelAgentHostService, tunnelService);
		instantiationService.stub(IRemoteAgentHostService, remoteService as unknown as IRemoteAgentHostService);
		instantiationService.stub(ISessionsProvidersService, providersService as unknown as ISessionsProvidersService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(INotificationService, { notify: () => ({ close() { } }) } as unknown as INotificationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None } as unknown as IAuthenticationService);
		instantiationService.stub(ITelemetryService, { publicLog2: () => { } } as unknown as ITelemetryService);
		instantiationService.stub(IHostService, new StubHostService());
		instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
		instantiationService.stub(IAgentHostFilterService, new StubFilterService() as unknown as IAgentHostFilterService);
		const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
		const tunnel: ITunnelInfo = {
			tunnelId: 'tunnel-dismissed',
			clusterId: 'use',
			name: 'Dismissed Tunnel',
			tags: [],
			protocolVersion: 5,
			hostConnectionCount: 1,
		};
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
		tunnelService.setCached([{ tunnelId: tunnel.tunnelId, clusterId: tunnel.clusterId, name: tunnel.name }]);
		tunnelService.setListed([tunnel]);
		const testable = contribution as unknown as {
			_disconnectTunnel(address: string): Promise<void>;
			_silentStatusCheck(): Promise<void>;
		};

		await testable._disconnectTunnel(address);
		const afterRemove = {
			cached: tunnelService.getCachedTunnels().map(cached => cached.tunnelId),
			dismissed: tunnelService.isTunnelDismissed(tunnel.tunnelId),
			disconnectCalls: tunnelService.disconnectCalls,
			providers: providersService.getProviders().map(provider => provider.id),
		};
		await testable._silentStatusCheck();
		const afterDiscovery = {
			cached: tunnelService.getCachedTunnels().map(cached => cached.tunnelId),
			dismissed: tunnelService.isTunnelDismissed(tunnel.tunnelId),
			providers: providersService.getProviders().map(provider => provider.id),
		};

		tunnelService.clearTunnelDismissal(tunnel.tunnelId);
		tunnelService.cacheTunnel(tunnel, 'github');
		assert.deepStrictEqual({
			afterRemove,
			afterDiscovery,
			afterExplicitRestore: {
				cached: tunnelService.getCachedTunnels().map(cached => cached.tunnelId),
				dismissed: tunnelService.isTunnelDismissed(tunnel.tunnelId),
				providers: providersService.getProviders().map(provider => provider.id),
			},
		}, {
			afterRemove: {
				cached: [],
				dismissed: true,
				disconnectCalls: [address],
				providers: [],
			},
			afterDiscovery: {
				cached: [],
				dismissed: true,
				providers: [],
			},
			afterExplicitRestore: {
				cached: [tunnel.tunnelId],
				dismissed: false,
				providers: [`agenthost-${address}`],
			},
		});
	});

	test('clears the provider connection only after a connected transport disconnects', () => {
		const tunnelService = store.add(new StubTunnelService());
		const remoteService = store.add(new StubRemoteAgentHostService());
		const providersService = store.add(new StubSessionsProvidersService());
		const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		const hostService = new StubHostService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITunnelAgentHostService, tunnelService as unknown as ITunnelAgentHostService);
		instantiationService.stub(IRemoteAgentHostService, remoteService as unknown as IRemoteAgentHostService);
		instantiationService.stub(ISessionsProvidersService, providersService as unknown as ISessionsProvidersService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(INotificationService, { notify: () => ({ close() { } }) } as unknown as INotificationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None } as unknown as IAuthenticationService);
		instantiationService.stub(ITelemetryService, { publicLog2: () => { } } as unknown as ITelemetryService);
		instantiationService.stub(IHostService, hostService);
		instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
		instantiationService.stub(IAgentHostFilterService, new StubFilterService() as unknown as IAgentHostFilterService);
		const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
		const tunnelId = 'tunnel-disconnect';
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
		tunnelService.setCached([{ tunnelId, clusterId: 'use', name: 'Disconnect Tunnel' }]);
		remoteService.addConnection({ address, name: 'Disconnect Tunnel', clientId: 'client', status: RemoteAgentHostConnectionStatus.connected }, {} as IAgentConnection);
		const provider = contribution.stubProviders.get(address)!;

		remoteService.fireConnectionChange();
		const whileConnected = provider.clearConnectionCalls.length;
		remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connecting);
		const whileConnecting = provider.clearConnectionCalls.length;
		remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connected);
		remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.disconnected);
		const afterDisconnect = provider.clearConnectionCalls.length;
		remoteService.fireConnectionChange();
		const afterRepeatDisconnect = provider.clearConnectionCalls.length;

		// A transport that drops via an intermediate `connecting` state must
		// still clear: the wired-provider bookkeeping has to survive statuses
		// that are neither connected nor disconnected.
		remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connected);
		remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connecting);
		remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.disconnected);

		assert.deepStrictEqual(
			{ whileConnected, whileConnecting, afterDisconnect, afterRepeatDisconnect, afterConnectingDisconnect: provider.clearConnectionCalls.length },
			{ whileConnected: 0, whileConnecting: 0, afterDisconnect: 1, afterRepeatDisconnect: 1, afterConnectingDisconnect: 2 },
		);
	});
});
