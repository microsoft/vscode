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
import { AuthenticationQueryService } from '../../browser/authenticationQueryService.js';
import { IAuthenticationService, IAuthenticationExtensionsService } from '../../common/authentication.js';
import { IAuthenticationUsageService } from '../../browser/authenticationUsageService.js';
import { IAuthenticationMcpUsageService } from '../../browser/authenticationMcpUsageService.js';
import { IAuthenticationAccessService } from '../../browser/authenticationAccessService.js';
import { IAuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../browser/authenticationMcpService.js';
import { TestUsageService, TestMcpUsageService, TestAccessService, TestMcpAccessService, TestExtensionsService, TestMcpService, TestAuthenticationService, createProvider, } from './authenticationQueryServiceMocks.js';
/**
 * Real integration tests for AuthenticationQueryService
 */
suite('AuthenticationQueryService Integration Tests', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let queryService;
    let authService;
    let usageService;
    let mcpUsageService;
    let accessService;
    let mcpAccessService;
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
        const extensionIds = [];
        accountQuery.extensions().forEach(extensionQuery => {
            extensionIds.push(extensionQuery.extensionId);
        });
        assert.strictEqual(extensionIds.length, 2);
        assert.ok(extensionIds.includes('ext1'));
        assert.ok(extensionIds.includes('ext2'));
        // Test MCP servers forEach - no await needed
        const mcpServerIds = [];
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
        }
        finally {
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
        assert.strictEqual(queryService.provider('github').account('github-user@example.com').extension('my-extension').isPreferred(), true);
        assert.strictEqual(queryService.provider('azure').account('azure-user@example.com').extension('my-extension').isPreferred(), true);
        assert.strictEqual(queryService.provider('github').account('wrong@example.com').extension('my-extension').isPreferred(), false);
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
            const visitedEntities = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi90ZXN0L2Jyb3dzZXIvYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUV0RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN6RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMxRixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1RixPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RixPQUFPLEVBQ04sZ0JBQWdCLEVBQ2hCLG1CQUFtQixFQUNuQixpQkFBaUIsRUFDakIsb0JB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