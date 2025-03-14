/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionService, IExtensionsStatus, NullExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestContextService, TestLoggerService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ILanguageModelToolsService } from '../../../chat/common/languageModelToolsService.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpService } from '../../common/mcpService.js';
import { McpCollectionSortOrder } from '../../common/mcpTypes.js';

class TestExtensionService extends NullExtensionService {
	private readonly store = new DisposableStore();

	public extensionStatuses = new Map<string, { activationTimes?: object }>();
	public firedActivationEvents = new Set<string>();

	public onDidChangeExtensionsEmitter = this.store.add(new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>());
	public override onDidChangeExtensions = this.onDidChangeExtensionsEmitter.event;

	public onDidChangeExtensionStatusEmitter = this.store.add(new Emitter<any>());
	public override onDidChangeExtensionsStatus = this.onDidChangeExtensionStatusEmitter.event;

	override getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		const result: { [id: string]: IExtensionsStatus } = {};
		this.extensionStatuses.forEach((status, id) => {
			result[id] = status as Partial<IExtensionsStatus> as IExtensionsStatus;
		});
		return result;
	}

	override activateByEvent(activationEvent: string): Promise<void> {
		this.firedActivationEvents.add(activationEvent);
		return Promise.resolve();
	}

	dispose() {
		this.store.dispose();
	}
}

class TestMcpService extends McpService {
	public get internalUserCache() {
		return this.userCache;
	}

	public get internalExtensionServers() {
		return this._extensionServers;
	}
}

