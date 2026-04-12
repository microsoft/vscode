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
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { RemoteAgentHostService } from '../../electron-browser/remoteAgentHostServiceImpl.js';
import { parseRemoteAgentHostInput, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../common/remoteAgentHostService.js';
import { DeferredPromise } from '../../../../base/common/async.js';
// ---- Mock protocol client ---------------------------------------------------
class MockProtocolClient extends Disposable {
    static { this._nextId = 1; }
    constructor(mockAddress) {
        super();
        this.mockAddress = mockAddress;
        this.clientId = `mock-client-${MockProtocolClient._nextId++}`;
        this._onDidClose = this._register(new Emitter());
        this.onDidClose = this._onDidClose.event;
        this.onDidAction = Event.None;
        this.onDidNotification = Event.None;
        this.connectDeferred = new DeferredPromise();
    }
    async connect() {
        return this.connectDeferred.p;
    }
    fireClose() {
        this._onDidClose.fire();
    }
}
// ---- Test configuration service ---------------------------------------------
class TestConfigurationService {
    constructor() {
        this._onDidChangeConfiguration = new Emitter();
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this._entries = [];
        this._enabled = true;
    }
    getValue(key) {
        if (key === RemoteAgentHostsEnabledSettingId) {
            return this._enabled;
        }
        return this._entries;
    }
    inspect(_key) {
        return {
            userValue: this._entries,
        };
    }
    async updateValue(_key, value) {
        this.setEntries(value ?? []);
    }
    get entries() {
        return this._entries;
    }
    setEntries(entries) {
        this._entries = entries;
        this._onDidChangeConfiguration.fire({
            affectsConfiguration: (key) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId,
        });
    }
    setEnabled(enabled) {
        this._enabled = enabled;
        this._onDidChangeConfiguration.fire({
            affectsConfiguration: (key) => key === RemoteAgentHostsEnabledSettingId,
        });
    }
    dispose() {
        this._onDidChangeConfiguration.dispose();
    }
}
suite('RemoteAgentHostService', () => {
    const disposables = new DisposableStore();
    let configService;
    let createdClients;
    let service;
    setup(() => {
        configService = new TestConfigurationService();
        disposables.add(toDisposable(() => configService.dispose()));
        createdClients = [];
        const instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IConfigurationService, configService);
        // Mock the instantiation service to capture created protocol clients
        const mockInstantiationService = {
            createInstance: (_ctor, ...args) => {
                const client = new MockProtocolClient(args[0]);
                disposables.add(client);
                createdClients.push(client);
                return client;
            },
        };
        instantiationService.stub(IInstantiationService, mockInstantiationService);
        service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
    });
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    /** Wait for a connection to reach Connected status. */
    async function waitForConnected() {
        while (!service.connections.some(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */)) {
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
        const connected = service.connections.filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */);
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
        assert.strictEqual(entry.status, "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */);
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
        assert.strictEqual(service.connections.filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */).length, 2);
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
            status: "connected" /* RemoteAgentHostConnectionStatus.Connected */,
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
            status: "connected" /* RemoteAgentHostConnectionStatus.Connected */,
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
        configService.setEntries = (entries) => {
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
        assert.strictEqual(service.connections.filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */).length, 1);
        configService.setEnabled(false);
        assert.strictEqual(service.connections.length, 0);
    });
    test('addRemoteAgentHost throws when disabled', async () => {
        configService.setEnabled(false);
        await assert.rejects(() => service.addRemoteAgentHost({ address: 'host1:8080', name: 'Host 1' }), /not enabled/);
    });
    test('re-enabling reconnects configured remotes', async () => {
        configService.setEntries([{ address: 'host1:8080', name: 'Host 1' }]);
        createdClients[0].connectDeferred.complete();
        await waitForConnected();
        assert.strictEqual(service.connections.filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */).length, 1);
        configService.setEnabled(false);
        assert.strictEqual(service.connections.length, 0);
        configService.setEnabled(true);
        assert.strictEqual(createdClients.length, 2); // new client created
        createdClients[1].connectDeferred.complete();
        await waitForConnected();
        assert.strictEqual(service.connections.filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */).length, 1);
    });
    test('removeRemoteAgentHost removes entry and disconnects', async () => {
        configService.setEntries([
            { address: 'ws://host1:8080', name: 'Host 1' },
            { address: 'ws://host2:9090', name: 'Host 2' },
        ]);
        createdClients[0].connectDeferred.complete();
        createdClients[1].connectDeferred.complete();
        await waitForConnected();
        assert.strictEqual(service.connections.filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */).length, 2);
        await service.removeRemoteAgentHost('ws://host1:8080');
        assert.deepStrictEqual(configService.entries, [
            { address: 'ws://host2:9090', name: 'Host 2' },
        ]);
        assert.strictEqual(service.connections.filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */).length, 1);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0U2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3QvZWxlY3Ryb24tYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakcsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN6RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUscUJBQXFCLEVBQWtDLE1BQU0sZ0RBQWdELENBQUM7QUFDdkgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdkYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDOUYsT0FBTyxFQUFFLHlCQUF5QixFQUFtQyxnQ0FBZ0MsRUFBRSx5QkFBeUIsRUFBOEIsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3TSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbkUsZ0ZBQWdGO0FBRWhGLE1BQU0sa0JBQW1CLFNBQVEsVUFBVTthQUMzQixZQUFPLEdBQUcsQ0FBQyxBQUFKLENBQUs7SUFVM0IsWUFBNEIsV0FBbUI7UUFDOUMsS0FBSyxFQUFFLENBQUM7UUFEbUIsZ0JBQVcsR0FB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