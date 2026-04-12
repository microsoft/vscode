/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcast } from '../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService, ILogService, NullLogger, NullLogService } from '../../../../../platform/log/common/log.js';
import { mcpAccessConfig } from '../../../../../platform/mcp/common/mcpManagement.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { TestLoggerService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { McpRegistry } from '../../common/mcpRegistry.js';
import { IMcpSandboxService } from '../../common/mcpSandboxService.js';
import { McpTaskManager } from '../../common/mcpTaskManager.js';
import { McpStartServerInteraction } from '../../common/mcpTypes.js';
import { TestMcpMessageTransport } from './mcpRegistryTypes.js';
class TestConfigurationResolverService {
    constructor() {
        this.interactiveCounter = 0;
        // Used to simulate stored/resolved variables
        this.resolvedVariables = new Map();
        // Add some test variables
        this.resolvedVariables.set('workspaceFolder', '/test/workspace');
        this.resolvedVariables.set('fileBasename', 'test.txt');
    }
    resolveAsync(folder, value) {
        const parsed = ConfigurationResolverExpression.parse(value);
        for (const variable of parsed.unresolved()) {
            const resolved = this.resolvedVariables.get(variable.inner);
            if (resolved) {
                parsed.resolve(variable, resolved);
            }
        }
        return Promise.resolve(parsed.toObject());
    }
    resolveWithInteraction(folder, config, section, variables, target) {
        const parsed = ConfigurationResolverExpression.parse(config);
        // For testing, we simulate interaction by returning a map with some variables
        const result = new Map();
        result.set('input:testInteractive', `interactiveValue${this.interactiveCounter++}`);
        result.set('command:testCommand', `commandOutput${this.interactiveCounter++}}`);
        // If variables are provided, include those too
        for (const [k, v] of result.entries()) {
            const replacement = {
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
class TestMcpHostDelegate {
    constructor() {
        this.priority = 0;
    }
    substituteVariables(serverDefinition, launch) {
        return Promise.resolve(launch);
    }
    canStart() {
        return true;
    }
    start() {
        return new TestMcpMessageTransport();
    }
    waitForInitialProviderPromises() {
        return Promise.resolve();
    }
}
class TestDialogService {
    constructor() {
        this._promptResult = true;
        this._promptSpy = sinon.stub();
        this._promptSpy.callsFake(() => {
            return Promise.resolve({ result: this._promptResult });
        });
    }
    setPromptResult(result) {
        this._promptResult = result;
    }
    get promptSpy() {
        return this._promptSpy;
    }
    prompt(options) {
        return this._promptSpy(options);
    }
}
class TestMcpRegistry extends McpRegistry {
    _promptForTrustOpenDialog() {
        return Promise.resolve(this.nextDefinitionIdsToTrust);
    }
}
class TestMcpSandboxService {
    constructor() {
        this.callCount = 0;
        this.enabled = false;
    }
    launchInSandboxIfEnabled(serverDef, launch, remoteAuthority, configTarget) {
        this.callCount++;
        this.lastLaunchCallArgs = { serverDef, launch, remoteAuthority, configTarget };
        if (this.enabled && launch.type === 1 /* McpServerTransportType.Stdio */) {
            return Promise.resolve({
                ...launch,
                command: 'sandboxed-command',
            });
        }
        return Promise.resolve(launch);
    }
    isEnabled(serverDef) {
        return Promise.resolve(this.enabled);
    }
    getSandboxConfigSuggestionMessage(_serverLabel, _potentialBlocks, _existingSandboxConfig) {
        return undefined;
    }
    applySandboxConfigSuggestion(_serverDef, _mcpResource, _configTarget, _potentialBlocks, _suggestedSandboxConfig) {
        return Promise.resolve(false);
    }
}
suite('Workbench - MCP - Registry', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let registry;
    let testStorageService;
    let testConfigResolverService;
    let testDialogService;
    let testCollection;
    let baseDefinition;
    let configurationService;
    let logger;
    let trustNonceBearer;
    let taskManager;
    let testMcpSandboxService;
    setup(() => {
        testConfigResolverService = new TestConfigurationResolverService();
        testStorageService = store.add(new TestStorageService());
        testDialogService = new TestDialogService();
        configurationService = new TestConfigurationService({ [mcpAccessConfig]: "all" /* McpAccessValue.All */ });
        trustNonceBearer = { trustedAtNonce: undefined };
        testMcpSandboxService = new TestMcpSandboxService();
        const services = new ServiceCollection([IConfigurationService, configurationService], [IConfigurationResolverService, testConfigResolverService], [IStorageService, testStorageService], [ISecretStorageService, new TestSecretStorageService()], [ILoggerService, store.add(new TestLoggerService())], [ILogService, store.add(new NullLogService())], [INotificationService, new TestNotificationService()], [IOutputService, upcast({ showChannel: () => { } })], [IDialogService, testDialogService], [IMcpSandboxService, testMcpSandboxService], [IProductService, {}]);
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
            trustBehavior: 0 /* McpServerTrust.Kind.Trusted */,
            scope: -1 /* StorageScope.APPLICATION */,
            configTarget: 2 /* ConfigurationTarget.USER */,
        };
        // Create base definition that can be reused
        baseDefinition = {
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
        configurationService.setUserConfiguration(mcpAccessConfig, "none" /* McpAccessValue.None */);
        configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: () => true,
            affectedKeys: new Set([mcpAccessConfig]),
            change: { keys: [mcpAccessConfig], overrides: [] },
            source: 2 /* ConfigurationTarget.USER */
        });
        assert.strictEqual(registry.collections.get().length, 0);
        configurationService.setUserConfiguration(mcpAccessConfig, "all" /* McpAccessValue.All */);
        configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: () => true,
            affectedKeys: new Set([mcpAccessConfig]),
            change: { keys: [mcpAccessConfig], overrides: [] },
            source: 2 /* ConfigurationTarget.USER */
        });
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
        const definition = {
            ...baseDefinition,
            launch: {
                type: 1 /* McpServerTransportType.Stdio */,
                command: '${workspaceFolder}/cmd',
                args: ['--file', '${fileBasename}'],
                env: {
                    PATH: '${input:testInteractive}'
                },
                envFile: undefined,
                cwd: '/test',
                sandbox: undefined
            },
            variableReplacement: {
                section: 'mcp',
                target: 5 /* ConfigurationTarget.WORKSPACE */,
            }
        };
        const delegate = new TestMcpHostDelegate();
        store.add(registry.registerDelegate(delegate));
        testCollection.serverDefinitions.set([definition], undefined);
        store.add(registry.registerCollection(testCollection));
        const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager });
        assert.ok(connection);
        assert.strictEqual(connection.definition, definition);
        assert.strictEqual(connection.launchDefinition.command, '/test/workspace/cmd');
        assert.strictEqual(connection.launchDefinition.env.PATH, 'interactiveValue0');
        connection.dispose();
        const connection2 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager });
        assert.ok(connection2);
        assert.strictEqual(connection2.launchDefinition.env.PATH, 'interactiveValue0');
        connection2.dispose();
        registry.clearSavedInputs(1 /* StorageScope.WORKSPACE */);
        const connection3 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager });
        assert.ok(connection3);
        assert.strictEqual(connection3.launchDefinition.env.PATH, 'interactiveValue4');
        connection3.dispose();
    });
    test('resolveConnection uses user-provided launch configuration', async () => {
        // Create a collection with custom launch resolver
        const customCollection = {
            ...testCollection,
            resolveServerLanch: async (def) => {
                return {
                    ...def.launch,
                    env: { CUSTOM_ENV: 'value' },
                };
            }
        };
        // Create a definition with variable replacement
        const definition = {
            ...baseDefinition,
            variableReplacement: {
                section: 'mcp',
                target: 5 /* ConfigurationTarget.WORKSPACE */,
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
        });
        assert.ok(connection);
        // Verify the launch configuration passed to _replaceVariablesInLaunch was the custom one
        assert.deepStrictEqual(connection.launchDefinition.env, { CUSTOM_ENV: 'value' });
        connection.dispose();
    });
    test('resolveConnection calls launchInSandboxIfEnabled with expected arguments when sandboxing is enabled', async () => {
        testMcpSandboxService.enabled = true;
        const mcpResource = URI.file('/test/mcp.json');
        const sandboxCollection = {
            ...testCollection,
            id: 'sandbox-collection',
            remoteAuthority: 'ssh-remote+test',
            presentation: {
                origin: mcpResource,
            },
        };
        const definition = {
            ...baseDefinition,
            id: 'sandbox-server',
            launch: {
                type: 1 /* McpServerTransportType.Stdio */,
                command: 'test-command',
                args: ['--flag'],
                env: {},
                envFile: undefined,
                cwd: '/test',
                sandbox: undefined
            },
        };
        const delegate = new TestMcpHostDelegate();
        store.add(registry.registerDelegate(delegate));
        sandboxCollection.serverDefinitions.set([definition], undefined);
        store.add(registry.registerCollection(sandboxCollection));
        const connection = await registry.resolveConnection({
            collectionRef: sandboxCollection,
            definitionRef: definition,
            logger,
            trustNonceBearer,
            taskManager,
        });
        assert.ok(connection);
        assert.strictEqual(testMcpSandboxService.callCount, 1);
        assert.strictEqual(testMcpSandboxService.lastLaunchCallArgs?.serverDef, definition);
        assert.deepStrictEqual(testMcpSandboxService.lastLaunchCallArgs?.launch, definition.launch);
        assert.strictEqual(testMcpSandboxService.lastLaunchCallArgs?.remoteAuthority, 'ssh-remote+test');
        assert.strictEqual(testMcpSandboxService.lastLaunchCallArgs?.configTarget, 2 /* ConfigurationTarget.USER */);
        assert.strictEqual(connection.launchDefinition.command, 'sandboxed-command');
        connection.dispose();
    });
    suite('Lazy Collections', () => {
        let lazyCollection;
        let normalCollection;
        let removedCalled;
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
            assert.strictEqual(registry.lazyCollectionState.get().state, 0 /* LazyCollectionState.HasUnknown */);
        });
        test('lazy collection is replaced by normal collection', () => {
            store.add(registry.registerCollection(lazyCollection));
            store.add(registry.registerCollection(normalCollection));
            const collections = registry.collections.get();
            assert.strictEqual(collections.length, 1);
            assert.strictEqual(collections[0], normalCollection);
            assert.strictEqual(collections[0].lazy, undefined);
            assert.strictEqual(registry.lazyCollectionState.get().state, 2 /* LazyCollectionState.AllKnown */);
        });
        test('lazyCollectionState updates correctly during loading', async () => {
            lazyCollection = {
                ...lazyCollection,
                lazy: {
                    ...lazyCollection.lazy,
                    load: async () => {
                        await timeout(0);
                        store.add(registry.registerCollection(normalCollection));
                        return Promise.resolve();
                    }
                }
            };
            store.add(registry.registerCollection(lazyCollection));
            assert.strictEqual(registry.lazyCollectionState.get().state, 0 /* LazyCollectionState.HasUnknown */);
            const loadingPromise = registry.discoverCollections();
            assert.strictEqual(registry.lazyCollectionState.get().state, 1 /* LazyCollectionState.LoadingUnknown */);
            await loadingPromise;
            // The collection wasn't replaced, so it should be removed
            assert.strictEqual(registry.collections.get().length, 1);
            assert.strictEqual(registry.lazyCollectionState.get().state, 2 /* LazyCollectionState.AllKnown */);
            assert.strictEqual(removedCalled, false);
        });
        test('removed callback is called when lazy collection is not replaced', async () => {
            store.add(registry.registerCollection(lazyCollection));
            await registry.discoverCollections();
            assert.strictEqual(removedCalled, true);
        });
        test('cached lazy collections are tracked correctly', () => {
            lazyCollection.lazy.isCached = true;
            store.add(registry.registerCollection(lazyCollection));
            assert.strictEqual(registry.lazyCollectionState.get().state, 2 /* LazyCollectionState.AllKnown */);
            // Adding an uncached lazy collection changes the state
            const uncachedLazy = {
                ...lazyCollection,
                id: 'uncached-lazy',
                lazy: {
                    ...lazyCollection.lazy,
                    isCached: false
                }
            };
            store.add(registry.registerCollection(uncachedLazy));
            assert.strictEqual(registry.lazyCollectionState.get().state, 0 /* LazyCollectionState.HasUnknown */);
        });
    });
    suite('Duplicate Collection Prevention', () => {
        test('prevents duplicate non-lazy collections with same ID', () => {
            const collection1 = {
                ...testCollection,
                id: 'duplicate-test',
                label: 'Collection 1',
            };
            const collection2 = {
                ...testCollection,
                id: 'duplicate-test',
                label: 'Collection 2',
            };
            store.add(registry.registerCollection(collection1));
            const disposable2 = registry.registerCollection(collection2);
            // Second registration should return Disposable.None and not add duplicate
            assert.strictEqual(disposable2, Disposable.None);
            assert.strictEqual(registry.collections.get().length, 1);
            assert.strictEqual(registry.collections.get()[0], collection1);
            assert.strictEqual(registry.collections.get()[0].label, 'Collection 1');
        });
        test('allows lazy collection to be replaced by non-lazy with same ID', () => {
            const lazyCollection = {
                ...testCollection,
                id: 'replaceable-test',
                label: 'Lazy Collection',
                lazy: {
                    isCached: false,
                    load: () => Promise.resolve(),
                }
            };
            const nonLazyCollection = {
                ...testCollection,
                id: 'replaceable-test',
                label: 'Non-Lazy Collection',
            };
            store.add(registry.registerCollection(lazyCollection));
            const disposable2 = store.add(registry.registerCollection(nonLazyCollection));
            // Should replace lazy with non-lazy
            assert.notStrictEqual(disposable2, Disposable.None);
            assert.strictEqual(registry.collections.get().length, 1);
            assert.strictEqual(registry.collections.get()[0], nonLazyCollection);
            assert.strictEqual(registry.collections.get()[0].label, 'Non-Lazy Collection');
            assert.strictEqual(registry.collections.get()[0].lazy, undefined);
        });
        test('prevents lazy collection from duplicating existing non-lazy collection', () => {
            const nonLazyCollection = {
                ...testCollection,
                id: 'protected-test',
                label: 'Non-Lazy Collection',
            };
            const lazyCollection = {
                ...testCollection,
                id: 'protected-test',
                label: 'Lazy Collection',
                lazy: {
                    isCached: false,
                    load: () => Promise.resolve(),
                }
            };
            store.add(registry.registerCollection(nonLazyCollection));
            const disposable2 = registry.registerCollection(lazyCollection);
            // Lazy collection should not replace or duplicate non-lazy
            assert.strictEqual(disposable2, Disposable.None);
            assert.strictEqual(registry.collections.get().length, 1);
            assert.strictEqual(registry.collections.get()[0], nonLazyCollection);
            assert.strictEqual(registry.collections.get()[0].label, 'Non-Lazy Collection');
        });
        test('allows different collection IDs to coexist', () => {
            const collection1 = {
                ...testCollection,
                id: 'collection-1',
                label: 'Collection 1',
            };
            const collection2 = {
                ...testCollection,
                id: 'collection-2',
                label: 'Collection 2',
            };
            store.add(registry.registerCollection(collection1));
            store.add(registry.registerCollection(collection2));
            // Both should be registered since they have different IDs
            assert.strictEqual(registry.collections.get().length, 2);
            assert.ok(registry.collections.get().some(c => c.id === 'collection-1'));
            assert.ok(registry.collections.get().some(c => c.id === 'collection-2'));
        });
        test('disposal of duplicate-preventing registration does not affect original', () => {
            const collection1 = {
                ...testCollection,
                id: 'disposal-test',
                label: 'Original Collection',
            };
            const collection2 = {
                ...testCollection,
                id: 'disposal-test',
                label: 'Duplicate Attempt',
            };
            const disposable1 = store.add(registry.registerCollection(collection1));
            const disposable2 = registry.registerCollection(collection2);
            assert.strictEqual(disposable2, Disposable.None);
            // Disposing the Disposable.None should do nothing
            disposable2.dispose();
            assert.strictEqual(registry.collections.get().length, 1);
            assert.strictEqual(registry.collections.get()[0], collection1);
            // Disposing the original should remove it
            disposable1.dispose();
            assert.strictEqual(registry.collections.get().length, 0);
        });
        test('simulates extension host restart scenario with when clause', async () => {
            // Simulates the bug: ExtensionMcpDiscovery registers lazy collection,
            // then MainThreadMcp tries to register non-lazy version on ext host restart
            // Step 1: ExtensionMcpDiscovery registers cached lazy collection
            const lazyCollection = {
                ...testCollection,
                id: 'ext-restart-test',
                label: 'Cached Lazy Collection',
                lazy: {
                    isCached: true,
                    load: () => Promise.resolve(),
                }
            };
            store.add(registry.registerCollection(lazyCollection));
            assert.strictEqual(registry.collections.get().length, 1);
            // Step 2: Extension activates, MainThreadMcp.$upsertMcpCollection called
            // This replaces lazy with non-lazy (normal flow)
            const nonLazyFromExtension = {
                ...testCollection,
                id: 'ext-restart-test',
                label: 'Extension-Provided Collection',
            };
            store.add(registry.registerCollection(nonLazyFromExtension));
            assert.strictEqual(registry.collections.get().length, 1);
            assert.strictEqual(registry.collections.get()[0].lazy, undefined);
            // Step 3: Extension host restarts, MainThreadMcp disposed
            // ExtensionMcpDiscovery's context listener fires again and tries to re-register
            // This should NOT create a duplicate
            const duplicateAttempt = {
                ...testCollection,
                id: 'ext-restart-test',
                label: 'Should Not Duplicate',
            };
            const disposable = registry.registerCollection(duplicateAttempt);
            assert.strictEqual(disposable, Disposable.None);
            assert.strictEqual(registry.collections.get().length, 1);
            assert.strictEqual(registry.collections.get()[0], nonLazyFromExtension);
        });
    });
    suite('Trust Flow', () => {
        /**
         * Helper to create a test MCP collection with a specific trust behavior
         */
        function createTestCollection(trustBehavior, id = 'test-collection') {
            return {
                id,
                label: 'Test Collection',
                remoteAuthority: null,
                serverDefinitions: observableValue('serverDefs', []),
                trustBehavior,
                scope: -1 /* StorageScope.APPLICATION */,
                configTarget: 2 /* ConfigurationTarget.USER */,
            };
        }
        /**
         * Helper to create a test server definition with a specific cache nonce
         */
        function createTestDefinition(id = 'test-server', cacheNonce = 'nonce-a') {
            return {
                id,
                label: 'Test Server',
                cacheNonce,
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
        }
        /**
         * Helper to set up a basic registry with delegate and collection
         */
        function setupRegistry(trustBehavior = 1 /* McpServerTrust.Kind.TrustedOnNonce */, cacheNonce = 'nonce-a') {
            const delegate = new TestMcpHostDelegate();
            store.add(registry.registerDelegate(delegate));
            const collection = createTestCollection(trustBehavior);
            const definition = createTestDefinition('test-server', cacheNonce);
            collection.serverDefinitions.set([definition], undefined);
            store.add(registry.registerCollection(collection));
            return { collection, definition, delegate };
        }
        test('trusted collection allows connection without prompting', async () => {
            const { collection, definition } = setupRegistry(0 /* McpServerTrust.Kind.Trusted */);
            const connection = await registry.resolveConnection({
                collectionRef: collection,
                definitionRef: definition,
                logger,
                trustNonceBearer,
                taskManager,
            });
            assert.ok(connection, 'Connection should be created for trusted collection');
            assert.strictEqual(registry.nextDefinitionIdsToTrust, undefined, 'Trust dialog should not have been called');
            connection.dispose();
        });
        test('nonce-based trust allows connection when nonce matches', async () => {
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-a');
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
            connection.dispose();
        });
        test('nonce-based trust prompts when nonce changes', async () => {
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            connection.dispose();
        });
        test('nonce-based trust denies connection when user rejects', async () => {
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            connection.dispose();
        });
        test('promptType "never" skips prompt and fails silently', async () => {
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            connection.dispose();
        });
        test('concurrent resolveConnection calls with same interaction are grouped', async () => {
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            connection1.dispose();
            connection2.dispose();
        });
        test('user cancelling trust dialog returns undefined for all pending connections', async () => {
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            const { collection, definition } = setupRegistry(1 /* McpServerTrust.Kind.TrustedOnNonce */, 'nonce-b');
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
            connection1.dispose();
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVnaXN0cnkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC90ZXN0L2NvbW1vbi9tY3BSZWdpc3RyeS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUF1QixlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBa0QscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0SixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsY0FBYyxFQUFXLE1BQU0sbURBQW1ELENBQUM7QUFDNUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFXLGNBQWMsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzdILE9BQU8sRUFBRSxlQUFlLEVBQWtCLE1BQU0scURBQXFELENBQUM7QUFFdEcsT0FBTyxFQUFFLG9CQUFv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