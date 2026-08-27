/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getEntryAddress, IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IDevContainerAgentHostConnector } from '../../../../../common/devContainerAgentHostService.js';
import { DevContainerAgentHostService } from '../../browser/devContainerAgentHostService.js';
import { IRemoteAgentHostSessionsProviderConfig, RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';

class TestAgentConnection extends mock<IAgentConnection>() implements IDisposable {
	override readonly clientId = 'dev-container-client';
	disposed = false;

	dispose(): void {
		this.disposed = true;
	}
}

class TestRemoteAgentHostService extends mock<IRemoteAgentHostService>() implements IDisposable {
	private readonly _onDidChangeConnections = new Emitter<void>();
	override readonly onDidChangeConnections = this._onDidChangeConnections.event;
	private _connections: IRemoteAgentHostConnectionInfo[] = [];

	addedEntry: IRemoteAgentHostEntry | undefined;
	removedAddress: string | undefined;
	connection: (IAgentConnection & IDisposable) | undefined;
	transportDisposable: IDisposable | undefined;

	override get connections(): readonly IRemoteAgentHostConnectionInfo[] {
		return this._connections;
	}

	override getConnection(address: string): IAgentConnection | undefined {
		return this._connections.some(connection => connection.address === address && RemoteAgentHostConnectionStatus.isConnected(connection.status))
			? this.connection
			: undefined;
	}

	override async addManagedConnection(entry: IRemoteAgentHostEntry, connection: IAgentConnection, transportDisposable?: IDisposable): Promise<IRemoteAgentHostConnectionInfo> {
		this.addedEntry = entry;
		this.connection = connection as IAgentConnection & IDisposable;
		this.transportDisposable = transportDisposable;
		const connectionInfo = {
			address: getEntryAddress(entry),
			name: entry.name,
			clientId: connection.clientId,
			defaultDirectory: '/workspace',
			status: RemoteAgentHostConnectionStatus.connected,
		};
		this._connections = [connectionInfo];
		this._onDidChangeConnections.fire();
		return connectionInfo;
	}

	override async removeRemoteAgentHost(address: string): Promise<void> {
		this.removedAddress = address;
		this.dropConnection();
	}

	dropConnection(): void {
		this._connections = [];
		this._onDidChangeConnections.fire();
		this.transportDisposable?.dispose();
		this.connection?.dispose();
	}

	dispose(): void {
		this._onDidChangeConnections.dispose();
	}
}

class TestSessionsProvidersService extends Disposable implements ISessionsProvidersService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeProviders = Event.None;
	readonly providers = new Map<string, ISessionsProvider>();

	registerProvider(provider: ISessionsProvider): IDisposable {
		this.providers.set(provider.id, provider);
		return toDisposable(() => this.providers.delete(provider.id));
	}

	getProviders(): ISessionsProvider[] {
		return Array.from(this.providers.values());
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this.providers.get(providerId) as T | undefined;
	}
}

class TestProvider extends mock<RemoteAgentHostSessionsProvider>() {
	override readonly id: string;
	wiredConnection: IAgentConnection | undefined;
	defaultDirectory: string | undefined;
	status = RemoteAgentHostConnectionStatus.disconnected;
	disposed = false;

	constructor(readonly config: IRemoteAgentHostSessionsProviderConfig) {
		super();
		this.id = `agenthost-${agentHostAuthority(config.address)}`;
	}

	override setConnection(connection: IAgentConnection, defaultDirectory?: string): void {
		this.wiredConnection = connection;
		this.defaultDirectory = defaultDirectory;
	}

	override setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this.status = status;
	}

	override dispose(): void {
		this.disposed = true;
	}
}

class TestDevContainerAgentHostService extends DevContainerAgentHostService {
	provider: TestProvider | undefined;

	protected override _createProvider(config: IRemoteAgentHostSessionsProviderConfig): RemoteAgentHostSessionsProvider {
		this.provider = new TestProvider(config);
		return this.provider as unknown as RemoteAgentHostSessionsProvider;
	}

	protected override async _waitForSessionTypes(): Promise<void> { }
}

