/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestStorageService, TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { AuthenticationMcpAccessService, AllowedMcpServer, IAuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';

suite('AuthenticationMcpAccessService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let storageService: TestStorageService;
	let productService: IProductService & { trustedMcpAuthAccess?: string[] | Record<string, string[]> };
	let authenticationMcpAccessService: IAuthenticationMcpAccessService;

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
			const legacyServer: AllowedMcpServer = {
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

	suite('isAccessAllowedForUrl URL binding (security)', () => {
		const serverUrl = 'https://server.example.com/mcp';

		test('grants access when the supplied URL matches the stored URL', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true, url: serverUrl }
			]);

			const result = authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'http-server', serverUrl);
			assert.strictEqual(result, true);
		});

		test('grants access despite cosmetic origin differences (root slash, host case)', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true, url: 'https://server.example.com' }
			]);

			// "foo.com" and "foo.com/" are the same origin, and the host is case-insensitive.
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'http-server', 'https://server.example.com/'),
				true
			);
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'http-server', 'https://SERVER.EXAMPLE.COM'),
				true
			);
		});

		test('re-prompts when a path trailing slash differs (foo.com/a vs foo.com/a/)', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true, url: 'https://server.example.com/mcp' }
			]);

			// A trailing slash on a path points at a different endpoint, so the user must re-consent.
			const result = authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'http-server', 'https://server.example.com/mcp/');
			assert.strictEqual(result, undefined);
		});

		test('re-prompts (returns undefined) when the URL changed for the same server id', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true, url: serverUrl }
			]);

			const result = authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'http-server', 'https://evil.example.com/mcp');
			assert.strictEqual(result, undefined);
		});

		test('breaks legacy grants that have no stored URL when a URL is supplied', () => {
			// Legacy grant: stored before URL binding existed, so it has no URL.
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true }
			]);

			const result = authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'http-server', serverUrl);
			assert.strictEqual(result, undefined);
		});

		test('inspection (isAccessAllowed) returns the stored decision regardless of stored URL', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true, url: serverUrl }
			]);

			const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'http-server');
			assert.strictEqual(result, true);
		});

		test('stdio servers (inspection, no URL) are unaffected', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'stdio-server', name: 'Stdio Server', allowed: true }
			]);

			const result = authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'stdio-server');
			assert.strictEqual(result, true);
		});

		test('product.json trusted servers bypass the URL check', () => {
			productService.trustedMcpAuthAccess = ['trusted-http-server'];

			const result = authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'trusted-http-server', 'https://anything.example.com/mcp');
			assert.strictEqual(result, true);
		});

		test('a management toggle that omits the URL does not clear the stored binding', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true, url: serverUrl }
			]);

			// Simulate the management UI toggling access without knowledge of the URL.
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'http-server', name: 'HTTP Server', allowed: true }
			]);

			const stored = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com')
				.find(s => s.id === 'http-server');
			assert.strictEqual(stored?.url, serverUrl);
			assert.strictEqual(authenticationMcpAccessService.isAccessAllowedForUrl('github', 'user@example.com', 'http-server', serverUrl), true);
		});
	});

	suite('readAllowedMcpServers', () => {
		test('returns empty array when no data exists', () => {
			const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
			assert.strictEqual(result.length, 0);
		});

		test('returns stored MCP servers', () => {
			const servers: AllowedMcpServer[] = [
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
			storageService.store('mcpserver-github-user@example.com', 'invalid json', StorageScope.APPLICATION, StorageTarget.USER);

			// Should return empty array instead of throwing
			const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
			assert.strictEqual(result.length, 0);
		});

		test('handles non-array product.json configuration gracefully', () => {
			// Set up invalid configuration
			// eslint-disable-next-line local/code-no-any-casts
			productService.trustedMcpAuthAccess = 'invalid-string' as any;

			const result = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
			assert.strictEqual(result.length, 0);
		});
	});

	suite('updateAllowedMcpServers', () => {
		test('stores new MCP servers', () => {
			const servers: AllowedMcpServer[] = [
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
			const storedData = JSON.parse(storageService.get(storageKey, StorageScope.APPLICATION) || '[]');

			// Should only contain the user-managed server, not the trusted one
			assert.strictEqual(storedData.length, 1);
			assert.strictEqual(storedData[0].id, 'user-server');

			// But readAllowedMcpServers should return both (including trusted from product.json)
			const allServers = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com');
			assert.strictEqual(allServers.length, 2);
		});

		test('persists agentHost metadata and preserves it when a later toggle omits it', () => {
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'agent-host-mcp:remote/GitHub/https://api.example/mcp', name: 'GitHub', allowed: true, url: 'https://api.example/mcp', agentHost: { authority: 'remote', label: 'SSH: my-host' } }
			]);

			// A management toggle (no agentHost/url) must not clear the stored metadata.
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'agent-host-mcp:remote/GitHub/https://api.example/mcp', name: 'GitHub', allowed: true }
			]);

			const stored = authenticationMcpAccessService.readAllowedMcpServers('github', 'user@example.com')
				.find(s => s.id === 'agent-host-mcp:remote/GitHub/https://api.example/mcp');
			assert.deepStrictEqual(stored?.agentHost, { authority: 'remote', label: 'SSH: my-host' });
		});

		test('fires onDidChangeMcpSessionAccess event', () => {
			let eventFired = false;
			let eventData: { providerId: string; accountName: string } | undefined;

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
			} finally {
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
			let eventData: { providerId: string; accountName: string } | undefined;

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
			} finally {
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
			const events: Array<{ providerId: string; accountName: string }> = [];

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
			} finally {
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
			} finally {
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
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
				undefined
			);

			// Add server as allowed
			authenticationMcpAccessService.updateAllowedMcpServers(providerId, accountName, [
				{ id: serverId, name: 'Test Server', allowed: true }
			]);

			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
				true
			);

			// Update to disallowed
			authenticationMcpAccessService.updateAllowedMcpServers(providerId, accountName, [
				{ id: serverId, name: 'Test Server', allowed: false }
			]);

			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
				false
			);

			// Remove all
			authenticationMcpAccessService.removeAllowedMcpServers(providerId, accountName);

			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
				undefined
			);
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
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed('github', 'user1@example.com', 'server1'),
				true
			);
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed('github', 'user2@example.com', 'server1'),
				false
			);
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed('microsoft', 'user1@example.com', 'server1'),
				true
			);

			// Non-existent combinations should return undefined
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed('microsoft', 'user2@example.com', 'server1'),
				undefined
			);
		});

		test('product.json configuration takes precedence in all scenarios', () => {
			productService.trustedMcpAuthAccess = {
				'github': ['trusted-server'],
				'microsoft': ['microsoft-trusted']
			};

			// Trusted servers should always return true regardless of storage
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'trusted-server'),
				true
			);

			// Try to override via storage
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'trusted-server', name: 'Trusted Server', allowed: false }
			]);

			// Should still return true
			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'trusted-server'),
				true
			);

			// But non-trusted servers should still respect storage
			authenticationMcpAccessService.updateAllowedMcpServers('github', 'user@example.com', [
				{ id: 'user-server', name: 'User Server', allowed: false }
			]);

			assert.strictEqual(
				authenticationMcpAccessService.isAccessAllowed('github', 'user@example.com', 'user-server'),
				false
			);
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
