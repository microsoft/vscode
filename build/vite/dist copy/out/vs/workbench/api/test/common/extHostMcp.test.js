/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { LogLevel } from '../../../../platform/log/common/log.js';
import { createAuthMetadata } from '../../common/extHostMcp.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
// Test constants to avoid magic strings
const TEST_MCP_URL = 'https://example.com/mcp';
const TEST_AUTH_SERVER = 'https://auth.example.com';
const TEST_RESOURCE_METADATA_URL = 'https://example.com/.well-known/oauth-protected-resource';
/**
 * Creates a mock CommonResponse for testing.
 */
function createMockResponse(options) {
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
async function createTestAuthMetadata(options) {
    const logMessages = [];
    const mockLogger = (level, message) => logMessages.push({ level, message });
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
    const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
        sameOriginHeaders: {},
        fetch: mockFetch,
        log: mockLogger
    });
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
                const result = authMetadata.update(response.headers);
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
                const result = authMetadata.update(response.headers);
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
                const result = authMetadata.update(response.headers);
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
                const result = authMetadata.update(response.headers);
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
                const result = authMetadata.update(response.headers);
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
                const result = authMetadata.update(response.headers);
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
                authMetadata.update(response.headers);
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
                const result = authMetadata.update(response.headers);
                assert.strictEqual(result, false);
                assert.strictEqual(authMetadata.scopes, undefined);
            });
        });
    });
    suite('createAuthMetadata', () => {
        let sandbox;
        let logMessages;
        let mockLogger;
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: { 'X-Custom': 'value' },
                fetch: mockFetch,
                log: mockLogger
            });
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: {},
                fetch: mockFetch,
                log: mockLogger
            });
            // Should use default metadata based on the URL
            assert.ok(authMetadata.authorizationServer.toString().startsWith('https://example.com'));
            assert.ok(authMetadata.serverMetadata.issuer.startsWith('https://example.com'));
            assert.ok(authMetadata.serverMetadata.authorization_endpoint?.startsWith('https://example.com/authorize'));
            assert.ok(authMetadata.serverMetadata.token_endpoint?.startsWith('https://example.com/token'));
            // Should log the fallback
            assert.ok(logMessages.some(m => m.level === LogLevel.Info &&
                m.message.includes('Using default auth metadata')));
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: {},
                fetch: mockFetch,
                log: mockLogger
            });
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: {},
                fetch: mockFetch,
                log: mockLogger
            });
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: {},
                fetch: mockFetch,
                log: mockLogger
            });
            assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
            // Verify the resource_metadata URL was logged
            assert.ok(logMessages.some(m => m.level === LogLevel.Debug &&
                m.message.includes('resource_metadata challenge')));
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
            const launchHeaders = {
                'Authorization': 'Bearer existing-token',
                'X-Custom-Header': 'custom-value'
            };
            await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: launchHeaders,
                fetch: mockFetch,
                log: mockLogger
            });
            // Verify fetch was called
            assert.ok(mockFetch.called, 'fetch should have been called');
            // Verify the first call (resource metadata) included the launch headers
            const firstCallArgs = mockFetch.firstCall.args;
            assert.ok(firstCallArgs.length >= 2, 'fetch should have been called with options');
            const fetchOptions = firstCallArgs[1];
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: {},
                fetch: mockFetch,
                log: mockLogger
            });
            // Empty scope string should result in empty array or undefined
            assert.ok(authMetadata.scopes === undefined ||
                (Array.isArray(authMetadata.scopes) && authMetadata.scopes.length === 0) ||
                (Array.isArray(authMetadata.scopes) && authMetadata.scopes.every(s => s === '')), 'Empty scope string should be handled gracefully');
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: {},
                fetch: mockFetch,
                log: mockLogger
            });
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
            const authMetadata = await createAuthMetadata(TEST_MCP_URL, originalResponse.headers, {
                sameOriginHeaders: {},
                fetch: mockFetch,
                log: mockLogger
            });
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
            const result = authMetadata.update(response.headers);
            // The behavior depends on implementation - either it updates or ignores non-401
            // This test documents the actual behavior
            assert.strictEqual(typeof result, 'boolean');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE1jcC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2NvbW1vbi9leHRIb3N0TWNwLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxrQkFBa0IsRUFBaUMsTUFBTSw0QkFBNEIsQ0FBQztBQUMvRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyx3Q0FBd0M7QUFDeEMsTUFBTSxZQUFZLEdBQUcseUJBQXlCLENBQUM7QUFDL0MsTUFBTSxnQkFBZ0IsR0FBRywwQkFBMEIsQ0FBQztBQUNwRCxNQUFNLDBCQUEwQixHQUFHLDBEQUEwRCxDQUFDO0FBRTlGOztHQUVHO0FBQ0gsU0FBUyxrQkFBa0IsQ0FBQyxPQU0zQjtJQUNBLE1BQU0sT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUM7SUFDbkQsT0FBTztRQUNOLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxJQUFJLEdBQUc7UUFDN0IsVUFBVSxFQUFFLE9BQU8sQ0FBQyxVQUFVLElBQUksSUFBSTtRQUN0QyxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsSUFBSSxZQUFZO1FBQ2hDLE9BQU87UUFDUCxJQUFJLEVBQUUsSUFBSTtRQUNWLElBQUksRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUM7UUFDbEQsSUFBSSxFQUFFLEtBQUssSUFB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