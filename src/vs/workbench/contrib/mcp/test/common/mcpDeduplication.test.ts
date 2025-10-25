/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { McpService } from '../../common/mcpService.js';
import { McpCollectionDefinition, McpServerDefinition, McpServerTransportType, McpServerTrust } from '../../common/mcpTypes.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { TestMcpRegistry } from './mcpRegistryTypes.js';

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	public events: Array<{ eventName: string; data: any }> = [];

	publicLog2(eventName: string, data: any): void {
		this.events.push({ eventName, data });
	}

	publicLog(eventName: string, data: any): void {
		this.events.push({ eventName, data });
	}

	publicLogError(eventName: string, data: any): void {
		this.events.push({ eventName, data });
	}

	publicLogError2(eventName: string, data: any): void {
		this.events.push({ eventName, data });
	}

	setEnabled(value: boolean): void {
		// No-op
	}

	isOptedIn(): boolean {
		return true;
	}

	get telemetryLevel() { return TelemetryLevel.USAGE; }
	get sessionId() { return 'test-session'; }
	get machineId() { return 'test-machine'; }
	get sqmId() { return 'test-sqm'; }
	get firstSessionDate() { return '2023-01-01'; }
	get msftInternal() { return false; }
	get isOptedInProductImprovement() { return false; }
	get devDeviceId() { return 'test-device'; }
	sendErrorTelemetry = false;
	setExperimentProperty(name: string, value: string): void { /* no-op */ }
}

suite('Workbench - MCP - Deduplication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mcpService: McpService;
	let telemetryService: TestTelemetryService;
	let mockRegistry: TestMcpRegistry;

	setup(() => {
		telemetryService = new TestTelemetryService();
		mockRegistry = new TestMcpRegistry(store.add(new TestInstantiationService()));

		const services = new ServiceCollection(
			[ILogService, store.add(new NullLogService())],
			[IConfigurationService, new TestConfigurationService()],
			[ITelemetryService, telemetryService],
			[IMcpRegistry, mockRegistry]
		);

		instantiationService = store.add(new TestInstantiationService(services));
		mcpService = store.add(instantiationService.createInstance(McpService));
	});

	test('should deduplicate identical server definitions', async () => {
		// Create two identical server definitions from different collections
		const serverDef: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'a',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'test-command',
				args: ['--arg1', '--arg2'],
				env: { TEST_VAR: 'value1' },
				envFile: undefined,
				cwd: '/test'
			}
		};

		const collection1: McpCollectionDefinition = {
			id: 'collection-1',
			label: 'Collection 1',
			remoteAuthority: null,
			serverDefinitions: observableValue('servers', [serverDef]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.APPLICATION,
			configTarget: 1 // ConfigurationTarget.USER
		};

		const collection2: McpCollectionDefinition = {
			id: 'collection-2',
			label: 'Collection 2',
			remoteAuthority: null,
			serverDefinitions: observableValue('servers', [serverDef]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.APPLICATION,
			configTarget: 1 // ConfigurationTarget.USER
		};

		// Update the mock registry
		mockRegistry.collections.set([collection1, collection2], undefined);

		// Test the deduplication logic
		await mcpService.updateCollectedServers();

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
		// Create two servers with different configurations
		const serverDef1: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'a',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'test-command',
				args: ['--arg1'],
				env: { TEST_VAR: 'value1' },
				envFile: undefined,
				cwd: '/test'
			}
		};

		const serverDef2: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'a',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'test-command',
				args: ['--arg2'], // Different args
				env: { TEST_VAR: 'value2' }, // Different env
				envFile: undefined,
				cwd: '/different' // Different cwd
			}
		};

		const collection1: McpCollectionDefinition = {
			id: 'collection-1',
			label: 'Collection 1',
			remoteAuthority: null,
			serverDefinitions: observableValue('servers', [serverDef1]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.APPLICATION,
			configTarget: 1 // ConfigurationTarget.USER
		};

		const collection2: McpCollectionDefinition = {
			id: 'collection-2',
			label: 'Collection 2',
			remoteAuthority: null,
			serverDefinitions: observableValue('servers', [serverDef2]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.APPLICATION,
			configTarget: 1 // ConfigurationTarget.USER
		};

		// Update the mock registry
		mockRegistry.collections.set([collection1, collection2], undefined);

		// Test the deduplication logic
		await mcpService.updateCollectedServers();

		// Should have two servers since they have different configurations
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 2, 'Should have two servers with different configurations');
	});

	test('should prioritize user settings over workspace settings for metadata', async () => {
		// Create identical server definitions in different scopes
		const serverDef: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'a',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'test-command',
				args: ['--arg1'],
				env: { TEST_VAR: 'value1' },
				envFile: undefined,
				cwd: '/test'
			}
		};

		const userCollection: McpCollectionDefinition = {
			id: 'user-collection',
			label: 'User Collection',
			remoteAuthority: null,
			serverDefinitions: observableValue('servers', [serverDef]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.PROFILE, // User scope - higher priority
			configTarget: 1 // ConfigurationTarget.USER
		};

		const workspaceCollection: McpCollectionDefinition = {
			id: 'workspace-collection',
			label: 'Workspace Collection',
			remoteAuthority: null,
			serverDefinitions: observableValue('servers', [serverDef]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.WORKSPACE, // Workspace scope - lower priority
			configTarget: 2 // ConfigurationTarget.WORKSPACE
		};

		// Update the mock registry
		mockRegistry.collections.set([userCollection, workspaceCollection], undefined);

		// Test the deduplication logic
		await mcpService.updateCollectedServers();

		// Should have only one server since they are identical after deduplication
		// The user collection should take priority for metadata
		const servers = mcpService.servers.get();
		assert.strictEqual(servers.length, 1, 'Should deduplicate identical servers with user settings taking priority');

		// Verify telemetry was called for deduplication
		const telemetryEvents = telemetryService.events;
		const deduplicationEvents = telemetryEvents.filter(e => e.eventName === 'mcp/serverDeduplication');
		assert.strictEqual(deduplicationEvents.length, 1, 'Should have one deduplication telemetry event');
	});
});
