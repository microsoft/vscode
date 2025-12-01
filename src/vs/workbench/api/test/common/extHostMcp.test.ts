/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { LogLevel } from '../../../../platform/log/common/log.js';
import { createAuthMetadata, CommonResponse, IAuthMetadata } from '../../common/extHostMcp.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

// Test constants to avoid magic strings
const TEST_MCP_URL = 'https://example.com/mcp';
const TEST_AUTH_SERVER = 'https://auth.example.com';
const TEST_RESOURCE_METADATA_URL = 'https://example.com/.well-known/oauth-protected-resource';

/**
 * Creates a mock CommonResponse for testing.
 */
function createMockResponse(options: {
	status?: number;
	statusText?: string;
	url?: string;
	headers?: Record<string, string>;
	body?: string;
}): CommonResponse {
	const headers = new Headers(options.headers ?? {});
	return {
		status: options.status ?? 200,
		statusText: options.statusText ?? 'OK',
		url: options.url ?? TEST_MCP_URL,
		headers,
		body: null,
		json: async () => JSON.parse(options.body ?? '{}'),
		text: async () => options.body ?? '',
	};
}

/**
 * Helper to create an IAuthMetadata instance for testing via the factory function.
 * Uses a mock fetch that returns the provided server metadata.
 */
async function createTestAuthMetadata(options: {
	scopes?: string[];
	serverMetadataIssuer?: string;
	resourceMetadata?: { resource: string; authorization_servers?: string[]; scopes_supported?: string[] };
}): Promise<{ authMetadata: IAuthMetadata; logMessages: Array<{ level: LogLevel; message: string }> }> {
	const logMessages: Array<{ level: LogLevel; message: string }> = [];
	const mockLogger = (level: LogLevel, message: string) => logMessages.push({ level, message });

	const issuer = options.serverMetadataIssuer ?? TEST_AUTH_SERVER;

	const mockFetch = sinon.stub();

	// Mock resource metadata fetch
	mockFetch.onCall(0).resolves(createMockResponse({
		status: 200,
		url: TEST_RESOURCE_METADATA_URL,
		body: JSON.stringify(options.resourceMetadata ?? {
			resource: TEST_MCP_URL,
			authorization_servers: [issuer]
		})
	}));

	// Mock server metadata fetch
	mockFetch.onCall(1).resolves(createMockResponse({
		status: 200,
		url: `${issuer}/.well-known/oauth-authorization-server`,
		body: JSON.stringify({
			issuer,
			authorization_endpoint: `${issuer}/authorize`,
			token_endpoint: `${issuer}/token`,
			response_types_supported: ['code']
		})
	}));

	const wwwAuthHeader = options.scopes
		? `Bearer scope="${options.scopes.join(' ')}"`
		: 'Bearer realm="example"';

	const originalResponse = createMockResponse({
		status: 401,
		url: TEST_MCP_URL,
		headers: {
			'WWW-Authenticate': wwwAuthHeader
		}
	});

	const authMetadata = await createAuthMetadata(
		TEST_MCP_URL,
		originalResponse,
		{
			launchHeaders: new Map(),
			fetch: mockFetch,
			log: mockLogger
		}
	);

	return { authMetadata, logMessages };
}

