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
import { RemoteAgentHostsSettingId, type IRemoteAgentHostEntry } from '../../common/remoteAgentHostService.js';
import { DeferredPromise } from '../../../../base/common/async.js';

// ---- Mock protocol client ---------------------------------------------------

class MockProtocolClient extends Disposable {
	private static _nextId = 1;
	readonly clientId: string;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;
	readonly onDidAction = Event.None;
	readonly onDidNotification = Event.None;

	public connectDeferred = new DeferredPromise<void>();
	public reconnectDeferred: DeferredPromise<{ type: string }> | undefined;

	/** Tracks the last serverSeq seen during connect/reconnect. */
	private _serverSeq = 0;
	get serverSeq(): number { return this._serverSeq; }

	constructor(
		public readonly mockAddress: string,
		public readonly connectionToken: string | undefined,
		clientId: string | undefined,
	) {
		super();
		this.clientId = clientId ?? `mock-client-${MockProtocolClient._nextId++}`;
	}

	async connect(): Promise<void> {
		return this.connectDeferred.p;
	}

	async reconnect(lastSeenServerSeq: number): Promise<{ type: string }> {
		this._serverSeq = lastSeenServerSeq;
		if (!this.reconnectDeferred) {
			this.reconnectDeferred = new DeferredPromise();
		}
		return this.reconnectDeferred.p;
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

	getValue(_key?: string): IRemoteAgentHostEntry[] {
		return this._entries;
	}

	setEntries(entries: IRemoteAgentHostEntry[]): void {
		this._entries = entries;
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (key: string) => key === RemoteAgentHostsSettingId,
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
				const client = new MockProtocolClient(args[0] as string, args[1] as string | undefined, args[2] as string | undefined);
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

	test('starts with no connections when setting is empty', () => {
		assert.deepStrictEqual(service.connections, []);
	});

	test('getConnection returns undefined for unknown address', () => {
		assert.strictEqual(service.getConnection('ws://unknown:1234'), undefined);
	});

	test('creates connection when setting is updated', async () => {
		const connectionChanged = Event.toPromise(service.onDidChangeConnections);
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		await connectionChanged;

		// Entry exists but is not yet connected
		assert.strictEqual(service.connections.length, 1);
		assert.strictEqual(service.connections[0].address, 'ws://host1:8080');
		assert.strictEqual(service.connections[0].name, 'Host 1');
		assert.strictEqual(service.connections[0].connected, false);

		// Complete the connect
		const stateEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].connectDeferred.complete();
		await stateEvent;

		assert.strictEqual(service.connections[0].connected, true);
	});

	test('getConnection returns client after successful connect', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);

		const stateEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].connectDeferred.complete();
		await stateEvent;

		const connection = service.getConnection('ws://host1:8080');
		assert.ok(connection);
		assert.strictEqual(connection.clientId, createdClients[0].clientId);
	});

	test('removes connection when setting entry is removed', async () => {
		// Add a connection and connect
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		const stateEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].connectDeferred.complete();
		await stateEvent;

		// Remove it
		const removedEvent = Event.toPromise(service.onDidChangeConnections);
		configService.setEntries([]);
		await removedEvent;

		assert.strictEqual(service.connections.length, 0);
		assert.strictEqual(service.getConnection('ws://host1:8080'), undefined);
	});

	test('fires onDidChangeConnections when connection closes but retains entry', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		const stateEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].connectDeferred.complete();
		await stateEvent;

		// Simulate connection close
		const closedEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].fireClose();
		const stateChange = await closedEvent;

		assert.strictEqual(stateChange.address, 'ws://host1:8080');
		assert.strictEqual(stateChange.connected, false);

		// Entry is retained as disconnected
		assert.strictEqual(service.connections.length, 1);
		assert.strictEqual(service.connections[0].connected, false);
		// getConnection returns undefined for disconnected entries
		assert.strictEqual(service.getConnection('ws://host1:8080'), undefined);
	});

	test('retains entry in disconnected state on connect failure', async () => {
		configService.setEntries([{ address: 'ws://bad:9999', name: 'Bad' }]);
		assert.strictEqual(createdClients.length, 1);

		// Fail the connection
		const stateEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].connectDeferred.error(new Error('Connection refused'));
		const stateChange = await stateEvent;

		assert.strictEqual(stateChange.address, 'ws://bad:9999');
		assert.strictEqual(stateChange.connected, false);

		// Entry is retained as disconnected, not removed
		assert.strictEqual(service.connections.length, 1);
		assert.strictEqual(service.connections[0].connected, false);
		assert.strictEqual(service.getConnection('ws://bad:9999'), undefined);
	});

	test('manages multiple connections independently', async () => {
		configService.setEntries([
			{ address: 'ws://host1:8080', name: 'Host 1' },
			{ address: 'ws://host2:8080', name: 'Host 2' },
		]);

		assert.strictEqual(createdClients.length, 2);
		createdClients[0].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnectionState);
		createdClients[1].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnectionState);

		assert.strictEqual(service.connections.length, 2);

		const conn1 = service.getConnection('ws://host1:8080');
		const conn2 = service.getConnection('ws://host2:8080');
		assert.ok(conn1);
		assert.ok(conn2);
		assert.notStrictEqual(conn1.clientId, conn2.clientId);
	});

	test('does not re-create existing connections on setting update', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnectionState);

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
		assert.strictEqual(service.connections[0].name, 'Renamed');
	});

	test('ensureConnected reconnects a disconnected entry', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnectionState);

		const firstClientId = createdClients[0].clientId;

		// Disconnect
		const disconnectEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].fireClose();
		await disconnectEvent;
		assert.strictEqual(service.connections[0].connected, false);

		// Reconnect via ensureConnected - the mock's reconnect() creates its own
		// deferred, so we need to resolve it after the method call starts.
		const reconnectPromise = service.ensureConnected('ws://host1:8080');

		// A new client should have been created with the same clientId
		assert.strictEqual(createdClients.length, 2);
		assert.strictEqual(createdClients[1].clientId, firstClientId);

		// Complete the reconnect deferred that the mock already created
		createdClients[1].reconnectDeferred!.complete({ type: 'replayed' });

		const conn = await reconnectPromise;
		assert.ok(conn);
		assert.strictEqual(service.connections[0].connected, true);
	});

	test('ensureConnected returns existing connection if already connected', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnectionState);

		const conn = await service.ensureConnected('ws://host1:8080');
		assert.ok(conn);
		// Should not have created a second client
		assert.strictEqual(createdClients.length, 1);
	});

	test('ensureConnected throws for unknown address', async () => {
		await assert.rejects(
			() => service.ensureConnected('ws://unknown:9999'),
			/No configured connection/,
		);
	});

	test('removing address from settings clears disconnected entry', async () => {
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnectionState);

		// Disconnect
		const disconnectEvent = Event.toPromise(service.onDidChangeConnectionState);
		createdClients[0].fireClose();
		await disconnectEvent;

		// Entry still present (disconnected)
		assert.strictEqual(service.connections.length, 1);

		// Remove from settings
		const removedEvent = Event.toPromise(service.onDidChangeConnections);
		configService.setEntries([]);
		await removedEvent;

		assert.strictEqual(service.connections.length, 0);
	});
});
