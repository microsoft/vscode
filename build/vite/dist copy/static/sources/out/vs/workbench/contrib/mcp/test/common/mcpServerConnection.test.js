/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { upcast } from '../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService, LogLevel, NullLogger } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { TestLoggerService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { TestMcpMessageTransport } from './mcpRegistryTypes.js';
import { Event } from '../../../../../base/common/event.js';
import { McpTaskManager } from '../../common/mcpTaskManager.js';
class TestMcpHostDelegate extends Disposable {
    constructor() {
        super();
        this._canStartValue = true;
        this.priority = 0;
        this._transport = this._register(new TestMcpMessageTransport());
    }
    substituteVariables(serverDefinition, launch) {
        return Promise.resolve(launch);
    }
    canStart() {
        return this._canStartValue;
    }
    start() {
        if (!this._canStartValue) {
            throw new Error('Cannot start server');
        }
        return this._transport;
    }
    getTransport() {
        return this._transport;
    }
    setCanStart(value) {
        this._canStartValue = value;
    }
    waitForInitialProviderPromises() {
        return Promise.resolve();
    }
}
suite('Workbench - MCP - ServerConnection', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let delegate;
    let transport;
    let collection;
    let serverDefinition;
    setup(() => {
        delegate = store.add(new TestMcpHostDelegate());
        transport = delegate.getTransport();
        // Setup test services
        const services = new ServiceCollection([ILoggerService, store.add(new TestLoggerService())], [IOutputService, upcast({ showChannel: () => { } })], [IStorageService, store.add(new TestStorageService())], [IProductService, TestProductService]);
        instantiationService = store.add(new TestInstantiationService(services));
        // Create test collection
        collection = {
            id: 'test-collection',
            label: 'Test Collection',
            remoteAuthority: null,
            serverDefinitions: observableValue('serverDefs', []),
            trustBehavior: 0 /* McpServerTrust.Kind.Trusted */,
            scope: -1 /* StorageScope.APPLICATION */,
            configTarget: 2 /* ConfigurationTarget.USER */,
        };
        // Create server definition
        serverDefinition = {
            id: 'test-server',
            label: 'Test Server',
            cacheNonce: 'a',
            launch: {
                type: 1 /* McpServerTransportType.Stdio */,
                command: 'test-command',
                args: [],
                env: {},
                envFile: undefined,
                cwd: '/test',
                sandbox: undefined
            }
        };
    });
    function waitForHandler(cnx) {
        const handler = cnx.handler.get();
        if (handler) {
            return Promise.resolve(handler);
        }
        return new Promise(resolve => {
            const disposable = autorun(reader => {
                const handler = cnx.handler.read(reader);
                if (handler) {
                    disposable.dispose();
                    resolve(handler);
                }
            });
        });
    }
    test('should start and set state to Running when transport succeeds', async () => {
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        // Start the connection
        const startPromise = connection.start({});
        // Simulate successful connection
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        const state = await startPromise;
        assert.strictEqual(state.state, 2 /* McpConnectionState.Kind.Running */);
        transport.simulateInitialized();
        assert.ok(await waitForHandler(connection));
    });
    test('should handle errors during start', async () => {
        // Setup delegate to fail on start
        delegate.setCanStart(false);
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        // Start the connection
        const state = await connection.start({});
        assert.strictEqual(state.state, 3 /* McpConnectionState.Kind.Error */);
        assert.ok(state.message);
    });
    test('should handle transport errors', async () => {
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        // Start the connection
        const startPromise = connection.start({});
        // Simulate error in transport
        transport.setConnectionState({
            state: 3 /* McpConnectionState.Kind.Error */,
            message: 'Test error message'
        });
        const state = await startPromise;
        assert.strictEqual(state.state, 3 /* McpConnectionState.Kind.Error */);
        assert.strictEqual(state.message, 'Test error message');
    });
    test('should stop and set state to Stopped', async () => {
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        // Start the connection
        const startPromise = connection.start({});
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        await startPromise;
        // Stop the connection
        const stopPromise = connection.stop();
        await stopPromise;
        assert.strictEqual(connection.state.get().state, 0 /* McpConnectionState.Kind.Stopped */);
    });
    test('should not restart if already starting', async () => {
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        // Start the connection
        const startPromise1 = connection.start({});
        // Try to start again while starting
        const startPromise2 = connection.start({});
        // Simulate successful connection
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        const state1 = await startPromise1;
        const state2 = await startPromise2;
        // Both promises should resolve to the same state
        assert.strictEqual(state1.state, 2 /* McpConnectionState.Kind.Running */);
        assert.strictEqual(state2.state, 2 /* McpConnectionState.Kind.Running */);
        transport.simulateInitialized();
        assert.ok(await waitForHandler(connection));
        connection.dispose();
    });
    test('should clean up when disposed', async () => {
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        // Start the connection
        const startPromise = connection.start({});
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        await startPromise;
        // Dispose the connection
        connection.dispose();
        assert.strictEqual(connection.state.get().state, 0 /* McpConnectionState.Kind.Stopped */);
    });
    test('should log transport messages', async () => {
        // Track logged messages
        const loggedMessages = [];
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, {
            onDidChangeLogLevel: Event.None,
            getLevel: () => LogLevel.Debug,
            info: (message) => {
                loggedMessages.push(message);
            },
            error: () => { },
            dispose: () => { }
        }, false, store.add(new McpTaskManager()));
        store.add(connection);
        // Start the connection
        const startPromise = connection.start({});
        // Simulate log message from transport
        transport.simulateLog('Test log message');
        // Set connection to running
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        await startPromise;
        // Check that the message was logged
        assert.ok(loggedMessages.some(msg => msg === 'Test log message'));
        connection.dispose();
        await timeout(10);
    });
    test('should emit a sandbox filesystem block for read-only errors with backtick paths', async () => {
        const sandboxedDefinition = {
            ...serverDefinition,
            sandboxEnabled: true,
        };
        const connection = instantiationService.createInstance(McpServerConnection, collection, sandboxedDefinition, delegate, sandboxedDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        const message = 'error: failed to open file `/test-for-sandbox/.git`: Read-only file system (os error 30)';
        const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
        const startPromise = connection.start({});
        transport.simulateLog(message);
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        assert.deepStrictEqual(await sandboxBlock, {
            kind: 'filesystem',
            message,
            path: '/test-for-sandbox/.git',
        });
        await startPromise;
        connection.dispose();
        await timeout(10);
    });
    test('should emit a sandbox filesystem block for read-only errors with double-quoted paths', async () => {
        const sandboxedDefinition = {
            ...serverDefinition,
            sandboxEnabled: true,
        };
        const connection = instantiationService.createInstance(McpServerConnection, collection, sandboxedDefinition, delegate, sandboxedDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        const message = 'error: failed to open file `/test-for-sandbox/.testfile`: Read-only file system (os error 30)';
        const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
        const startPromise = connection.start({});
        transport.simulateLog(message);
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        assert.deepStrictEqual(await sandboxBlock, {
            kind: 'filesystem',
            message,
            path: '/test-for-sandbox/.testfile',
        });
        await startPromise;
        connection.dispose();
        await timeout(10);
    });
    test('should emit a sandbox filesystem block for read-only at-path errors with double-quoted paths', async () => {
        const sandboxedDefinition = {
            ...serverDefinition,
            sandboxEnabled: true,
        };
        const connection = instantiationService.createInstance(McpServerConnection, collection, sandboxedDefinition, delegate, sandboxedDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        const message = 'error: Read-only file system (os error 30) at path "/test-for-sandbox/.testfile"';
        const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
        const startPromise = connection.start({});
        transport.simulateLog(message);
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        assert.deepStrictEqual(await sandboxBlock, {
            kind: 'filesystem',
            message,
            path: '/test-for-sandbox/.testfile',
        });
        await startPromise;
        connection.dispose();
        await timeout(10);
    });
    test('should emit a sandbox network block with the denied host', async () => {
        const sandboxedDefinition = {
            ...serverDefinition,
            sandboxEnabled: true,
        };
        const connection = instantiationService.createInstance(McpServerConnection, collection, sandboxedDefinition, delegate, sandboxedDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
        const startPromise = connection.start({});
        transport.simulateLog('No matching config rule, denying: api.example.com:443.');
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        assert.deepStrictEqual(await sandboxBlock, {
            kind: 'network',
            message: 'No matching config rule, denying: api.example.com:443.',
            host: 'api.example.com',
        });
        await startPromise;
        connection.dispose();
        await timeout(10);
    });
    test('should correctly handle transitions to and from error state', async () => {
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        // Start the connection
        const startPromise = connection.start({});
        // Transition to error state
        const errorState = {
            state: 3 /* McpConnectionState.Kind.Error */,
            message: 'Temporary error'
        };
        transport.setConnectionState(errorState);
        let state = await startPromise;
        assert.equal(state, errorState);
        transport.setConnectionState({ state: 0 /* McpConnectionState.Kind.Stopped */ });
        // Transition back to running state
        const startPromise2 = connection.start({});
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        state = await startPromise2;
        assert.deepStrictEqual(state, { state: 2 /* McpConnectionState.Kind.Running */ });
        connection.dispose();
        await timeout(10);
    });
    test('should handle multiple start/stop cycles', async () => {
        // Create server connection
        const connection = instantiationService.createInstance(McpServerConnection, collection, serverDefinition, delegate, serverDefinition.launch, new NullLogger(), false, store.add(new McpTaskManager()));
        store.add(connection);
        // First cycle
        let startPromise = connection.start({});
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        await startPromise;
        await connection.stop();
        assert.deepStrictEqual(connection.state.get(), { state: 0 /* McpConnectionState.Kind.Stopped */ });
        // Second cycle
        startPromise = connection.start({});
        transport.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ });
        await startPromise;
        assert.deepStrictEqual(connection.state.get(), { state: 2 /* McpConnectionState.Kind.Running */ });
        await connection.stop();
        assert.deepStrictEqual(connection.state.get(), { state: 0 /* McpConnectionState.Kind.Stopped */ });
        connection.dispose();
        await timeout(10);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyQ29ubmVjdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL3Rlc3QvY29tbW9uL21jcFNlcnZlckNvbm5lY3Rpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDcEYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBVyxjQUFjLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzFHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFnQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU3SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUxRSxPQUFPLEVBQUUsdUJB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