/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAllowedMcpServersService, mcpAutoStartConfig, McpAutoStartValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestContextService, TestLoggerService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpServer } from '../../common/mcpServer.js';
import { McpService } from '../../common/mcpService.js';
import { McpConnectionFailedError, McpConnectionState, McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';
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
		const configurationService = new TestConfigurationService({ [mcpAutoStartConfig]: McpAutoStartValue.NewAndOutdated });
		const mcpService = store.add(new McpService(instantiationService, registry, new NullLogService(), configurationService, storageService));
		return { mcpService, registry };
	};

	const setServerDefinition = (registry: TestMcpRegistry, definition: McpServerDefinition) => {
		const collection = registry.collections.get()[0];
		registry.collections.set([{
			...collection,
			serverDefinitions: observableValue('serverDefinitions', [definition])
		}], undefined);
	};

	test('first autostart waits for discovery and loads the newly discovered server tools', async () => {
		const { mcpService, registry } = createMcpService();
		const collection = registry.collections.get()[0];
		registry.collections.set([], undefined);
		const initialDiscovery = new DeferredPromise<void>();
		const discoveryStub = sinon.stub(registry, 'discoverCollections').callsFake(async () => {
			await initialDiscovery.p;
			registry.collections.set([collection], undefined);
			return [collection];
		});
		store.add(toDisposable(() => discoveryStub.restore()));
		registry.makeTestTransport = () => {
			const transport = new TestMcpMessageTransport();
			transport.setResponder('tools/list', message => ({
				jsonrpc: MCP.JSONRPC_VERSION,
				id: (message as MCP.JSONRPCRequest).id,
				result: { tools: [{ name: 'search_index', inputSchema: { type: 'object' } }] },
			}));
			return transport;
		};

		const autostart = mcpService.autostart();
		const beforeDiscovery = {
			working: autostart.get().working,
			serverCount: mcpService.servers.get().length,
		};
		await initialDiscovery.complete();
		const result = await waitForState(autostart, state => !state.working);

		assert.deepStrictEqual({
			beforeDiscovery,
			requiringInteraction: result.serversRequiringInteraction,
			servers: mcpService.servers.get().map(server => ({
				state: server.connectionState.get().state,
				toolCount: server.tools.get().length,
			})),
		}, {
			beforeDiscovery: { working: true, serverCount: 0 },
			requiringInteraction: [],
			servers: [{ state: McpConnectionState.Kind.Running, toolCount: 1 }],
		});
	});

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

	suite('tool call cancellation', () => {
		const createTool = async (onCall: (transport: TestMcpMessageTransport, request: MCP.JSONRPCRequest) => MCP.JSONRPCMessage | undefined) => {
			const { mcpService, registry } = createMcpService();
			registry.makeTestTransport = () => {
				const transport = new TestMcpMessageTransport();
				transport.setResponder('tools/list', message => ({
					jsonrpc: MCP.JSONRPC_VERSION,
					id: (message as MCP.JSONRPCRequest).id,
					result: { tools: [{ name: 'search_index', inputSchema: { type: 'object' } }] },
				}));
				transport.setResponder('tools/call', message => {
					store.add(disposableTimeout(() => {
						const response = onCall(transport, message as MCP.JSONRPCRequest);
						if (response) {
							transport.simulateReceiveMessage(response);
						}
					}));
					return undefined;
				});
				return transport;
			};
			mcpService.updateCollectedServers();
			const server = mcpService.servers.get()[0];
			await server.start({ promptType: 'never', errorOnUserInteraction: true });
			const [tool] = await waitForState(server.tools, tools => tools.length > 0);
			assert.ok(server instanceof McpServer);
			const refreshStub = sinon.stub(server, 'awaitToolRefresh').resolves();
			store.add(toDisposable(() => refreshStub.restore()));
			return tool;
		};

		const failures: { name: string; state: McpConnectionState; message: string }[] = [
			{
				name: 'connection error',
				state: { state: McpConnectionState.Kind.Error, message: 'HTTP 502' },
				message: 'MCP connection failed: HTTP 502',
			},
			{
				name: 'stopped connection',
				state: { state: McpConnectionState.Kind.Stopped },
				message: 'MCP server disconnected during the tool call.',
			},
			{
				name: 'authentication requires interaction',
				state: { state: McpConnectionState.Kind.Stopped, reason: 'needs-user-interaction' },
				message: 'MCP server requires user interaction before this tool can run.',
			},
		];

		for (const withProgress of [false, true]) {
			for (const failure of failures) {
				test(`${withProgress ? 'callWithProgress' : 'call'} reports ${failure.name} as a tool error`, async () => {
					const tool = await createTool(transport => {
						transport.setConnectionState(failure.state);
						return undefined;
					});

					const result = withProgress
						? tool.callWithProgress({}, { report: () => { } })
						: tool.call({});

					await assert.rejects(result, (error: Error) => {
						assert.deepStrictEqual({
							connectionFailure: error instanceof McpConnectionFailedError,
							cancelled: isCancellationError(error),
							message: error.message,
						}, {
							connectionFailure: true,
							cancelled: false,
							message: failure.message,
						});
						return true;
					});
				});
			}
		}

		for (const failure of failures) {
			test(`preserves caller cancellation racing with ${failure.name}`, async () => {
				const cts = store.add(new CancellationTokenSource());
				const tool = await createTool(transport => {
					cts.cancel();
					transport.setConnectionState(failure.state);
					return undefined;
				});

				await assert.rejects(tool.call({}, undefined, cts.token), isCancellationError);
			});
		}

		test('preserves server cancellation when the connection is still running', async () => {
			const tool = await createTool((_transport, request) => ({
				jsonrpc: MCP.JSONRPC_VERSION,
				method: 'notifications/cancelled',
				params: { requestId: request.id },
			}));

			await assert.rejects(tool.call({}), isCancellationError);
		});

		test('preserves an ordinary server error', async () => {
			const tool = await createTool((_transport, request) => ({
				jsonrpc: MCP.JSONRPC_VERSION,
				id: request.id,
				error: { code: -32001, message: 'Tool failed' },
			}));

			await assert.rejects(tool.call({}), (error: Error) => {
				assert.deepStrictEqual({
					connectionFailure: error instanceof McpConnectionFailedError,
					cancelled: isCancellationError(error),
					message: error.message,
				}, {
					connectionFailure: false,
					cancelled: false,
					message: 'MPC -32001: Tool failed',
				});
				return true;
			});
		});

		test('preserves the existing retry for retryable connection errors', async () => {
			let calls = 0;
			const expected: MCP.CallToolResult = { content: [{ type: 'text', text: 'Recovered' }] };
			const tool = await createTool((transport, request) => {
				if (++calls === 1) {
					transport.setConnectionState({ state: McpConnectionState.Kind.Error, message: 'Connection lost', shouldRetry: true });
					return undefined;
				}
				return { jsonrpc: MCP.JSONRPC_VERSION, id: request.id, result: expected };
			});

			const result = await tool.callWithProgress({}, { report: () => { } }, undefined, CancellationToken.None);
			assert.deepStrictEqual({ result, calls }, { result: expected, calls: 2 });
		});

		test('reports a connection error when the existing retry is exhausted', async () => {
			let calls = 0;
			const tool = await createTool(transport => {
				calls++;
				transport.setConnectionState({ state: McpConnectionState.Kind.Error, message: 'Connection lost', shouldRetry: true });
				return undefined;
			});

			await assert.rejects(tool.call({}), (error: Error) => {
				assert.deepStrictEqual({
					connectionFailure: error instanceof McpConnectionFailedError,
					cancelled: isCancellationError(error),
					calls,
				}, {
					connectionFailure: true,
					cancelled: false,
					calls: 2,
				});
				return true;
			});
		});
	});
});
