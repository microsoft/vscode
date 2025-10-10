/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestStorageService, TestExtensionService } from '../../../../../test/common/workbenchTestServices.js';
import { ExtensionMcpDiscovery } from '../../../common/discovery/extensionMcpDiscovery.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMcpRegistry } from '../../../common/mcpRegistryTypes.js';
import { TestMcpRegistry } from '../mcpRegistryTypes.js';
import { ExtensionMessageCollector, ExtensionPointUserDelta, IExtensionPointUser } from '../../../../../services/extensions/common/extensionsRegistry.js';
import { IMcpCollectionContribution, IExtensionDescription, ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';

// #region Test Helper Classes

/**
 * Testable version of ExtensionMcpDiscovery that exposes protected methods
 */
class TestableExtensionMcpDiscovery extends ExtensionMcpDiscovery {

	public handleExtensionChangeTest(
		extensions: readonly IExtensionPointUser<IMcpCollectionContribution[]>[],
		delta: ExtensionPointUserDelta<IMcpCollectionContribution[]>
	): void {
		super.handleExtensionChange(extensions, delta);
	}

}

/**
 * Test implementation of IContextKeyService for MCP discovery tests
 * Provides configurable context matching for testing conditional collections
 */
class TestContextKeyService extends MockContextKeyService {
	private _contextMatchesRules: boolean = true;

	public override contextMatchesRules(): boolean {
		return this._contextMatchesRules;
	}

	public override get onDidChangeContext() {
		return Event.None;
	}

	public setContextMatchesRules(value: boolean): void {
		this._contextMatchesRules = value;
	}

	public override dispose(): void {
		// Test implementation - no cleanup needed
	}
}

// #endregion


/**
 * Test suite for ExtensionMcpDiscovery
 *
 * This class manages the discovery and registration of MCP (Model Context Protocol)
 * collections from VS Code extensions. It handles:
 * - Extension point registration and validation
 * - Collection registration with conditional support ("when" clauses)
 * - Caching of server definitions
 * - Extension lifecycle (add/remove)
 */
suite('ExtensionMcpDiscovery', () => {
	// #region Test State
	interface TestFixture {
		extensionMcpDiscovery: TestableExtensionMcpDiscovery;
		storageService: TestStorageService;
		extensionService: TestExtensionService;
		contextKeyService: TestContextKeyService;
		mcpRegistry: TestMcpRegistry;
	}

	let fixture: TestFixture;
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	// #endregion

	// #region Helper Methods
	/**
	 * Creates a fresh ExtensionMcpDiscovery instance with new services
	 * Useful for testing constructor behavior in isolation
	 */
	function createDiscoveryInstance(): ExtensionMcpDiscovery {
		const services = new ServiceCollection(
			[IStorageService, fixture.storageService],
			[IExtensionService, fixture.extensionService],
			[IContextKeyService, fixture.contextKeyService]
		);
		const serviceInstantiation = store.add(new TestInstantiationService(services));
		const registry = new TestMcpRegistry(serviceInstantiation);
		const instance = store.add(serviceInstantiation.createChild(new ServiceCollection([IMcpRegistry, registry])));
		return store.add(instance.createInstance(ExtensionMcpDiscovery));
	}

	/**
	 * Sets up the test fixture with all required services
	 */
	function setupTestFixture(): TestFixture {
		const storageService = store.add(new TestStorageService());
		const extensionService = new TestExtensionService();
		const contextKeyService = new TestContextKeyService();

		const services = new ServiceCollection(
			[IStorageService, storageService],
			[IExtensionService, extensionService],
			[IContextKeyService, contextKeyService]
		);
		const serviceInstantiation = store.add(new TestInstantiationService(services));
		const mcpRegistry = new TestMcpRegistry(serviceInstantiation);

		const instance = store.add(serviceInstantiation.createChild(new ServiceCollection([IMcpRegistry, mcpRegistry])));
		const extensionMcpDiscovery = store.add(instance.createInstance(TestableExtensionMcpDiscovery));

		return {
			extensionMcpDiscovery,
			storageService,
			extensionService,
			contextKeyService,
			mcpRegistry
		};
	}
	// #endregion

	// #region Test Setup/Teardown
	setup(() => {
		fixture = setupTestFixture();
	});

	teardown(() => {
		sinon.restore();
	});
	// #endregion

	// #region Basic Functionality Tests
	suite('Basic Functionality', () => {
		test('should start without throwing errors', () => {
			assert.doesNotThrow(() => {
				fixture.extensionMcpDiscovery.start();
			}, 'start() should not throw any errors');
		});
	});
	// #endregion

	// #region Constructor Tests
	suite('Constructor Behavior', () => {
		test('should register onWillSaveState listener during construction', () => {
			// Spy on the storage service's onWillSaveState method
			const onWillSaveStateSpy = sinon.spy(fixture.storageService, 'onWillSaveState');

			// Create a new instance to test the constructor behavior
			createDiscoveryInstance();

			// Verify that onWillSaveState was called to register a listener
			assert.ok(onWillSaveStateSpy.calledOnce, 'onWillSaveState should be called to register a listener');
			assert.strictEqual(
				typeof onWillSaveStateSpy.getCall(0).args[0],
				'function',
				'onWillSaveState should be called with a function callback'
			);

			onWillSaveStateSpy.restore();
		});

		test('should not call storageService.store when onWillSaveState event is emitted with no changes', () => {
			// Spy on the storage service's store method
			const storeSpy = sinon.spy(fixture.storageService, 'store');

			// Create a new instance to ensure the event handler is registered
			createDiscoveryInstance();

			// Trigger the onWillSaveState event (no collections have been modified)
			fixture.storageService.testEmitWillSaveState(0 /* WillSaveStateReason.NONE */);

			// Verify that store was not called since there are no changes to persist
			assert.ok(storeSpy.notCalled, 'storageService.store should not be called when there are no changes to persist');

			storeSpy.restore();
		});
	});
	// #endregion

	// #region Extension Point Handler Tests
	suite('Extension Point Handler', () => {
		/**
		 * Creates mock extension point user data for testing
		 */
		function createMockExtensionPointUser(
			id: string,
			label: string,
			extensionId: string = 'test.extension',
			when?: string
		): IExtensionPointUser<IMcpCollectionContribution[]> {
			const contribution: IMcpCollectionContribution = {
				id,
				label,
				...(when && { when })
			};

			// Create a mock collector that satisfies the ExtensionMessageCollector interface
			const mockCollector = {
				error: sinon.stub(),
				warn: sinon.stub(),
				info: sinon.stub(),
				_messageHandler: sinon.stub(),
				_extension: null,
				_extensionPointId: 'test-point',
				_msg: []
			} as unknown as ExtensionMessageCollector; // Use any for the mock to avoid complex type requirements

			return {
				value: [contribution],
				description: {
					identifier: new ExtensionIdentifier(extensionId)
				} as IExtensionDescription,
				collector: mockCollector
			};
		}

		/**
		 * Creates a mock ExtensionPointUserDelta for testing
		 */
		function createMockDelta(
			added: IExtensionPointUser<IMcpCollectionContribution[]>[] = [],
			removed: IExtensionPointUser<IMcpCollectionContribution[]>[] = []
		): ExtensionPointUserDelta<IMcpCollectionContribution[]> {
			return {
				added,
				removed
			} as ExtensionPointUserDelta<IMcpCollectionContribution[]>;
		}

		test('should handle added extensions without when clause', () => {
			// Start the discovery to initialize internal state
			fixture.extensionMcpDiscovery.start();

			// Spy on the mcpRegistry to verify collection registration
			const registerCollectionStub = sinon.stub(fixture.mcpRegistry, 'registerCollection').returns({ dispose: sinon.stub() });

			// Create mock extension data
			const mockExtension = createMockExtensionPointUser('test-collection', 'Test Collection');
			const delta = createMockDelta([mockExtension], []);

			//spy on registercollection

			// Call the method under test
			fixture.extensionMcpDiscovery.handleExtensionChangeTest([], delta);

			// Verify that registerCollection was called for the added extension
			assert.ok(registerCollectionStub.calledOnce, 'registerCollection should be called once for added extension');

			const registrationCall = registerCollectionStub.getCall(0);
			const registrationArgs = registrationCall.args[0];
			assert.strictEqual(registrationArgs.id, 'test.extension/test-collection', 'Collection should be registered with prefixed ID');
			assert.strictEqual(registrationArgs.label, 'Test Collection', 'Collection should have correct label');

			registerCollectionStub.restore();
		});

		test('should handle added extensions with when clause', () => {
			// Start the discovery to initialize internal state
			fixture.extensionMcpDiscovery.start();

			// Configure context to match the when clause
			fixture.contextKeyService.setContextMatchesRules(true);

			// Spy on the mcpRegistry to verify collection registration
			const registerCollectionStub = sinon.stub(fixture.mcpRegistry, 'registerCollection').returns({ dispose: sinon.stub() });

			// Create mock extension data with when clause
			const mockExtension = createMockExtensionPointUser(
				'conditional-collection',
				'Conditional Collection',
				'test.extension',
				'config.someFlag'
			);
			const delta = createMockDelta([mockExtension], []);

			// Call the method under test
			fixture.extensionMcpDiscovery.handleExtensionChangeTest([], delta);

			// Verify that registerCollection was called for the conditional extension
			assert.ok(registerCollectionStub.calledOnce, 'registerCollection should be called once for conditional extension when context matches');
			assert.strictEqual(registerCollectionStub.getCall(0).args[0].id, 'test.extension/conditional-collection', 'Collection should be registered with prefixed ID');
			assert.strictEqual(registerCollectionStub.getCall(0).args[0].label, 'Conditional Collection', 'Collection should have correct label');

			registerCollectionStub.restore();
		});

		test('should handle removed extensions', () => {
			// Start the discovery to initialize internal state
			fixture.extensionMcpDiscovery.start();

			// First add an extension to be removed later
			const mockExtension = createMockExtensionPointUser('removable-collection', 'Removable Collection');
			const addDelta = createMockDelta([mockExtension], []);

			// Spy on registry to monitor any new registrations during removal
			const registerCollectionSpy = sinon.stub(fixture.mcpRegistry, 'registerCollection').returns({ dispose: sinon.stub() });
			fixture.extensionMcpDiscovery.handleExtensionChangeTest([], addDelta);

			registerCollectionSpy.resetHistory(); // Clear any previous calls

			// Now remove the extension
			const removeDelta = createMockDelta([], [mockExtension]);
			fixture.extensionMcpDiscovery.handleExtensionChangeTest([], removeDelta);

			// Verify that no new registrations occurred during removal
			assert.ok(registerCollectionSpy.notCalled, 'No new collections should be registered when extensions are removed');
			registerCollectionSpy.restore();
		});

		test('should skip invalid extensions', () => {
			// Start the discovery to initialize internal state
			fixture.extensionMcpDiscovery.start();

			const registerCollectionSpy = sinon.stub(fixture.mcpRegistry, 'registerCollection').returns({ dispose: sinon.stub() });

			// Create mock extension data with invalid structure (empty id should fail validation)
			const invalidExtension = createMockExtensionPointUser('', 'Invalid Collection'); // Empty id
			const invalidDelta = createMockDelta([invalidExtension], []);

			// Call the method under test
			fixture.extensionMcpDiscovery.handleExtensionChangeTest([], invalidDelta);

			// Verify that registerCollection was not called for invalid extension
			assert.ok(registerCollectionSpy.notCalled, 'registerCollection should not be called for invalid extensions');

			registerCollectionSpy.restore();
		});

		test('should handle mixed add and remove operations', () => {
			// Start the discovery to initialize internal state
			fixture.extensionMcpDiscovery.start();

			// First add an extension to be removed later
			const existingExtension = createMockExtensionPointUser('existing-collection', 'Existing Collection');
			const addExistingDelta = createMockDelta([existingExtension], []);
			// Prepare spy for the mixed operation
			const registerCollectionSpy = sinon.stub(fixture.mcpRegistry, 'registerCollection').returns({ dispose: sinon.stub() });
			fixture.extensionMcpDiscovery.handleExtensionChangeTest([], addExistingDelta);
			// Create mixed delta: add new extension, remove existing one
			const newExtension = createMockExtensionPointUser('new-collection', 'New Collection', 'new.extension');
			const mixedDelta = createMockDelta([newExtension], [existingExtension]);

			// Reset spy call counts after initial setup
			registerCollectionSpy.resetHistory();

			// Call the method under test
			fixture.extensionMcpDiscovery.handleExtensionChangeTest([], mixedDelta);

			// Verify new collection was registered (we can't easily test removal with current test setup)
			assert.ok(registerCollectionSpy.calledOnce, 'New collection should be registered');

			const registrationCall = registerCollectionSpy.getCall(0);
			assert.strictEqual(registrationCall.args[0].id, 'new.extension/new-collection', 'New collection should have correct prefixed ID');

			registerCollectionSpy.restore();
		});
	});
	// #endregion

	// #region Future Test Suites
	// TODO: Add test suites for:
	// - Collection Validation Details
	// - Conditional Collections Context Changes
	// - Storage Persistence Edge Cases
	// - Error Handling
	// #endregion

});
