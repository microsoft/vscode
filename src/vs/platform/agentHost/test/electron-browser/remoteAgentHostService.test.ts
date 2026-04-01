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
import { RemoteAgentHostService } from '../../electron-browser/remoteAgentHostServiceImpl.js';
import { parseRemoteAgentHostInput, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, type IRemoteAgentHostEntry } from '../../common/remoteAgentHostService.js';
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

	private _entries: IRemoteAgentHostEntry[] = [];
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
		this.setEntries((value as IRemoteAgentHostEntry[] | undefined) ?? []);
	}

	get entries(): readonly IRemoteAgentHostEntry[] {
		return this._entries;
	}

	setEntries(entries: IRemoteAgentHostEntry[]): void {
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

suite('RemoteAgentHostService', () => {

	const disposables = new DisposableStore();
	let configService: TestConfigurationService;
	let createdClients: MockProtocolClient[];
	let service: RemoteAgentHostService;

	setup(() => {
		configService = new TestConfigurationService();
		disposables.add(toDisposable(() => configService.dispose()));

		createdClients = [];

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, configService as Partial<IConfigurationService>);

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
		while (!service.connections.some(c => c.status === RemoteAgentHostConnectionStatus.Connected)) {
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
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);

		// Resolve the connect promise
		assert.strictEqual(createdClients.length, 1);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connected = service.connections.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected);
		assert.strictEqual(connected.length, 1);
		assert.strictEqual(connected[0].address, 'host1:8080');
		assert.strictEqual(connected[0].name, 'Host 1');
	});

	test('getConnection returns client after successful connect', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connection = service.getConnection('ws://host1:8080');
		assert.ok(connection);
		assert.strictEqual(connection.clientId, createdClients[0].clientId);
	});

	test('removes connection when setting entry is removed', async () => {
		// Add a connection
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
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
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
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
		assert.strictEqual(entry.status, RemoteAgentHostConnectionStatus.Disconnected);
	});

	test('removes connection on connect failure', async () => {
		configService.setEntries([{ address: 'ws://bad:9999', name: 'Bad' }]);
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
			{ address: 'ws://host1:8080', name: 'Host 1' },
			{ address: 'ws://host2:8080', name: 'Host 2' },
		]);

		assert.strictEqual(createdClients.length, 2);
		createdClients[0].connectDeferred.complete();
		createdClients[1].connectDeferred.complete();
		await waitForConnected();

		assert.strictEqual(service.connections.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected).length, 2);

		const conn1 = service.getConnection('ws://host1:8080');
		const conn2 = service.getConnection('ws://host2:8080');
		assert.ok(conn1);
		assert.ok(conn2);
		assert.notStrictEqual(conn1.clientId, conn2.clientId);
	});

	test('does not re-create existing connections on setting update', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const firstClientId = createdClients[0].clientId;

		// Update setting with same address (but different name)
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Renamed' }]);

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
			address: 'ws://host1:8080',
			name: 'Host 1',
			connectionToken: 'secret-token',
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
			status: RemoteAgentHostConnectionStatus.Connected,
		});
	});

	test('addRemoteAgentHost updates existing configured entries without reconnecting', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		const connection = await service.addRemoteAgentHost({
			address: 'ws://host1:8080',
			name: 'Updated Host',
			connectionToken: 'new-token',
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
			status: RemoteAgentHostConnectionStatus.Connected,
		});
	});

	test('addRemoteAgentHost appends when adding a second host', async () => {
		// Add first host
		const firstPromise = service.addRemoteAgentHost({
			address: 'host1:8080',
			name: 'Host 1',
		});
		createdClients[0].connectDeferred.complete();
		await firstPromise;

		// Add second host
		const secondPromise = service.addRemoteAgentHost({
			address: 'host2:9090',
			name: 'Host 2',
		});
		createdClients[1].connectDeferred.complete();
		await secondPromise;

		assert.strictEqual(createdClients.length, 2);
		assert.deepStrictEqual(configService.entries, [
			{ address: 'host1:8080', name: 'Host 1' },
			{ address: 'host2:9090', name: 'Host 2' },
		]);
		assert.strictEqual(service.connections.length, 2);
	});

	test('addRemoteAgentHost resolves when connection completes before wait is created', async () => {
		// Simulate a fast connect: the mock client resolves synchronously
		// during the config change handler, before addRemoteAgentHost has a
		// chance to create its DeferredPromise wait.
		const originalSetEntries = configService.setEntries.bind(configService);
		configService.setEntries = (entries: IRemoteAgentHostEntry[]) => {
			originalSetEntries(entries);
			// Complete the connection synchronously inside the config change callback
			if (createdClients.length > 0) {
				createdClients[createdClients.length - 1].connectDeferred.complete();
			}
		};

		const connection = await service.addRemoteAgentHost({
			address: 'fast-host:1234',
			name: 'Fast Host',
		});

		assert.strictEqual(connection.address, 'fast-host:1234');
		assert.strictEqual(connection.name, 'Fast Host');
	});

	test('disabling the enabled setting disconnects all remotes', async () => {
		configService.setEntries([{ address: 'host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected).length, 1);

		configService.setEnabled(false);

		assert.strictEqual(service.connections.length, 0);
	});

	test('addRemoteAgentHost throws when disabled', async () => {
		configService.setEnabled(false);

		await assert.rejects(
			() => service.addRemoteAgentHost({ address: 'host1:8080', name: 'Host 1' }),
			/not enabled/,
		);
	});

	test('re-enabling reconnects configured remotes', async () => {
		configService.setEntries([{ address: 'host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected).length, 1);

		configService.setEnabled(false);
		assert.strictEqual(service.connections.length, 0);

		configService.setEnabled(true);
		assert.strictEqual(createdClients.length, 2); // new client created
		createdClients[1].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected).length, 1);
	});

	test('removeRemoteAgentHost removes entry and disconnects', async () => {
		configService.setEntries([
			{ address: 'ws://host1:8080', name: 'Host 1' },
			{ address: 'ws://host2:9090', name: 'Host 2' },
		]);
		createdClients[0].connectDeferred.complete();
		createdClients[1].connectDeferred.complete();
		await waitForConnected();
		assert.strictEqual(service.connections.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected).length, 2);

		await service.removeRemoteAgentHost('ws://host1:8080');

		assert.deepStrictEqual(configService.entries, [
			{ address: 'ws://host2:9090', name: 'Host 2' },
		]);
		assert.strictEqual(service.connections.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected).length, 1);
		assert.strictEqual(service.getConnection('ws://host1:8080'), undefined);
		assert.ok(service.getConnection('ws://host2:9090'));
	});

	test('removeRemoteAgentHost normalizes address before removing', async () => {
		configService.setEntries([{ address: 'host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await waitForConnected();

		await service.removeRemoteAgentHost('ws://host1:8080');

		assert.deepStrictEqual(configService.entries, []);
		assert.strictEqual(service.connections.length, 0);
	});
});
