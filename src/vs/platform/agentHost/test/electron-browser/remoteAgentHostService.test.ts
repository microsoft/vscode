/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService, type IConfigurationChangeEvent } from '../../../configuration/common/configuration.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILabelService, type ResourceLabelFormatter } from '../../../label/common/label.js';
import { RemoteAgentHostService } from '../../browser/remoteAgentHostServiceImpl.js';
import { parseRemoteAgentHostInput, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, entryToRawEntry, type IRawRemoteAgentHostEntry, type IRemoteAgentHostEntry } from '../../common/remoteAgentHostService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../common/agentHostUri.js';
import { DeferredPromise } from '../../../../base/common/async.js';

// ---- Mock protocol client ---------------------------------------------------

class MockProtocolClient extends Disposable {
	private static _nextId = 1;
	readonly clientId = `mock-client-${MockProtocolClient._nextId++}`;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;
	readonly onDidAction = Event.None;
	readonly onDidNotification = Event.None;

	public connectDeferred = new DeferredPromise<void>();

	constructor(public readonly mockAddress: string) {
		super();
	}

	async connect(): Promise<void> {
		return this.connectDeferred.p;
	}

	fireClose(): void {
		this._onDidClose.fire();
	}
}

// ---- Test configuration service ---------------------------------------------

