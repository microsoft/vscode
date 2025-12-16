/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcast } from '../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService, IPrompt } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogger, ILoggerService, ILogService, NullLogger, NullLogService } from '../../../../../platform/log/common/log.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderData } from '../../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression, Replacement } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { TestLoggerService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { McpRegistry } from '../../common/mcpRegistry.js';
import { IMcpHostDelegate, IMcpMessageTransport } from '../../common/mcpRegistryTypes.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { McpTaskManager } from '../../common/mcpTaskManager.js';
import { LazyCollectionState, McpCollectionDefinition, McpServerDefinition, McpServerLaunch, McpServerTransportStdio, McpServerTransportType, McpServerTrust, McpStartServerInteraction } from '../../common/mcpTypes.js';
import { TestMcpMessageTransport } from './mcpRegistryTypes.js';

class TestConfigurationResolverService {
	declare readonly _serviceBrand: undefined;

	private interactiveCounter = 0;

	// Used to simulate stored/resolved variables
	private readonly resolvedVariables = new Map<string, string>();

	constructor() {
		// Add some test variables
		this.resolvedVariables.set('workspaceFolder', '/test/workspace');
		this.resolvedVariables.set('fileBasename', 'test.txt');
	}

	resolveAsync<T>(folder: IWorkspaceFolderData | undefined, value: T): Promise<unknown> {
		const parsed = ConfigurationResolverExpression.parse(value);
		for (const variable of parsed.unresolved()) {
			const resolved = this.resolvedVariables.get(variable.inner);
			if (resolved) {
				parsed.resolve(variable, resolved);
			}
		}

		return Promise.resolve(parsed.toObject());
	}

	resolveWithInteraction(folder: IWorkspaceFolderData | undefined, config: unknown, section?: string, variables?: Record<string, string>, target?: ConfigurationTarget): Promise<Map<string, string> | undefined> {
		const parsed = ConfigurationResolverExpression.parse(config);
		// For testing, we simulate interaction by returning a map with some variables
		const result = new Map<string, string>();
		result.set('input:testInteractive', `interactiveValue${this.interactiveCounter++}`);
		result.set('command:testCommand', `commandOutput${this.interactiveCounter++}}`);

		// If variables are provided, include those too
		for (const [k, v] of result.entries()) {
			const replacement: Replacement = {
				id: '${' + k + '}',
				inner: k,
				name: k.split(':')[0] || k,
				arg: k.split(':')[1]
			};
			parsed.resolve(replacement, v);
		}

		return Promise.resolve(result);
	}
}

class TestMcpHostDelegate implements IMcpHostDelegate {
	priority = 0;

	substituteVariables(serverDefinition: McpServerDefinition, launch: McpServerLaunch): Promise<McpServerLaunch> {
		return Promise.resolve(launch);
	}

	canStart(): boolean {
		return true;
	}

	start(): IMcpMessageTransport {
		return new TestMcpMessageTransport();
	}

	waitForInitialProviderPromises(): Promise<void> {
		return Promise.resolve();
	}
}

class TestDialogService {
	declare readonly _serviceBrand: undefined;

	private _promptResult: boolean | undefined = true;
	private _promptSpy: sinon.SinonStub;

	constructor() {
		this._promptSpy = sinon.stub();
		this._promptSpy.callsFake(() => {
			return Promise.resolve({ result: this._promptResult });
		});
	}

	setPromptResult(result: boolean | undefined): void {
		this._promptResult = result;
	}

	get promptSpy(): sinon.SinonStub {
		return this._promptSpy;
	}

	prompt<T>(options: IPrompt<T>): Promise<{ result?: T }> {
		return this._promptSpy(options);
	}
}

class TestMcpRegistry extends McpRegistry {
	public nextDefinitionIdsToTrust: string[] | undefined;

	protected override _promptForTrustOpenDialog(): Promise<string[] | undefined> {
		return Promise.resolve(this.nextDefinitionIdsToTrust);
	}
}

