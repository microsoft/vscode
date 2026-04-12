/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestStorageService, TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { AuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';
suite('AuthenticationMcpAccessService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let storageService;
    let productService;
    let authenticationMcpAccessService;
    setup(() => {
        instantiationService = disposables.add(new TestInstantiationService());
        // Set up storage service
        storageService = disposables.add(new TestStorageService());
        instantiationService.stub(IStorageService, storageService);
        // Set up product service with no trusted servers by default
        productService = { ...TestProductService };
        instantiationService.stub(IProductService, productService);
        // Create the service instance
        authenticationMcpAccessService = disposables.add(instantiationService.createInstance(AuthenticationMcpAccessService));
    });
    suite('isAccessAllowed', () => {
        test('returns undefined for unknown MCP server with no product configuration', () => {
            const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'unknown-server');
            assert.strictEqual(result, undefined);
        });
        test('returns true for trusted MCP server from product.json (array format)', () => {
            productService.trustedMcpAuthAccess = ['trusted-server-1', 'trusted-server-2'];
            const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'trusted-server-1');
            assert.strictEqual(result, true);
        });
        test('returns true for trusted MCP server from product.json (object format)', () => {
            productService.trustedMcpAuthAccess = {
                'github': ['github-server'],
                'microsoft': ['microsoft-server']
            };
            const result1 = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'github-server');
            assert.strictEqual(result1, true);
            const result2 = authenticationMcpAccessService.isAccessAllowed('microsoft', 'user@microsoft.com', 'microsoft-server');
            assert.strictEqual(result2, true);
        });
        test('returns undefined for MCP server not in trusted list', () => {
            productService.trustedMcpAuthAccess = ['trusted-server'];
            const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'untrusted-server');
            assert.strictEqual(result, undefined);
        });
        test('returns stored allowed state when server is in storage', () => {
            // Add server to storage
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [{
                    id: 'stored-server',
                    name: 'Stored Server',
                    allowed: false
                }]);
            const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'stored-server');
            assert.strictEqual(result, false);
        });
        test('returns true for server in storage with allowed=true', () => {
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [{
                    id: 'allowed-server',
                    name: 'Allowed Server',
                    allowed: true
                }]);
            const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'allowed-server');
            assert.strictEqual(result, true);
        });
        test('returns true for server in storage with undefined allowed property (legacy behavior)', () => {
            // Simulate legacy data where allowed property didn't exist
            const legacyServer = {
                id: 'legacy-server',
                name: 'Legacy Server'
                // allowed property is undefined
            };
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [legacyServer]);
            const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'legacy-server');
            assert.strictEqual(result, true);
        });
        test('product.json trusted servers take precedence over storage', () => {
            productService.trustedMcpAuthAccess = ['product-trusted-server'];
            // Try to store the same server as not allowed
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [{
                    id: 'product-trusted-server',
                    name: 'Product Trusted Server',
                    allowed: false
                }]);
            // Product.json should take precedence
            const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'product-trusted-server');
            assert.strictEqual(result, true);
        });
    });
    suite('readAllowedMcpServers', () => {
        test('returns empty array when no data exists', () => {
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
        });
        test('returns stored MCP servers', () => {
            const servers = [
                { id: 'server1', name: 'Server 1', allowed: true },
                { id: 'server2', name: 'Server 2', allowed: false }
            ];
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', servers);
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, 'server1');
            assert.strictEqual(result[0].allowed, true);
            assert.strictEqual(result[1].id, 'server2');
            assert.strictEqual(result[1].allowed, false);
        });
        test('includes trusted servers from product.json (array format)', () => {
            productService.trustedMcpAuthAccess = ['trusted-server-1', 'trusted-server-2'];
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            const trustedServer1 = result.find(s => s.id === 'trusted-server-1');
            assert.ok(trustedServer1);
            assert.strictEqual(trustedServer1.allowed, true);
            assert.strictEqual(trustedServer1.trusted, true);
            assert.strictEqual(trustedServer1.name, 'trusted-server-1'); // Should default to ID
            const trustedServer2 = result.find(s => s.id === 'trusted-server-2');
            assert.ok(trustedServer2);
            assert.strictEqual(trustedServer2.allowed, true);
            assert.strictEqual(trustedServer2.trusted, true);
        });
        test('includes trusted servers from product.json (object format)', () => {
            productService.trustedMcpAuthAccess = {
                'github': ['github-server'],
                'microsoft': ['microsoft-server']
            };
            const githubResult = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(githubResult.length, 1);
            assert.strictEqual(githubResult[0].id, 'github-server');
            assert.strictEqual(githubResult[0].trusted, true);
            const microsoftResult = authenticationMcpAccessService.readAllowedMcpServers('microsoft', 'user@microsoft.com');
            assert.strictEqual(microsoftResult.length, 1);
            assert.strictEqual(microsoftResult[0].id, 'microsoft-server');
            assert.strictEqual(microsoftResult[0].trusted, true);
            // Provider not in trusted list should return empty (no stored servers)
            const unknownResult = authenticationMcpAccessService.readAllowedMcpServers('unknown', 'user@unknown.com');
            assert.strictEqual(unknownResult.length, 0);
        });
        test('merges stored servers with trusted servers from product.json', () => {
            productService.trustedMcpAuthAccess = ['trusted-server'];
            // Add some stored servers
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'stored-server', name: 'Stored Server', allowed: false }
            ]);
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            const trustedServer = result.find(s => s.id === 'trusted-server');
            assert.ok(trustedServer);
            assert.strictEqual(trustedServer.trusted, true);
            assert.strictEqual(trustedServer.allowed, true);
            const storedServer = result.find(s => s.id === 'stored-server');
            assert.ok(storedServer);
            assert.strictEqual(storedServer.trusted, undefined);
            assert.strictEqual(storedServer.allowed, false);
        });
        test('updates existing stored server to be trusted when it appears in product.json', () => {
            // First add a server as stored (not trusted)
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server-1', name: 'Server 1', allowed: false }
            ]);
            // Then make it trusted via product.json
            productService.trustedMcpAuthAccess = ['server-1'];
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            const server = result[0];
            assert.strictEqual(server.id, 'server-1');
            assert.strictEqual(server.allowed, true); // Should be overridden to true
            assert.strictEqual(server.trusted, true); // Should be marked as trusted
            assert.strictEqual(server.name, 'Server 1'); // Should keep existing name
        });
        test('handles malformed JSON in storage gracefully', () => {
            // Manually corrupt the storage
            storageService.store('mcpserver-github-user@example.com', 'invalid json', -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            // Should return empty array instead of throwing
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
        });
        test('handles non-array product.json configuration gracefully', () => {
            // Set up invalid configuration
            // eslint-disable-next-line local/code-no-any-casts
            productService.trustedMcpAuthAccess = 'invalid-string';
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
        });
    });
    suite('updateAllowedMcpServers', () => {
        test('stores new MCP servers', () => {
            const servers = [
                { id: 'server1', name: 'Server 1', allowed: true },
                { id: 'server2', name: 'Server 2', allowed: false }
            ];
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', servers);
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, 'server1');
            assert.strictEqual(result[1].id, 'server2');
        });
        test('updates existing MCP server allowed status', () => {
            // First add a server
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'Server 1', allowed: true }
            ]);
            // Then update its allowed status
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'Server 1', allowed: false }
            ]);
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].allowed, false);
        });
        test('updates existing MCP server name when new name is provided', () => {
            // First add a server with default name
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'server1', allowed: true }
            ]);
            // Then update with a proper name
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'My Server', allowed: true }
            ]);
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'My Server');
        });
        test('does not update name when new name is same as ID', () => {
            // First add a server with a proper name
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'My Server', allowed: true }
            ]);
            // Then try to update with ID as name (should keep existing name)
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'server1', allowed: false }
            ]);
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'My Server'); // Should keep original name
            assert.strictEqual(result[0].allowed, false); // But allowed status should update
        });
        test('adds new servers while preserving existing ones', () => {
            // First add one server
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'Server 1', allowed: true }
            ]);
            // Then add another server
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server2', name: 'Server 2', allowed: false }
            ]);
            const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            const server1 = result.find(s => s.id === 'server1');
            const server2 = result.find(s => s.id === 'server2');
            assert.ok(server1);
            assert.ok(server2);
            assert.strictEqual(server1.allowed, true);
            assert.strictEqual(server2.allowed, false);
        });
        test('does not store trusted servers from product.json', () => {
            productService.trustedMcpAuthAccess = ['trusted-server'];
            // Try to update a trusted server
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'trusted-server', name: 'Trusted Server', allowed: false, trusted: true },
                { id: 'user-server', name: 'User Server', allowed: true }
            ]);
            // Check what's actually stored in storage (not including product.json servers)
            const storageKey = 'mcpserver-github-user@example.com';
            const storedData = JSON.parse(storageService.get(storageKey, -1 /* StorageScope.APPLICATION */) || '[]');
            // Should only contain the user-managed server, not the trusted one
            assert.strictEqual(storedData.length, 1);
            assert.strictEqual(storedData[0].id, 'user-server');
            // But readAllowedMcpServers should return both (including trusted from product.json)
            const allServers = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(allServers.length, 2);
        });
        test('fires onDidChangeMcpSessionAccess event', () => {
            let eventFired = false;
            let eventData;
            const disposable = authenticationMcpAccessService.onDidChangeMcpSessionAccess(event => {
                eventFired = true;
                eventData = event;
            });
            try {
                authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                    { id: 'server1', name: 'Server 1', allowed: true }
                ]);
                assert.strictEqual(eventFired, true);
                assert.ok(eventData);
                assert.strictEqual(eventData.providerId, 'github');
                assert.strictEqual(eventData.accountName, 'user@example.com');
            }
            finally {
                disposable.dispose();
            }
        });
    });
    suite('removeAllowedMcpServers', () => {
        test('removes all stored MCP servers for account', () => {
            // First add some servers
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'server1', name: 'Server 1', allowed: true },
                { id: 'server2', name: 'Server 2', allowed: false }
            ]);
            // Verify they exist
            let result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            // Remove them
            authenticationMcpAccessService.removeAllowedMcpServers('github', 'user@example.com');
            // Verify they're gone
            result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
        });
        test('does not affect trusted servers from product.json', () => {
            productService.trustedMcpAuthAccess = ['trusted-server'];
            // Add some user-managed servers
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'user-server', name: 'User Server', allowed: true }
            ]);
            // Verify both trusted and user servers exist
            let result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            // Remove user servers
            authenticationMcpAccessService.removeAllowedMcpServers('github', 'user@example.com');
            // Should still have trusted server
            result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].id, 'trusted-server');
            assert.strictEqual(result[0].trusted, true);
        });
        test('fires onDidChangeMcpSessionAccess event', () => {
            let eventFired = false;
            let eventData;
            const disposable = authenticationMcpAccessService.onDidChangeMcpSessionAccess(event => {
                eventFired = true;
                eventData = event;
            });
            try {
                authenticationMcpAccessService.removeAllowedMcpServers('github', 'user@example.com');
                assert.strictEqual(eventFired, true);
                assert.ok(eventData);
                assert.strictEqual(eventData.providerId, 'github');
                assert.strictEqual(eventData.accountName, 'user@example.com');
            }
            finally {
                disposable.dispose();
            }
        });
        test('handles removal of non-existent data gracefully', () => {
            // Should not throw when trying to remove data that doesn't exist
            assert.doesNotThrow(() => {
                authenticationMcpAccessService.removeAllowedMcpServers('nonexistent', 'user@example.com');
            });
        });
    });
    suite('onDidChangeMcpSessionAccess event', () => {
        test('event is fired for each update operation', () => {
            const events = [];
            const disposable = authenticationMcpAccessService.onDidChangeMcpSessionAccess(event => {
                events.push(event);
            });
            try {
                // Should fire for update
                authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                    { id: 'server1', name: 'Server 1', allowed: true }
                ]);
                // Should fire for remove
                authenticationMcpAccessService.removeAllowedMcpServers('github', 'user@example.com');
                // Should fire for different account
                authenticationMcpAccessService.updateAllowedMcpServers('microsoft', 'admin@company.com', [
                    { id: 'server2', name: 'Server 2', allowed: false }
                ]);
                assert.strictEqual(events.length, 3);
                assert.strictEqual(events[0].providerId, 'github');
                assert.strictEqual(events[0].accountName, 'user@example.com');
                assert.strictEqual(events[1].providerId, 'github');
                assert.strictEqual(events[1].accountName, 'user@example.com');
                assert.strictEqual(events[2].providerId, 'microsoft');
                assert.strictEqual(events[2].accountName, 'admin@company.com');
            }
            finally {
                disposable.dispose();
            }
        });
        test('multiple listeners receive events', () => {
            let listener1Fired = false;
            let listener2Fired = false;
            const disposable1 = authenticationMcpAccessService.onDidChangeMcpSessionAccess(() => {
                listener1Fired = true;
            });
            const disposable2 = authenticationMcpAccessService.onDidChangeMcpSessionAccess(() => {
                listener2Fired = true;
            });
            try {
                authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                    { id: 'server1', name: 'Server 1', allowed: true }
                ]);
                assert.strictEqual(listener1Fired, true);
                assert.strictEqual(listener2Fired, true);
            }
            finally {
                disposable1.dispose();
                disposable2.dispose();
            }
        });
    });
    suite('integration scenarios', () => {
        test('complete workflow: add, update, query, remove', () => {
            const providerId = 'github';
            const accountName = 'user@example.com';
            const serverId = 'test-server';
            // Initially unknown
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId), undefined);
            // Add server as allowed
            authenticationMcpAccessService.updateAllowedMcpServers(providerId, accountName, [
                { id: serverId, name: 'Test Server', allowed: true }
            ]);
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId), true);
            // Update to disallowed
            authenticationMcpAccessService.updateAllowedMcpServers(providerId, accountName, [
                { id: serverId, name: 'Test Server', allowed: false }
            ]);
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId), false);
            // Remove all
            authenticationMcpAccessService.removeAllowedMcpServers(providerId, accountName);
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId), undefined);
        });
        test('multiple providers and accounts are isolated', () => {
            // Add data for different combinations
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user1@example.com', [
                { id: 'server1', name: 'Server 1', allowed: true }
            ]);
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user2@example.com', [
                { id: 'server1', name: 'Server 1', allowed: false }
            ]);
            authenticationMcpAccessService.updateAllowedMcpServers('microsoft', 'user1@example.com', [
                { id: 'server1', name: 'Server 1', allowed: true }
            ]);
            // Verify isolation
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed('github', 'user1@example.com', 'server1'), true);
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed('github', 'user2@example.com', 'server1'), false);
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed('microsoft', 'user1@example.com', 'server1'), true);
            // Non-existent combinations should return undefined
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed('microsoft', 'user2@example.com', 'server1'), undefined);
        });
        test('product.json configuration takes precedence in all scenarios', () => {
            productService.trustedMcpAuthAccess = {
                'github': ['trusted-server'],
                'microsoft': ['microsoft-trusted']
            };
            // Trusted servers should always return true regardless of storage
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'trusted-server'), true);
            // Try to override via storage
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'trusted-server', name: 'Trusted Server', allowed: false }
            ]);
            // Should still return true
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'trusted-server'), true);
            // But non-trusted servers should still respect storage
            authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                { id: 'user-server', name: 'User Server', allowed: false }
            ]);
            assert.strictEqual(authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'user-server'), false);
        });
        test('handles edge cases with empty or null values', () => {
            // Empty provider/account names
            assert.doesNotThrow(() => {
                authenticationMcpAccessService.isAccessAllowed('', '', 'server1');
            });
            // Empty server arrays
            assert.doesNotThrow(() => {
                authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', []);
            });
            // Empty server ID/name
            assert.doesNotThrow(() => {
                authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
                    { id: '', name: '', allowed: true }
                ]);
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vdGVzdC9icm93c2VyL2F1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsOEJBQThCLEVBQXFELE1BQU0saURBQWlELENBQUM7QUFFcEosS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtJQUM1QyxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTlELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxjQUFrQyxDQUFDO0lBQ3ZDLElBQUksY0FBZ0csQ0FBQztJQUNyRyxJQUFJLDhCQUErRCxDQUFDO0lBRXBFLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixvQkFBb0IsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBRXZFLHlCQUF5QjtRQUN6QixjQUFjLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQztR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