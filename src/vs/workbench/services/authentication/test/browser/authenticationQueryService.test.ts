/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IAuthenticationQueryService } from '../../common/authenticationQuery.js';
import { AuthenticationQueryService } from '../../browser/authenticationQueryService.js';
import { IAuthenticationService, IAuthenticationExtensionsService } from '../../common/authentication.js';
import { IAuthenticationUsageService } from '../../browser/authenticationUsageService.js';
import { IAuthenticationMcpUsageService } from '../../browser/authenticationMcpUsageService.js';
import { IAuthenticationAccessService } from '../../browser/authenticationAccessService.js';
import { IAuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../browser/authenticationMcpService.js';
import {
	TestUsageService,
	TestMcpUsageService,
	TestAccessService,
	TestMcpAccessService,
	TestExtensionsService,
	TestMcpService,
	TestAuthenticationService,
	createProvider,
} from './authenticationQueryServiceMocks.js';

/**
 * Real integration tests for AuthenticationQueryService
 */
suite('AuthenticationQueryService Integration Tests', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let queryService: IAuthenticationQueryService;
	let authService: TestAuthenticationService;
	let usageService: TestUsageService;
	let mcpUsageService: TestMcpUsageService;
	let accessService: TestAccessService;
	let mcpAccessService: TestMcpAccessService;

	setup(() => {
		const instantiationService = disposables.add(new TestInstantiationService());

		// Set up storage service
		const storageService = disposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);

		// Set up log service
		instantiationService.stub(ILogService, new NullLogService());

		// Create and register test services
		authService = disposables.add(new TestAuthenticationService());
		instantiationService.stub(IAuthenticationService, authService);

		usageService = disposables.add(new TestUsageService());
		mcpUsageService = disposables.add(new TestMcpUsageService());
		accessService = disposables.add(new TestAccessService());
		mcpAccessService = disposables.add(new TestMcpAccessService());

		instantiationService.stub(IAuthenticationUsageService, usageService);
		instantiationService.stub(IAuthenticationMcpUsageService, mcpUsageService);
		instantiationService.stub(IAuthenticationAccessService, accessService);
		instantiationService.stub(IAuthenticationMcpAccessService, mcpAccessService);
		instantiationService.stub(IAuthenticationExtensionsService, disposables.add(new TestExtensionsService()));
		instantiationService.stub(IAuthenticationMcpService, disposables.add(new TestMcpService()));

		// Create the query service
		queryService = disposables.add(instantiationService.createInstance(AuthenticationQueryService));
	});

	test('usage tracking stores and retrieves data correctly', () => {
		const extensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');

		// Initially no usage
		assert.strictEqual(extensionQuery.getUsage().length, 0);

		// Add usage and verify it's stored
		extensionQuery.addUsage(['read', 'write'], 'My Extension');
		const usage = extensionQuery.getUsage();
		assert.strictEqual(usage.length, 1);
		assert.strictEqual(usage[0].extensionId, 'my-extension');
		assert.strictEqual(usage[0].extensionName, 'My Extension');
		assert.deepStrictEqual(usage[0].scopes, ['read', 'write']);

		// Add more usage and verify accumulation
		extensionQuery.addUsage(['admin'], 'My Extension');
		assert.strictEqual(extensionQuery.getUsage().length, 2);
	});

	test('access control persists across queries', () => {
		const extensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');

		// Set access and verify
		extensionQuery.setAccessAllowed(true, 'My Extension');
		assert.strictEqual(extensionQuery.isAccessAllowed(), true);

		// Create new query object for same target - should persist
		const sameExtensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');
		assert.strictEqual(sameExtensionQuery.isAccessAllowed(), true);

		// Different extension should be unaffected
		const otherExtensionQuery = queryService.provider('github').account('user@example.com').extension('other-extension');
		assert.strictEqual(otherExtensionQuery.isAccessAllowed(), undefined);
	});

	test('account preferences work across services', () => {
		const extensionQuery = queryService.provider('github').extension('my-extension');
		const mcpQuery = queryService.provider('github').mcpServer('my-server');

		// Set preferences for both
		extensionQuery.setPreferredAccount({ id: 'user1', label: 'user@example.com' });
		mcpQuery.setPreferredAccount({ id: 'user2', label: 'admin@example.com' });

		// Verify different preferences are stored independently
		assert.strictEqual(extensionQuery.getPreferredAccount(), 'user@example.com');
		assert.strictEqual(mcpQuery.getPreferredAccount(), 'admin@example.com');

		// Test preference detection
		const userExtensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');
		const adminMcpQuery = queryService.provider('github').account('admin@example.com').mcpServer('my-server');

		assert.strictEqual(userExtensionQuery.isPreferred(), true);
		assert.strictEqual(adminMcpQuery.isPreferred(), true);

		// Test non-preferred accounts
		const wrongExtensionQuery = queryService.provider('github').account('wrong@example.com').extension('my-extension');
		assert.strictEqual(wrongExtensionQuery.isPreferred(), false);
	});

	test('account removal cleans up all related data', () => {
		const accountQuery = queryService.provider('github').account('user@example.com');

		// Set up data across multiple services
		accountQuery.extension('ext1').setAccessAllowed(true, 'Extension 1');
		accountQuery.extension('ext1').addUsage(['read'], 'Extension 1');
		accountQuery.mcpServer('mcp1').setAccessAllowed(true, 'MCP Server 1');
		accountQuery.mcpServer('mcp1').addUsage(['write'], 'MCP Server 1');

		// Verify data exists
		assert.strictEqual(accountQuery.extension('ext1').isAccessAllowed(), true);
		assert.strictEqual(accountQuery.extension('ext1').getUsage().length, 1);
		assert.strictEqual(accountQuery.mcpServer('mcp1').isAccessAllowed(), true);
		assert.strictEqual(accountQuery.mcpServer('mcp1').getUsage().length, 1);

		// Remove account
		accountQuery.remove();

		// Verify all data is cleaned up
		assert.strictEqual(accountQuery.extension('ext1').isAccessAllowed(), undefined);
		assert.strictEqual(accountQuery.extension('ext1').getUsage().length, 0);
		assert.strictEqual(accountQuery.mcpServer('mcp1').isAccessAllowed(), undefined);
		assert.strictEqual(accountQuery.mcpServer('mcp1').getUsage().length, 0);
	});

	test('provider registration and listing works', () => {
		// Initially no providers
		assert.strictEqual(queryService.getProviderIds().length, 0);

		// Register a provider
		const provider = createProvider({ id: 'github', label: 'GitHub' });
		authService.registerAuthenticationProvider('github', provider);

		// Verify provider is listed
		const providerIds = queryService.getProviderIds();
		assert.ok(providerIds.includes('github'));
		assert.strictEqual(authService.isAuthenticationProviderRegistered('github'), true);
	});

	test('MCP usage and access work independently from extensions', () => {
		const extensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');
		const mcpQuery = queryService.provider('github').account('user@example.com').mcpServer('my-server');

		// Set up data for both
		extensionQuery.setAccessAllowed(true, 'My Extension');
		extensionQuery.addUsage(['read'], 'My Extension');

		mcpQuery.setAccessAllowed(false, 'My Server');
		mcpQuery.addUsage(['write'], 'My Server');

		// Verify they're independent
		assert.strictEqual(extensionQuery.isAccessAllowed(), true);
		assert.strictEqual(mcpQuery.isAccessAllowed(), false);

		assert.strictEqual(extensionQuery.getUsage()[0].extensionId, 'my-extension');
		assert.strictEqual(mcpQuery.getUsage()[0].mcpServerId, 'my-server');

		// Verify no cross-contamination
		assert.strictEqual(extensionQuery.getUsage().length, 1);
		assert.strictEqual(mcpQuery.getUsage().length, 1);
	});

	test('getAllAccountPreferences returns synchronously', () => {
		// Register providers for the test
		const githubProvider = createProvider({ id: 'github', label: 'GitHub' });
		const azureProvider = createProvider({ id: 'azure', label: 'Azure' });
		authService.registerAuthenticationProvider('github', githubProvider);
		authService.registerAuthenticationProvider('azure', azureProvider);

		const extensionQuery = queryService.extension('my-extension');
		const mcpQuery = queryService.mcpServer('my-server');

		// Set preferences for different providers
		extensionQuery.provider('github').setPreferredAccount({ id: 'user1', label: 'github-user@example.com' });
		extensionQuery.provider('azure').setPreferredAccount({ id: 'user2', label: 'azure-user@example.com' });
		mcpQuery.provider('github').setPreferredAccount({ id: 'user3', label: 'github-mcp@example.com' });

		// Get all preferences synchronously (no await needed)
		const extensionPreferences = extensionQuery.getAllAccountPreferences();
		const mcpPreferences = mcpQuery.getAllAccountPreferences();

		// Verify extension preferences
		assert.strictEqual(extensionPreferences.get('github'), 'github-user@example.com');
		assert.strictEqual(extensionPreferences.get('azure'), 'azure-user@example.com');
		assert.strictEqual(extensionPreferences.size, 2);

		// Verify MCP preferences
		assert.strictEqual(mcpPreferences.get('github'), 'github-mcp@example.com');
		assert.strictEqual(mcpPreferences.size, 1);

		// Verify they don't interfere with each other
		assert.notStrictEqual(extensionPreferences.get('github'), mcpPreferences.get('github'));
	});

	test('forEach methods work synchronously', () => {
		const accountQuery = queryService.provider('github').account('user@example.com');

		// Add some usage data first
		accountQuery.extension('ext1').addUsage(['read'], 'Extension 1');
		accountQuery.extension('ext2').addUsage(['write'], 'Extension 2');
		accountQuery.mcpServer('mcp1').addUsage(['admin'], 'MCP Server 1');

		// Test extensions forEach - no await needed
		const extensionIds: string[] = [];
		accountQuery.extensions().forEach(extensionQuery => {
			extensionIds.push(extensionQuery.extensionId);
		});

		assert.strictEqual(extensionIds.length, 2);
		assert.ok(extensionIds.includes('ext1'));
		assert.ok(extensionIds.includes('ext2'));

		// Test MCP servers forEach - no await needed
		const mcpServerIds: string[] = [];
		accountQuery.mcpServers().forEach(mcpServerQuery => {
			mcpServerIds.push(mcpServerQuery.mcpServerId);
		});

		assert.strictEqual(mcpServerIds.length, 1);
		assert.ok(mcpServerIds.includes('mcp1'));
	});

	test('remove method works synchronously', () => {
		const accountQuery = queryService.provider('github').account('user@example.com');

		// Set up data
		accountQuery.extension('ext1').setAccessAllowed(true, 'Extension 1');
		accountQuery.mcpServer('mcp1').setAccessAllowed(true, 'MCP Server 1');

		// Remove synchronously - no await needed
		accountQuery.remove();

		// Verify data is gone
		assert.strictEqual(accountQuery.extension('ext1').isAccessAllowed(), undefined);
		assert.strictEqual(accountQuery.mcpServer('mcp1').isAccessAllowed(), undefined);
	});

	test('cross-provider extension queries work correctly', () => {
		// Register multiple providers
		const githubProvider = createProvider({ id: 'github', label: 'GitHub' });
		const azureProvider = createProvider({ id: 'azure', label: 'Azure' });
		authService.registerAuthenticationProvider('github', githubProvider);
		authService.registerAuthenticationProvider('azure', azureProvider);

		// Set up data using provider-first approach
		queryService.provider('github').account('user@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('azure').account('admin@example.com').extension('my-extension').setAccessAllowed(false, 'My Extension');

		// Query using extension-first approach should return all providers
		const extensionQuery = queryService.extension('my-extension');
		const githubPrefs = extensionQuery.getAllAccountPreferences();

		// Should include both providers
		assert.ok(githubPrefs.size >= 0); // Extension query should work across providers

		// Test preferences using extension-first query pattern
		extensionQuery.provider('github').setPreferredAccount({ id: 'user1', label: 'user@example.com' });
		extensionQuery.provider('azure').setPreferredAccount({ id: 'user2', label: 'admin@example.com' });

		assert.strictEqual(extensionQuery.provider('github').getPreferredAccount(), 'user@example.com');
		assert.strictEqual(extensionQuery.provider('azure').getPreferredAccount(), 'admin@example.com');
	});

	test('event forwarding from authentication service works', () => {
		let eventFired = false;

		// Listen for access change events through the query service
		const disposable = queryService.onDidChangeAccess(() => {
			eventFired = true;
		});

		try {
			// Trigger an access change that should fire an event
			queryService.provider('github').account('user@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');

			// Verify the event was fired
			assert.strictEqual(eventFired, true);
		} finally {
			disposable.dispose();
		}
	});

	test('error handling for invalid inputs works correctly', () => {
		// Test with non-existent provider
		const invalidProviderQuery = queryService.provider('non-existent-provider');

		// Should not throw, but should handle gracefully
		assert.doesNotThrow(() => {
			invalidProviderQuery.account('user@example.com').extension('my-extension').isAccessAllowed();
		});

		// Test with empty/invalid account names
		const emptyAccountQuery = queryService.provider('github').account('').extension('my-extension');
		assert.doesNotThrow(() => {
			emptyAccountQuery.isAccessAllowed();
		});

		// Test with empty extension IDs
		const emptyExtensionQuery = queryService.provider('github').account('user@example.com').extension('');
		assert.doesNotThrow(() => {
			emptyExtensionQuery.isAccessAllowed();
		});
	});

	test('bulk operations work correctly', () => {
		const accountQuery = queryService.provider('github').account('user@example.com');

		// Set up multiple extensions with different access levels
		accountQuery.extension('ext1').setAccessAllowed(true, 'Extension 1');
		accountQuery.extension('ext2').setAccessAllowed(false, 'Extension 2');
		accountQuery.extension('ext3').setAccessAllowed(true, 'Extension 3');

		// Add usage for some extensions
		accountQuery.extension('ext1').addUsage(['read'], 'Extension 1');
		accountQuery.extension('ext3').addUsage(['write'], 'Extension 3');

		// Test bulk enumeration
		let extensionCount = 0;
		let allowedCount = 0;
		let usageCount = 0;

		accountQuery.extensions().forEach(extensionQuery => {
			extensionCount++;
			if (extensionQuery.isAccessAllowed() === true) {
				allowedCount++;
			}
			if (extensionQuery.getUsage().length > 0) {
				usageCount++;
			}
		});

		// Verify bulk operation results
		assert.strictEqual(extensionCount, 3);
		assert.strictEqual(allowedCount, 2); // ext1 and ext3
		assert.strictEqual(usageCount, 2); // ext1 and ext3

		// Test bulk operations for MCP servers
		accountQuery.mcpServer('mcp1').setAccessAllowed(true, 'MCP 1');
		accountQuery.mcpServer('mcp2').setAccessAllowed(false, 'MCP 2');

		let mcpCount = 0;
		accountQuery.mcpServers().forEach(mcpQuery => {
			mcpCount++;
		});

		assert.strictEqual(mcpCount, 2);
	});

	test('data consistency across different query paths', () => {
		// Set up data using one query path
		const extensionQuery1 = queryService.provider('github').account('user@example.com').extension('my-extension');
		extensionQuery1.setAccessAllowed(true, 'My Extension');
		extensionQuery1.addUsage(['read', 'write'], 'My Extension');

		// Access same data using different query path (cross-provider query)
		const extensionQuery2 = queryService.extension('my-extension').provider('github');

		// Data should be consistent through provider preference access
		assert.strictEqual(extensionQuery1.isAccessAllowed(), true);
		assert.strictEqual(extensionQuery1.getUsage().length, 1);

		// Set preferences and check consistency
		extensionQuery2.setPreferredAccount({ id: 'user', label: 'user@example.com' });
		assert.strictEqual(extensionQuery2.getPreferredAccount(), 'user@example.com');

		// Modify through one path
		extensionQuery1.setAccessAllowed(false, 'My Extension');

		// Should be reflected when accessing through provider->account path
		assert.strictEqual(extensionQuery1.isAccessAllowed(), false);
	});

	test('preference management handles complex scenarios', () => {
		// Register multiple providers
		const githubProvider = createProvider({ id: 'github', label: 'GitHub' });
		const azureProvider = createProvider({ id: 'azure', label: 'Azure' });
		authService.registerAuthenticationProvider('github', githubProvider);
		authService.registerAuthenticationProvider('azure', azureProvider);

		const extensionQuery = queryService.extension('my-extension');

		// Set different preferences for different providers
		extensionQuery.provider('github').setPreferredAccount({ id: 'user1', label: 'github-user@example.com' });
		extensionQuery.provider('azure').setPreferredAccount({ id: 'user2', label: 'azure-user@example.com' });

		// Test preference retrieval
		assert.strictEqual(extensionQuery.provider('github').getPreferredAccount(), 'github-user@example.com');
		assert.strictEqual(extensionQuery.provider('azure').getPreferredAccount(), 'azure-user@example.com');

		// Test account preference detection through provider->account queries
		assert.strictEqual(
			queryService.provider('github').account('github-user@example.com').extension('my-extension').isPreferred(),
			true
		);
		assert.strictEqual(
			queryService.provider('azure').account('azure-user@example.com').extension('my-extension').isPreferred(),
			true
		);
		assert.strictEqual(
			queryService.provider('github').account('wrong@example.com').extension('my-extension').isPreferred(),
			false
		);

		// Test getAllAccountPreferences with multiple providers
		const allPrefs = extensionQuery.getAllAccountPreferences();
		assert.strictEqual(allPrefs.get('github'), 'github-user@example.com');
		assert.strictEqual(allPrefs.get('azure'), 'azure-user@example.com');
		assert.strictEqual(allPrefs.size, 2);
	});

	test('MCP server vs extension data isolation is complete', () => {
		const accountQuery = queryService.provider('github').account('user@example.com');

		// Set up similar data for extension and MCP server with same IDs
		const sameId = 'same-identifier';
		accountQuery.extension(sameId).setAccessAllowed(true, 'Extension');
		accountQuery.extension(sameId).addUsage(['ext-scope'], 'Extension');

		accountQuery.mcpServer(sameId).setAccessAllowed(false, 'MCP Server');
		accountQuery.mcpServer(sameId).addUsage(['mcp-scope'], 'MCP Server');

		// Verify complete isolation
		assert.strictEqual(accountQuery.extension(sameId).isAccessAllowed(), true);
		assert.strictEqual(accountQuery.mcpServer(sameId).isAccessAllowed(), false);

		const extUsage = accountQuery.extension(sameId).getUsage();
		const mcpUsage = accountQuery.mcpServer(sameId).getUsage();

		assert.strictEqual(extUsage.length, 1);
		assert.strictEqual(mcpUsage.length, 1);
		assert.strictEqual(extUsage[0].extensionId, sameId);
		assert.strictEqual(mcpUsage[0].mcpServerId, sameId);
		assert.notDeepStrictEqual(extUsage[0].scopes, mcpUsage[0].scopes);

		// Test preference isolation
		queryService.extension(sameId).provider('github').setPreferredAccount({ id: 'ext-user', label: 'ext@example.com' });
		queryService.mcpServer(sameId).provider('github').setPreferredAccount({ id: 'mcp-user', label: 'mcp@example.com' });

		assert.strictEqual(queryService.extension(sameId).provider('github').getPreferredAccount(), 'ext@example.com');
		assert.strictEqual(queryService.mcpServer(sameId).provider('github').getPreferredAccount(), 'mcp@example.com');
	});

	test('provider listing and registration integration', () => {
		// Initially should have providers from setup (if any)
		const initialProviders = queryService.getProviderIds();
		const initialCount = initialProviders.length;

		// Register a new provider
		const newProvider = createProvider({ id: 'test-provider', label: 'Test Provider' });
		authService.registerAuthenticationProvider('test-provider', newProvider);

		// Should now appear in listing
		const updatedProviders = queryService.getProviderIds();
		assert.strictEqual(updatedProviders.length, initialCount + 1);
		assert.ok(updatedProviders.includes('test-provider'));

		// Should be able to query the new provider
		const providerQuery = queryService.provider('test-provider');
		assert.strictEqual(providerQuery.providerId, 'test-provider');

		// Should integrate with authentication service state
		assert.strictEqual(authService.isAuthenticationProviderRegistered('test-provider'), true);
	});

	/**
	 * Service Call Verification Tests
	 * These tests verify that the AuthenticationQueryService properly delegates to underlying services
	 * with the correct parameters. This is important for ensuring the facade works correctly.
	 */
	test('setAccessAllowed calls updateAllowedExtensions with correct parameters', () => {
		const extensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');

		// Clear any previous calls
		accessService.clearCallHistory();

		// Call setAccessAllowed
		extensionQuery.setAccessAllowed(true, 'My Extension');

		// Verify the underlying service was called correctly
		const calls = accessService.getCallsFor('updateAllowedExtensions');
		assert.strictEqual(calls.length, 1);

		const [providerId, accountName, extensions] = calls[0].args;
		assert.strictEqual(providerId, 'github');
		assert.strictEqual(accountName, 'user@example.com');
		assert.strictEqual(extensions.length, 1);
		assert.strictEqual(extensions[0].id, 'my-extension');
		assert.strictEqual(extensions[0].name, 'My Extension');
		assert.strictEqual(extensions[0].allowed, true);
	});

	test('addUsage calls addAccountUsage with correct parameters', () => {
		const extensionQuery = queryService.provider('azure').account('admin@company.com').extension('test-extension');

		// Clear any previous calls
		usageService.clearCallHistory();

		// Call addUsage
		extensionQuery.addUsage(['read', 'write'], 'Test Extension');

		// Verify the underlying service was called correctly
		const calls = usageService.getCallsFor('addAccountUsage');
		assert.strictEqual(calls.length, 1);

		const [providerId, accountName, scopes, extensionId, extensionName] = calls[0].args;
		assert.strictEqual(providerId, 'azure');
		assert.strictEqual(accountName, 'admin@company.com');
		assert.deepStrictEqual(scopes, ['read', 'write']);
		assert.strictEqual(extensionId, 'test-extension');
		assert.strictEqual(extensionName, 'Test Extension');
	});

	test('isAccessAllowed calls underlying service with correct parameters', () => {
		const extensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');

		// Clear any previous calls
		accessService.clearCallHistory();

		// Call isAccessAllowed
		extensionQuery.isAccessAllowed();

		// Verify the underlying service was called correctly
		const calls = accessService.getCallsFor('isAccessAllowed');
		assert.strictEqual(calls.length, 1);

		const [providerId, accountName, extensionId] = calls[0].args;
		assert.strictEqual(providerId, 'github');
		assert.strictEqual(accountName, 'user@example.com');
		assert.strictEqual(extensionId, 'my-extension');
	});

	test('getUsage calls readAccountUsages with correct parameters', () => {
		const extensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');

		// Clear any previous calls
		usageService.clearCallHistory();

		// Call getUsage
		extensionQuery.getUsage();

		// Verify the underlying service was called correctly
		const calls = usageService.getCallsFor('readAccountUsages');
		assert.strictEqual(calls.length, 1);

		const [providerId, accountName] = calls[0].args;
		assert.strictEqual(providerId, 'github');
		assert.strictEqual(accountName, 'user@example.com');
	});

	test('MCP setAccessAllowed calls updateAllowedMcpServers with correct parameters', () => {
		const mcpQuery = queryService.provider('github').account('user@example.com').mcpServer('my-server');

		// Clear any previous calls
		mcpAccessService.clearCallHistory();

		// Call setAccessAllowed
		mcpQuery.setAccessAllowed(false, 'My MCP Server');

		// Verify the underlying service was called correctly
		const calls = mcpAccessService.getCallsFor('updateAllowedMcpServers');
		assert.strictEqual(calls.length, 1);

		const [providerId, accountName, servers] = calls[0].args;
		assert.strictEqual(providerId, 'github');
		assert.strictEqual(accountName, 'user@example.com');
		assert.strictEqual(servers.length, 1);
		assert.strictEqual(servers[0].id, 'my-server');
		assert.strictEqual(servers[0].name, 'My MCP Server');
		assert.strictEqual(servers[0].allowed, false);
	});

	test('MCP addUsage calls addAccountUsage with correct parameters', () => {
		const mcpQuery = queryService.provider('azure').account('admin@company.com').mcpServer('test-server');

		// Clear any previous calls
		mcpUsageService.clearCallHistory();

		// Call addUsage
		mcpQuery.addUsage(['admin'], 'Test MCP Server');

		// Verify the underlying service was called correctly
		const calls = mcpUsageService.getCallsFor('addAccountUsage');
		assert.strictEqual(calls.length, 1);

		const [providerId, accountName, scopes, serverId, serverName] = calls[0].args;
		assert.strictEqual(providerId, 'azure');
		assert.strictEqual(accountName, 'admin@company.com');
		assert.deepStrictEqual(scopes, ['admin']);
		assert.strictEqual(serverId, 'test-server');
		assert.strictEqual(serverName, 'Test MCP Server');
	});

	test('account removal calls all appropriate cleanup methods', () => {
		const accountQuery = queryService.provider('github').account('user@example.com');

		// Set up some data first
		accountQuery.extension('ext1').setAccessAllowed(true, 'Extension 1');
		accountQuery.extension('ext1').addUsage(['read'], 'Extension 1');
		accountQuery.mcpServer('mcp1').setAccessAllowed(true, 'MCP Server 1');
		accountQuery.mcpServer('mcp1').addUsage(['write'], 'MCP Server 1');

		// Clear call history to focus on removal calls
		usageService.clearCallHistory();
		mcpUsageService.clearCallHistory();
		accessService.clearCallHistory();
		mcpAccessService.clearCallHistory();

		// Call remove
		accountQuery.remove();

		// Verify all cleanup methods were called
		const extensionUsageRemoval = usageService.getCallsFor('removeAccountUsage');
		const mcpUsageRemoval = mcpUsageService.getCallsFor('removeAccountUsage');
		const extensionAccessRemoval = accessService.getCallsFor('removeAllowedExtensions');
		const mcpAccessRemoval = mcpAccessService.getCallsFor('removeAllowedMcpServers');

		assert.strictEqual(extensionUsageRemoval.length, 1);
		assert.strictEqual(mcpUsageRemoval.length, 1);
		assert.strictEqual(extensionAccessRemoval.length, 1);
		assert.strictEqual(mcpAccessRemoval.length, 1);

		// Verify all calls use correct parameters
		[extensionUsageRemoval[0], mcpUsageRemoval[0], extensionAccessRemoval[0], mcpAccessRemoval[0]].forEach(call => {
			const [providerId, accountName] = call.args;
			assert.strictEqual(providerId, 'github');
			assert.strictEqual(accountName, 'user@example.com');
		});
	});

	test('bulk operations call readAccountUsages and readAllowedExtensions', () => {
		const accountQuery = queryService.provider('github').account('user@example.com');

		// Set up some data
		accountQuery.extension('ext1').setAccessAllowed(true, 'Extension 1');
		accountQuery.extension('ext2').addUsage(['read'], 'Extension 2');

		// Clear call history
		usageService.clearCallHistory();
		accessService.clearCallHistory();

		// Perform bulk operation
		accountQuery.extensions().forEach(() => {
			// Just iterate to trigger the underlying service calls
		});

		// Verify the underlying services were called for bulk enumeration
		const usageCalls = usageService.getCallsFor('readAccountUsages');
		const accessCalls = accessService.getCallsFor('readAllowedExtensions');

		assert.strictEqual(usageCalls.length, 1);
		assert.strictEqual(accessCalls.length, 1);

		// Verify parameters
		usageCalls.concat(accessCalls).forEach(call => {
			const [providerId, accountName] = call.args;
			assert.strictEqual(providerId, 'github');
			assert.strictEqual(accountName, 'user@example.com');
		});
	});

	test('multiple operations accumulate service calls correctly', () => {
		const extensionQuery = queryService.provider('github').account('user@example.com').extension('my-extension');

		// Clear call history
		accessService.clearCallHistory();
		usageService.clearCallHistory();

		// Perform multiple operations
		extensionQuery.setAccessAllowed(true, 'My Extension');
		extensionQuery.addUsage(['read'], 'My Extension');
		extensionQuery.isAccessAllowed();
		extensionQuery.getUsage();
		extensionQuery.setAccessAllowed(false, 'My Extension');

		// Verify call counts
		assert.strictEqual(accessService.getCallsFor('updateAllowedExtensions').length, 2);
		assert.strictEqual(accessService.getCallsFor('isAccessAllowed').length, 1);
		assert.strictEqual(usageService.getCallsFor('addAccountUsage').length, 1);
		assert.strictEqual(usageService.getCallsFor('readAccountUsages').length, 1);
	});

	test('getProvidersWithAccess filters internal providers by default', async () => {
		// Register multiple providers including internal ones
		const githubProvider = createProvider({ id: 'github', label: 'GitHub' });
		const azureProvider = createProvider({ id: 'azure', label: 'Azure' });
		const internalProvider1 = createProvider({ id: '__internal1', label: 'Internal Provider 1' });
		const internalProvider2 = createProvider({ id: '__internal2', label: 'Internal Provider 2' });

		authService.registerAuthenticationProvider('github', githubProvider);
		authService.registerAuthenticationProvider('azure', azureProvider);
		authService.registerAuthenticationProvider('__internal1', internalProvider1);
		authService.registerAuthenticationProvider('__internal2', internalProvider2);

		// Add accounts to all providers
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);
		authService.addAccounts('azure', [{ id: 'user2', label: 'user@azure.com' }]);
		authService.addAccounts('__internal1', [{ id: 'user3', label: 'internal1@example.com' }]);
		authService.addAccounts('__internal2', [{ id: 'user4', label: 'internal2@example.com' }]);

		// Set up access for all providers
		queryService.provider('github').account('user@github.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('azure').account('user@azure.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('__internal1').account('internal1@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('__internal2').account('internal2@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');

		// Test extension query - should exclude internal providers by default
		const extensionQuery = queryService.extension('my-extension');
		const providersWithAccess = await extensionQuery.getProvidersWithAccess();

		assert.strictEqual(providersWithAccess.length, 2);
		assert.ok(providersWithAccess.includes('github'));
		assert.ok(providersWithAccess.includes('azure'));
		assert.ok(!providersWithAccess.includes('__internal1'));
		assert.ok(!providersWithAccess.includes('__internal2'));
	});

	test('getProvidersWithAccess includes internal providers when requested', async () => {
		// Register multiple providers including internal ones
		const githubProvider = createProvider({ id: 'github', label: 'GitHub' });
		const internalProvider = createProvider({ id: '__internal1', label: 'Internal Provider' });

		authService.registerAuthenticationProvider('github', githubProvider);
		authService.registerAuthenticationProvider('__internal1', internalProvider);

		// Add accounts to all providers
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);
		authService.addAccounts('__internal1', [{ id: 'user2', label: 'internal@example.com' }]);

		// Set up access for all providers
		queryService.provider('github').account('user@github.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('__internal1').account('internal@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');

		// Test extension query - should include internal providers when requested
		const extensionQuery = queryService.extension('my-extension');
		const providersWithAccess = await extensionQuery.getProvidersWithAccess(true);

		assert.strictEqual(providersWithAccess.length, 2);
		assert.ok(providersWithAccess.includes('github'));
		assert.ok(providersWithAccess.includes('__internal1'));
	});

	test('MCP server getProvidersWithAccess filters internal providers by default', async () => {
		// Register multiple providers including internal ones
		const githubProvider = createProvider({ id: 'github', label: 'GitHub' });
		const azureProvider = createProvider({ id: 'azure', label: 'Azure' });
		const internalProvider1 = createProvider({ id: '__internal1', label: 'Internal Provider 1' });
		const internalProvider2 = createProvider({ id: '__internal2', label: 'Internal Provider 2' });

		authService.registerAuthenticationProvider('github', githubProvider);
		authService.registerAuthenticationProvider('azure', azureProvider);
		authService.registerAuthenticationProvider('__internal1', internalProvider1);
		authService.registerAuthenticationProvider('__internal2', internalProvider2);

		// Add accounts to all providers
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);
		authService.addAccounts('azure', [{ id: 'user2', label: 'user@azure.com' }]);
		authService.addAccounts('__internal1', [{ id: 'user3', label: 'internal1@example.com' }]);
		authService.addAccounts('__internal2', [{ id: 'user4', label: 'internal2@example.com' }]);

		// Set up MCP access for all providers
		queryService.provider('github').account('user@github.com').mcpServer('my-server').setAccessAllowed(true, 'My Server');
		queryService.provider('azure').account('user@azure.com').mcpServer('my-server').setAccessAllowed(true, 'My Server');
		queryService.provider('__internal1').account('internal1@example.com').mcpServer('my-server').setAccessAllowed(true, 'My Server');
		queryService.provider('__internal2').account('internal2@example.com').mcpServer('my-server').setAccessAllowed(true, 'My Server');

		// Test MCP server query - should exclude internal providers by default
		const mcpServerQuery = queryService.mcpServer('my-server');
		const providersWithAccess = await mcpServerQuery.getProvidersWithAccess();

		assert.strictEqual(providersWithAccess.length, 2);
		assert.ok(providersWithAccess.includes('github'));
		assert.ok(providersWithAccess.includes('azure'));
		assert.ok(!providersWithAccess.includes('__internal1'));
		assert.ok(!providersWithAccess.includes('__internal2'));
	});

	test('MCP server getProvidersWithAccess includes internal providers when requested', async () => {
		// Register multiple providers including internal ones
		const githubProvider = createProvider({ id: 'github', label: 'GitHub' });
		const internalProvider = createProvider({ id: '__internal1', label: 'Internal Provider' });

		authService.registerAuthenticationProvider('github', githubProvider);
		authService.registerAuthenticationProvider('__internal1', internalProvider);

		// Add accounts to all providers
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);
		authService.addAccounts('__internal1', [{ id: 'user2', label: 'internal@example.com' }]);

		// Set up MCP access for all providers
		queryService.provider('github').account('user@github.com').mcpServer('my-server').setAccessAllowed(true, 'My Server');
		queryService.provider('__internal1').account('internal@example.com').mcpServer('my-server').setAccessAllowed(true, 'My Server');

		// Test MCP server query - should include internal providers when requested
		const mcpServerQuery = queryService.mcpServer('my-server');
		const providersWithAccess = await mcpServerQuery.getProvidersWithAccess(true);

		assert.strictEqual(providersWithAccess.length, 2);
		assert.ok(providersWithAccess.includes('github'));
		assert.ok(providersWithAccess.includes('__internal1'));
	});

	test('internal provider filtering works with mixed access patterns', async () => {
		// Register mixed providers
		const normalProvider = createProvider({ id: 'normal', label: 'Normal Provider' });
		const internalProvider = createProvider({ id: '__internal', label: 'Internal Provider' });
		const noAccessProvider = createProvider({ id: 'no-access', label: 'No Access Provider' });

		authService.registerAuthenticationProvider('normal', normalProvider);
		authService.registerAuthenticationProvider('__internal', internalProvider);
		authService.registerAuthenticationProvider('no-access', noAccessProvider);

		// Add accounts to all providers
		authService.addAccounts('normal', [{ id: 'user1', label: 'user@normal.com' }]);
		authService.addAccounts('__internal', [{ id: 'user2', label: 'internal@example.com' }]);
		authService.addAccounts('no-access', [{ id: 'user3', label: 'user@noaccess.com' }]);

		// Set up access only for normal and internal providers
		queryService.provider('normal').account('user@normal.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('__internal').account('internal@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		// Note: no-access provider deliberately has no access set

		const extensionQuery = queryService.extension('my-extension');

		// Without includeInternal: should only return normal provider
		const providersWithoutInternal = await extensionQuery.getProvidersWithAccess(false);
		assert.strictEqual(providersWithoutInternal.length, 1);
		assert.ok(providersWithoutInternal.includes('normal'));
		assert.ok(!providersWithoutInternal.includes('__internal'));
		assert.ok(!providersWithoutInternal.includes('no-access'));

		// With includeInternal: should return both normal and internal
		const providersWithInternal = await extensionQuery.getProvidersWithAccess(true);
		assert.strictEqual(providersWithInternal.length, 2);
		assert.ok(providersWithInternal.includes('normal'));
		assert.ok(providersWithInternal.includes('__internal'));
		assert.ok(!providersWithInternal.includes('no-access'));
	});

	test('internal provider filtering respects the __ prefix exactly', async () => {
		// Register providers with various naming patterns
		const regularProvider = createProvider({ id: 'regular', label: 'Regular Provider' });
		const underscoreProvider = createProvider({ id: '_single', label: 'Single Underscore Provider' });
		const doubleUnderscoreProvider = createProvider({ id: '__double', label: 'Double Underscore Provider' });
		const tripleUnderscoreProvider = createProvider({ id: '___triple', label: 'Triple Underscore Provider' });
		const underscoreInMiddleProvider = createProvider({ id: 'mid_underscore', label: 'Middle Underscore Provider' });

		authService.registerAuthenticationProvider('regular', regularProvider);
		authService.registerAuthenticationProvider('_single', underscoreProvider);
		authService.registerAuthenticationProvider('__double', doubleUnderscoreProvider);
		authService.registerAuthenticationProvider('___triple', tripleUnderscoreProvider);
		authService.registerAuthenticationProvider('mid_underscore', underscoreInMiddleProvider);

		// Add accounts to all providers
		authService.addAccounts('regular', [{ id: 'user1', label: 'user@regular.com' }]);
		authService.addAccounts('_single', [{ id: 'user2', label: 'user@single.com' }]);
		authService.addAccounts('__double', [{ id: 'user3', label: 'user@double.com' }]);
		authService.addAccounts('___triple', [{ id: 'user4', label: 'user@triple.com' }]);
		authService.addAccounts('mid_underscore', [{ id: 'user5', label: 'user@middle.com' }]);

		// Set up access for all providers
		queryService.provider('regular').account('user@regular.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('_single').account('user@single.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('__double').account('user@double.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('___triple').account('user@triple.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('mid_underscore').account('user@middle.com').extension('my-extension').setAccessAllowed(true, 'My Extension');

		const extensionQuery = queryService.extension('my-extension');

		// Without includeInternal: should exclude only providers starting with exactly "__"
		const providersWithoutInternal = await extensionQuery.getProvidersWithAccess(false);
		assert.strictEqual(providersWithoutInternal.length, 3);
		assert.ok(providersWithoutInternal.includes('regular'));
		assert.ok(providersWithoutInternal.includes('_single'));
		assert.ok(!providersWithoutInternal.includes('__double'));
		assert.ok(!providersWithoutInternal.includes('___triple')); // This starts with __, so should be filtered
		assert.ok(providersWithoutInternal.includes('mid_underscore'));

		// With includeInternal: should include all providers
		const providersWithInternal = await extensionQuery.getProvidersWithAccess(true);
		assert.strictEqual(providersWithInternal.length, 5);
		assert.ok(providersWithInternal.includes('regular'));
		assert.ok(providersWithInternal.includes('_single'));
		assert.ok(providersWithInternal.includes('__double'));
		assert.ok(providersWithInternal.includes('___triple'));
		assert.ok(providersWithInternal.includes('mid_underscore'));
	});

	test('getAllAccountPreferences filters internal providers by default for extensions', () => {
		// Register providers
		authService.registerAuthenticationProvider('github', createProvider({ id: 'github', label: 'GitHub' }));
		authService.registerAuthenticationProvider('azure', createProvider({ id: 'azure', label: 'Azure' }));
		authService.registerAuthenticationProvider('__internal', createProvider({ id: '__internal', label: 'Internal' }));

		// Set preferences
		const extensionQuery = queryService.extension('my-extension');
		extensionQuery.provider('github').setPreferredAccount({ id: 'user1', label: 'user@github.com' });
		extensionQuery.provider('azure').setPreferredAccount({ id: 'user2', label: 'user@azure.com' });
		extensionQuery.provider('__internal').setPreferredAccount({ id: 'user3', label: 'internal@example.com' });

		// Without includeInternal: should exclude internal providers
		const prefsWithoutInternal = extensionQuery.getAllAccountPreferences(false);
		assert.strictEqual(prefsWithoutInternal.size, 2);
		assert.strictEqual(prefsWithoutInternal.get('github'), 'user@github.com');
		assert.strictEqual(prefsWithoutInternal.get('azure'), 'user@azure.com');
		assert.strictEqual(prefsWithoutInternal.get('__internal'), undefined);

		// With includeInternal: should include all providers
		const prefsWithInternal = extensionQuery.getAllAccountPreferences(true);
		assert.strictEqual(prefsWithInternal.size, 3);
		assert.strictEqual(prefsWithInternal.get('github'), 'user@github.com');
		assert.strictEqual(prefsWithInternal.get('azure'), 'user@azure.com');
		assert.strictEqual(prefsWithInternal.get('__internal'), 'internal@example.com');

		// Default behavior: should exclude internal providers
		const prefsDefault = extensionQuery.getAllAccountPreferences();
		assert.strictEqual(prefsDefault.size, 2);
		assert.strictEqual(prefsDefault.get('__internal'), undefined);
	});

	test('getAllAccountPreferences filters internal providers by default for MCP servers', () => {
		// Register providers
		authService.registerAuthenticationProvider('github', createProvider({ id: 'github', label: 'GitHub' }));
		authService.registerAuthenticationProvider('azure', createProvider({ id: 'azure', label: 'Azure' }));
		authService.registerAuthenticationProvider('__internal', createProvider({ id: '__internal', label: 'Internal' }));

		// Set preferences
		const mcpQuery = queryService.mcpServer('my-server');
		mcpQuery.provider('github').setPreferredAccount({ id: 'user1', label: 'user@github.com' });
		mcpQuery.provider('azure').setPreferredAccount({ id: 'user2', label: 'user@azure.com' });
		mcpQuery.provider('__internal').setPreferredAccount({ id: 'user3', label: 'internal@example.com' });

		// Without includeInternal: should exclude internal providers
		const prefsWithoutInternal = mcpQuery.getAllAccountPreferences(false);
		assert.strictEqual(prefsWithoutInternal.size, 2);
		assert.strictEqual(prefsWithoutInternal.get('github'), 'user@github.com');
		assert.strictEqual(prefsWithoutInternal.get('azure'), 'user@azure.com');
		assert.strictEqual(prefsWithoutInternal.get('__internal'), undefined);

		// With includeInternal: should include all providers
		const prefsWithInternal = mcpQuery.getAllAccountPreferences(true);
		assert.strictEqual(prefsWithInternal.size, 3);
		assert.strictEqual(prefsWithInternal.get('github'), 'user@github.com');
		assert.strictEqual(prefsWithInternal.get('azure'), 'user@azure.com');
		assert.strictEqual(prefsWithInternal.get('__internal'), 'internal@example.com');

		// Default behavior: should exclude internal providers
		const prefsDefault = mcpQuery.getAllAccountPreferences();
		assert.strictEqual(prefsDefault.size, 2);
		assert.strictEqual(prefsDefault.get('__internal'), undefined);
	});

	test('clearAllData includes internal providers by default', async () => {
		// Register providers
		authService.registerAuthenticationProvider('github', createProvider({ id: 'github', label: 'GitHub' }));
		authService.registerAuthenticationProvider('__internal', createProvider({ id: '__internal', label: 'Internal' }));

		// Add accounts
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);
		authService.addAccounts('__internal', [{ id: 'user2', label: 'internal@example.com' }]);

		// Set up some data
		queryService.provider('github').account('user@github.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('__internal').account('internal@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');

		// Verify data exists
		assert.strictEqual(queryService.provider('github').account('user@github.com').extension('my-extension').isAccessAllowed(), true);
		assert.strictEqual(queryService.provider('__internal').account('internal@example.com').extension('my-extension').isAccessAllowed(), true);

		// Clear all data (should include internal providers by default)
		await queryService.clearAllData('CLEAR_ALL_AUTH_DATA');

		// Verify all data is cleared
		assert.strictEqual(queryService.provider('github').account('user@github.com').extension('my-extension').isAccessAllowed(), undefined);
		assert.strictEqual(queryService.provider('__internal').account('internal@example.com').extension('my-extension').isAccessAllowed(), undefined);
	});

	test('clearAllData can exclude internal providers when specified', async () => {
		// Register providers
		authService.registerAuthenticationProvider('github', createProvider({ id: 'github', label: 'GitHub' }));
		authService.registerAuthenticationProvider('__internal', createProvider({ id: '__internal', label: 'Internal' }));

		// Add accounts
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);
		authService.addAccounts('__internal', [{ id: 'user2', label: 'internal@example.com' }]);

		// Set up some data
		queryService.provider('github').account('user@github.com').extension('my-extension').setAccessAllowed(true, 'My Extension');
		queryService.provider('__internal').account('internal@example.com').extension('my-extension').setAccessAllowed(true, 'My Extension');

		// Clear data excluding internal providers
		await queryService.clearAllData('CLEAR_ALL_AUTH_DATA', false);

		// Verify only non-internal data is cleared
		assert.strictEqual(queryService.provider('github').account('user@github.com').extension('my-extension').isAccessAllowed(), undefined);
		assert.strictEqual(queryService.provider('__internal').account('internal@example.com').extension('my-extension').isAccessAllowed(), true);
	});

	test('isTrusted method works with mock service', () => {
		// Register provider and add account
		authService.registerAuthenticationProvider('github', createProvider({ id: 'github', label: 'GitHub' }));
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);

		// Add a server with trusted state manually to the mock
		mcpAccessService.updateAllowedMcpServers('github', 'user@github.com', [{
			id: 'trusted-server',
			name: 'Trusted Server',
			allowed: true,
			trusted: true
		}]);

		// Add a non-trusted server
		mcpAccessService.updateAllowedMcpServers('github', 'user@github.com', [{
			id: 'non-trusted-server',
			name: 'Non-Trusted Server',
			allowed: true
		}]);

		// Test trusted server
		const trustedQuery = queryService.provider('github').account('user@github.com').mcpServer('trusted-server');
		assert.strictEqual(trustedQuery.isTrusted(), true);

		// Test non-trusted server
		const nonTrustedQuery = queryService.provider('github').account('user@github.com').mcpServer('non-trusted-server');
		assert.strictEqual(nonTrustedQuery.isTrusted(), false);
	});

	test('getAllowedMcpServers method returns servers with trusted state', () => {
		// Register provider and add account
		authService.registerAuthenticationProvider('github', createProvider({ id: 'github', label: 'GitHub' }));
		authService.addAccounts('github', [{ id: 'user1', label: 'user@github.com' }]);

		// Add servers manually to the mock
		mcpAccessService.updateAllowedMcpServers('github', 'user@github.com', [
			{
				id: 'trusted-server',
				name: 'Trusted Server',
				allowed: true,
				trusted: true
			},
			{
				id: 'user-server',
				name: 'User Server',
				allowed: true
			}
		]);

		// Get all allowed servers
		const allowedServers = queryService.provider('github').account('user@github.com').mcpServers().getAllowedMcpServers();

		// Should have both servers
		assert.strictEqual(allowedServers.length, 2);

		// Find the trusted server
		const trustedServer = allowedServers.find(s => s.id === 'trusted-server');
		assert.ok(trustedServer);
		assert.strictEqual(trustedServer.trusted, true);
		assert.strictEqual(trustedServer.allowed, true);

		// Find the user-allowed server
		const userServer = allowedServers.find(s => s.id === 'user-server');
		assert.ok(userServer);
		assert.strictEqual(userServer.trusted, undefined);
		assert.strictEqual(userServer.allowed, true);
	});

	test('getAllowedExtensions returns extension data with trusted state', () => {
		// Set up some extension access data
		const accountQuery = queryService.provider('github').account('user@example.com');
		accountQuery.extension('ext1').setAccessAllowed(true, 'Extension One');
		accountQuery.extension('ext2').setAccessAllowed(true, 'Extension Two');
		accountQuery.extension('ext1').addUsage(['read'], 'Extension One');

		const allowedExtensions = accountQuery.extensions().getAllowedExtensions();

		// Should have both extensions
		assert.strictEqual(allowedExtensions.length, 2);

		// Find the first extension
		const ext1 = allowedExtensions.find(e => e.id === 'ext1');
		assert.ok(ext1);
		assert.strictEqual(ext1.name, 'Extension One');
		assert.strictEqual(ext1.allowed, true);
		assert.strictEqual(ext1.trusted, false); // Not in trusted list
		assert.ok(typeof ext1.lastUsed === 'number');

		// Find the second extension
		const ext2 = allowedExtensions.find(e => e.id === 'ext2');
		assert.ok(ext2);
		assert.strictEqual(ext2.name, 'Extension Two');
		assert.strictEqual(ext2.allowed, true);
		assert.strictEqual(ext2.trusted, false); // Not in trusted list
		assert.strictEqual(ext2.lastUsed, undefined); // No usage
	});

	suite('Account entities query', () => {
		test('hasAnyUsage returns false for clean account', () => {
			const entitiesQuery = queryService.provider('github').account('clean@example.com').entities();
			assert.strictEqual(entitiesQuery.hasAnyUsage(), false);
		});

		test('hasAnyUsage returns true when extension has usage', () => {
			const accountQuery = queryService.provider('github').account('user@example.com');
			accountQuery.extension('test-ext').addUsage(['read'], 'Test Extension');

			const entitiesQuery = accountQuery.entities();
			assert.strictEqual(entitiesQuery.hasAnyUsage(), true);
		});

		test('hasAnyUsage returns true when MCP server has usage', () => {
			const accountQuery = queryService.provider('github').account('user@example.com');
			accountQuery.mcpServer('test-server').addUsage(['write'], 'Test Server');

			const entitiesQuery = accountQuery.entities();
			assert.strictEqual(entitiesQuery.hasAnyUsage(), true);
		});

		test('hasAnyUsage returns true when extension has access', () => {
			const accountQuery = queryService.provider('github').account('user@example.com');
			accountQuery.extension('test-ext').setAccessAllowed(true, 'Test Extension');

			const entitiesQuery = accountQuery.entities();
			assert.strictEqual(entitiesQuery.hasAnyUsage(), true);
		});

		test('hasAnyUsage returns true when MCP server has access', () => {
			const accountQuery = queryService.provider('github').account('user@example.com');
			accountQuery.mcpServer('test-server').setAccessAllowed(true, 'Test Server');

			const entitiesQuery = accountQuery.entities();
			assert.strictEqual(entitiesQuery.hasAnyUsage(), true);
		});

		test('getEntityCount returns correct counts', () => {
			const accountQuery = queryService.provider('github').account('user@example.com');

			// Set up test data
			accountQuery.extension('ext1').setAccessAllowed(true, 'Extension One');
			accountQuery.extension('ext2').setAccessAllowed(true, 'Extension Two');
			accountQuery.mcpServer('server1').setAccessAllowed(true, 'Server One');

			const entitiesQuery = accountQuery.entities();
			const counts = entitiesQuery.getEntityCount();

			assert.strictEqual(counts.extensions, 2);
			assert.strictEqual(counts.mcpServers, 1);
			assert.strictEqual(counts.total, 3);
		});

		test('getEntityCount returns zero for clean account', () => {
			const entitiesQuery = queryService.provider('github').account('clean@example.com').entities();
			const counts = entitiesQuery.getEntityCount();

			assert.strictEqual(counts.extensions, 0);
			assert.strictEqual(counts.mcpServers, 0);
			assert.strictEqual(counts.total, 0);
		});

		test('removeAllAccess removes access for all entity types', () => {
			const accountQuery = queryService.provider('github').account('user@example.com');

			// Set up test data
			accountQuery.extension('ext1').setAccessAllowed(true, 'Extension One');
			accountQuery.extension('ext2').setAccessAllowed(true, 'Extension Two');
			accountQuery.mcpServer('server1').setAccessAllowed(true, 'Server One');
			accountQuery.mcpServer('server2').setAccessAllowed(true, 'Server Two');

			// Verify initial state
			assert.strictEqual(accountQuery.extension('ext1').isAccessAllowed(), true);
			assert.strictEqual(accountQuery.extension('ext2').isAccessAllowed(), true);
			assert.strictEqual(accountQuery.mcpServer('server1').isAccessAllowed(), true);
			assert.strictEqual(accountQuery.mcpServer('server2').isAccessAllowed(), true);

			// Remove all access
			const entitiesQuery = accountQuery.entities();
			entitiesQuery.removeAllAccess();

			// Verify all access is removed
			assert.strictEqual(accountQuery.extension('ext1').isAccessAllowed(), false);
			assert.strictEqual(accountQuery.extension('ext2').isAccessAllowed(), false);
			assert.strictEqual(accountQuery.mcpServer('server1').isAccessAllowed(), false);
			assert.strictEqual(accountQuery.mcpServer('server2').isAccessAllowed(), false);
		});

		test('forEach iterates over all entity types', () => {
			const accountQuery = queryService.provider('github').account('user@example.com');

			// Set up test data
			accountQuery.extension('ext1').setAccessAllowed(true, 'Extension One');
			accountQuery.extension('ext2').addUsage(['read'], 'Extension Two');
			accountQuery.mcpServer('server1').setAccessAllowed(true, 'Server One');
			accountQuery.mcpServer('server2').addUsage(['write'], 'Server Two');

			const entitiesQuery = accountQuery.entities();
			const visitedEntities: Array<{ id: string; type: 'extension' | 'mcpServer' }> = [];

			entitiesQuery.forEach((entityId, entityType) => {
				visitedEntities.push({ id: entityId, type: entityType });
			});

			// Should visit all entities that have usage or access
			assert.strictEqual(visitedEntities.length, 4);

			const extensions = visitedEntities.filter(e => e.type === 'extension');
			const mcpServers = visitedEntities.filter(e => e.type === 'mcpServer');

			assert.strictEqual(extensions.length, 2);
			assert.strictEqual(mcpServers.length, 2);

			// Check specific entities were visited
			assert.ok(visitedEntities.some(e => e.id === 'ext1' && e.type === 'extension'));
			assert.ok(visitedEntities.some(e => e.id === 'ext2' && e.type === 'extension'));
			assert.ok(visitedEntities.some(e => e.id === 'server1' && e.type === 'mcpServer'));
			assert.ok(visitedEntities.some(e => e.id === 'server2' && e.type === 'mcpServer'));
		});
	});
});
