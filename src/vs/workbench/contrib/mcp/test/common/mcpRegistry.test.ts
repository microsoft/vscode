/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcast } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogger, ILoggerService, NullLogger } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { TestLoggerService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { McpRegistry } from '../../common/mcpRegistry.js';
import { IMcpHostDelegate, IMcpMessageTransport } from '../../common/mcpRegistryTypes.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { LazyCollectionState, McpCollectionDefinition, McpCollectionReference, McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';
import { TestMcpMessageTransport } from './mcpRegistryTypes.js';
import { ConfigurationResolverExpression } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';

class TestConfigurationResolverService implements Partial<IConfigurationResolverService> {
	declare readonly _serviceBrand: undefined;

	private interactiveCounter = 0;

	// Used to simulate stored/resolved variables
	private readonly resolvedVariables = new Map<string, string>();

	constructor() {
		// Add some test variables
		this.resolvedVariables.set('workspaceFolder', '/test/workspace');
		this.resolvedVariables.set('fileBasename', 'test.txt');
	}

	resolveAsync(folder: any, value: any): Promise<any> {
		const parsed = ConfigurationResolverExpression.parse(value);
		for (const variable of parsed.unresolved()) {
			const resolved = this.resolvedVariables.get(variable.inner);
			if (resolved) {
				parsed.resolve(variable, resolved);
			}
		}

		return Promise.resolve(parsed.toObject());
	}

	resolveWithInteraction(folder: any, config: any, section?: string, variables?: Record<string, string>, target?: ConfigurationTarget): Promise<Map<string, string> | undefined> {
		const parsed = ConfigurationResolverExpression.parse(config);
		// For testing, we simulate interaction by returning a map with some variables
		const result = new Map<string, string>();
		result.set('input:testInteractive', `interactiveValue${this.interactiveCounter++}`);
		result.set('command:testCommand', `commandOutput${this.interactiveCounter++}}`);

		// If variables are provided, include those too
		for (const [k, v] of result.entries()) {
			parsed.resolve({ id: '${' + k + '}' } as any, v);
		}

		return Promise.resolve(result);
	}
}

class TestMcpHostDelegate implements IMcpHostDelegate {
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

class TestDialogService implements Partial<IDialogService> {
	declare readonly _serviceBrand: undefined;

	private _promptResult: boolean | undefined;
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

	prompt(options: any): Promise<any> {
		return this._promptSpy(options);
	}
}

suite('Workbench - MCP - Registry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let registry: McpRegistry;
	let testStorageService: TestStorageService;
	let testConfigResolverService: TestConfigurationResolverService;
	let testDialogService: TestDialogService;
	let testCollection: McpCollectionDefinition & { serverDefinitions: ISettableObservable<McpServerDefinition[]> };
	let baseDefinition: McpServerDefinition;
	let logger: ILogger;

	setup(() => {
		testConfigResolverService = new TestConfigurationResolverService();
		testStorageService = store.add(new TestStorageService());
		testDialogService = new TestDialogService();

		const services = new ServiceCollection(
			[IConfigurationResolverService, testConfigResolverService],
			[IStorageService, testStorageService],
			[ISecretStorageService, new TestSecretStorageService()],
			[ILoggerService, store.add(new TestLoggerService())],
			[IOutputService, upcast({ showChannel: () => { } })],
			[IDialogService, testDialogService],
			[IProductService, {}],
		);

		logger = new NullLogger();

		const instaService = store.add(new TestInstantiationService(services));
		registry = store.add(instaService.createInstance(McpRegistry));

		// Create test collection that can be reused
		testCollection = {
			id: 'test-collection',
			label: 'Test Collection',
			remoteAuthority: null,
			serverDefinitions: observableValue('serverDefs', []),
			isTrustedByDefault: true,
			scope: StorageScope.APPLICATION
		};

		// Create base definition that can be reused
		baseDefinition = {
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

	test('registerCollection adds collection to registry', () => {
		const disposable = registry.registerCollection(testCollection);
		store.add(disposable);

		assert.strictEqual(registry.collections.get().length, 1);
		assert.strictEqual(registry.collections.get()[0], testCollection);

		disposable.dispose();
		assert.strictEqual(registry.collections.get().length, 0);
	});

	test('registerDelegate adds delegate to registry', () => {
		const delegate = new TestMcpHostDelegate();
		const disposable = registry.registerDelegate(delegate);
		store.add(disposable);

		assert.strictEqual(registry.delegates.length, 1);
		assert.strictEqual(registry.delegates[0], delegate);

		disposable.dispose();
		assert.strictEqual(registry.delegates.length, 0);
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
				cwd: URI.parse('file:///test')
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

		const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger }) as McpServerConnection;

		assert.ok(connection);
		assert.strictEqual(connection.definition, definition);
		assert.strictEqual((connection.launchDefinition as any).command, '/test/workspace/cmd');
		assert.strictEqual((connection.launchDefinition as any).env.PATH, 'interactiveValue0');
		connection.dispose();

		const connection2 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger }) as McpServerConnection;

		assert.ok(connection2);
		assert.strictEqual((connection2.launchDefinition as any).env.PATH, 'interactiveValue0');
		connection2.dispose();

		registry.clearSavedInputs(StorageScope.WORKSPACE);

		const connection3 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger }) as McpServerConnection;

		assert.ok(connection3);
		assert.strictEqual((connection3.launchDefinition as any).env.PATH, 'interactiveValue4');
		connection3.dispose();
	});

	suite('Trust Management', () => {
		setup(() => {
			const delegate = new TestMcpHostDelegate();
			store.add(registry.registerDelegate(delegate));
		});

		test('resolveConnection connects to server when trusted by default', async () => {
			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(testCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger });

			assert.ok(connection);
			assert.strictEqual(testDialogService.promptSpy.called, false);
			connection?.dispose();
		});

		test('resolveConnection prompts for confirmation when not trusted by default', async () => {
			const untrustedCollection: McpCollectionDefinition = {
				...testCollection,
				isTrustedByDefault: false
			};

			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(untrustedCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			testDialogService.setPromptResult(true);

			const connection = await registry.resolveConnection({
				logger,
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.ok(connection);
			assert.strictEqual(testDialogService.promptSpy.called, true);
			connection?.dispose();

			testDialogService.promptSpy.resetHistory();
			const connection2 = await registry.resolveConnection({
				logger,
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.ok(connection2);
			assert.strictEqual(testDialogService.promptSpy.called, false);
			connection2?.dispose();
		});

		test('resolveConnection returns undefined when user does not trust the server', async () => {
			const untrustedCollection: McpCollectionDefinition = {
				...testCollection,
				isTrustedByDefault: false
			};

			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(untrustedCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			testDialogService.setPromptResult(false);

			const connection = await registry.resolveConnection({
				logger,
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.strictEqual(connection, undefined);
			assert.strictEqual(testDialogService.promptSpy.called, true);

			testDialogService.promptSpy.resetHistory();
			const connection2 = await registry.resolveConnection({
				logger,
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.strictEqual(connection2, undefined);
			assert.strictEqual(testDialogService.promptSpy.called, false);
		});

		test('resolveConnection honors forceTrust parameter', async () => {
			const untrustedCollection: McpCollectionDefinition = {
				...testCollection,
				isTrustedByDefault: false
			};

			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(untrustedCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			testDialogService.setPromptResult(false);

			const connection1 = await registry.resolveConnection({
				logger,
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.strictEqual(connection1, undefined);

			testDialogService.promptSpy.resetHistory();
			testDialogService.setPromptResult(true);

			const connection2 = await registry.resolveConnection({
				logger,
				collectionRef: untrustedCollection,
				definitionRef: definition,
				forceTrust: true
			});

			assert.ok(connection2);
			assert.strictEqual(testDialogService.promptSpy.called, true);
			connection2?.dispose();

			testDialogService.promptSpy.resetHistory();
			const connection3 = await registry.resolveConnection({
				logger,
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.ok(connection3);
			assert.strictEqual(testDialogService.promptSpy.called, false);
			connection3?.dispose();
		});
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
			assert.strictEqual(registry.lazyCollectionState.get(), LazyCollectionState.HasUnknown);
		});

		test('lazy collection is replaced by normal collection', () => {
			store.add(registry.registerCollection(lazyCollection));
			store.add(registry.registerCollection(normalCollection));

			const collections = registry.collections.get();
			assert.strictEqual(collections.length, 1);
			assert.strictEqual(collections[0], normalCollection);
			assert.strictEqual(collections[0].lazy, undefined);
			assert.strictEqual(registry.lazyCollectionState.get(), LazyCollectionState.AllKnown);
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
			assert.strictEqual(registry.lazyCollectionState.get(), LazyCollectionState.HasUnknown);

			const loadingPromise = registry.discoverCollections();
			assert.strictEqual(registry.lazyCollectionState.get(), LazyCollectionState.LoadingUnknown);

			await loadingPromise;

			// The collection wasn't replaced, so it should be removed
			assert.strictEqual(registry.collections.get().length, 1);
			assert.strictEqual(registry.lazyCollectionState.get(), LazyCollectionState.AllKnown);
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

			assert.strictEqual(registry.lazyCollectionState.get(), LazyCollectionState.AllKnown);

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

			assert.strictEqual(registry.lazyCollectionState.get(), LazyCollectionState.HasUnknown);
		});
	});

	suite('Collection Tool Prefixes', () => {
		test('assigns unique prefixes to collections', () => {
			const collection1: McpCollectionDefinition = {
				id: 'collection1',
				label: 'Collection 1',
				remoteAuthority: null,
				serverDefinitions: observableValue('serverDefs', []),
				isTrustedByDefault: true,
				scope: StorageScope.APPLICATION
			};

			const collection2: McpCollectionDefinition = {
				id: 'collection2',
				label: 'Collection 2',
				remoteAuthority: null,
				serverDefinitions: observableValue('serverDefs', []),
				isTrustedByDefault: true,
				scope: StorageScope.APPLICATION
			};

			store.add(registry.registerCollection(collection1));
			store.add(registry.registerCollection(collection2));

			const prefix1 = registry.collectionToolPrefix(collection1).get();
			const prefix2 = registry.collectionToolPrefix(collection2).get();

			assert.notStrictEqual(prefix1, prefix2);
			assert.ok(/^[a-f0-9]{3}\.$/.test(prefix1));
			assert.ok(/^[a-f0-9]{3}\.$/.test(prefix2));
		});

		test('handles hash collisions by incrementing view', () => {
			// These strings are known to have SHA1 hash collisions in their first 3 characters
			const collection1: McpCollectionDefinition = {
				id: 'potato',
				label: 'Collection 1',
				remoteAuthority: null,
				serverDefinitions: observableValue('serverDefs', []),
				isTrustedByDefault: true,
				scope: StorageScope.APPLICATION
			};

			const collection2: McpCollectionDefinition = {
				id: 'candidate_83048',
				label: 'Collection 2',
				remoteAuthority: null,
				serverDefinitions: observableValue('serverDefs', []),
				isTrustedByDefault: true,
				scope: StorageScope.APPLICATION
			};

			store.add(registry.registerCollection(collection1));
			store.add(registry.registerCollection(collection2));

			const prefix1 = registry.collectionToolPrefix(collection1).get();
			const prefix2 = registry.collectionToolPrefix(collection2).get();

			assert.notStrictEqual(prefix1, prefix2);
			assert.ok(/^[a-f0-9]{3}\.$/.test(prefix1));
			assert.ok(/^[a-f0-9]{3}\.$/.test(prefix2));
		});

		test('prefix changes when collections change', () => {
			const collection1: McpCollectionDefinition = {
				id: 'collection1',
				label: 'Collection 1',
				remoteAuthority: null,
				serverDefinitions: observableValue('serverDefs', []),
				isTrustedByDefault: true,
				scope: StorageScope.APPLICATION
			};

			const disposable = registry.registerCollection(collection1);
			store.add(disposable);

			const prefix1 = registry.collectionToolPrefix(collection1).get();
			assert.ok(!!prefix1);

			disposable.dispose();

			const prefix2 = registry.collectionToolPrefix(collection1).get();

			assert.strictEqual(prefix2, '');
		});

		test('prefix is empty for unknown collections', () => {
			const unknownCollection: McpCollectionReference = {
				id: 'unknown',
				label: 'Unknown'
			};

			const prefix = registry.collectionToolPrefix(unknownCollection).get();
			assert.strictEqual(prefix, '');
		});
	});
});
