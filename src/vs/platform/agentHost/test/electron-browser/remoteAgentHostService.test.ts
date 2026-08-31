/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { URI } from '../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService, type IConfigurationChangeEvent } from '../../../configuration/common/configuration.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILabelService, type ResourceLabelFormatter } from '../../../label/common/label.js';
import { AgentsWindowRemoteAgentHostService, RemoteAgentHostService } from '../../browser/remoteAgentHostServiceImpl.js';
import type { IAgentHostProtocolClientOptions } from '../../browser/agentHostProtocolClient.js';
import { addSSHRemoteAgentHostEntry, addWebSocketRemoteAgentHostEntry, getEntryTypeConfig, parseRemoteAgentHostInput, removeWebSocketRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, type IRawRemoteAgentHostEntry, type IRemoteAgentHostEntry } from '../../common/remoteAgentHostService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../common/agentHostUri.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../storage/common/storage.js';
import type { StorageValue } from '../../../../base/parts/storage/common/storage.js';
import type { Implementation } from '../../common/state/protocol/common/commands.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from '../../common/agentHostClientInfo.js';

// ---- Mock transport ---------------------------------------------------------

class MockTransport extends Disposable {
	readonly onMessage = Event.None;
	readonly onClose = Event.None;
	readonly onOpen = Event.None;
	readonly isOpen = false;
	connect(): Promise<void> { return Promise.resolve(); }
	send(): boolean { return true; }
}

// ---- Mock protocol client ---------------------------------------------------

class MockProtocolClient extends Disposable {
	private static _nextId = 1;
	readonly clientId = `mock-client-${MockProtocolClient._nextId++}`;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;
	readonly onDidAction = Event.None;
	readonly onDidNotification = Event.None;
	private readonly _onDidChangeConnectionState = this._register(new Emitter<string>());
	readonly onDidChangeConnectionState = this._onDidChangeConnectionState.event;
	readonly onDidReceiveOtlpLogs = Event.None;
	readonly connectionState = 'connecting' as const;
	readonly initializeResult = undefined;
	readonly telemetryCapabilities = undefined;
	readonly triggerVscodeUpgradeCalls: string[] = [];

	public connectDeferred = new DeferredPromise<void>();

	constructor(public readonly mockAddress: string) {
		super();
	}

	async connect(): Promise<void> {
		return this.connectDeferred.p;
	}

	async triggerVscodeUpgrade(method: string) {
		this.triggerVscodeUpgradeCalls.push(method);
		return { ok: true, upgradeStarted: true };
	}

	fireClose(): void {
		this._onDidClose.fire();
	}

	fireConnectionState(state: 'connecting' | 'reconnecting' | 'connected' | 'incompatible' | 'closed'): void {
		this._onDidChangeConnectionState.fire(state);
	}
}

// ---- Test configuration service ---------------------------------------------

class TestConfigurationService {
	private readonly _onDidChangeConfiguration = new Emitter<Partial<IConfigurationChangeEvent>>();
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private _entries: IRawRemoteAgentHostEntry[] = [];
	private _enabled = true;
	updateValueCalls = 0;

	getValue(key?: string): unknown {
		if (key === RemoteAgentHostsEnabledSettingId) {
			return this._enabled;
		}
		return this._entries;
	}

	inspect(_key: string) {
		return {
			userValue: this._entries,
		};
	}

	async updateValue(_key: string, value: unknown): Promise<void> {
		this.updateValueCalls++;
		const entries = (value as IRawRemoteAgentHostEntry[] | undefined) ?? [];
		const changed = JSON.stringify(this._entries) !== JSON.stringify(entries);
		this._entries = entries;
		if (!changed) {
			return;
		}
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (key: string) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId,
		});
	}

	get entries(): readonly IRawRemoteAgentHostEntry[] {
		return this._entries;
	}

	setEntries(entries: IRemoteAgentHostEntry[]): void {
		this._entries = entries.flatMap(entry => {
			const config = getEntryTypeConfig(entry.connection.type);
			return config.store === 'settings' ? [config.toRaw!(entry, entry.connection)] : [];
		});
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (key: string) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId,
		});
	}

	setRawEntries(entries: IRawRemoteAgentHostEntry[]): void {
		this._entries = entries;
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (key: string) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId,
		});
	}

	setEnabled(enabled: boolean): void {
		this._enabled = enabled;
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (key: string) => key === RemoteAgentHostsEnabledSettingId,
		});
	}

	dispose(): void {
		this._onDidChangeConfiguration.dispose();
	}
}