suite('Workbench - MCP - Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockExtensionService: TestExtensionService;
	let mockMcpRegistry: Partial<IMcpRegistry>;
	let mockLanguageModelToolsService: Partial<ILanguageModelToolsService>;
	let testStorageService: TestStorageService;
	let mcpService: TestMcpService;

	// Utility function to create a mock extension
	const createExtension = (id: string, collections?: Array<{ id: string; label: string }>) => {
		return {
			identifier: new ExtensionIdentifier(id),
			contributes: collections ? {
				modelContextServerCollections: collections
			} : undefined
		};
	};

	setup(() => {
		// Mock extension service
		mockExtensionService = store.add(new TestExtensionService());

		// Mock MCP registry
		mockMcpRegistry = {
			collections: observableValue('collections', [])
		};

		// Mock language model tools service
		mockLanguageModelToolsService = {
			registerToolData: () => ({ dispose: () => { } }),
			registerToolImplementation: () => ({ dispose: () => { } })
		};

		// Create test storage service
		testStorageService = store.add(new TestStorageService());

		// Create service collection
		const services = new ServiceCollection(
			[IExtensionService, mockExtensionService],
			[IMcpRegistry, mockMcpRegistry],
			[ILanguageModelToolsService, mockLanguageModelToolsService],
			[IContextKeyService, new MockContextKeyService()],
			[IStorageService, testStorageService],
			[ILoggerService, store.add(new TestLoggerService())],
			[IProductService, { nameShort: 'VSCode Test' } as IProductService],
			[IWorkspaceContextService, new TestContextService()]
		);

		// Create instantiation service
		instantiationService = store.add(new TestInstantiationService(services));

		// Create McpService instance
		mcpService = instantiationService.createInstance(TestMcpService);
		store.add(mcpService);
	});

	test('should initialize with no servers', () => {
		assert.strictEqual(mcpService.servers.get().length, 0);
	});

	test('should have extension servers when extensions with collections are loaded', async () => {
		// Create a test extension with MCP collections
		const ext1 = createExtension('ext1', [
			{ id: 'collection1', label: 'Collection 1' }
		]);

		// Set cached servers for this collection
		mcpService.internalUserCache.storeServers('collection1', {
			servers: [{
				id: 'server1',
				label: 'Server 1',
				launch: { type: 1, command: 'test', args: [], env: {}, cwd: undefined }
			}]
		});

		// Trigger extension loaded
		mockExtensionService.onDidChangeExtensionsEmitter.fire({ added: [ext1 as any], removed: [] });

		// Should have one server in the servers list
		assert.strictEqual(mcpService.servers.get().length, 1);
		assert.strictEqual(mcpService.servers.get()[0].definition.id, 'server1');

		// Should be loaded from cache but not activated yet
		assert.strictEqual(mcpService.internalExtensionServers.get().length, 1);
		assert.strictEqual(mcpService.internalExtensionServers.get()[0].collectionId, 'collection1');
		assert.strictEqual(mcpService.internalExtensionServers.get()[0].pendingServers?.length, 1);
	});

	test('should remove pending servers once extension is activated', async () => {
		// Create a test extension with MCP collections
		const ext1 = createExtension('ext1', [
			{ id: 'collection1', label: 'Collection 1' }
		]);

		// Set cached servers for this collection
		mcpService.internalUserCache.storeServers('collection1', {
			servers: [{
				id: 'server1',
				label: 'Server 1',
				launch: { type: 1, command: 'test', args: [], env: {}, cwd: undefined }
			}]
		});

		// Add the extension
		mockExtensionService.onDidChangeExtensionsEmitter.fire({ added: [ext1 as any], removed: [] });

		// Should have one server in the servers list (from cache)
		assert.strictEqual(mcpService.servers.get().length, 1);
		assert.strictEqual(mcpService.internalExtensionServers.get().length, 1);
		assert.strictEqual(mcpService.internalExtensionServers.get()[0].pendingServers?.length, 1);

		// Now simulate extension activation (but it doesn't register the server)
		mockExtensionService.extensionStatuses.set('ext1', { activationTimes: {} });
		mockExtensionService.onDidChangeExtensionStatusEmitter.fire(undefined);

		// The server should be removed since it wasn't registered by the extension
		assert.strictEqual(mcpService.servers.get().length, 0);
		assert.strictEqual(mcpService.internalExtensionServers.get().length, 0);
	});

	test('should keep servers that are registered by activated extension', async () => {
		// Create a test extension with MCP collections
		const ext1 = createExtension('ext1', [
			{ id: 'collection1', label: 'Collection 1' }
		]);

		// Set cached servers for this collection
		mcpService.internalUserCache.storeServers('collection1', {
			servers: [{
				id: 'server1',
				label: 'Server 1',
				launch: { type: 1, command: 'test', args: [], env: {}, cwd: undefined }
			}]
		});

		// Add the extension
		mockExtensionService.onDidChangeExtensionsEmitter.fire({ added: [ext1 as any], removed: [] });


		// Register a collection with the same server id through the registry
		const mockCollection = {
			id: 'collection1',
			label: 'Collection 1',
			remoteAuthority: null,
			serverDefinitions: observableValue('serverDefs', [{
				id: 'server1',
				label: 'Server 1',
				launch: { type: 1, command: 'test', args: [], env: {}, cwd: undefined }
			}]),
			isTrustedByDefault: true,
			scope: StorageScope.APPLICATION,
			presentation: { order: McpCollectionSortOrder.Extension }
		};

		(mockMcpRegistry!.collections as ISettableObservable<any>).set([mockCollection], undefined);

		// Now simulate extension activation
		mockExtensionService.extensionStatuses.set('ext1', { activationTimes: {} });
		mockExtensionService.onDidChangeExtensionStatusEmitter.fire(undefined);

		// The server should still be there since it was registered
		assert.strictEqual(mcpService.servers.get().length, 1);
		assert.strictEqual(mcpService.internalExtensionServers.get().length, 0); // But removed from extension servers
	});

	test('activateExtensionServers should activate all extension events', async () => {
		// Create extensions with MCP collections
		const ext1 = createExtension('ext1', [{ id: 'collection1', label: 'Collection 1' }]);
		const ext2 = createExtension('ext2', [{ id: 'collection2', label: 'Collection 2' }]);

		// Add the extensions
		mockExtensionService.onDidChangeExtensionsEmitter.fire({ added: [ext1 as any, ext2 as any], removed: [] });

		// Verify activation events aren't done yet
		assert.strictEqual(mockExtensionService.firedActivationEvents.has('onMcpCollection:collection1'), false);
		assert.strictEqual(mockExtensionService.firedActivationEvents.has('onMcpCollection:collection2'), false);

		// Call activateExtensionServers
		await mcpService.activateExtensionServers();

		// Verify activation events were triggered
		assert.strictEqual(mockExtensionService.firedActivationEvents.has('onMcpCollection:collection1'), true);
		assert.strictEqual(mockExtensionService.firedActivationEvents.has('onMcpCollection:collection2'), true);
	});

	test('hasExtensionsWithUnknownServers should be true when extensions have unactivated servers', () => {
		// Initially should be false
		assert.strictEqual(mcpService.hasExtensionsWithUnknownServers.get(), false);

		// Create a test extension with MCP collections
		const ext1 = createExtension('ext1', [
			{ id: 'collection1', label: 'Collection 1' }
		]);

		// Add the extension
		mockExtensionService.onDidChangeExtensionsEmitter.fire({ added: [ext1 as any], removed: [] });

		// Should be true now
		assert.strictEqual(mcpService.hasExtensionsWithUnknownServers.get(), true);

		// Activate the extension
		mockExtensionService.extensionStatuses.set('ext1', { activationTimes: {} });
		mockExtensionService.onDidChangeExtensionStatusEmitter.fire(undefined);

		// Should be false again
		assert.strictEqual(mcpService.hasExtensionsWithUnknownServers.get(), false);
	});
});
