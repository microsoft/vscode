/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { upcast } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogger, ILoggerService, NullLogger } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { TestLoggerService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IMcpHostDelegate, IMcpMessageTransport } from '../../common/mcpRegistryTypes.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';
import { TestMcpMessageTransport } from './mcpRegistryTypes.js';

class TestMcpHostDelegate extends Disposable implements IMcpHostDelegate {
	private readonly _transport: TestMcpMessageTransport;
	private _canStartValue = true;

	constructor() {
		super();
		this._transport = this._register(new TestMcpMessageTransport());
	}

	canStart(): boolean {
		return this._canStartValue;
	}

	start(): IMcpMessageTransport {
		if (!this._canStartValue) {
			throw new Error('Cannot start server');
		}
		return this._transport;
	}

	getTransport(): TestMcpMessageTransport {
		return this._transport;
	}

	setCanStart(value: boolean): void {
		this._canStartValue = value;
	}

	waitForInitialProviderPromises(): Promise<void> {
		return Promise.resolve();
	}
}

suite('Workbench - MCP - ServerConnection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let delegate: TestMcpHostDelegate;
	let transport: TestMcpMessageTransport;
	let collection: McpCollectionDefinition;
	let serverDefinition: McpServerDefinition;

	setup(() => {
		delegate = store.add(new TestMcpHostDelegate());
		transport = delegate.getTransport();

		// Setup test services
		const services = new ServiceCollection(
			[ILoggerService, store.add(new TestLoggerService())],
			[IOutputService, upcast({ showChannel: () => { } })],
			[IStorageService, store.add(new TestStorageService())],
			[IProductService, TestProductService],
		);

		instantiationService = store.add(new TestInstantiationService(services));

		// Create test collection
		collection = {
			id: 'test-collection',
			label: 'Test Collection',
			remoteAuthority: null,
			serverDefinitions: observableValue('serverDefs', []),
			isTrustedByDefault: true,
			scope: StorageScope.APPLICATION
		};

		// Create server definition
		serverDefinition = {
			id: 'test-server',
			label: 'Test Server',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'test-command',
				args: [],
				env: {},
				envFile: undefined,
				cwd: URI.parse('file:///test')
			}
		};
	});

	function waitForHandler(cnx: McpServerConnection) {
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
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);
		store.add(connection);

		// Start the connection
		const startPromise = connection.start();

		// Simulate successful connection
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });

		const state = await startPromise;
		assert.strictEqual(state.state, McpConnectionState.Kind.Running);

		transport.simulateInitialized();
		assert.ok(await waitForHandler(connection));
	});

	test('should handle errors during start', async () => {
		// Setup delegate to fail on start
		delegate.setCanStart(false);

		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);
		store.add(connection);

		// Start the connection
		const state = await connection.start();

		assert.strictEqual(state.state, McpConnectionState.Kind.Error);
		assert.ok(state.message);
	});

	test('should handle transport errors', async () => {
		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);
		store.add(connection);

		// Start the connection
		const startPromise = connection.start();

		// Simulate error in transport
		transport.setConnectionState({
			state: McpConnectionState.Kind.Error,
			message: 'Test error message'
		});

		const state = await startPromise;
		assert.strictEqual(state.state, McpConnectionState.Kind.Error);
		assert.strictEqual(state.message, 'Test error message');
	});

	test('should stop and set state to Stopped', async () => {
		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);
		store.add(connection);

		// Start the connection
		const startPromise = connection.start();
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });
		await startPromise;

		// Stop the connection
		const stopPromise = connection.stop();
		await stopPromise;

		assert.strictEqual(connection.state.get().state, McpConnectionState.Kind.Stopped);
	});

	test('should not restart if already starting', async () => {
		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);
		store.add(connection);

		// Start the connection
		const startPromise1 = connection.start();

		// Try to start again while starting
		const startPromise2 = connection.start();

		// Simulate successful connection
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });

		const state1 = await startPromise1;
		const state2 = await startPromise2;

		// Both promises should resolve to the same state
		assert.strictEqual(state1.state, McpConnectionState.Kind.Running);
		assert.strictEqual(state2.state, McpConnectionState.Kind.Running);

		transport.simulateInitialized();
		assert.ok(await waitForHandler(connection));
	});

	test('should clean up when disposed', async () => {
		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);

		// Start the connection
		const startPromise = connection.start();
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });
		await startPromise;

		// Dispose the connection
		connection.dispose();

		assert.strictEqual(connection.state.get().state, McpConnectionState.Kind.Stopped);
	});

	test('should log transport messages', async () => {
		// Track logged messages
		const loggedMessages: string[] = [];

		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			{
				info: (message: string) => {
					loggedMessages.push(message);
				},
				error: () => { },
				dispose: () => { }
			} as Partial<ILogger> as ILogger,
		);
		store.add(connection);

		// Start the connection
		const startPromise = connection.start();

		// Simulate log message from transport
		transport.simulateLog('Test log message');

		// Set connection to running
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });
		await startPromise;

		// Check that the message was logged
		assert.ok(loggedMessages.some(msg => msg === 'Test log message'));

		connection.dispose();
		await timeout(10);
	});

	test('should correctly handle transitions to and from error state', async () => {
		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);
		store.add(connection);

		// Start the connection
		const startPromise = connection.start();

		// Transition to error state
		const errorState: McpConnectionState = {
			state: McpConnectionState.Kind.Error,
			message: 'Temporary error'
		};
		transport.setConnectionState(errorState);

		let state = await startPromise;
		assert.equal(state, errorState);


		transport.setConnectionState({ state: McpConnectionState.Kind.Stopped });

		// Transition back to running state
		const startPromise2 = connection.start();
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });
		state = await startPromise2;
		assert.deepStrictEqual(state, { state: McpConnectionState.Kind.Running });

		connection.dispose();
		await timeout(10);
	});

	test('should handle multiple start/stop cycles', async () => {
		// Create server connection
		const connection = instantiationService.createInstance(
			McpServerConnection,
			collection,
			serverDefinition,
			delegate,
			serverDefinition.launch,
			new NullLogger(),
		);
		store.add(connection);

		// First cycle
		let startPromise = connection.start();
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });
		await startPromise;

		await connection.stop();
		assert.deepStrictEqual(connection.state.get(), { state: McpConnectionState.Kind.Stopped });

		// Second cycle
		startPromise = connection.start();
		transport.setConnectionState({ state: McpConnectionState.Kind.Running });
		await startPromise;

		assert.deepStrictEqual(connection.state.get(), { state: McpConnectionState.Kind.Running });

		await connection.stop();

		assert.deepStrictEqual(connection.state.get(), { state: McpConnectionState.Kind.Stopped });

		connection.dispose();
		await timeout(10);
	});
});
