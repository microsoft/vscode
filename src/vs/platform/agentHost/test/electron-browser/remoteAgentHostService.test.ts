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

	test('starts with no connections when setting is empty', () => {
		assert.deepStrictEqual(service.connections, []);
	});

	test('getConnection returns undefined for unknown address', () => {
		assert.strictEqual(service.getConnection('ws://unknown:1234'), undefined);
	});

	test('creates connection when setting is updated', async () => {
		const connectionChanged = Event.toPromise(service.onDidChangeConnections);
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);

		// Resolve the connect promise
		assert.strictEqual(createdClients.length, 1);
		createdClients[0].connectDeferred.complete();
		await connectionChanged;

		assert.strictEqual(service.connections.length, 1);
		assert.strictEqual(service.connections[0].address, 'ws://host1:8080');
		assert.strictEqual(service.connections[0].name, 'Host 1');
	});

	test('getConnection returns client after successful connect', async () => {
		const connectionChanged = Event.toPromise(service.onDidChangeConnections);
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await connectionChanged;

		const connection = service.getConnection('ws://host1:8080');
		assert.ok(connection);
		assert.strictEqual(connection.clientId, createdClients[0].clientId);
	});

	test('removes connection when setting entry is removed', async () => {
		// Add a connection
		configService.setEntries([{ address: 'ws://host1:8080', name: 'Host 1' }]);
		createdClients[0].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnections);

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
		await Event.toPromise(service.onDidChangeConnections);

		// Simulate connection close
		const closedEvent = Event.toPromise(service.onDidChangeConnections);
		createdClients[0].fireClose();
		await closedEvent;

		assert.strictEqual(service.connections.length, 0);
		assert.strictEqual(service.getConnection('ws://host1:8080'), undefined);
	});

	test('removes connection on connect failure', async () => {
		configService.setEntries([{ address: 'ws://bad:9999', name: 'Bad' }]);
		assert.strictEqual(createdClients.length, 1);

		// Fail the connection
		createdClients[0].connectDeferred.error(new Error('Connection refused'));

		// Wait for async error handling
		await new Promise(r => setTimeout(r, 10));

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
		await Event.toPromise(service.onDidChangeConnections);
		createdClients[1].connectDeferred.complete();
		await Event.toPromise(service.onDidChangeConnections);

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
		await Event.toPromise(service.onDidChangeConnections);

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
});
