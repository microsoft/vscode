/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, raceTimeout, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService, NullLogger, NullLogService } from '../../../../../platform/log/common/log.js';
import { AllowedMcpServersService } from '../../../../../platform/mcp/common/allowedMcpServersService.js';
import { IAllowedMcpServersService, mcpAccessConfig, McpAccessValue, mcpAllowedServersConfig, mcpAutoStartConfig, McpAutoStartValue, mcpDeniedServersConfig } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ConfigurationResolverExpression } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestContextService, TestLoggerService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { McpService } from '../../common/mcpService.js';
import { McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportType } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';
import { TestMcpMessageTransport, TestMcpRegistry } from './mcpRegistryTypes.js';

suite('Workbench - MCP - McpService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const createMcpService = (allowedMcpServersService?: IAllowedMcpServersService) => {
		const storageService = store.add(new TestStorageService());
		const services = new ServiceCollection(
			[IFileService, { registerProvider: () => { } }],
			[IStorageService, storageService],
			[ILoggerService, store.add(new TestLoggerService())],
			[IWorkspaceContextService, new TestContextService()],
			[IWorkbenchEnvironmentService, {}],
			[ITelemetryService, NullTelemetryService],
			[IProductService, TestProductService],
			[IAllowedMcpServersService, allowedMcpServersService ?? { _serviceBrand: undefined, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowedBeforeResolution: () => true, isServerAllowed: () => true }],
		);

		const parentInstantiationService = store.add(new TestInstantiationService(services));
		const registry = new TestMcpRegistry(parentInstantiationService);
		const instantiationService = store.add(parentInstantiationService.createChild(new ServiceCollection([IMcpRegistry, registry])));
		const configurationService = new TestConfigurationService({ [mcpAutoStartConfig]: McpAutoStartValue.NewAndOutdated });
		const mcpService = store.add(new McpService(instantiationService, registry, new NullLogService(), configurationService, storageService));
		return { mcpService, registry, instantiationService };
	};

	const setServerDefinition = (registry: TestMcpRegistry, definition: McpServerDefinition) => {
		const collection = registry.collections.get()[0];
		registry.collections.set([{
			...collection,
			serverDefinitions: observableValue('serverDefinitions', [definition])
		}], undefined);
	};

	suite('URL policy resolution', () => {
		const createPolicyServer = (definitionUrl: string, resolvedUrl = definitionUrl, requiresActivation = false) => {
			const configurationService = new TestConfigurationService({
				[mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }],
				[mcpDeniedServersConfig]: [{ serverUrl: 'https://blocked.example/*' }],
			});
			const allowedMcpServersService = store.add(new AllowedMcpServersService(configurationService));
			const { mcpService, registry, instantiationService } = createMcpService(allowedMcpServersService);
			const definition: McpServerDefinition = {
				id: 'test-server',
				label: 'Test Server',
				launch: { type: McpServerTransportType.HTTP, uri: URI.parse(definitionUrl), headers: [] },
				cacheNonce: 'a',
			};
			setServerDefinition(registry, definition);
			const activation = { done: true, calls: 0 };
			if (requiresActivation) {
				const collection = registry.collections.get()[0];
				registry.collections.set([{ ...collection, lazy: { isCached: true, load: async () => { } } }], undefined);
				instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
					override activationEventIsDone(): boolean { return activation.done; }
					override async activateByEvent(): Promise<void> { activation.calls++; activation.done = true; }
				});
			}

			const inputChanges = store.add(new Emitter<void>());
			registry.onDidChangeInputs = inputChanges.event;
			const resolutionResult: { url: string; beforeResolve?: () => Promise<void>; cancelled?: boolean } = { url: resolvedUrl };
			const resolution = sinon.stub(registry, 'resolveConnection').callsFake(async options => {
				await resolutionResult.beforeResolve?.();
				if (resolutionResult.cancelled) {
					return undefined;
				}
				return store.add(instantiationService.createInstance(
					McpServerConnection,
					registry.collections.get()[0],
					definition,
					registry.delegates.get()[0],
					{ type: McpServerTransportType.HTTP, uri: URI.parse(resolutionResult.url), headers: [] },
					new NullLogger(),
					true,
					options.taskManager,
				));
			});
			store.add(toDisposable(() => resolution.restore()));

			const transports: TestMcpMessageTransport[] = [];
			registry.makeTestTransport = () => {
				const transport = store.add(new TestMcpMessageTransport());
				transports.push(transport);
				transport.setResponder('tools/list', message => ({
					jsonrpc: MCP.JSONRPC_VERSION,
					id: (message as MCP.JSONRPCRequest).id,
					result: { tools: [] },
				}));
				return transport;
			};
			mcpService.updateCollectedServers();
			return { server: mcpService.servers.get()[0], configurationService, resolution, resolutionResult, transports, registry, mcpService, definition, inputChanges, activation };
		};

		const setDeniedUrls = async (configurationService: TestConfigurationService, urls: string[]) => {
			await configurationService.setUserConfiguration(mcpDeniedServersConfig, urls.map(serverUrl => ({ serverUrl })));
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([mcpDeniedServersConfig]),
				change: { keys: [mcpDeniedServersConfig], overrides: [] },
				affectsConfiguration: key => key === mcpDeniedServersConfig,
			});
		};

		const provideCachedMetadata = (registry: TestMcpRegistry) => {
			const createTransport = registry.makeTestTransport;
			registry.makeTestTransport = () => {
				const transport = createTransport();
				transport.setResponder('initialize', message => ({
					jsonrpc: MCP.JSONRPC_VERSION,
					id: (message as MCP.JSONRPCRequest).id,
					result: {
						protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
						serverInfo: { name: 'Policy Fixture', version: '1.0.0' },
						capabilities: { tools: {}, prompts: {} },
					}
				}));
				transport.setResponder('tools/list', message => ({
					jsonrpc: MCP.JSONRPC_VERSION, id: (message as MCP.JSONRPCRequest).id,
					result: { tools: [{ name: 'cached_tool', inputSchema: { type: 'object', properties: {} } }] },
				}));
				transport.setResponder('prompts/list', message => ({
					jsonrpc: MCP.JSONRPC_VERSION, id: (message as MCP.JSONRPCRequest).id,
					result: { prompts: [{ name: 'cached_prompt' }] },
				}));
				return transport;
			};
		};

		const createBlockedInputServer = async () => {
			const context = createPolicyServer('https://${input:host}/mcp', 'https://trusted.example/mcp');
			const { server, registry, configurationService } = context;
			provideCachedMetadata(registry);
			await configurationService.setUserConfiguration(mcpAllowedServersConfig, [
				{ serverUrl: 'https://trusted.example/mcp' },
				{ serverUrl: 'https://changed.example/mcp' },
			]);
			await server.start({ promptType: 'never', errorOnUserInteraction: true });
			await Promise.all([
				waitForState(server.tools, tools => tools.length === 1),
				waitForState(server.prompts, prompts => prompts.length === 1),
			]);
			await setDeniedUrls(configurationService, ['https://trusted.example/*']);
			const snapshot = () => ({
				state: server.connectionState.get().state,
				connected: !!server.connection.get(),
				tools: server.tools.get().length,
				prompts: server.prompts.get().length,
			});
			return { ...context, snapshot };
		};

		test('retains a resolved policy block and suppresses cached metadata after disposal', async () => {
			const { server, configurationService, registry, definition } = createPolicyServer('https://${input:host}/mcp', 'https://trusted.example/mcp');
			provideCachedMetadata(registry);
			await server.start({ promptType: 'never', errorOnUserInteraction: true });
			await Promise.all([
				waitForState(server.tools, tools => tools.length === 1),
				waitForState(server.prompts, prompts => prompts.length === 1),
			]);
			const snapshot = () => ({
				state: server.connectionState.get().state,
				connected: !!server.connection.get(),
				tools: server.tools.get().length,
				prompts: server.prompts.get().length,
			});
			const before = snapshot();
			await setDeniedUrls(configurationService, ['https://trusted.example/*']);
			const blocked = snapshot();
			setServerDefinition(registry, { ...definition, launch: { ...definition.launch } });
			const equivalentDefinition = snapshot();
			await setDeniedUrls(configurationService, []);
			const allowedAgain = snapshot();

			assert.deepStrictEqual({ before, blocked, equivalentDefinition, allowedAgain }, {
				before: { state: McpConnectionState.Kind.Running, connected: true, tools: 1, prompts: 1 },
				blocked: { state: McpConnectionState.Kind.Error, connected: false, tools: 0, prompts: 0 },
				equivalentDefinition: { state: McpConnectionState.Kind.Error, connected: false, tools: 0, prompts: 0 },
				allowedAgain: { state: McpConnectionState.Kind.Stopped, connected: false, tools: 1, prompts: 1 },
			});
		});

		for (const inputAction of ['edit', 'reset'] as const) {
			test(`explicit retry re-resolves a blocked server after saved input ${inputAction}`, async () => {
				const { server, registry, definition, resolution, resolutionResult, inputChanges, transports, snapshot } = await createBlockedInputServer();
				const resolving = new DeferredPromise<void>();
				const resume = new DeferredPromise<void>();
				resolutionResult.beforeResolve = async () => {
					void resolving.complete();
					await resume.p;
				};
				const changedInput = async () => {
					resolutionResult.url = 'https://changed.example/mcp';
					inputChanges.fire();
				};
				const edit = sinon.stub(registry, 'editSavedInput').callsFake(changedInput);
				store.add(toDisposable(() => edit.restore()));
				const clear = sinon.stub(registry, 'clearSavedInputs').callsFake(changedInput);
				store.add(toDisposable(() => clear.restore()));
				if (inputAction === 'edit') {
					await registry.editSavedInput('${input:host}', undefined, 'mcp', ConfigurationTarget.USER);
				} else {
					await registry.clearSavedInputs(StorageScope.PROFILE, '${input:host}');
				}
				const afterInputChange = snapshot();
				const quiet = await server.start({ promptType: 'never', errorOnUserInteraction: true });
				const quietResolutions = resolution.callCount;
				const pending = server.start({ promptType: 'all-untrusted' });
				const enteredResolution = await raceTimeout(resolving.p.then(() => true), 1000) ?? false;
				const duringResolution = snapshot();
				await resume.complete();
				const retried = await pending;
				const connection = server.connection.get();
				if (connection) {
					await waitForState(connection.handler, Boolean);
				}

				const blocked = { state: McpConnectionState.Kind.Error, connected: false, tools: 0, prompts: 0 };
				assert.deepStrictEqual({
					definitionUnchanged: registry.collections.get()[0].serverDefinitions.get()[0] === definition,
					afterInputChange,
					quiet: quiet.state,
					quietResolutions,
					enteredResolution,
					duringResolution,
					retried: retried.state,
					afterRetry: snapshot(),
					resolutions: resolution.callCount,
					transports: transports.length,
				}, {
					definitionUnchanged: true,
					afterInputChange: blocked,
					quiet: McpConnectionState.Kind.Error,
					quietResolutions: 1,
					enteredResolution: true,
					duringResolution: blocked,
					retried: McpConnectionState.Kind.Running,
					afterRetry: { state: McpConnectionState.Kind.Running, connected: true, tools: 1, prompts: 1 },
					resolutions: 2,
					transports: 2,
				});
			});
		}

		test('cancelled and repeatedly denied input retries keep cached metadata blocked', async () => {
			const { server, registry, resolution, resolutionResult, inputChanges, transports, snapshot } = await createBlockedInputServer();
			const resolving = new DeferredPromise<void>();
			const resume = new DeferredPromise<void>();
			const clear = sinon.stub(registry, 'clearSavedInputs').callsFake(async () => inputChanges.fire());
			store.add(toDisposable(() => clear.restore()));
			await registry.clearSavedInputs(StorageScope.PROFILE, '${input:host}');
			resolutionResult.beforeResolve = async () => {
				void resolving.complete();
				await resume.p;
			};
			resolutionResult.cancelled = true;
			const pending = server.start({ promptType: 'all-untrusted' });
			const enteredResolution = await raceTimeout(resolving.p.then(() => true), 1000) ?? false;
			const duringResolution = snapshot();
			await resume.complete();
			const cancelled = await pending;
			const afterCancellation = snapshot();
			resolutionResult.beforeResolve = undefined;
			resolutionResult.cancelled = false;
			const denied = await server.start({ promptType: 'all-untrusted' });

			const blocked = { state: McpConnectionState.Kind.Error, connected: false, tools: 0, prompts: 0 };
			assert.deepStrictEqual({
				enteredResolution,
				duringResolution,
				cancelled: cancelled.state,
				afterCancellation,
				denied: denied.state,
				afterDenial: snapshot(),
				resolutions: resolution.callCount,
				transports: transports.length,
			}, {
				enteredResolution: true,
				duringResolution: blocked,
				cancelled: McpConnectionState.Kind.Stopped,
				afterCancellation: blocked,
				denied: McpConnectionState.Kind.Error,
				afterDenial: blocked,
				resolutions: 3,
				transports: 1,
			});
		});

		for (const variable of ['${input:host}', '${command:resolveHost}']) {
			for (const retained of [false, true]) {
				for (const [reason, key, value] of [
					['disabled access', mcpAccessConfig, McpAccessValue.None],
					['denied name', mcpDeniedServersConfig, [{ serverName: 'Test Server' }]],
					['unlisted name', mcpAllowedServersConfig, [{ serverName: 'Another Server' }]],
				] as const) {
					test(`${reason} prevents startup side effects for ${variable} with retained identity ${retained}`, async () => {
						const { server, configurationService, resolution, resolutionResult, transports, activation } = createPolicyServer(`https://${variable}/mcp`, 'https://blocked.example/mcp', true);
						if (retained) {
							await server.start({ promptType: 'never', errorOnUserInteraction: true });
						}
						await configurationService.setUserConfiguration(key, value);
						configurationService.onDidChangeConfigurationEmitter.fire({
							source: ConfigurationTarget.USER,
							affectedKeys: new Set([key]),
							change: { keys: [key], overrides: [] },
							affectsConfiguration: candidate => candidate === key,
						});
						activation.done = false;
						const resolveInputs = sinon.stub().resolves();
						resolutionResult.beforeResolve = resolveInputs;
						const result = await server.start({ promptType: 'all-untrusted' });
						assert.deepStrictEqual({
							state: result.state,
							activations: activation.calls,
							resolutions: resolution.callCount,
							inputResolutions: resolveInputs.callCount,
							transports: transports.length,
							tools: server.tools.get().length,
							prompts: server.prompts.get().length,
						}, {
							state: McpConnectionState.Kind.Error,
							activations: 0,
							resolutions: retained ? 1 : 0,
							inputResolutions: 0,
							transports: 0,
							tools: 0,
							prompts: 0,
						});
					});
				}
			}
		}

		for (const transportType of [McpServerTransportType.HTTP, McpServerTransportType.Stdio]) {
			test(`discovery handles repeated incomplete markers without URL rules for transport ${transportType}`, () => {
				const configurationService = new TestConfigurationService();
				const allowedMcpServersService = store.add(new AllowedMcpServersService(configurationService));
				const { mcpService, registry } = createMcpService(allowedMcpServersService);
				const markers = '${'.repeat(32 * 1024);
				const launch: McpServerLaunch = transportType === McpServerTransportType.HTTP
					? { type: McpServerTransportType.HTTP, uri: URI.parse(`https://trusted.example/mcp#${markers}`), headers: [] }
					: { type: McpServerTransportType.Stdio, command: 'echo', args: [markers], env: {}, envFile: undefined, cwd: undefined, sandbox: undefined };
				setServerDefinition(registry, { id: 'test-server', label: 'Test Server', cacheNonce: 'a', launch });
				const stopwatch = StopWatch.create();
				mcpService.updateCollectedServers();
				const elapsed = stopwatch.elapsed();
				assert.ok(elapsed < 1000, `Discovery took ${elapsed}ms for 64 KiB of incomplete markers`);
				assert.strictEqual(mcpService.servers.get()[0].connectionState.get().state, McpConnectionState.Kind.Stopped);
			});
		}

		test('a changed definition releases the retained resolved policy block', async () => {
			const { server, registry, definition, transports } = createPolicyServer('https://${input:host}/mcp', 'https://blocked.example/mcp');
			const result = await server.start({ promptType: 'never', errorOnUserInteraction: true });
			const blocked = server.connectionState.get().state;
			setServerDefinition(registry, {
				...definition,
				cacheNonce: 'b',
				launch: { type: McpServerTransportType.HTTP, uri: URI.parse('https://trusted.example/mcp'), headers: [] }
			});
			assert.deepStrictEqual({
				result: result.state,
				blocked,
				changed: server.connectionState.get().state,
				transports: transports.length,
			}, {
				result: McpConnectionState.Kind.Error,
				blocked: McpConnectionState.Kind.Error,
				changed: McpConnectionState.Kind.Stopped,
				transports: 0,
			});
		});

		test('reverting a changed definition does not restore a stale resolved policy block', async () => {
			const { server, registry, definition, resolution, resolutionResult, transports } = createPolicyServer('https://${input:host}/mcp', 'https://blocked.example/mcp');
			const initial = await server.start({ promptType: 'never', errorOnUserInteraction: true });
			setServerDefinition(registry, {
				...definition,
				cacheNonce: 'b',
				launch: { type: McpServerTransportType.HTTP, uri: URI.parse('https://${input:otherHost}/mcp'), headers: [] }
			});
			const changed = server.connectionState.get().state;
			resolutionResult.url = 'https://trusted.example/mcp';
			setServerDefinition(registry, { ...definition, launch: { ...definition.launch } });
			const reverted = server.connectionState.get().state;
			const retried = await server.start({ promptType: 'never', errorOnUserInteraction: true });

			assert.deepStrictEqual({
				initial: initial.state,
				changed,
				reverted,
				retried: retried.state,
				resolutions: resolution.callCount,
				transports: transports.length,
			}, {
				initial: McpConnectionState.Kind.Error,
				changed: McpConnectionState.Kind.Stopped,
				reverted: McpConnectionState.Kind.Stopped,
				retried: McpConnectionState.Kind.Running,
				resolutions: 2,
				transports: 1,
			});
		});

		test('definition changes during a live connection invalidate its retained identity', async () => {
			const { server, configurationService, registry, definition, resolution, transports } = createPolicyServer('https://${input:host}/mcp', 'https://trusted.example/mcp');
			const initial = await server.start({ promptType: 'never', errorOnUserInteraction: true });
			setServerDefinition(registry, {
				...definition,
				cacheNonce: 'b',
				launch: { type: McpServerTransportType.HTTP, uri: URI.parse('https://${input:otherHost}/mcp'), headers: [] }
			});
			setServerDefinition(registry, { ...definition, launch: { ...definition.launch } });
			const reverted = server.connectionState.get().state;
			await setDeniedUrls(configurationService, ['https://trusted.example/*']);
			const revoked = { state: server.connectionState.get().state, connected: !!server.connection.get() };
			const retried = await server.start({ promptType: 'never', errorOnUserInteraction: true });

			assert.deepStrictEqual({
				initial: initial.state,
				reverted,
				revoked,
				retried: retried.state,
				resolutions: resolution.callCount,
				transports: transports.length,
			}, {
				initial: McpConnectionState.Kind.Running,
				reverted: McpConnectionState.Kind.Running,
				revoked: { state: McpConnectionState.Kind.Stopped, connected: false },
				retried: McpConnectionState.Kind.Error,
				resolutions: 2,
				transports: 1,
			});
		});

		test('policy revocation during Starting settles startup and permits a later retry', async () => {
			const { server, configurationService, registry, transports } = createPolicyServer('https://${input:host}/mcp', 'https://trusted.example/mcp');
			const starting = new DeferredPromise<void>();
			registry.delegates.set([{
				...registry.delegates.get()[0],
				start: () => {
					const transport = registry.makeTestTransport();
					if (transports.length === 1) {
						void starting.complete();
					} else {
						transport.setConnectionState({ state: McpConnectionState.Kind.Running });
					}
					return transport;
				},
			}], undefined);

			const pending = server.start({ promptType: 'never', errorOnUserInteraction: true });
			await starting.p;
			await setDeniedUrls(configurationService, ['https://trusted.example/*']);
			const revoked = await raceTimeout(pending, 1000);
			assert.ok(revoked, 'Startup must settle when policy disposes a Starting connection');
			const blocked = server.connectionState.get().state;
			await setDeniedUrls(configurationService, []);
			const retried = await raceTimeout(server.start({ promptType: 'never', errorOnUserInteraction: true }), 1000);
			assert.deepStrictEqual({
				revoked: revoked.state,
				blocked,
				retried: retried?.state,
				transports: transports.length,
			}, {
				revoked: McpConnectionState.Kind.Error,
				blocked: McpConnectionState.Kind.Error,
				retried: McpConnectionState.Kind.Running,
				transports: 2,
			});
		});

		for (const [host, reason] of [
			['attacker.example', 'not in the list of servers allowed by your organization'],
			['blocked.example', 'blocked by your organization'],
		]) {
			test(`blocks a non-variable fragment at rest for ${host}`, async () => {
				const url = `https://${host}/mcp#\${`;
				const { server, resolution, transports } = createPolicyServer(url);
				const beforeStart = server.connectionState.get().state;
				const result = await server.start({ promptType: 'never', errorOnUserInteraction: true });

				assert.deepStrictEqual({
					unresolvedVariables: [...ConfigurationResolverExpression.parse(url).unresolved()].length,
					beforeStart,
					blocked: result.state === McpConnectionState.Kind.Error && result.message.includes(reason),
					resolutions: resolution.callCount,
					transports: transports.length,
				}, {
					unresolvedVariables: 0,
					beforeStart: McpConnectionState.Kind.Error,
					blocked: true,
					resolutions: 0,
					transports: 0,
				});
			});

			for (const fragment of ['${', '${input:literal}']) {
				test(`blocks the resolved launch for ${host} with fragment ${fragment}`, async () => {
					const { server, resolution, transports } = createPolicyServer('https://${input:host}/mcp', `https://${host}/mcp#${fragment}`);
					const beforeStart = server.connectionState.get().state;
					const result = await server.start({ promptType: 'never', errorOnUserInteraction: true });

					assert.deepStrictEqual({
						beforeStart,
						blocked: result.state === McpConnectionState.Kind.Error && result.message.includes(reason),
						resolutions: resolution.callCount,
						transports: transports.length,
						connected: server.connection.get() !== undefined,
					}, {
						beforeStart: McpConnectionState.Kind.Stopped,
						blocked: true,
						resolutions: 1,
						transports: 0,
						connected: false,
					});
				});
			}
		}

		for (const url of ['https://trusted.example/mcp', 'https://trusted.example/mcp#${']) {
			test(`preserves unresolved definitions that resolve to ${url}`, async () => {
				const { server, resolution, transports } = createPolicyServer('https://${input:host}/mcp', url);
				const beforeStart = server.connectionState.get().state;
				const result = await server.start({ promptType: 'never', errorOnUserInteraction: true });
				const launch = server.connection.get()?.launchDefinition;

				assert.deepStrictEqual({
					beforeStart,
					afterStart: result.state,
					resolutions: resolution.callCount,
					transports: transports.length,
					resolvedUrl: launch?.type === McpServerTransportType.HTTP ? launch.uri.toString(true) : undefined,
				}, {
					beforeStart: McpConnectionState.Kind.Stopped,
					afterStart: McpConnectionState.Kind.Running,
					resolutions: 1,
					transports: 1,
					resolvedUrl: url,
				});
			});
		}

		test('stops a resolved URL with a literal variable marker when policy denies it', async () => {
			const { server, configurationService } = createPolicyServer('https://${input:host}/mcp', 'https://trusted.example/mcp#${input:literal}');
			const result = await server.start({ promptType: 'never', errorOnUserInteraction: true });
			const connection = server.connection.get();

			await configurationService.setUserConfiguration(mcpDeniedServersConfig, [{ serverUrl: 'https://trusted.example/*' }]);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([mcpDeniedServersConfig]),
				change: { keys: [mcpDeniedServersConfig], overrides: [] },
				affectsConfiguration: key => key === mcpDeniedServersConfig,
			});

			assert.deepStrictEqual({
				started: result.state,
				connected: server.connection.get() !== undefined,
				connectionState: connection?.state.get().state,
			}, {
				started: McpConnectionState.Kind.Running,
				connected: false,
				connectionState: McpConnectionState.Kind.Stopped,
			});
		});
	});

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
});