class TestConfigurationService {
	private readonly _onDidChangeConfiguration = new Emitter<Partial<IConfigurationChangeEvent>>();
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private _entries: IRawRemoteAgentHostEntry[] = [];
	private _enabled = true;

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
		this._entries = (value as IRawRemoteAgentHostEntry[] | undefined) ?? [];
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (key: string) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId,
		});
	}

	get entries(): readonly IRawRemoteAgentHostEntry[] {
		return this._entries;
	}

	setEntries(entries: IRemoteAgentHostEntry[]): void {
		this._entries = entries.map(entryToRawEntry).filter((e): e is IRawRemoteAgentHostEntry => e !== undefined);
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

suite('RemoteAgentHostService', () => {

	const disposables = new DisposableStore();
	let configService: TestConfigurationService;
	let createdClients: MockProtocolClient[];
	let registeredFormatters: ResourceLabelFormatter[];
	let service: RemoteAgentHostService;

	setup(() => {
		configService = new TestConfigurationService();
		disposables.add(toDisposable(() => configService.dispose()));

		createdClients = [];

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, configService as Partial<IConfigurationService>);
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

		// Mock the instantiation service to capture created protocol clients
		const mockInstantiationService: Partial<IInstantiationService> = {
			createInstance: (_ctor: unknown, ...args: unknown[]) => {
				const client = new MockProtocolClient(args[0] as string);
				disposables.add(client);
				createdClients.push(client);
				return client;
			},
		};
		instantiationService.stub(IInstantiationService, mockInstantiationService as Partial<IInstantiationService>);

		service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	/** Wait for a connection to reach Connected status. */
	async function waitForConnected(): Promise<void> {
		while (!service.connections.some(c => RemoteAgentHostConnectionStatus.isConnected(c.status))) {
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
		], [
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:8089', connectionToken: undefined, suggestedName: '127.0.0.1:8089' } },
			{ parsed: { address: '127.0.0.1:40147', connectionToken: 'c9d12867-da33-425e-8d39-0d071e851597', suggestedName: '127.0.0.1:40147' } },
			{ parsed: { address: 'wss://secure.example.com', connectionToken: undefined, suggestedName: 'secure.example.com' } },
		]);
	});

	test('getConnection returns undefined for unknown address', () => {
		assert.strictEqual(service.getConnection('ws://unknown:1234'), undefined);
	});

	test('creates connection when setting is updated', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);

		// Resolve the connect promise
		assert.strictEqual(createdClients.length, 1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connected = service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status));
		assert.strictEqual(connected.length, 1);
		assert.strictEqual(connected[0].address, 'host1:8080');
		assert.strictEqual(connected[0].name, 'Host 1');
	});

	test('getConnection returns client after successful connect', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connection = service.getConnection('ws://host1:8080');
		assert.ok(connection);
		assert.strictEqual(connection.clientId, createdClients[0].clientId);
	});

	test('removes connection when setting entry is removed', async () => {
		// Add a connection
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
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

	test('does not re-create existing connections on setting update', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
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

	test('addRemoteAgentHost stores the entry and waits for connection', async () => {
		const connectionPromise = service.addRemoteAgentHost({
			name: 'Host 1',
			connectionToken: 'secret-token',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' },
		});

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

	test('addRemoteAgentHost updates existing configured entries without reconnecting', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connection = await service.addRemoteAgentHost({
			name: 'Updated Host',
			connectionToken: 'new-token',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' },
		});

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

	test('addRemoteAgentHost appends when adding a second host', async () => {
		// Add first host
		const firstPromise = service.addRemoteAgentHost({
			name: 'Host 1',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' },
		});
		createdClients[0].connectDeferred.complete();
		await firstPromise;

		// Add second host
		const secondPromise = service.addRemoteAgentHost({
			name: 'Host 2',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host2:9090' },
		});
		createdClients[1].connectDeferred.complete();
		await secondPromise;

		assert.strictEqual(createdClients.length, 2);
		assert.deepStrictEqual(configService.entries, [
			{ address: 'host1:8080', name: 'Host 1', connectionToken: undefined },
			{ address: 'host2:9090', name: 'Host 2', connectionToken: undefined },
		]);
		assert.strictEqual(service.connections.length, 2);
	});

	test('addRemoteAgentHost resolves when connection completes before wait is created', async () => {
		// Simulate a fast connect: the mock client resolves synchronously
		// during the config change handler, before addRemoteAgentHost has a
		// chance to create its DeferredPromise wait.
		const originalUpdateValue = configService.updateValue.bind(configService);
		configService.updateValue = async (key: string, value: unknown) => {
			await originalUpdateValue(key, value);
			// Complete the connection synchronously inside the config change callback
			if (createdClients.length > 0) {
				createdClients[createdClients.length - 1].connectDeferred.complete();
			}
		};

		const connection = await service.addRemoteAgentHost({
			name: 'Fast Host',
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'fast-host:1234' },
		});

		assert.strictEqual(connection.address, 'fast-host:1234');
		assert.strictEqual(connection.name, 'Fast Host');
	});

	test('disabling the enabled setting disconnects all remotes', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);

		configService.setEnabled(false);

		assert.strictEqual(service.connections.length, 0);
	});

	test('addRemoteAgentHost throws when disabled', async () => {
		configService.setEnabled(false);

		await assert.rejects(
			() => service.addRemoteAgentHost({ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }),
			/not enabled/,
		);
	});

	test('re-enabling reconnects configured remotes', async () => {
		configService.setEntries([{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'host1:8080' } }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);

		configService.setEnabled(false);
		assert.strictEqual(service.connections.length, 0);

		configService.setEnabled(true);
		assert.strictEqual(createdClients.length, 2); // new client created
		createdClients[1].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
	});

	test('removeRemoteAgentHost removes entry and disconnects', async () => {
		configService.setEntries([
			{ name: 'Host 1', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host1:8080' } },
			{ name: 'Host 2', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host2:9090' } },
		]);
		createdClients[0].connectDeferred.complete();
		createdClients[1].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 2);

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
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

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

		test('disposes transportDisposable when entry is removed via removeRemoteAgentHost', async () => {
			const t = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t.disposable);
			assert.strictEqual(t.disposed(), false);

			await service.removeRemoteAgentHost('ws://managed:1234');

			assert.strictEqual(t.disposed(), true, 'transport disposable runs when entry is removed');
			assert.strictEqual(service.getConnection('ws://managed:1234'), undefined);
		});

		test('disposes previous transportDisposable when entry is replaced', async () => {
			const t1 = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t1.disposable);

			const t2 = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t2.disposable);

			assert.strictEqual(t1.disposed(), true, 'first transport disposable runs when entry is replaced');
			assert.strictEqual(t2.disposed(), false, 'second transport disposable is still alive');
		});

		test('disposes transportDisposable when service itself is disposed', async () => {
			const t = makeTransportDisposable();
			await addManaged('Managed', 'managed:1234', t.disposable);

			service.dispose();

			assert.strictEqual(t.disposed(), true, 'transport disposable runs when service is disposed');
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
