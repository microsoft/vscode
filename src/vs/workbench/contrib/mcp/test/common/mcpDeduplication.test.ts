/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { McpService } from '../../common/mcpService.js';
import { McpCollectionDefinition, McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceUtils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestLogService } from '../../../../platform/log/test/common/testLogService.js';
import { TestTelemetryService } from '../../../../platform/telemetry/test/common/testTelemetryService.js';
import { observableValue } from '../../../../base/common/observable.js';

suite('Workbench - MCP - Deduplication', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let mcpService: McpService;
	let telemetryService: TestTelemetryService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = disposables.add(new TestInstantiationService());
		telemetryService = disposables.add(new TestTelemetryService());

		// Mock the MCP registry
		const mockRegistry = {
			collections: observableValue('collections', []),
			lazyCollectionState: observableValue('lazyCollectionState', {})
		};

		instantiationService.stub(IConfigurationService, disposables.add(new TestConfigurationService()));
		instantiationService.stub(ILogService, disposables.add(new TestLogService()));
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub('IMcpRegistry', mockRegistry);

		mcpService = disposables.add(instantiationService.createInstance(McpService));
	});

	teardown(() => {
		disposables.dispose();
	});

	test('should deduplicate servers with same ID and configuration', async () => {
		// Create a mock server definition
		const serverDef: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'node',
				args: ['server.js']
			}
		} satisfies McpServerDefinition;

		// Create mock collection definitions for testing deduplication logic
		const workspaceCollection: McpCollectionDefinition = {
			id: 'workspace-collection',
			label: 'Workspace Collection',
			scope: StorageScope.WORKSPACE,
			serverDefinitions: observableValue('workspace-servers', [serverDef])
		};

		const userCollection: McpCollectionDefinition = {
			id: 'user-collection',
			label: 'User Collection',
			scope: StorageScope.PROFILE,
			serverDefinitions: observableValue('user-servers', [serverDef])
		};

		// Verify collection definitions are properly structured
		assert.strictEqual(workspaceCollection.scope, StorageScope.WORKSPACE, 'Workspace collection should have workspace scope');
		assert.strictEqual(userCollection.scope, StorageScope.PROFILE, 'User collection should have profile scope');

		// Test the deduplication logic by calling updateCollectedServers
		// This will trigger our deduplication method
		mcpService.updateCollectedServers();

		// Verify that only one server instance was created (deduplication worked)
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 1, 'Should have only one server after deduplication');

		// Verify telemetry was called for deduplication
		const telemetryEvents = telemetryService.events;
		const deduplicationEvents = telemetryEvents.filter(e => e.eventName === 'mcp/serverDeduplication');
		assert.strictEqual(deduplicationEvents.length, 1, 'Should have one deduplication telemetry event');
		assert.strictEqual(deduplicationEvents[0].data.serverId, 'test-server', 'Telemetry should track correct server ID');
	});

	test('should keep servers with different configurations as separate', async () => {
		// Create two different server definitions
		const serverDef1: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'node',
				args: ['server.js']
			}
		} satisfies McpServerDefinition;

		const serverDef2: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'python',
				args: ['server.py']
			}
		} satisfies McpServerDefinition;

		const collection: McpCollectionDefinition = {
			id: 'test-collection',
			label: 'Test Collection',
			scope: StorageScope.WORKSPACE,
			serverDefinitions: observableValue('servers', [serverDef1, serverDef2])
		};

		// Update the mock registry
		const mockRegistry = instantiationService.get('IMcpRegistry');
		mockRegistry.collections.set([collection]);

		mcpService.updateCollectedServers();

		// Should have two servers since they have different configurations
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 2, 'Should have two servers with different configurations');
	});

	test('should prioritize workspace over user collections', async () => {
		const serverDef: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'node',
				args: ['server.js']
			}
		} satisfies McpServerDefinition;

		const workspaceCollection: McpCollectionDefinition = {
			id: 'workspace-collection',
			label: 'Workspace Collection',
			scope: StorageScope.WORKSPACE,
			serverDefinitions: observableValue('workspace-servers', [serverDef])
		};

		const userCollection: McpCollectionDefinition = {
			id: 'user-collection',
			label: 'User Collection',
			scope: StorageScope.PROFILE,
			serverDefinitions: observableValue('user-servers', [serverDef])
		};

		// Update the mock registry
		const mockRegistry = instantiationService.get('IMcpRegistry');
		mockRegistry.collections.set([workspaceCollection, userCollection]);

		mcpService.updateCollectedServers();

		// Should have one server from workspace collection (higher priority)
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 1, 'Should have one server after deduplication');
		assert.strictEqual(servers[0].collection.id, 'workspace-collection', 'Should keep server from workspace collection');
	});

	test('should support HTTP transport type', async () => {
		const serverDef: McpServerDefinition = {
			id: 'http-server',
			label: 'HTTP Server',
			launch: {
				type: McpServerTransportType.HTTP,
				uri: new URL('http://localhost:3000')
			}
		} satisfies McpServerDefinition;

		const collection: McpCollectionDefinition = {
			id: 'http-collection',
			label: 'HTTP Collection',
			scope: StorageScope.WORKSPACE,
			serverDefinitions: observableValue('http-servers', [serverDef])
		};

		// Update the mock registry
		const mockRegistry = instantiationService.get('IMcpRegistry');
		mockRegistry.collections.set([collection]);

		mcpService.updateCollectedServers();

		// Should successfully create HTTP server
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 1, 'Should have one HTTP server');
		assert.strictEqual(servers[0].definition.launch.type, McpServerTransportType.HTTP, 'Should be HTTP transport type');
	});

	test('should handle empty or null input gracefully', async () => {
		// Test with empty collections
		const mockRegistry = instantiationService.get('IMcpRegistry');
		mockRegistry.collections.set([]);

		mcpService.updateCollectedServers();

		// Should handle empty collections without errors
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 0, 'Should have no servers with empty collections');
	});

	test('should preserve server configuration during deduplication', async () => {
		const serverDef: McpServerDefinition = {
			id: 'config-server',
			label: 'Config Server',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'node',
				args: ['server.js', '--port', '3000']
			}
		} satisfies McpServerDefinition;

		const collection: McpCollectionDefinition = {
			id: 'config-collection',
			label: 'Config Collection',
			scope: StorageScope.WORKSPACE,
			serverDefinitions: observableValue('config-servers', [serverDef])
		};

		// Update the mock registry
		const mockRegistry = instantiationService.get('IMcpRegistry');
		mockRegistry.collections.set([collection]);

		mcpService.updateCollectedServers();

		// Should preserve the server configuration
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 1, 'Should have one server');
		assert.deepStrictEqual(servers[0].definition.launch.args, ['server.js', '--port', '3000'], 'Should preserve server arguments');
	});
});