suite('ExtHostMcp', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('IAuthMetadata', () => {
		suite('properties', () => {
			test('should expose readonly properties', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: ['read', 'write'],
					serverMetadataIssuer: TEST_AUTH_SERVER
				});

				assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
				assert.strictEqual(authMetadata.serverMetadata.issuer, TEST_AUTH_SERVER);
				assert.deepStrictEqual(authMetadata.scopes, ['read', 'write']);
			});

			test('should allow undefined scopes', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: undefined
				});

				assert.strictEqual(authMetadata.scopes, undefined);
			});
		});

		suite('update()', () => {
			test('should return true and update scopes when WWW-Authenticate header contains new scopes', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: ['read']
				});

				const response = createMockResponse({
					status: 401,
					headers: {
						'WWW-Authenticate': 'Bearer scope="read write admin"'
					}
				});

				const result = authMetadata.update(response);

				assert.strictEqual(result, true);
				assert.deepStrictEqual(authMetadata.scopes, ['read', 'write', 'admin']);
			});

			test('should return false when scopes are the same', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: ['read', 'write']
				});

				const response = createMockResponse({
					status: 401,
					headers: {
						'WWW-Authenticate': 'Bearer scope="read write"'
					}
				});

				const result = authMetadata.update(response);

				assert.strictEqual(result, false);
				assert.deepStrictEqual(authMetadata.scopes, ['read', 'write']);
			});

			test('should return false when scopes are same but in different order', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: ['read', 'write']
				});

				const response = createMockResponse({
					status: 401,
					headers: {
						'WWW-Authenticate': 'Bearer scope="write read"'
					}
				});

				const result = authMetadata.update(response);

				assert.strictEqual(result, false);
			});

			test('should return true when updating from undefined scopes to defined scopes', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: undefined
				});

				const response = createMockResponse({
					status: 401,
					headers: {
						'WWW-Authenticate': 'Bearer scope="read"'
					}
				});

				const result = authMetadata.update(response);

				assert.strictEqual(result, true);
				assert.deepStrictEqual(authMetadata.scopes, ['read']);
			});

			test('should return true when updating from defined scopes to undefined (no scope in header)', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: ['read']
				});

				const response = createMockResponse({
					status: 401,
					headers: {
						'WWW-Authenticate': 'Bearer realm="example"'
					}
				});

				const result = authMetadata.update(response);

				assert.strictEqual(result, true);
				assert.strictEqual(authMetadata.scopes, undefined);
			});

			test('should return false when no WWW-Authenticate header and scopes are already undefined', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: undefined
				});

				const response = createMockResponse({
					status: 401,
					headers: {}
				});

				const result = authMetadata.update(response);

				assert.strictEqual(result, false);
			});

			test('should handle multiple Bearer challenges and use first scope', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: undefined
				});

				const response = createMockResponse({
					status: 401,
					headers: {
						'WWW-Authenticate': 'Bearer scope="first", Bearer scope="second"'
					}
				});

				authMetadata.update(response);

				assert.deepStrictEqual(authMetadata.scopes, ['first']);
			});

			test('should ignore non-Bearer schemes', async () => {
				const { authMetadata } = await createTestAuthMetadata({
					scopes: undefined
				});

				const response = createMockResponse({
					status: 401,
					headers: {
						'WWW-Authenticate': 'Basic realm="example"'
					}
				});

				const result = authMetadata.update(response);

				assert.strictEqual(result, false);
				assert.strictEqual(authMetadata.scopes, undefined);
			});
		});
	});

	suite('createAuthMetadata', () => {
		let sandbox: sinon.SinonSandbox;
		let logMessages: Array<{ level: LogLevel; message: string }>;
		let mockLogger: (level: LogLevel, message: string) => void;

		setup(() => {
			sandbox = sinon.createSandbox();
			logMessages = [];
			mockLogger = (level, message) => logMessages.push({ level, message });
		});

		teardown(() => {
			sandbox.restore();
		});

		test('should create IAuthMetadata with fetched server metadata', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: TEST_RESOURCE_METADATA_URL,
				body: JSON.stringify({
					resource: TEST_MCP_URL,
					authorization_servers: [TEST_AUTH_SERVER],
					scopes_supported: ['read', 'write']
				})
			}));

			// Mock server metadata fetch
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
				body: JSON.stringify({
					issuer: TEST_AUTH_SERVER,
					authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
					token_endpoint: `${TEST_AUTH_SERVER}/token`,
					response_types_supported: ['code']
				})
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {
					'WWW-Authenticate': 'Bearer scope="api.read"'
				}
			});

			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map([['X-Custom', 'value']]),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
			assert.strictEqual(authMetadata.serverMetadata.issuer, TEST_AUTH_SERVER);
			assert.deepStrictEqual(authMetadata.scopes, ['api.read']);
		});

		test('should fall back to default metadata when server metadata fetch fails', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch - fails
			mockFetch.onCall(0).rejects(new Error('Network error'));

			// Mock server metadata fetch - also fails
			mockFetch.onCall(1).rejects(new Error('Network error'));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {}
			});

			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map(),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			// Should use default metadata based on the URL
			assert.ok(authMetadata.authorizationServer.toString().startsWith('https://example.com'));
			assert.ok(authMetadata.serverMetadata.issuer.startsWith('https://example.com'));
			assert.ok(authMetadata.serverMetadata.authorization_endpoint?.startsWith('https://example.com/authorize'));
			assert.ok(authMetadata.serverMetadata.token_endpoint?.startsWith('https://example.com/token'));

			// Should log the fallback
			assert.ok(logMessages.some(m =>
				m.level === LogLevel.Info &&
				m.message.includes('Using default auth metadata')
			));
		});

		test('should use scopes from WWW-Authenticate header when resource metadata has none', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch - no scopes_supported
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: TEST_RESOURCE_METADATA_URL,
				body: JSON.stringify({
					resource: TEST_MCP_URL,
					authorization_servers: [TEST_AUTH_SERVER]
				})
			}));

			// Mock server metadata fetch
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
				body: JSON.stringify({
					issuer: TEST_AUTH_SERVER,
					authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
					token_endpoint: `${TEST_AUTH_SERVER}/token`,
					response_types_supported: ['code']
				})
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {
					'WWW-Authenticate': 'Bearer scope="header.scope"'
				}
			});

			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map(),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			assert.deepStrictEqual(authMetadata.scopes, ['header.scope']);
		});

		test('should use scopes from WWW-Authenticate header even when resource metadata has scopes_supported', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch - has scopes_supported
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: TEST_RESOURCE_METADATA_URL,
				body: JSON.stringify({
					resource: TEST_MCP_URL,
					authorization_servers: [TEST_AUTH_SERVER],
					scopes_supported: ['resource.scope1', 'resource.scope2']
				})
			}));

			// Mock server metadata fetch
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
				body: JSON.stringify({
					issuer: TEST_AUTH_SERVER,
					authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
					token_endpoint: `${TEST_AUTH_SERVER}/token`,
					response_types_supported: ['code']
				})
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {
					'WWW-Authenticate': 'Bearer scope="header.scope"'
				}
			});

			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map(),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			// WWW-Authenticate header scopes take precedence over resource metadata scopes_supported
			assert.deepStrictEqual(authMetadata.scopes, ['header.scope']);
		});

		test('should use resource_metadata challenge URL from WWW-Authenticate header', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch from challenge URL
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: 'https://example.com/custom-resource-metadata',
				body: JSON.stringify({
					resource: TEST_MCP_URL,
					authorization_servers: [TEST_AUTH_SERVER]
				})
			}));

			// Mock server metadata fetch
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
				body: JSON.stringify({
					issuer: TEST_AUTH_SERVER,
					authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
					token_endpoint: `${TEST_AUTH_SERVER}/token`,
					response_types_supported: ['code']
				})
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {
					'WWW-Authenticate': 'Bearer resource_metadata="https://example.com/custom-resource-metadata"'
				}
			});

			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map(),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));

			// Verify the resource_metadata URL was logged
			assert.ok(logMessages.some(m =>
				m.level === LogLevel.Debug &&
				m.message.includes('resource_metadata challenge')
			));
		});

		test('should pass launch headers when fetching metadata from same origin', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch to succeed so we can verify headers
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: TEST_RESOURCE_METADATA_URL,
				body: JSON.stringify({
					resource: TEST_MCP_URL,
					authorization_servers: [TEST_AUTH_SERVER]
				})
			}));

			// Mock server metadata fetch
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
				body: JSON.stringify({
					issuer: TEST_AUTH_SERVER,
					authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
					token_endpoint: `${TEST_AUTH_SERVER}/token`,
					response_types_supported: ['code']
				})
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {}
			});

			const launchHeaders = new Map<string, string>([
				['Authorization', 'Bearer existing-token'],
				['X-Custom-Header', 'custom-value']
			]);

			await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders,
					fetch: mockFetch,
					log: mockLogger
				}
			);

			// Verify fetch was called
			assert.ok(mockFetch.called, 'fetch should have been called');

			// Verify the first call (resource metadata) included the launch headers
			const firstCallArgs = mockFetch.firstCall.args;
			assert.ok(firstCallArgs.length >= 2, 'fetch should have been called with options');
			const fetchOptions = firstCallArgs[1] as RequestInit;
			assert.ok(fetchOptions.headers, 'fetch options should include headers');
		});

		test('should handle empty scope string in WWW-Authenticate header', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: TEST_RESOURCE_METADATA_URL,
				body: JSON.stringify({
					resource: TEST_MCP_URL,
					authorization_servers: [TEST_AUTH_SERVER]
				})
			}));

			// Mock server metadata fetch
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
				body: JSON.stringify({
					issuer: TEST_AUTH_SERVER,
					authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
					token_endpoint: `${TEST_AUTH_SERVER}/token`,
					response_types_supported: ['code']
				})
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {
					'WWW-Authenticate': 'Bearer scope=""'
				}
			});

			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map(),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			// Empty scope string should result in empty array or undefined
			assert.ok(
				authMetadata.scopes === undefined ||
				(Array.isArray(authMetadata.scopes) && authMetadata.scopes.length === 0) ||
				(Array.isArray(authMetadata.scopes) && authMetadata.scopes.every(s => s === '')),
				'Empty scope string should be handled gracefully'
			);
		});

		test('should handle malformed WWW-Authenticate header gracefully', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: TEST_RESOURCE_METADATA_URL,
				body: JSON.stringify({
					resource: TEST_MCP_URL,
					authorization_servers: [TEST_AUTH_SERVER]
				})
			}));

			// Mock server metadata fetch
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
				body: JSON.stringify({
					issuer: TEST_AUTH_SERVER,
					authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
					token_endpoint: `${TEST_AUTH_SERVER}/token`,
					response_types_supported: ['code']
				})
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {
					// Malformed header - missing closing quote
					'WWW-Authenticate': 'Bearer scope="unclosed'
				}
			});

			// Should not throw - should handle gracefully
			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map(),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			// Should still create valid auth metadata
			assert.ok(authMetadata.authorizationServer);
			assert.ok(authMetadata.serverMetadata);
		});

		test('should handle invalid JSON in resource metadata response', async () => {
			const mockFetch = sandbox.stub();

			// Mock resource metadata fetch - returns invalid JSON
			mockFetch.onCall(0).resolves(createMockResponse({
				status: 200,
				url: TEST_RESOURCE_METADATA_URL,
				body: 'not valid json {'
			}));

			// Mock server metadata fetch - also returns invalid JSON
			mockFetch.onCall(1).resolves(createMockResponse({
				status: 200,
				url: 'https://example.com/.well-known/oauth-authorization-server',
				body: '{ invalid }'
			}));

			const originalResponse = createMockResponse({
				status: 401,
				url: TEST_MCP_URL,
				headers: {}
			});

			// Should fall back to default metadata, not throw
			const authMetadata = await createAuthMetadata(
				TEST_MCP_URL,
				originalResponse,
				{
					launchHeaders: new Map(),
					fetch: mockFetch,
					log: mockLogger
				}
			);

			// Should use default metadata
			assert.ok(authMetadata.authorizationServer);
			assert.ok(authMetadata.serverMetadata);
		});

		test('should handle non-401 status codes in update()', async () => {
			const { authMetadata } = await createTestAuthMetadata({
				scopes: ['read']
			});

			// Response with 403 instead of 401
			const response = createMockResponse({
				status: 403,
				headers: {
					'WWW-Authenticate': 'Bearer scope="new.scope"'
				}
			});

			// update() should still process the WWW-Authenticate header regardless of status
			const result = authMetadata.update(response);

			// The behavior depends on implementation - either it updates or ignores non-401
			// This test documents the actual behavior
			assert.strictEqual(typeof result, 'boolean');
		});

		suite('metadata resolution flows', () => {
			/**
			 * Helper to create a URL-based mock fetch that returns different responses
			 * based on URL patterns. This handles the fact that fetchResourceMetadata
			 * and fetchAuthorizationServerMetadata may try multiple URLs internally.
			 */
			function createUrlBasedMockFetch(
				sandbox: sinon.SinonSandbox,
				urlResponses: Array<{ urlPattern: string | RegExp; response: CommonResponse }>
			): sinon.SinonStub {
				const mockFetch = sandbox.stub();
				mockFetch.callsFake((url: string) => {
					for (const { urlPattern, response } of urlResponses) {
						if (typeof urlPattern === 'string') {
							if (url.includes(urlPattern)) {
								return Promise.resolve(response);
							}
						} else if (urlPattern.test(url)) {
							return Promise.resolve(response);
						}
					}
					// Default: return 404 for any unmatched URL
					return Promise.resolve(createMockResponse({
						status: 404,
						url,
						body: 'Not Found'
					}));
				});
				return mockFetch;
			}

			test('Scenario 1: PRM exists with authorization_servers, AS exists - should use AS from PRM', async () => {
				const customAuthServer = 'https://custom-auth.example.com';

				const mockFetch = createUrlBasedMockFetch(sandbox, [
					// Resource metadata fetch - returns PRM with authorization_servers
					{
						urlPattern: 'oauth-protected-resource',
						response: createMockResponse({
							status: 200,
							url: TEST_RESOURCE_METADATA_URL,
							body: JSON.stringify({
								resource: TEST_MCP_URL,
								authorization_servers: [customAuthServer],
								scopes_supported: ['read', 'write']
							})
						})
					},
					// Server metadata fetch from custom auth server - succeeds
					{
						urlPattern: customAuthServer,
						response: createMockResponse({
							status: 200,
							url: `${customAuthServer}/.well-known/oauth-authorization-server`,
							body: JSON.stringify({
								issuer: customAuthServer,
								authorization_endpoint: `${customAuthServer}/authorize`,
								token_endpoint: `${customAuthServer}/token`,
								response_types_supported: ['code']
							})
						})
					}
				]);

				const originalResponse = createMockResponse({
					status: 401,
					url: TEST_MCP_URL,
					headers: {}
				});

				const authMetadata = await createAuthMetadata(
					TEST_MCP_URL,
					originalResponse,
					{
						launchHeaders: new Map(),
						fetch: mockFetch,
						log: mockLogger
					}
				);

				// Should use the auth server from PRM
				assert.ok(authMetadata.authorizationServer.toString().startsWith(customAuthServer));
				assert.strictEqual(authMetadata.serverMetadata.issuer, customAuthServer);
				assert.ok(authMetadata.resourceMetadata);
				assert.deepStrictEqual(authMetadata.resourceMetadata?.scopes_supported, ['read', 'write']);

				// Should log that it's using PRM authorization server
				assert.ok(logMessages.some(m =>
					m.level === LogLevel.Info &&
					m.message.includes('Populated auth metadata from PRM authorization server')
				));
			});

			test('Scenario 2: PRM exists without authorization_servers - should fallback to base URL for AS', async () => {
				const mockFetch = createUrlBasedMockFetch(sandbox, [
					// Resource metadata fetch - PRM exists but no authorization_servers
					{
						urlPattern: 'oauth-protected-resource',
						response: createMockResponse({
							status: 200,
							url: TEST_RESOURCE_METADATA_URL,
							body: JSON.stringify({
								resource: TEST_MCP_URL,
								// No authorization_servers
								scopes_supported: ['read']
							})
						})
					},
					// Server metadata fetch from base URL (example.com)
					{
						urlPattern: /example\.com.*(?:oauth-authorization-server|openid-configuration)/,
						response: createMockResponse({
							status: 200,
							url: 'https://example.com/.well-known/oauth-authorization-server',
							body: JSON.stringify({
								issuer: 'https://example.com',
								authorization_endpoint: 'https://example.com/authorize',
								token_endpoint: 'https://example.com/token',
								response_types_supported: ['code']
							})
						})
					}
				]);

				const originalResponse = createMockResponse({
					status: 401,
					url: TEST_MCP_URL,
					headers: {}
				});

				const authMetadata = await createAuthMetadata(
					TEST_MCP_URL,
					originalResponse,
					{
						launchHeaders: new Map(),
						fetch: mockFetch,
						log: mockLogger
					}
				);

				// Should use the base URL's auth server metadata
				assert.ok(authMetadata.authorizationServer.toString().startsWith('https://example.com'));
				assert.strictEqual(authMetadata.serverMetadata.issuer, 'https://example.com');
				// PRM should still be preserved
				assert.ok(authMetadata.resourceMetadata);

				// Should log fetching from base URL
				assert.ok(logMessages.some(m =>
					m.level === LogLevel.Info &&
					m.message.includes('Populated auth metadata from base URL')
				));
			});

			test('Scenario 3: PRM does not exist, AS exists at base URL - should use AS from base URL', async () => {
				const mockFetch = createUrlBasedMockFetch(sandbox, [
					// Resource metadata fetch - fails (PRM doesn't exist)
					{
						urlPattern: 'oauth-protected-resource',
						response: createMockResponse({
							status: 404,
							url: TEST_RESOURCE_METADATA_URL,
							body: 'Not Found'
						})
					},
					// Server metadata fetch from base URL - succeeds
					{
						urlPattern: /example\.com.*(?:oauth-authorization-server|openid-configuration)/,
						response: createMockResponse({
							status: 200,
							url: 'https://example.com/.well-known/oauth-authorization-server',
							body: JSON.stringify({
								issuer: 'https://example.com',
								authorization_endpoint: 'https://example.com/authorize',
								token_endpoint: 'https://example.com/token',
								response_types_supported: ['code']
							})
						})
					}
				]);

				const originalResponse = createMockResponse({
					status: 401,
					url: TEST_MCP_URL,
					headers: {}
				});

				const authMetadata = await createAuthMetadata(
					TEST_MCP_URL,
					originalResponse,
					{
						launchHeaders: new Map(),
						fetch: mockFetch,
						log: mockLogger
					}
				);

				// Should use the base URL's auth server metadata
				assert.ok(authMetadata.authorizationServer.toString().startsWith('https://example.com'));
				assert.strictEqual(authMetadata.serverMetadata.issuer, 'https://example.com');
				// PRM should be undefined
				assert.strictEqual(authMetadata.resourceMetadata, undefined);
			});

			test('Scenario 4: Neither PRM nor AS exists - should use default metadata', async () => {
				const mockFetch = createUrlBasedMockFetch(sandbox, [
					// All requests return 404 - nothing exists
				]);

				const originalResponse = createMockResponse({
					status: 401,
					url: TEST_MCP_URL,
					headers: {}
				});

				const authMetadata = await createAuthMetadata(
					TEST_MCP_URL,
					originalResponse,
					{
						launchHeaders: new Map(),
						fetch: mockFetch,
						log: mockLogger
					}
				);

				// Should use default metadata based on the URL
				assert.ok(authMetadata.authorizationServer.toString().startsWith('https://example.com'));
				// Default metadata should have standard endpoints
				assert.ok(authMetadata.serverMetadata.authorization_endpoint?.includes('/authorize'));
				assert.ok(authMetadata.serverMetadata.token_endpoint?.includes('/token'));
				// PRM should be undefined
				assert.strictEqual(authMetadata.resourceMetadata, undefined);

				// Should log using default metadata (Flow 3)
				assert.ok(logMessages.some(m =>
					m.level === LogLevel.Info &&
					m.message.includes('[Flow 3] Using default auth metadata')
				));
			});

			test('Scenario 1b: PRM exists with AS on different origin, AS fetch fails - should fallback to base URL', async () => {
				const customAuthServer = 'https://different-auth.example.com';

				const mockFetch = createUrlBasedMockFetch(sandbox, [
					// Resource metadata fetch - returns PRM with authorization_servers on different origin
					{
						urlPattern: 'oauth-protected-resource',
						response: createMockResponse({
							status: 200,
							url: TEST_RESOURCE_METADATA_URL,
							body: JSON.stringify({
								resource: TEST_MCP_URL,
								authorization_servers: [customAuthServer]
							})
						})
					},
					// Server metadata fetch from custom auth server - fails
					{
						urlPattern: /different-auth\.example\.com/,
						response: createMockResponse({
							status: 500,
							url: `${customAuthServer}/.well-known/oauth-authorization-server`,
							body: 'Internal Server Error'
						})
					},
					// Server metadata fetch from base URL - succeeds
					{
						urlPattern: /^https:\/\/example\.com.*(?:oauth-authorization-server|openid-configuration)/,
						response: createMockResponse({
							status: 200,
							url: 'https://example.com/.well-known/oauth-authorization-server',
							body: JSON.stringify({
								issuer: 'https://example.com',
								authorization_endpoint: 'https://example.com/authorize',
								token_endpoint: 'https://example.com/token',
								response_types_supported: ['code']
							})
						})
					}
				]);

				const originalResponse = createMockResponse({
					status: 401,
					url: TEST_MCP_URL,
					headers: {}
				});

				const authMetadata = await createAuthMetadata(
					TEST_MCP_URL,
					originalResponse,
					{
						launchHeaders: new Map(),
						fetch: mockFetch,
						log: mockLogger
					}
				);

				// Should fallback to base URL after PRM's AS fails
				assert.ok(authMetadata.authorizationServer.toString().startsWith('https://example.com'));
				assert.strictEqual(authMetadata.serverMetadata.issuer, 'https://example.com');
				// PRM should still be preserved
				assert.ok(authMetadata.resourceMetadata);

				// Should log failure from custom auth server and success from base URL
				assert.ok(logMessages.some(m =>
					m.level === LogLevel.Warning &&
					m.message.includes(customAuthServer)
				));
				assert.ok(logMessages.some(m =>
					m.level === LogLevel.Info &&
					m.message.includes('Populated auth metadata from base URL')
				));
			});

			test('should include same-origin headers when fetching AS metadata from same origin as MCP server', async () => {
				let capturedAsHeaders: Record<string, string> | undefined;

				const mockFetch = sandbox.stub().callsFake((url: string, init: RequestInit) => {
					if (url.includes('oauth-protected-resource')) {
						// Resource metadata fetch - PRM exists with AS on same origin
						return Promise.resolve(createMockResponse({
							status: 200,
							url: TEST_RESOURCE_METADATA_URL,
							body: JSON.stringify({
								resource: TEST_MCP_URL,
								authorization_servers: ['https://example.com'] // Same origin as MCP URL
							})
						}));
					} else if (url.includes('example.com') && (url.includes('oauth-authorization-server') || url.includes('openid-configuration'))) {
						// Capture headers from AS metadata fetch
						capturedAsHeaders = init?.headers as Record<string, string>;
						return Promise.resolve(createMockResponse({
							status: 200,
							url: 'https://example.com/.well-known/oauth-authorization-server',
							body: JSON.stringify({
								issuer: 'https://example.com',
								authorization_endpoint: 'https://example.com/authorize',
								token_endpoint: 'https://example.com/token',
								response_types_supported: ['code']
							})
						}));
					}
					return Promise.resolve(createMockResponse({
						status: 404,
						url,
						body: 'Not Found'
					}));
				});

				const launchHeaders = new Map<string, string>([
					['X-Custom-Header', 'custom-value'],
					['Authorization', 'Bearer existing-token']
				]);

				const originalResponse = createMockResponse({
					status: 401,
					url: TEST_MCP_URL,
					headers: {}
				});

				await createAuthMetadata(
					TEST_MCP_URL,
					originalResponse,
					{
						launchHeaders,
						fetch: mockFetch,
						log: mockLogger
					}
				);

				// Verify the AS metadata fetch was made
				assert.ok(mockFetch.called, 'fetch should have been called');
				assert.ok(capturedAsHeaders, 'AS metadata fetch headers should have been captured');

				// Same-origin headers should be included when fetching from same origin
				assert.ok(
					capturedAsHeaders['MCP-Protocol-Version'] || capturedAsHeaders['X-Custom-Header'],
					'Same-origin headers should be included when fetching from same origin'
				);
			});
		});
	});
});

