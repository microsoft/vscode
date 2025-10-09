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

// #region Test Helper Classes

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
		extensionMcpDiscovery: ExtensionMcpDiscovery;
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
		const extensionMcpDiscovery = store.add(instance.createInstance(ExtensionMcpDiscovery));

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

	// #region Future Test Suites
	// TODO: Add test suites for:
	// - Extension Point Registration
	// - Collection Validation
	// - Conditional Collections
	// - Storage Persistence
	// - Extension Lifecycle
	// #endregion

});