suite('Workbench - MCP - Registry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let registry: TestMcpRegistry;
	let testStorageService: TestStorageService;
	let testConfigResolverService: TestConfigurationResolverService;
	let testDialogService: TestDialogService;
	let testCollection: McpCollectionDefinition & { serverDefinitions: ISettableObservable<McpServerDefinition[]> };
	let baseDefinition: McpServerDefinition;
	let configurationService: TestConfigurationService;
	let logger: ILogger;
	let trustNonceBearer: { trustedAtNonce: string | undefined };
	let taskManager: McpTaskManager;

	setup(() => {
		testConfigResolverService = new TestConfigurationResolverService();
		testStorageService = store.add(new TestStorageService());
		testDialogService = new TestDialogService();
		configurationService = new TestConfigurationService({ [mcpAccessConfig]: McpAccessValue.All });
		trustNonceBearer = { trustedAtNonce: undefined };

		const services = new ServiceCollection(
			[IConfigurationService, configurationService],
			[IConfigurationResolverService, testConfigResolverService],
			[IStorageService, testStorageService],
			[ISecretStorageService, new TestSecretStorageService()],
			[ILoggerService, store.add(new TestLoggerService())],
			[ILogService, store.add(new NullLogService())],
			[IOutputService, upcast({ showChannel: () => { } })],
			[IDialogService, testDialogService],
			[IProductService, {}],
		);

		logger = new NullLogger();
		taskManager = store.add(new McpTaskManager());

		const instaService = store.add(new TestInstantiationService(services));
		registry = store.add(instaService.createInstance(TestMcpRegistry));

		// Create test collection that can be reused
		testCollection = {
			id: 'test-collection',
			label: 'Test Collection',
			remoteAuthority: null,
			serverDefinitions: observableValue('serverDefs', []),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.APPLICATION,
			configTarget: ConfigurationTarget.USER,
		};

		// Create base definition that can be reused
		baseDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'a',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'test-command',
				args: [],
				env: {},
				envFile: undefined,
				cwd: '/test',
			}
		};
	});

	test('registerCollection adds collection to registry', () => {
		const disposable = registry.registerCollection(testCollection);
		store.add(disposable);

		assert.strictEqual(registry.collections.get().length, 1);
		assert.strictEqual(registry.collections.get()[0], testCollection);

		disposable.dispose();
		assert.strictEqual(registry.collections.get().length, 0);
	});

	test('collections are not visible when not enabled', () => {
		const disposable = registry.registerCollection(testCollection);
		store.add(disposable);

		assert.strictEqual(registry.collections.get().length, 1);

		configurationService.setUserConfiguration(mcpAccessConfig, McpAccessValue.None);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
			affectedKeys: new Set([mcpAccessConfig]),
			change: { keys: [mcpAccessConfig], overrides: [] },
			source: ConfigurationTarget.USER
		} as IConfigurationChangeEvent); assert.strictEqual(registry.collections.get().length, 0);

		configurationService.setUserConfiguration(mcpAccessConfig, McpAccessValue.All);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
			affectedKeys: new Set([mcpAccessConfig]),
			change: { keys: [mcpAccessConfig], overrides: [] },
			source: ConfigurationTarget.USER
		} as IConfigurationChangeEvent);
	});

	test('registerDelegate adds delegate to registry', () => {
		const delegate = new TestMcpHostDelegate();
		const disposable = registry.registerDelegate(delegate);
		store.add(disposable);

		assert.strictEqual(registry.delegates.get().length, 1);
		assert.strictEqual(registry.delegates.get()[0], delegate);

		disposable.dispose();
		assert.strictEqual(registry.delegates.get().length, 0);
	});

	test('resolveConnection creates connection with resolved variables and memorizes them until cleared', async () => {
		const definition: McpServerDefinition = {
			...baseDefinition,
			launch: {
				type: McpServerTransportType.Stdio,
				command: '${workspaceFolder}/cmd',
				args: ['--file', '${fileBasename}'],
				env: {
					PATH: '${input:testInteractive}'
				},
				envFile: undefined,
				cwd: '/test',
			},
			variableReplacement: {
				section: 'mcp',
				target: ConfigurationTarget.WORKSPACE,
			}
		};

		const delegate = new TestMcpHostDelegate();
		store.add(registry.registerDelegate(delegate));
		testCollection.serverDefinitions.set([definition], undefined);
		store.add(registry.registerCollection(testCollection));

		const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager }) as McpServerConnection;

		assert.ok(connection);
		assert.strictEqual(connection.definition, definition);
		assert.strictEqual((connection.launchDefinition as unknown as { command: string }).command, '/test/workspace/cmd');
		assert.strictEqual((connection.launchDefinition as unknown as { env: { PATH: string } }).env.PATH, 'interactiveValue0');
		connection.dispose();

		const connection2 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager }) as McpServerConnection;

		assert.ok(connection2);
		assert.strictEqual((connection2.launchDefinition as unknown as { env: { PATH: string } }).env.PATH, 'interactiveValue0');
		connection2.dispose();

		registry.clearSavedInputs(StorageScope.WORKSPACE);

		const connection3 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager }) as McpServerConnection;

		assert.ok(connection3);
		assert.strictEqual((connection3.launchDefinition as unknown as { env: { PATH: string } }).env.PATH, 'interactiveValue4');
		connection3.dispose();
	});

	test('resolveConnection uses user-provided launch configuration', async () => {
		// Create a collection with custom launch resolver
		const customCollection: McpCollectionDefinition = {
			...testCollection,
			resolveServerLanch: async (def) => {
				return {
					...(def.launch as McpServerTransportStdio),
					env: { CUSTOM_ENV: 'value' },
				};
			}
		};

		// Create a definition with variable replacement
		const definition: McpServerDefinition = {
			...baseDefinition,
			variableReplacement: {
				section: 'mcp',
				target: ConfigurationTarget.WORKSPACE,
			}
		};

		const delegate = new TestMcpHostDelegate();
		store.add(registry.registerDelegate(delegate));
		testCollection.serverDefinitions.set([definition], undefined);
		store.add(registry.registerCollection(customCollection));

		// Resolve connection should use the custom launch configuration
		const connection = await registry.resolveConnection({
			collectionRef: customCollection,
			definitionRef: definition,
			logger,
			trustNonceBearer,
			taskManager,
		}) as McpServerConnection;

		assert.ok(connection);

		// Verify the launch configuration passed to _replaceVariablesInLaunch was the custom one
		assert.deepStrictEqual((connection.launchDefinition as McpServerTransportStdio).env, { CUSTOM_ENV: 'value' });

		connection.dispose();
	});

	suite('Lazy Collections', () => {
		let lazyCollection: McpCollectionDefinition;
		let normalCollection: McpCollectionDefinition;
		let removedCalled: boolean;

		setup(() => {
			removedCalled = false;
			lazyCollection = {
				...testCollection,
				id: 'lazy-collection',
				lazy: {
					isCached: false,
					load: () => Promise.resolve(),
					removed: () => { removedCalled = true; }
				}
			};
			normalCollection = {
				...testCollection,
				id: 'lazy-collection',
				serverDefinitions: observableValue('serverDefs', [baseDefinition])
			};
		});

		test('registers lazy collection', () => {
			const disposable = registry.registerCollection(lazyCollection);
			store.add(disposable);

			assert.strictEqual(registry.collections.get().length, 1);
			assert.strictEqual(registry.collections.get()[0], lazyCollection);
			assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.HasUnknown);
		});

		test('lazy collection is replaced by normal collection', () => {
			store.add(registry.registerCollection(lazyCollection));
			store.add(registry.registerCollection(normalCollection));

			const collections = registry.collections.get();
			assert.strictEqual(collections.length, 1);
			assert.strictEqual(collections[0], normalCollection);
			assert.strictEqual(collections[0].lazy, undefined);
			assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.AllKnown);
		});

		test('lazyCollectionState updates correctly during loading', async () => {
			lazyCollection = {
				...lazyCollection,
				lazy: {
					...lazyCollection.lazy!,
					load: async () => {
						await timeout(0);
						store.add(registry.registerCollection(normalCollection));
						return Promise.resolve();
					}
				}
			};

			store.add(registry.registerCollection(lazyCollection));
			assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.HasUnknown);

			const loadingPromise = registry.discoverCollections();
			assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.LoadingUnknown);

			await loadingPromise;

			// The collection wasn't replaced, so it should be removed
			assert.strictEqual(registry.collections.get().length, 1);
			assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.AllKnown);
			assert.strictEqual(removedCalled, false);
		});

		test('removed callback is called when lazy collection is not replaced', async () => {
			store.add(registry.registerCollection(lazyCollection));
			await registry.discoverCollections();

			assert.strictEqual(removedCalled, true);
		});

		test('cached lazy collections are tracked correctly', () => {
			lazyCollection.lazy!.isCached = true;
			store.add(registry.registerCollection(lazyCollection));

			assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.AllKnown);

			// Adding an uncached lazy collection changes the state
			const uncachedLazy = {
				...lazyCollection,
				id: 'uncached-lazy',
				lazy: {
					...lazyCollection.lazy!,
					isCached: false
				}
			};
			store.add(registry.registerCollection(uncachedLazy));

			assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.HasUnknown);
		});
	});

	suite('Trust Flow', () => {
		/**
		 * Helper to create a test MCP collection with a specific trust behavior
		 */
		function createTestCollection(trustBehavior: McpServerTrust.Kind.Trusted | McpServerTrust.Kind.TrustedOnNonce, id = 'test-collection'): McpCollectionDefinition & { serverDefinitions: ISettableObservable<McpServerDefinition[]> } {
			return {
				id,
				label: 'Test Collection',
				remoteAuthority: null,
				serverDefinitions: observableValue('serverDefs', []),
				trustBehavior,
				scope: StorageScope.APPLICATION,
				configTarget: ConfigurationTarget.USER,
			};
		}

		/**
		 * Helper to create a test server definition with a specific cache nonce
		 */
		function createTestDefinition(id = 'test-server', cacheNonce = 'nonce-a'): McpServerDefinition {
			return {
				id,
				label: 'Test Server',
				cacheNonce,
				launch: {
					type: McpServerTransportType.Stdio,
					command: 'test-command',
					args: [],
					env: {},
					envFile: undefined,
					cwd: '/test',
				}
			};
		}

		/**
		 * Helper to set up a basic registry with delegate and collection
		 */
		function setupRegistry(trustBehavior: McpServerTrust.Kind.Trusted | McpServerTrust.Kind.TrustedOnNonce = McpServerTrust.Kind.TrustedOnNonce, cacheNonce = 'nonce-a') {
			const delegate = new TestMcpHostDelegate();
			store.add(registry.registerDelegate(delegate));

			const collection = createTestCollection(trustBehavior);
			const definition = createTestDefinition('test-server', cacheNonce);
			collection.serverDefinitions.set([definition], undefined);
			store.add(registry.registerCollection(collection));

			return { collection, definition, delegate };
		}

		test('trusted collection allows connection without prompting', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.Trusted);

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer,
				taskManager,
			});

			assert.ok(connection, 'Connection should be created for trusted collection');
			assert.strictEqual(registry.nextDefinitionIdsToTrust, undefined, 'Trust dialog should not have been called');
			connection!.dispose();
		});

		test('nonce-based trust allows connection when nonce matches', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-a');
			trustNonceBearer.trustedAtNonce = 'nonce-a';

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer,
				taskManager,
			});

			assert.ok(connection, 'Connection should be created when nonce matches');
			assert.strictEqual(registry.nextDefinitionIdsToTrust, undefined, 'Trust dialog should not have been called');
			connection!.dispose();
		});

		test('nonce-based trust prompts when nonce changes', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = 'nonce-a'; // Different nonce
			registry.nextDefinitionIdsToTrust = [definition.id]; // User trusts the server

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer, taskManager,
			});

			assert.ok(connection, 'Connection should be created when user trusts');
			assert.strictEqual(trustNonceBearer.trustedAtNonce, 'nonce-b', 'Nonce should be updated');
			connection!.dispose();
		});

		test('nonce-based trust denies connection when user rejects', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = 'nonce-a'; // Different nonce
			registry.nextDefinitionIdsToTrust = []; // User does not trust the server

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer, taskManager,
			});

			assert.strictEqual(connection, undefined, 'Connection should not be created when user rejects');
			assert.strictEqual(trustNonceBearer.trustedAtNonce, '__vscode_not_trusted', 'Should mark as explicitly not trusted');
		});

		test('autoTrustChanges bypasses prompt when nonce changes', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = 'nonce-a'; // Different nonce

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer,
				autoTrustChanges: true,
				taskManager,
			});

			assert.ok(connection, 'Connection should be created with autoTrustChanges');
			assert.strictEqual(trustNonceBearer.trustedAtNonce, 'nonce-b', 'Nonce should be updated');
			assert.strictEqual(registry.nextDefinitionIdsToTrust, undefined, 'Trust dialog should not have been called');
			connection!.dispose();
		});

		test('promptType "never" skips prompt and fails silently', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = 'nonce-a'; // Different nonce

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer,
				promptType: 'never',
				taskManager,
			});

			assert.strictEqual(connection, undefined, 'Connection should not be created with promptType "never"');
			assert.strictEqual(registry.nextDefinitionIdsToTrust, undefined, 'Trust dialog should not have been called');
		});

		test('promptType "only-new" skips previously untrusted servers', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = '__vscode_not_trusted'; // Previously explicitly denied

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer,
				promptType: 'only-new',
				taskManager,
			});

			assert.strictEqual(connection, undefined, 'Connection should not be created for previously untrusted server');
			assert.strictEqual(registry.nextDefinitionIdsToTrust, undefined, 'Trust dialog should not have been called');
		});

		test('promptType "all-untrusted" prompts for previously untrusted servers', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = '__vscode_not_trusted'; // Previously explicitly denied
			registry.nextDefinitionIdsToTrust = [definition.id]; // User now trusts the server

			const connection = await registry.resolveConnection({
				collectionRef: collection,
				definitionRef: definition,
				logger,
				trustNonceBearer,
				promptType: 'all-untrusted',
				taskManager,
			});

			assert.ok(connection, 'Connection should be created when user trusts previously untrusted server');
			assert.strictEqual(trustNonceBearer.trustedAtNonce, 'nonce-b', 'Nonce should be updated');
			connection!.dispose();
		});

		test('concurrent resolveConnection calls with same interaction are grouped', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = 'nonce-a'; // Different nonce

			// Create a second definition that also needs trust
			const definition2 = createTestDefinition('test-server-2', 'nonce-c');
			collection.serverDefinitions.set([definition, definition2], undefined);

			// Create shared interaction
			const interaction = new McpStartServerInteraction();

			// Manually set participants as mentioned in the requirements
			interaction.participants.set(definition.id, { s: 'unknown' });
			interaction.participants.set(definition2.id, { s: 'unknown' });

			const trustNonceBearer2 = { trustedAtNonce: 'nonce-b' }; // Different nonce for second server

			// Trust both servers
			registry.nextDefinitionIdsToTrust = [definition.id, definition2.id];

			// Start both connections concurrently with the same interaction
			const [connection1, connection2] = await Promise.all([
				registry.resolveConnection({
					collectionRef: collection,
					definitionRef: definition,
					logger,
					trustNonceBearer,
					interaction,
					taskManager,
				}),
				registry.resolveConnection({
					collectionRef: collection,
					definitionRef: definition2,
					logger,
					trustNonceBearer: trustNonceBearer2,
					interaction,
					taskManager,
				})
			]);

			assert.ok(connection1, 'First connection should be created');
			assert.ok(connection2, 'Second connection should be created');
			assert.strictEqual(trustNonceBearer.trustedAtNonce, 'nonce-b', 'First nonce should be updated');
			assert.strictEqual(trustNonceBearer2.trustedAtNonce, 'nonce-c', 'Second nonce should be updated');

			connection1!.dispose();
			connection2!.dispose();
		});

		test('user cancelling trust dialog returns undefined for all pending connections', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = 'nonce-a'; // Different nonce

			// Create a second definition that also needs trust
			const definition2 = createTestDefinition('test-server-2', 'nonce-c');
			collection.serverDefinitions.set([definition, definition2], undefined);

			// Create shared interaction
			const interaction = new McpStartServerInteraction();

			// Manually set participants as mentioned in the requirements
			interaction.participants.set(definition.id, { s: 'unknown' });
			interaction.participants.set(definition2.id, { s: 'unknown' });

			const trustNonceBearer2 = { trustedAtNonce: 'nonce-b' }; // Different nonce for second server

			// User cancels the dialog
			registry.nextDefinitionIdsToTrust = undefined;

			// Start both connections concurrently with the same interaction
			const [connection1, connection2] = await Promise.all([
				registry.resolveConnection({
					collectionRef: collection,
					definitionRef: definition,
					logger,
					trustNonceBearer,
					interaction,
					taskManager,
				}),
				registry.resolveConnection({
					collectionRef: collection,
					definitionRef: definition2,
					logger,
					trustNonceBearer: trustNonceBearer2,
					interaction,
					taskManager,
				})
			]);

			assert.strictEqual(connection1, undefined, 'First connection should not be created when user cancels');
			assert.strictEqual(connection2, undefined, 'Second connection should not be created when user cancels');
		});

		test('partial trust selection in grouped interaction', async () => {
			const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, 'nonce-b');
			trustNonceBearer.trustedAtNonce = 'nonce-a'; // Different nonce

			// Create a second definition that also needs trust
			const definition2 = createTestDefinition('test-server-2', 'nonce-c');
			collection.serverDefinitions.set([definition, definition2], undefined);

			// Create shared interaction
			const interaction = new McpStartServerInteraction();

			// Manually set participants as mentioned in the requirements
			interaction.participants.set(definition.id, { s: 'unknown' });
			interaction.participants.set(definition2.id, { s: 'unknown' });

			const trustNonceBearer2 = { trustedAtNonce: 'nonce-b' }; // Different nonce for second server

			// User trusts only the first server
			registry.nextDefinitionIdsToTrust = [definition.id];

			// Start both connections concurrently with the same interaction
			const [connection1, connection2] = await Promise.all([
				registry.resolveConnection({
					collectionRef: collection,
					definitionRef: definition,
					logger,
					trustNonceBearer,
					interaction,
					taskManager,
				}),
				registry.resolveConnection({
					collectionRef: collection,
					definitionRef: definition2,
					logger,
					trustNonceBearer: trustNonceBearer2,
					interaction,
					taskManager,
				})
			]);

			assert.ok(connection1, 'First connection should be created when trusted');
			assert.strictEqual(connection2, undefined, 'Second connection should not be created when not trusted');
			assert.strictEqual(trustNonceBearer.trustedAtNonce, 'nonce-b', 'First nonce should be updated');
			assert.strictEqual(trustNonceBearer2.trustedAtNonce, '__vscode_not_trusted', 'Second nonce should be marked as not trusted');

			connection1!.dispose();
		});
	});

});