suite('Dev Container Agent Host Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers a runtime provider around a connector-owned Agent Host connection', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const remoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const sessionsProvidersService = store.add(new TestSessionsProvidersService());
		const service = store.add(new TestDevContainerAgentHostService(
			instantiationService,
			remoteAgentHostService,
			sessionsProvidersService,
		));

		const sourceWorkspace = URI.file('/source');
		const address = 'devcontainer:source';
		const remoteWorkspace = URI.from({
			scheme: AGENT_HOST_SCHEME,
			authority: agentHostAuthority(address),
			path: '/workspaces/source',
		});
		const connection = new TestAgentConnection();
		let transportDisposed = false;
		let connectorCalls = 0;
		const connector: IDevContainerAgentHostConnector = {
			isAvailable: async () => true,
			connect: async () => {
				connectorCalls++;
				return {
					address,
					name: 'Source Dev Container',
					connection,
					transportDisposable: toDisposable(() => transportDisposed = true),
					workspaceUri: remoteWorkspace,
				};
			},
		};
		store.add(service.registerConnector(connector));

		const first = await service.connect(sourceWorkspace, CancellationToken.None);
		const second = await service.connect(sourceWorkspace, CancellationToken.None);
		await first.release();
		await first.release();
		const afterFirstRelease = {
			removedAddress: remoteAgentHostService.removedAddress,
			connectionDisposed: connection.disposed,
			transportDisposed,
		};
		await second.release();

		assert.deepStrictEqual({
			target: { providerId: first.providerId, workspaceUri: first.workspaceUri },
			reusedConnection: second.providerId === first.providerId && second.workspaceUri.toString() === first.workspaceUri.toString(),
			afterFirstRelease,
			connectorCalls,
			entry: remoteAgentHostService.addedEntry,
			provider: service.provider && {
				config: service.provider.config,
				connected: service.provider.wiredConnection === connection,
				defaultDirectory: service.provider.defaultDirectory,
				status: service.provider.status,
				disposed: service.provider.disposed,
			},
			registeredProviders: sessionsProvidersService.getProviders().map(provider => provider.id),
			removedAddress: remoteAgentHostService.removedAddress,
			connectionDisposed: connection.disposed,
			transportDisposed,
		}, {
			target: {
				providerId: `agenthost-${agentHostAuthority(address)}`,
				workspaceUri: remoteWorkspace,
			},
			reusedConnection: true,
			afterFirstRelease: {
				removedAddress: undefined,
				connectionDisposed: false,
				transportDisposed: false,
			},
			connectorCalls: 1,
			entry: {
				name: 'Source Dev Container',
				connection: {
					type: RemoteAgentHostEntryType.DevContainer,
					address,
					hostPath: sourceWorkspace.fsPath,
				},
			},
			provider: {
				config: {
					address,
					name: 'Source Dev Container',
					omitHostFromWorkspaceLabel: true,
				},
				connected: true,
				defaultDirectory: '/workspace',
				status: RemoteAgentHostConnectionStatus.connected,
				disposed: true,
			},
			registeredProviders: [],
			removedAddress: address,
			connectionDisposed: true,
			transportDisposed: true,
		});
	});

	test('disconnect forces teardown while a connection lease is held', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const remoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const sessionsProvidersService = store.add(new TestSessionsProvidersService());
		const service = store.add(new TestDevContainerAgentHostService(
			instantiationService,
			remoteAgentHostService,
			sessionsProvidersService,
		));

		const sourceWorkspace = URI.file('/source');
		const address = 'devcontainer:source';
		const connection = new TestAgentConnection();
		let transportDisposed = false;
		store.add(service.registerConnector({
			isAvailable: async () => true,
			connect: async () => ({
				address,
				name: 'Source Dev Container',
				connection,
				transportDisposable: toDisposable(() => transportDisposed = true),
				workspaceUri: URI.from({
					scheme: AGENT_HOST_SCHEME,
					authority: agentHostAuthority(address),
					path: '/workspaces/source',
				}),
			}),
		}));

		const target = await service.connect(sourceWorkspace, CancellationToken.None);
		await service.disconnect(sourceWorkspace);
		await target.release();

		assert.deepStrictEqual({
			removedAddress: remoteAgentHostService.removedAddress,
			providerDisposed: service.provider?.disposed,
			registeredProviders: sessionsProvidersService.getProviders(),
			connectionDisposed: connection.disposed,
			transportDisposed,
		}, {
			removedAddress: address,
			providerDisposed: true,
			registeredProviders: [],
			connectionDisposed: true,
			transportDisposed: true,
		});
	});

	test('a canceled caller stops waiting without canceling a shared connection', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const remoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const sessionsProvidersService = store.add(new TestSessionsProvidersService());
		const service = store.add(new TestDevContainerAgentHostService(
			instantiationService,
			remoteAgentHostService,
			sessionsProvidersService,
		));

		const sourceWorkspace = URI.file('/source');
		const address = 'devcontainer:source';
		const connection = new TestAgentConnection();
		let connectorCalls = 0;
		let connectorToken = CancellationToken.None;
		const result = new DeferredPromise<{
			address: string;
			name: string;
			connection: TestAgentConnection;
			workspaceUri: URI;
		}>();
		store.add(service.registerConnector({
			isAvailable: async () => true,
			connect: async (_workspaceUri, token) => {
				connectorCalls++;
				connectorToken = token;
				return result.p;
			},
		}));

		const first = service.connect(sourceWorkspace, CancellationToken.None);
		const secondTokenSource = store.add(new CancellationTokenSource());
		const second = service.connect(sourceWorkspace, secondTokenSource.token);
		secondTokenSource.cancel();
		await assert.rejects(second, CancellationError);
		result.complete({
			address,
			name: 'Source Dev Container',
			connection,
			workspaceUri: URI.from({
				scheme: AGENT_HOST_SCHEME,
				authority: agentHostAuthority(address),
				path: '/workspaces/source',
			}),
		});
		const target = await first;
		await target.release();

		assert.deepStrictEqual({
			connectorCalls,
			underlyingConnectionCanceled: connectorToken.isCancellationRequested,
			removedAddress: remoteAgentHostService.removedAddress,
			connectionDisposed: connection.disposed,
		}, {
			connectorCalls: 1,
			underlyingConnectionCanceled: false,
			removedAddress: address,
			connectionDisposed: true,
		});
	});

	test('disconnect cancels an in-flight container connection', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const remoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const sessionsProvidersService = store.add(new TestSessionsProvidersService());
		const service = store.add(new TestDevContainerAgentHostService(
			instantiationService,
			remoteAgentHostService,
			sessionsProvidersService,
		));

		const sourceWorkspace = URI.file('/source');
		const address = 'devcontainer:source';
		const connection = new TestAgentConnection();
		let transportDisposed = false;
		let connectorToken = CancellationToken.None;
		const result = new DeferredPromise<{
			address: string;
			name: string;
			connection: TestAgentConnection;
			transportDisposable: IDisposable;
			workspaceUri: URI;
		}>();
		store.add(service.registerConnector({
			isAvailable: async () => true,
			connect: async (_workspaceUri, token) => {
				connectorToken = token;
				return result.p;
			},
		}));

		const connect = service.connect(sourceWorkspace, CancellationToken.None);
		const disconnect = service.disconnect(sourceWorkspace);
		assert.strictEqual(connectorToken.isCancellationRequested, true);
		result.complete({
			address,
			name: 'Source Dev Container',
			connection,
			transportDisposable: toDisposable(() => transportDisposed = true),
			workspaceUri: URI.from({
				scheme: AGENT_HOST_SCHEME,
				authority: agentHostAuthority(address),
				path: '/workspaces/source',
			}),
		});

		await assert.rejects(connect);
		await disconnect;
		assert.deepStrictEqual({
			addedEntry: remoteAgentHostService.addedEntry,
			provider: service.provider,
			registeredProviders: sessionsProvidersService.getProviders(),
			connectionDisposed: connection.disposed,
			transportDisposed,
		}, {
			addedEntry: undefined,
			provider: undefined,
			registeredProviders: [],
			connectionDisposed: true,
			transportDisposed: true,
		});
	});

	test('removes the provider when the managed connection disappears', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const remoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const sessionsProvidersService = store.add(new TestSessionsProvidersService());
		const service = store.add(new TestDevContainerAgentHostService(
			instantiationService,
			remoteAgentHostService,
			sessionsProvidersService,
		));

		const sourceWorkspace = URI.file('/source');
		const address = 'devcontainer:source';
		const connection = new TestAgentConnection();
		let transportDisposed = false;
		store.add(service.registerConnector({
			isAvailable: async () => true,
			connect: async () => ({
				address,
				name: 'Source Dev Container',
				connection,
				transportDisposable: toDisposable(() => transportDisposed = true),
				workspaceUri: URI.from({
					scheme: AGENT_HOST_SCHEME,
					authority: agentHostAuthority(address),
					path: '/workspaces/source',
				}),
			}),
		}));

		await service.connect(sourceWorkspace, CancellationToken.None);
		const provider = service.provider;
		remoteAgentHostService.dropConnection();

		assert.deepStrictEqual({
			providerDisposed: provider?.disposed,
			registeredProviders: sessionsProvidersService.getProviders(),
			connectionDisposed: connection.disposed,
			transportDisposed,
		}, {
			providerDisposed: true,
			registeredProviders: [],
			connectionDisposed: true,
			transportDisposed: true,
		});
	});
});
