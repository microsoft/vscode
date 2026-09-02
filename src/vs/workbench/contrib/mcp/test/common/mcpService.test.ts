/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAllowedMcpServersService } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestContextService, TestLoggerService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpService } from '../../common/mcpService.js';
import { McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';
import { TestMcpMessageTransport, TestMcpRegistry } from './mcpRegistryTypes.js';

suite('Workbench - MCP - McpService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const createMcpService = () => {
		const storageService = store.add(new TestStorageService());
		const services = new ServiceCollection(
			[IFileService, { registerProvider: () => { } }],
			[IStorageService, storageService],
			[ILoggerService, store.add(new TestLoggerService())],
			[IWorkspaceContextService, new TestContextService()],
			[IWorkbenchEnvironmentService, {}],
			[ITelemetryService, NullTelemetryService],
			[IProductService, TestProductService],
			[IAllowedMcpServersService, { _serviceBrand: undefined, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true }],
		);

		const parentInstantiationService = store.add(new TestInstantiationService(services));
		const registry = new TestMcpRegistry(parentInstantiationService);
		const instantiationService = store.add(parentInstantiationService.createChild(new ServiceCollection([IMcpRegistry, registry])));
		const mcpService = store.add(new McpService(instantiationService, registry, new NullLogService(), new TestConfigurationService(), storageService));
		return { mcpService, registry };
	};

	const setServerDefinition = (registry: TestMcpRegistry, definition: McpServerDefinition) => {
		const collection = registry.collections.get()[0];
		registry.collections.set([{
			...collection,
			serverDefinitions: observableValue('serverDefinitions', [definition])
		}], undefined);
	};

	test('does not notify servers observers when the collection is unchanged', () => {
		const { mcpService, registry } = createMcpService();
		mcpService.updateCollectedServers();

		const observedServerCounts: number[] = [];
		store.add(autorun(reader => observedServerCounts.push(mcpService.servers.read(reader).length)));

		registry.collections.set([...registry.collections.get()], undefined);
		mcpService.updateCollectedServers();
		registry.collections.set([], undefined);
		mcpService.updateCollectedServers();

		assert.deepStrictEqual(observedServerCounts, [1, 0]);
	});

	test('does not stop a running server when an equivalent HTTP definition is published', async () => {
		const { mcpService, registry } = createMcpService();
		registry.makeTestTransport = () => {
			const transport = new TestMcpMessageTransport();
			transport.setResponder('tools/list', message => ({
				jsonrpc: MCP.JSONRPC_VERSION,
				id: (message as MCP.JSONRPCRequest).id,
				result: { tools: [] }
			}));
			return transport;
		};

		const uri = URI.parse('https://example.com/mcp');
		setServerDefinition(registry, {
			id: 'test-server',
			label: 'Test Server',
			launch: { type: McpServerTransportType.HTTP, uri, headers: [] },
			cacheNonce: 'a',
		});
		mcpService.updateCollectedServers();

		const server = mcpService.servers.get()[0];
		await server.start({ promptType: 'never', errorOnUserInteraction: true });
		await timeout(0);
		const stopStub = sinon.stub(server, 'stop').resolves();
		store.add(toDisposable(() => stopStub.restore()));
		// Populate the live definition's enumerable URI cache before publishing a fresh equivalent definition.
		uri.toString();

		setServerDefinition(registry, {
			id: 'test-server',
			label: 'Test Server',
			launch: { type: McpServerTransportType.HTTP, uri: URI.parse('https://example.com/mcp'), headers: [] },
			cacheNonce: 'a',
		});
		mcpService.updateCollectedServers();

		assert.deepStrictEqual({
			sameServer: mcpService.servers.get()[0] === server,
			stopCalls: stopStub.callCount,
		}, {
			sameServer: true,
			stopCalls: 0,
		});

		setServerDefinition(registry, {
			id: 'test-server',
			label: 'Test Server',
			launch: { type: McpServerTransportType.HTTP, uri: URI.parse('https://example.com/changed'), headers: [] },
			cacheNonce: 'a',
		});
		mcpService.updateCollectedServers();

		assert.strictEqual(stopStub.callCount, 1);
	});
});