class TestStorageService extends InMemoryStorageService {
	writeCalls = 0;

	override store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget, external = false): void {
		this.writeCalls++;
		super.store(key, value, scope, target, external);
	}

	override remove(key: string, scope: StorageScope, external = false): void {
		this.writeCalls++;
		super.remove(key, scope, external);
	}
}

suite('RemoteAgentHostService', () => {

	const disposables = new DisposableStore();
	let configService: TestConfigurationService;
	let createdClients: MockProtocolClient[];
	let createdClientInfos: (Implementation | undefined)[];
	let registeredFormatters: ResourceLabelFormatter[];
	let instantiationService: TestInstantiationService;
	let service: RemoteAgentHostService;
	let storageService: TestStorageService;

	setup(() => {
		configService = new TestConfigurationService();
		disposables.add(toDisposable(() => configService.dispose()));

		createdClients = [];
		createdClientInfos = [];

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IEnvironmentService, { logsHome: URI.file('/logs') } as Partial<IEnvironmentService>);
		instantiationService.stub(IConfigurationService, configService as Partial<IConfigurationService>);
		storageService = disposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);
		registeredFormatters = [];
		instantiationService.stub(ILabelService, {
			registerFormatter(formatter: ResourceLabelFormatter) {
				registeredFormatters.push(formatter);
				return toDisposable(() => {
					const idx = registeredFormatters.indexOf(formatter);
					if (idx >= 0) {
						registeredFormatters.splice(idx, 1);
					}
				});
			},
		} as Partial<ILabelService>);

		// Mock the instantiation service to capture created protocol clients.
		// `WebSocketConnectionFactory` calls `createInstance` for
		// `WebSocketClientTransport` and `AgentHostProtocolClient`. We only care about tracking
		// the protocol client; for the transport we return a no-op
		// disposable so the test can keep asserting on `createdClients.length`.
		const mockInstantiationService: Partial<IInstantiationService> = {
			createInstance: (ctor: unknown, ...args: unknown[]) => {
				const ctorName = (ctor as { name?: string }).name;
				if (ctorName === 'WebSocketClientTransport') {
					return disposables.add(new MockTransport());
				}
				const client = new MockProtocolClient(args[0] as string);
				createdClientInfos.push((args[2] as IAgentHostProtocolClientOptions | undefined)?.clientInfo);
				disposables.add(client);
				createdClients.push(client);
				return client;
			},
		};
		instantiationService.stub(IInstantiationService, mockInstantiationService as Partial<IInstantiationService>);

		service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
	});

	test('round-trips persisted entry types through their configuration', () => {
		const entries: IRemoteAgentHostEntry[] = [
			{ name: 'WebSocket', connectionToken: 'ws-token', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host:8080' } },
			{ name: 'SSH', connectionToken: 'ssh-token', connection: { type: RemoteAgentHostEntryType.SSH, address: 'localhost:1234', sshConfigHost: 'host', hostName: 'host.example', user: 'me', port: 2222 } },
		];

		assert.deepStrictEqual(entries.map(entry => {
			const config = getEntryTypeConfig(entry.connection.type);
			return config.fromRaw!(config.toRaw!(entry, entry.connection));
		}), entries);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	/** Wait for a connection to reach Connected status. */
	async function waitForConnected(): Promise<void> {
		while (!service.connections.some(c => RemoteAgentHostConnectionStatus.isConnected(c.status))) {
			await Event.toPromise(service.onDidChangeConnections);
		}
	}

	/** Wait for factories to build the requested number of protocol clients. */
	async function waitForCreatedClients(count: number): Promise<void> {
		while (createdClients.length < count) {
			await Event.toPromise(service.onDidChangeConnections);
		}
	}

	test('starts with no connections when setting is empty', () => {
		assert.deepStrictEqual(service.connections, []);
	});

	test('parses supported remote host inputs', () => {
		assert.deepStrictEqual([
			parseRemoteAgentHostInput('Listening on ws://127.0.0.1:8089'),
			parseRemoteAgentHostInput('Agent host proxy listening on ws://127.0.0.1:8089'),
			parseRemoteAgentHostInput('127.0.0.1:8089'),
			parseRemoteAgentHostInput('ws://127.0.0.1:8089'),
			parseRemoteAgentHostInput('ws://127.0.0.1:40147?tkn=c9d12867-da33-425e-8d39-0d071e851597'),
			parseRemoteAgentHostInput('wss://secure.example.com:443'),
			parseRemoteAgentHostInput('local'),
			parseRemoteAgentHostInput('ws://local'),
		], [
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:40147', connectionToken: 'c9d12867-da33-425e-8d39-0d071e851597', suggestedName: '127.0.0.1:40147' } },
			{ parsed: { address: 'wss://secure.example.com', connectionToken: undefined, suggestedName: 'secure.example.com' } },
			{ parsed: { address: 'local', connectionToken: undefined, suggestedName: 'local' } },
			{ parsed: { address: 'local', connectionToken: undefined, suggestedName: 'local' } },
		]);
	});

	test('getConnection returns undefined for unknown address', () => {
		assert.strictEqual(service.getConnection('ws://unknown:1234'), undefined);
	});

	test('creates connection when setting is updated', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);

		// Resolve the connect promise
		await waitForCreatedClients(1);
		assert.strictEqual(createdClients.length, 1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connected = service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status));
		assert.deepStrictEqual({
			connection: connected.map(({ address, name }) => ({ address, name })),
			clientInfo: createdClientInfos,
		}, {
			connection: [{ address: 'host1:8080', name: 'Host 1' }],
			clientInfo: [editorWindowAgentHostClientInfo],
		});
	});

	test('agents window service identifies its protocol client', async () => {
		service.dispose();
		service = disposables.add(instantiationService.createInstance(AgentsWindowRemoteAgentHostService));
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		assert.deepStrictEqual(createdClientInfos, [agentsWindowAgentHostClientInfo]);
	});

	test('getConnection returns client after successful connect', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connection = service.getConnection('ws://host1:8080');
		assert.ok(connection);
		assert.strictEqual(connection.clientId, createdClients[0].clientId);
	});

	test('removes connection when setting entry is removed', async () => {
		// Add a connection
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		// Remove it
		const removedEvent = Event.toPromise(service.onDidChangeConnections);
		configService.setEntries([]);
		await removedEvent;

		assert.strictEqual(service.connections.length, 0);
		assert.strictEqual(service.getConnection('ws://host1:8080'), undefined);
	});

	test('fires onDidChangeConnections when connection closes', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		// Simulate connection close — entry transitions to Disconnected
		const closedEvent = Event.toPromise(service.onDidChangeConnections);
		createdClients[0].fireClose();
		await closedEvent;

		// Connection is still tracked (for reconnect) but getConnection returns undefined
		assert.strictEqual(service.getConnection('ws://host1:8080'), undefined);
		const entry = service.connections.find(c => c.address === 'host1:8080');
		assert.ok(entry);
		assert.strictEqual(entry.status, RemoteAgentHostConnectionStatus.disconnected);
	});

	test('removes connection on connect failure', async () => {
		configService.setEntries([{ name: 'Bad', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://bad:9999' } }]);
		await waitForCreatedClients(1);
		assert.strictEqual(createdClients.length, 1);

		// Fail the connection and wait for the service to react
		const connectionChanged = Event.toPromise(service.onDidChangeConnections);
		createdClients[0].connectDeferred.error(new Error('Connection refused'));
		await connectionChanged;

		assert.strictEqual(service.connections.length, 0);
		assert.strictEqual(service.getConnection('ws://bad:9999'), undefined);
	});

	test('manages multiple connections independently', async () => {
		configService.setEntries([
			{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } },
			{ name: 'Host 2', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host2:8080' } },
		]);

		await waitForCreatedClients(2);
		assert.strictEqual(createdClients.length, 2);
		createdClients[0].connectDeferred.complete();
		createdClients[1].connectDeferred.complete();
		await waitForConnected();

		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 2);

		const conn1 = service.getConnection('ws://host1:8080');
		const conn2 = service.getConnection('ws://host2:8080');
		assert.ok(conn1);
		assert.ok(conn2);
		assert.notStrictEqual(conn1.clientId, conn2.clientId);
	});

	test('does not re-create an in-flight connection on setting update', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		configService.setEntries([{ name: 'Renamed', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);

		await waitForCreatedClients(1);
		assert.strictEqual(createdClients.length, 1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		assert.strictEqual(service.connections.find(connection => connection.address === 'host1:8080')?.name, 'Renamed');
	});

	test('does not re-create existing connections on setting update', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const firstClientId = createdClients[0].clientId;

		// Update setting with same address (but different name)
		configService.setEntries([{ name: 'Renamed', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);

		// Should NOT have created a second client
		assert.strictEqual(createdClients.length, 1);

		// Connection should still work with same client
		const conn = service.getConnection('ws://host1:8080');
		assert.ok(conn);
		assert.strictEqual(conn.clientId, firstClientId);

		// But name should be updated
		const entry = service.connections.find(c => c.address === 'host1:8080');
		assert.strictEqual(entry?.name, 'Renamed');
	});

	test('waitForConnection resolves after a configured entry connects', async () => {
		await addWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, {
			name: 'Host 1',
			connectionToken: 'secret-token',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' },
		});
		const connectionPromise = service.waitForConnection('ws://host1:8080');

		await waitForCreatedClients(1);
		assert.deepStrictEqual(configService.entries, [{
			address: 'host1:8080',
			name: 'Host 1',
			connectionToken: 'secret-token',
		}]);
		assert.strictEqual(createdClients.length, 1);

		createdClients[0].connectDeferred.complete();
		const connection = await connectionPromise;

		assert.deepStrictEqual(connection, {
			address: 'host1:8080',
			name: 'Host 1',
			clientId: createdClients[0].clientId,
			defaultDirectory: undefined,
			status: RemoteAgentHostConnectionStatus.connected,
		});
	});

	test('updating a configured entry does not reconnect it', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		await addWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, {
			name: 'Updated Host',
			connectionToken: 'new-token',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' },
		});
		const connection = await service.waitForConnection('ws://host1:8080');

		assert.strictEqual(createdClients.length, 1);
		assert.deepStrictEqual(configService.entries, [{
			address: 'host1:8080',
			name: 'Updated Host',
			connectionToken: 'new-token',
		}]);
		assert.deepStrictEqual(connection, {
			address: 'host1:8080',
			name: 'Updated Host',
			clientId: createdClients[0].clientId,
			defaultDirectory: undefined,
			status: RemoteAgentHostConnectionStatus.connected,
		});
	});

	test('configured WebSocket entries append a second host', async () => {
		// Add first host
		await addWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, {
			name: 'Host 1',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' },
		});
		const firstPromise = service.waitForConnection('host1:8080');
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await firstPromise;

		// Add second host
		await addWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, {
			name: 'Host 2',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host2:9090' },
		});
		const secondPromise = service.waitForConnection('host2:9090');
		await waitForCreatedClients(2);
		createdClients[1].connectDeferred.complete();
		await secondPromise;

		assert.strictEqual(createdClients.length, 2);
		assert.deepStrictEqual(configService.entries, [
			{ address: 'host1:8080', name: 'Host 1', connectionToken: undefined },
			{ address: 'host2:9090', name: 'Host 2', connectionToken: undefined },
		]);
		assert.strictEqual(service.connections.length, 2);
	});

	test('waitForConnection resolves when connection completes before it is called', async () => {
		// Simulate a fast connect: the mock client resolves during the
		// configuration update, before waitForConnection is called.
		const originalUpdateValue = configService.updateValue.bind(configService);
		configService.updateValue = async (key: string, value: unknown) => {
			await originalUpdateValue(key, value);
			await waitForCreatedClients(1);
			createdClients[createdClients.length - 1].connectDeferred.complete();
		};

		await addWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, {
			name: 'Fast Host',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'fast-host:1234' },
		});
		const connection = await service.waitForConnection('fast-host:1234');

		assert.strictEqual(connection.address, 'fast-host:1234');
		assert.strictEqual(connection.name, 'Fast Host');
	});

	test('disabling the enabled setting disconnects all remotes', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);

		configService.setEnabled(false);

		assert.strictEqual(service.connections.length, 0);
	});

	test('waitForConnection throws when disabled', async () => {
		configService.setEnabled(false);

		await assert.rejects(
			() => service.waitForConnection('host1:8080'),
			/not enabled/,
		);
	});

	test('a handshake interrupted by a transport drop leaves the client to restore itself', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);
		await waitForCreatedClients(1);

		// The protocol client schedules its own retry and only then rejects the
		// original connect(), so the service must not tear the entry down.
		createdClients[0].fireConnectionState('reconnecting');
		createdClients[0].connectDeferred.error(new Error('transport closed'));
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			status: service.connections.find(connection => connection.address === 'host1:8080')?.status,
			clientsCreated: createdClients.length,
		}, {
			status: RemoteAgentHostConnectionStatus.reconnecting,
			clientsCreated: 1,
		});
	});

	test('a soft reconnect settles a wait started before the drop', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].fireConnectionState('reconnecting');
		createdClients[0].connectDeferred.error(new Error('transport closed'));

		const waiting = service.waitForConnection('host1:8080');
		createdClients[0].fireConnectionState('connected');

		assert.strictEqual((await waiting).address, 'host1:8080');
	});

	test('re-enabling reconnects configured remotes', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);

		configService.setEnabled(false);
		assert.strictEqual(service.connections.length, 0);

		configService.setEnabled(true);
		await waitForCreatedClients(2);
		assert.strictEqual(createdClients.length, 2); // new client created
		createdClients[1].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
	});

	test('removing a configured entry and connection keeps it removed', async () => {
		configService.setEntries([
			{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } },
			{ name: 'Host 2', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host2:9090' } },
		]);
		await waitForCreatedClients(2);
		createdClients[0].connectDeferred.complete();
		createdClients[1].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 2);

		await removeWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, 'ws://host1:8080');
		await service.removeRemoteAgentHost('ws://host1:8080');

		assert.deepStrictEqual(configService.entries, [
			{ address: 'ws://host2:9090', name: 'Host 2', connectionToken: undefined },
		]);
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
		assert.strictEqual(service.getConnection('ws://host1:8080'), undefined);
		assert.ok(service.getConnection('ws://host2:9090'));
	});

	test('removeRemoteAgentHost normalizes address before removing', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);
		await waitForCreatedClients(1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		await removeWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, 'ws://host1:8080');
		await service.removeRemoteAgentHost('ws://host1:8080');

		assert.deepStrictEqual(configService.entries, []);
		assert.strictEqual(service.connections.length, 0);
	});

	suite('addManagedConnection', () => {

		// Build a transport disposable that records when it ran.
		function makeTransportDisposable(): { disposable: { dispose(): void }; disposed: () => boolean } {
			let disposed = false;
			return {
				disposable: { dispose: () => { disposed = true; } },
				disposed: () => disposed,
			};
		}

		// Inject a managed connection (mimicking the SSH/tunnel renderer flow).
		async function addManaged(name: string, address: string, transport?: { dispose(): void }) {
			const mockClient = disposables.add(new MockProtocolClient(`ws://${address}`));
			return service.addManagedConnection(
				{ name, connection: { type: RemoteAgentHostEntryType.WebSocket, address } },
				mockClient as unknown as Parameters<typeof service.addManagedConnection>[1],
				transport,
			);
		}

		test('keeps incompatible managed connection addressable for server upgrade', async () => {
			const mockClient = disposables.add(new MockProtocolClient('ssh:remote.example'));
			await service.addManagedConnection(
				{
					name: 'SSH Host',
					connection: {
						type: RemoteAgentHostEntryType.SSH,
						address: 'ssh:remote.example',
						sshConfigHost: 'remote',
						hostName: 'remote.example',
					},
				},
				mockClient as unknown as Parameters<typeof service.addManagedConnection>[1],
				undefined,
				RemoteAgentHostConnectionStatus.incompatible('Unsupported protocol version', ['0.3.0'], ['^0.2.0'], '_vscodeUpgrade'),
			);

			const upgradeResult = await service.triggerServerUpgrade('ssh:remote.example', '_vscodeUpgrade');

			assert.deepStrictEqual({
				status: service.connections[0].status,
				connectedConnection: service.getConnection('ssh:remote.example'),
				upgradeCalls: mockClient.triggerVscodeUpgradeCalls,
				upgradeResult,
			}, {
				status: RemoteAgentHostConnectionStatus.incompatible('Unsupported protocol version', ['0.3.0'], ['^0.2.0'], '_vscodeUpgrade'),
				connectedConnection: undefined,
				upgradeCalls: ['_vscodeUpgrade'],
				upgradeResult: { ok: true, upgradeStarted: true },
			});
		});

		test('disposes transportDisposable when entry is removed via removeRemoteAgentHost', async () => {
			const t = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t.disposable);
			assert.strictEqual(t.disposed(), false);

			await service.removeRemoteAgentHost('ws://managed:1234');

			assert.strictEqual(t.disposed(), true, 'transport disposable runs when entry is removed');
			assert.strictEqual(service.getConnection('ws://managed:1234'), undefined);
		});

		test('throws when disabled', async () => {
			configService.setEnabled(false);

			await assert.rejects(
				() => addManaged('Managed', 'managed:1234'),
				/not enabled/,
			);
		});

		test('does NOT dispose previous transportDisposable when entry is replaced', async () => {
			// When the entry is replaced (e.g. on reconnect to the same address),
			// the new entry takes ownership of the same underlying connectionId.
			// Running the old transportDisposable would call disconnect() on the
			// shared-process tunnel keyed by that connectionId and immediately
			// tear down the brand-new connection. The new transportDisposable
			// inherits responsibility for the underlying tunnel.
			const t1 = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t1.disposable);

			const t2 = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t2.disposable);

			assert.strictEqual(t1.disposed(), false, 'previous transport disposable is not run on replacement');
			assert.strictEqual(t2.disposed(), false, 'new transport disposable is still alive');

			await service.removeRemoteAgentHost('ws://managed:1234');

			assert.strictEqual(t2.disposed(), true, 'new transport disposable runs on full removal');
		});

		test('disposes transportDisposable when service itself is disposed', async () => {
			const t = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t.disposable);

			service.dispose();

			assert.strictEqual(t.disposed(), true, 'transport disposable runs when service is disposed');
		});

		test('does not persist runtime managed connections or their removal', async () => {
			const entries: IRemoteAgentHostEntry[] = [
				{ name: 'Tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'runtime-tunnel', clusterId: 'cluster' } },
				{ name: 'WSL', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:runtime', distro: 'runtime' } },
				{ name: 'Cloud Sandbox', connection: { type: RemoteAgentHostEntryType.CloudSandbox, address: 'cloud:runtime', environmentId: 'env_runtime' } },
				{ name: 'Dev Container', connection: { type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:runtime', hostPath: '/workspace' } },
			];
			const addresses = ['tunnel:runtime-tunnel', 'wsl:runtime', 'cloud:runtime', 'devcontainer:runtime'];

			for (let index = 0; index < entries.length; index++) {
				const client = disposables.add(new MockProtocolClient(addresses[index]));
				await service.addManagedConnection(entries[index], client as unknown as Parameters<typeof service.addManagedConnection>[1]);
			}
			for (const address of addresses) {
				await service.removeRemoteAgentHost(address);
			}

			assert.deepStrictEqual({
				settingsWrites: configService.updateValueCalls,
				storageWrites: storageService.writeCalls,
				settings: configService.entries,
			}, {
				settingsWrites: 0,
				storageWrites: 0,
				settings: [],
			});
		});

		test('keeps a registered tunnel connected when WebSocket settings change', async () => {
			const tunnel = disposables.add(new MockProtocolClient('tunnel:live'));
			await service.addManagedConnection(
				{ name: 'Tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'live', clusterId: 'cluster' } },
				tunnel as unknown as Parameters<typeof service.addManagedConnection>[1],
			);

			configService.setEntries([{ name: 'WebSocket', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host:8080' } }]);

			assert.strictEqual(service.getConnection('tunnel:live'), tunnel);
		});

		test('does not surface storage-only SSH entries without an SSH factory', async () => {
			configService.setEntries([{
				name: 'WebSocket Host',
				connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' },
			}]);

			await removeWebSocketRemoteAgentHostEntry(configService as unknown as IConfigurationService, 'host1:8080');
			addSSHRemoteAgentHostEntry(storageService, {
				name: 'SSH Host',
				connection: {
					type: RemoteAgentHostEntryType.SSH,
					address: 'host1:8080',
					sshConfigHost: 'host1',
					hostName: 'host1.example',
				},
			});

			assert.deepStrictEqual({
				settings: configService.entries,
				configured: service.configuredEntries,
			}, {
				settings: [],
				configured: [],
			});
		});

		test('keeps runtime connection names across reconciliation', async () => {
			const tunnel: IRemoteAgentHostEntry = { name: 'My Tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'tunnel', clusterId: 'cluster' } };
			const client = disposables.add(new MockProtocolClient('tunnel:tunnel'));
			await service.addManagedConnection(tunnel, client as unknown as Parameters<typeof service.addManagedConnection>[1]);

			configService.setEntries([{ name: 'WebSocket', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);

			assert.deepStrictEqual(
				service.connections.find(connection => connection.address === 'tunnel:tunnel')?.name,
				'My Tunnel');
		});
	});

	suite('host label formatter', () => {

		function formatterFor(address: string): ResourceLabelFormatter | undefined {
			const authority = agentHostAuthority(address);
			return registeredFormatters.find(f => f.scheme === AGENT_HOST_SCHEME && f.authority === authority);
		}

		test('registers formatter when an entry is added', async () => {
			configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);

			const formatter = formatterFor('host1:8080');
			assert.ok(formatter, 'formatter is registered');
			assert.strictEqual(formatter.formatting.workspaceSuffix, 'Host 1');
		});

		test('refreshes formatter when an entry name changes', async () => {
			configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
			configService.setEntries([{ name: 'Renamed', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);

			const matching = registeredFormatters.filter(f => f.authority === agentHostAuthority('host1:8080'));
			assert.strictEqual(matching.length, 1, 'old formatter is replaced, not duplicated');
			assert.strictEqual(matching[0].formatting.workspaceSuffix, 'Renamed');
		});

		test('removes formatter when an entry is removed', async () => {
			configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
			assert.ok(formatterFor('host1:8080'));

			configService.setEntries([]);

			assert.strictEqual(formatterFor('host1:8080'), undefined);
		});

		test('removes formatters when the service is disabled', async () => {
			configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
			assert.ok(formatterFor('host1:8080'));

			configService.setEnabled(false);

			assert.strictEqual(formatterFor('host1:8080'), undefined);
		});
	});
});
