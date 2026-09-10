/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../../base/common/hash.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostProtocolClient } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getEntryAddress, IRemoteAgentHostConnectionFactory, IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { ISessionChangeEvent, ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IDevContainerAgentHostConnector } from '../../../../../common/devContainerAgentHostService.js';
import { DevContainerAgentHostService } from '../../browser/devContainerAgentHostService.js';
import { IRemoteAgentHostSessionsProviderConfig, RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';

/** Stands in for the protocol client the factory hands back to the service. */
class TestAgentConnection extends mock<AgentHostProtocolClient>() implements IDisposable {
	override get clientId(): string { return 'dev-container-client'; }
	disposed = false;

	override dispose(): void {
		this.disposed = true;
	}
}

function devContainerAddress(workspaceUri: URI): string {
	const sha = new StringSHA1();
	sha.update(getComparisonKey(workspaceUri));
	return `devcontainer:${sha.digest()}`;
}

class TestRemoteAgentHostService extends mock<IRemoteAgentHostService>() implements IDisposable {
	private readonly _onDidChangeConnections = new Emitter<void>();
	override readonly onDidChangeConnections = this._onDidChangeConnections.event;
	private _connections: IRemoteAgentHostConnectionInfo[] = [];
	private _factory: IRemoteAgentHostConnectionFactory | undefined;
	private _pendingConnect: Promise<void> | undefined;

	stagedEntry: IRemoteAgentHostEntry | undefined;
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

	override registerConnectionFactory(factory: IRemoteAgentHostConnectionFactory): IDisposable {
		this._factory = factory;
		return toDisposable(() => {
			if (this._factory === factory) {
				this._factory = undefined;
			}
		});
	}

	override reconnect(address: string, userInitiated = true): void {
		const entry = this._factory?.entries.get().find(entry => getEntryAddress(entry) === address);
		if (!entry || !this._factory) {
			return;
		}
		this.stagedEntry = entry;
		this._pendingConnect = this._factory.createConnection(entry, { userInitiated }).then(createdConnection => {
			this.connection = createdConnection.connection;
			this.transportDisposable = createdConnection.transportDisposable;
			this._connections = [{
				address,
				name: entry.name,
				clientId: createdConnection.connection.clientId,
				defaultDirectory: '/workspace',
				status: RemoteAgentHostConnectionStatus.connected,
			}];
			this._onDidChangeConnections.fire();
		});
	}

	override async waitForConnection(address: string): Promise<IRemoteAgentHostConnectionInfo> {
		await this._pendingConnect;
		const connection = this._connections.find(candidate => candidate.address === address);
		if (!connection) {
			throw new Error(`No connection for ${address}`);
		}
		return connection;
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
	readonly sessionsChangedEmitter = new Emitter<ISessionChangeEvent>();
	override readonly onDidChangeSessions = this.sessionsChangedEmitter.event;
	readonly testSession = new class extends mock<ISession>() { }();
	sessionPublished = false;
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

	override clearConnection(): void {
		this.wiredConnection = undefined;
		this.defaultDirectory = undefined;
	}

	override getSessions(): ISession[] {
		return this.sessionPublished ? [this.testSession] : [];
	}

	publishSession(): void {
		this.sessionPublished = true;
		this.sessionsChangedEmitter.fire({ added: [this.testSession], removed: [], changed: [] });
	}

	override dispose(): void {
		this.disposed = true;
		this.sessionsChangedEmitter.dispose();
	}
}

class TestDevContainerAgentHostService extends DevContainerAgentHostService {
	provider: TestProvider | undefined;
	publishSessionOnCreate = false;

	protected override _createProvider(config: IRemoteAgentHostSessionsProviderConfig): RemoteAgentHostSessionsProvider {
		this.provider = new TestProvider(config);
		this.provider.sessionPublished = this.publishSessionOnCreate;
		return this.provider as unknown as RemoteAgentHostSessionsProvider;
	}

	protected override async _waitForSessionTypes(): Promise<void> { }
}

suite('Dev Container Agent Host Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers a runtime provider around a factory-owned Agent Host connection', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const remoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const sessionsProvidersService = store.add(new TestSessionsProvidersService());
		const service = store.add(new TestDevContainerAgentHostService(
			instantiationService,
			remoteAgentHostService,
			sessionsProvidersService,
			store.add(new InMemoryStorageService()),
		));

		const sourceWorkspace = URI.file('/source');
		const address = devContainerAddress(sourceWorkspace);
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
			createConnection: async (_workspaceUri, address) => {
				connectorCalls++;
				return {
					address,
					name: 'Source Dev Container',
					transportFactory: () => undefined as never,
					transportDisposable: toDisposable(() => transportDisposed = true),
					workspaceUri: remoteWorkspace,
				};
			},
		};
		store.add(service.registerConnector(connector));
		instantiationService.stubInstance(AgentHostProtocolClient, connection);

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
			entry: remoteAgentHostService.stagedEntry,
			provider: service.provider && {
				config: {
					address: service.provider.config.address,
					name: service.provider.config.name,
					devContainerWorktreeScope: service.provider.config.devContainerWorktreeScope,
					omitHostFromWorkspaceLabel: service.provider.config.omitHostFromWorkspaceLabel,
					connectOnDemand: !!service.provider.config.connectOnDemand,
					disconnectOnDemand: !!service.provider.config.disconnectOnDemand,
				},
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
					devContainerWorktreeScope: getComparisonKey(sourceWorkspace),
					omitHostFromWorkspaceLabel: true,
					connectOnDemand: true,
					disconnectOnDemand: true,
				},
				connected: false,
				defaultDirectory: undefined,
				status: RemoteAgentHostConnectionStatus.disconnected,
				disposed: true,
			},
			registeredProviders: [],
			removedAddress: address,
			connectionDisposed: true,
			transportDisposed: true,
		});
	});

	test('restores a disconnected provider and reconnects it on demand', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const sourceWorkspace = URI.file('/source');
		const address = devContainerAddress(sourceWorkspace);
		const remoteWorkspace = URI.from({
			scheme: AGENT_HOST_SCHEME,
			authority: agentHostAuthority(address),
			path: '/workspaces/source',
		});

		const firstInstantiationService = store.add(new TestInstantiationService());
		const firstRemoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const firstSessionsProvidersService = store.add(new TestSessionsProvidersService());
		const firstService = store.add(new TestDevContainerAgentHostService(
			firstInstantiationService,
			firstRemoteAgentHostService,
			firstSessionsProvidersService,
			storageService,
		));
		firstInstantiationService.stubInstance(AgentHostProtocolClient, new TestAgentConnection());
		store.add(firstService.registerConnector({
			isAvailable: async () => true,
			createConnection: async (_workspaceUri, stagedAddress) => ({
				address: stagedAddress,
				name: 'Source Dev Container',
				transportFactory: () => undefined as never,
				workspaceUri: remoteWorkspace,
			}),
		}));
		const target = await firstService.connect(sourceWorkspace, CancellationToken.None);
		firstService.provider?.publishSession();
		await target.release();
		firstService.dispose();

		const secondInstantiationService = store.add(new TestInstantiationService());
		const secondRemoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const secondSessionsProvidersService = store.add(new TestSessionsProvidersService());
		const secondService = store.add(new TestDevContainerAgentHostService(
			secondInstantiationService,
			secondRemoteAgentHostService,
			secondSessionsProvidersService,
			storageService,
		));
		const restoredProvider = secondService.provider;
		let connectorCalls = 0;
		secondInstantiationService.stubInstance(AgentHostProtocolClient, new TestAgentConnection());
		const reconnect = restoredProvider?.config.connectOnDemand?.();
		const statusBeforeConnector = restoredProvider?.status;
		store.add(secondService.registerConnector({
			isAvailable: async () => true,
			createConnection: async (_workspaceUri, stagedAddress) => {
				connectorCalls++;
				return {
					address: stagedAddress,
					name: 'Source Dev Container',
					transportFactory: () => undefined as never,
					workspaceUri: remoteWorkspace,
				};
			},
		}));
		await reconnect;

		assert.deepStrictEqual({
			restoredProvider: restoredProvider && {
				id: restoredProvider.id,
				status: restoredProvider.status,
				connectOnDemand: !!restoredProvider.config.connectOnDemand,
			},
			registeredProviders: secondSessionsProvidersService.getProviders().map(provider => provider.id),
			reusedProvider: secondService.provider === restoredProvider,
			connectorCalls,
			connected: restoredProvider?.wiredConnection !== undefined,
			statusBeforeConnector,
			storageTargets: {
				machine: storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
				user: storageService.keys(StorageScope.APPLICATION, StorageTarget.USER),
			},
		}, {
			restoredProvider: {
				id: `agenthost-${agentHostAuthority(address)}`,
				status: RemoteAgentHostConnectionStatus.connected,
				connectOnDemand: true,
			},
			registeredProviders: [`agenthost-${agentHostAuthority(address)}`],
			reusedProvider: true,
			connectorCalls: 1,
			connected: true,
			statusBeforeConnector: RemoteAgentHostConnectionStatus.connecting,
			storageTargets: {
				machine: ['devContainerAgentHost.connections'],
				user: [],
			},
		});
	});

	test('persists a provider whose sessions were already cached', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const sourceWorkspace = URI.file('/source');
		const address = devContainerAddress(sourceWorkspace);
		const remoteWorkspace = URI.from({
			scheme: AGENT_HOST_SCHEME,
			authority: agentHostAuthority(address),
			path: '/workspaces/source',
		});

		const firstInstantiationService = store.add(new TestInstantiationService());
		const firstRemoteAgentHostService = store.add(new TestRemoteAgentHostService());
		const firstService = store.add(new TestDevContainerAgentHostService(
			firstInstantiationService,
			firstRemoteAgentHostService,
			store.add(new TestSessionsProvidersService()),
			storageService,
		));
		firstService.publishSessionOnCreate = true;
		firstInstantiationService.stubInstance(AgentHostProtocolClient, new TestAgentConnection());
		store.add(firstService.registerConnector({
			isAvailable: async () => true,
			createConnection: async (_workspaceUri, stagedAddress) => ({
				address: stagedAddress,
				name: 'Source Dev Container',
				transportFactory: () => undefined as never,
				workspaceUri: remoteWorkspace,
			}),
		}));
		const target = await firstService.connect(sourceWorkspace, CancellationToken.None);
		await target.release();
		firstService.dispose();

		const secondSessionsProvidersService = store.add(new TestSessionsProvidersService());
		const secondService = store.add(new TestDevContainerAgentHostService(
			store.add(new TestInstantiationService()),
			store.add(new TestRemoteAgentHostService()),
			secondSessionsProvidersService,
			storageService,
		));

		assert.deepStrictEqual({
			providerId: secondService.provider?.id,
			status: secondService.provider?.status,
			registeredProviders: secondSessionsProvidersService.getProviders().map(provider => provider.id),
		}, {
			providerId: `agenthost-${agentHostAuthority(address)}`,
			status: RemoteAgentHostConnectionStatus.disconnected,
			registeredProviders: [`agenthost-${agentHostAuthority(address)}`],
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
			store.add(new InMemoryStorageService()),
		));

		const sourceWorkspace = URI.file('/source');
		const address = devContainerAddress(sourceWorkspace);
		const connection = new TestAgentConnection();
		let transportDisposed = false;
		store.add(service.registerConnector({
			isAvailable: async () => true,
			createConnection: async (_workspaceUri, stagedAddress) => ({
				address: stagedAddress,
				name: 'Source Dev Container',
				transportFactory: () => undefined as never,
				transportDisposable: toDisposable(() => transportDisposed = true),
				workspaceUri: URI.from({
					scheme: AGENT_HOST_SCHEME,
					authority: agentHostAuthority(address),
					path: '/workspaces/source',
				}),
			}),
		}));
		instantiationService.stubInstance(AgentHostProtocolClient, connection);

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
			store.add(new InMemoryStorageService()),
		));

		const sourceWorkspace = URI.file('/source');
		const address = devContainerAddress(sourceWorkspace);
		const connection = new TestAgentConnection();
		let connectorCalls = 0;
		let connectorToken = CancellationToken.None;
		const result = new DeferredPromise<{
			address: string;
			name: string;
			transportFactory: () => never;
			workspaceUri: URI;
		}>();
		store.add(service.registerConnector({
			isAvailable: async () => true,
			createConnection: async (_workspaceUri, _address, token) => {
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
			transportFactory: () => undefined as never,
			workspaceUri: URI.from({
				scheme: AGENT_HOST_SCHEME,
				authority: agentHostAuthority(address),
				path: '/workspaces/source',
			}),
		});
		instantiationService.stubInstance(AgentHostProtocolClient, connection);
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
			store.add(new InMemoryStorageService()),
		));

		const sourceWorkspace = URI.file('/source');
		const address = devContainerAddress(sourceWorkspace);
		let transportDisposed = false;
		let connectorToken = CancellationToken.None;
		const result = new DeferredPromise<{
			address: string;
			name: string;
			transportFactory: () => never;
			transportDisposable: IDisposable;
			workspaceUri: URI;
		}>();
		store.add(service.registerConnector({
			isAvailable: async () => true,
			createConnection: async (_workspaceUri, _address, token) => {
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
			transportFactory: () => undefined as never,
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
			stagedEntry: remoteAgentHostService.stagedEntry,
			provider: service.provider,
			registeredProviders: sessionsProvidersService.getProviders(),
			transportDisposed,
		}, {
			stagedEntry: undefined,
			provider: undefined,
			registeredProviders: [],
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
			store.add(new InMemoryStorageService()),
		));

		const sourceWorkspace = URI.file('/source');
		const address = devContainerAddress(sourceWorkspace);
		const connection = new TestAgentConnection();
		let transportDisposed = false;
		store.add(service.registerConnector({
			isAvailable: async () => true,
			createConnection: async (_workspaceUri, stagedAddress) => ({
				address: stagedAddress,
				name: 'Source Dev Container',
				transportFactory: () => undefined as never,
				transportDisposable: toDisposable(() => transportDisposed = true),
				workspaceUri: URI.from({
					scheme: AGENT_HOST_SCHEME,
					authority: agentHostAuthority(address),
					path: '/workspaces/source',
				}),
			}),
		}));
		instantiationService.stubInstance(AgentHostProtocolClient, connection);

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
