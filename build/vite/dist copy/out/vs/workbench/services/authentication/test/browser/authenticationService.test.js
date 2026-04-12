/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { AuthenticationAccessService } from '../../browser/authenticationAccessService.js';
import { AuthenticationService } from '../../browser/authenticationService.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestExtensionService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
function createSession() {
    return { id: 'session1', accessToken: 'token1', account: { id: 'account', label: 'Account' }, scopes: ['test'] };
}
function createProvider(overrides = {}) {
    return {
        supportsMultipleAccounts: false,
        onDidChangeSessions: new Emitter().event,
        id: 'test',
        label: 'Test',
        getSessions: async () => [],
        createSession: async () => createSession(),
        removeSession: async () => { },
        ...overrides
    };
}
suite('AuthenticationService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let authenticationService;
    setup(() => {
        const storageService = disposables.add(new TestStorageService());
        const authenticationAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
        authenticationService = disposables.add(new AuthenticationService(new TestExtensionService(), authenticationAccessService, TestEnvironmentService, new NullLogService()));
    });
    teardown(() => {
        // Dispose the authentication service after each test
        authenticationService.dispose();
    });
    suite('declaredAuthenticationProviders', () => {
        test('registerDeclaredAuthenticationProvider', async () => {
            const changed = Event.toPromise(authenticationService.onDidChangeDeclaredProviders);
            const provider = {
                id: 'github',
                label: 'GitHub'
            };
            authenticationService.registerDeclaredAuthenticationProvider(provider);
            // Assert that the provider is added to the declaredProviders array and the event fires
            assert.equal(authenticationService.declaredProviders.length, 1);
            assert.deepEqual(authenticationService.declaredProviders[0], provider);
            await changed;
        });
        test('unregisterDeclaredAuthenticationProvider', async () => {
            const provider = {
                id: 'github',
                label: 'GitHub'
            };
            authenticationService.registerDeclaredAuthenticationProvider(provider);
            const changed = Event.toPromise(authenticationService.onDidChangeDeclaredProviders);
            authenticationService.unregisterDeclaredAuthenticationProvider(provider.id);
            // Assert that the provider is removed from the declaredProviders array and the event fires
            assert.equal(authenticationService.declaredProviders.length, 0);
            await changed;
        });
    });
    suite('authenticationProviders', () => {
        test('isAuthenticationProviderRegistered', async () => {
            const registered = Event.toPromise(authenticationService.onDidRegisterAuthenticationProvider);
            const provider = createProvider();
            assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), false);
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), true);
            const result = await registered;
            assert.deepEqual(result, { id: provider.id, label: provider.label });
        });
        test('unregisterAuthenticationProvider', async () => {
            const unregistered = Event.toPromise(authenticationService.onDidUnregisterAuthenticationProvider);
            const provider = createProvider();
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), true);
            authenticationService.unregisterAuthenticationProvider(provider.id);
            assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), false);
            const result = await unregistered;
            assert.deepEqual(result, { id: provider.id, label: provider.label });
        });
        test('getProviderIds', () => {
            const provider1 = createProvider({
                id: 'provider1',
                label: 'Provider 1'
            });
            const provider2 = createProvider({
                id: 'provider2',
                label: 'Provider 2'
            });
            authenticationService.registerAuthenticationProvider(provider1.id, provider1);
            authenticationService.registerAuthenticationProvider(provider2.id, provider2);
            const providerIds = authenticationService.getProviderIds();
            // Assert that the providerIds array contains the registered provider ids
            assert.deepEqual(providerIds, [provider1.id, provider2.id]);
        });
        test('getProvider', () => {
            const provider = createProvider();
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            const retrievedProvider = authenticationService.getProvider(provider.id);
            // Assert that the retrieved provider is the same as the registered provider
            assert.deepEqual(retrievedProvider, provider);
        });
        test('getOrActivateProviderIdForServer - should return undefined when no provider matches the authorization server', async () => {
            const authorizationServer = URI.parse('https://example.com');
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
            assert.strictEqual(result, undefined);
        });
        test('getOrActivateProviderIdForServer - should return provider id if authorizationServerGlobs matches and authorizationServers match', async () => {
            // Register a declared provider with an authorization server glob
            const provider = {
                id: 'github',
                label: 'GitHub',
                authorizationServerGlobs: ['https://github.com/*']
            };
            authenticationService.registerDeclaredAuthenticationProvider(provider);
            // Register an authentication provider with matching authorization servers
            const authProvider = createProvider({
                id: 'github',
                label: 'GitHub',
                authorizationServers: [URI.parse('https://github.com/login')]
            });
            authenticationService.registerAuthenticationProvider('github', authProvider);
            // Test with a matching URI
            const authorizationServer = URI.parse('https://github.com/login');
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
            // Verify the result
            assert.strictEqual(result, 'github');
        });
        test('getOrActivateProviderIdForServer - should return undefined if authorizationServerGlobs match but authorizationServers do not match', async () => {
            // Register a declared provider with an authorization server glob
            const provider = {
                id: 'github',
                label: 'GitHub',
                authorizationServerGlobs: ['https://github.com/*']
            };
            authenticationService.registerDeclaredAuthenticationProvider(provider);
            // Register an authentication provider with non-matching authorization servers
            const authProvider = createProvider({
                id: 'github',
                label: 'GitHub',
                authorizationServers: [URI.parse('https://github.com/different')]
            });
            authenticationService.registerAuthenticationProvider('github', authProvider);
            // Test with a non-matching URI
            const authorizationServer = URI.parse('https://github.com/login');
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
            // Verify the result
            assert.strictEqual(result, undefined);
        });
        test('getOrActivateProviderIdForAuthorizationServer - should check multiple providers and return the first match', async () => {
            // Register two declared providers with authorization server globs
            const provider1 = {
                id: 'github',
                label: 'GitHub',
                authorizationServerGlobs: ['https://github.com/*']
            };
            const provider2 = {
                id: 'microsoft',
                label: 'Microsoft',
                authorizationServerGlobs: ['https://login.microsoftonline.com/*']
            };
            authenticationService.registerDeclaredAuthenticationProvider(provider1);
            authenticationService.registerDeclaredAuthenticationProvider(provider2);
            // Register authentication providers
            const githubProvider = createProvider({
                id: 'github',
                label: 'GitHub',
                authorizationServers: [URI.parse('https://github.com/different')]
            });
            authenticationService.registerAuthenticationProvider('github', githubProvider);
            const microsoftProvider = createProvider({
                id: 'microsoft',
                label: 'Microsoft',
                authorizationServers: [URI.parse('https://login.microsoftonline.com/common')]
            });
            authenticationService.registerAuthenticationProvider('microsoft', microsoftProvider);
            // Test with a URI that should match the second provider
            const authorizationServer = URI.parse('https://login.microsoftonline.com/common');
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
            // Verify the result
            assert.strictEqual(result, 'microsoft');
        });
        test('getOrActivateProviderIdForServer - should match when resourceServer matches provider resourceServer', async () => {
            const authorizationServer = URI.parse('https://login.microsoftonline.com/common');
            const resourceServer = URI.parse('https://graph.microsoft.com');
            // Register an authentication provider with a resourceServer
            const authProvider = createProvider({
                id: 'microsoft',
                label: 'Microsoft',
                authorizationServers: [authorizationServer],
                resourceServer: resourceServer
            });
            authenticationService.registerAuthenticationProvider('microsoft', authProvider);
            // Test with matching authorization server and resource server
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
            // Verify the result
            assert.strictEqual(result, 'microsoft');
        });
        test('getOrActivateProviderIdForServer - should not match when resourceServer does not match provider resourceServer', async () => {
            const authorizationServer = URI.parse('https://login.microsoftonline.com/common');
            const resourceServer = URI.parse('https://graph.microsoft.com');
            const differentResourceServer = URI.parse('https://vault.azure.net');
            // Register an authentication provider with a resourceServer
            const authProvider = createProvider({
                id: 'microsoft',
                label: 'Microsoft',
                authorizationServers: [authorizationServer],
                resourceServer: resourceServer
            });
            authenticationService.registerAuthenticationProvider('microsoft', authProvider);
            // Test with matching authorization server but different resource server
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, differentResourceServer);
            // Verify the result - should not match because resource servers don't match
            assert.strictEqual(result, undefined);
        });
        test('getOrActivateProviderIdForServer - should match when provider has no resourceServer and resourceServer is provided', async () => {
            const authorizationServer = URI.parse('https://login.microsoftonline.com/common');
            const resourceServer = URI.parse('https://graph.microsoft.com');
            // Register an authentication provider without a resourceServer
            const authProvider = createProvider({
                id: 'microsoft',
                label: 'Microsoft',
                authorizationServers: [authorizationServer]
            });
            authenticationService.registerAuthenticationProvider('microsoft', authProvider);
            // Test with matching authorization server and a resource server
            // Should match because provider has no resourceServer defined
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
            // Verify the result
            assert.strictEqual(result, 'microsoft');
        });
        test('getOrActivateProviderIdForServer - should match when provider has resourceServer but no resourceServer is provided', async () => {
            const authorizationServer = URI.parse('https://login.microsoftonline.com/common');
            const resourceServer = URI.parse('https://graph.microsoft.com');
            // Register an authentication provider with a resourceServer
            const authProvider = createProvider({
                id: 'microsoft',
                label: 'Microsoft',
                authorizationServers: [authorizationServer],
                resourceServer: resourceServer
            });
            authenticationService.registerAuthenticationProvider('microsoft', authProvider);
            // Test with matching authorization server but no resource server provided
            // Should match because no resourceServer is provided to check against
            const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
            // Verify the result
            assert.strictEqual(result, 'microsoft');
        });
        test('getOrActivateProviderIdForServer - should distinguish between providers with same authorization server but different resource servers', async () => {
            const authorizationServer = URI.parse('https://login.microsoftonline.com/common');
            const graphResourceServer = URI.parse('https://graph.microsoft.com');
            const vaultResourceServer = URI.parse('https://vault.azure.net');
            // Register first provider with Graph resource server
            const graphProvider = createProvider({
                id: 'microsoft-graph',
                label: 'Microsoft Graph',
                authorizationServers: [authorizationServer],
                resourceServer: graphResourceServer
            });
            authenticationService.registerAuthenticationProvider('microsoft-graph', graphProvider);
            // Register second provider with Vault resource server
            const vaultProvider = createProvider({
                id: 'microsoft-vault',
                label: 'Microsoft Vault',
                authorizationServers: [authorizationServer],
                resourceServer: vaultResourceServer
            });
            authenticationService.registerAuthenticationProvider('microsoft-vault', vaultProvider);
            // Test with Graph resource server - should match the first provider
            const graphResult = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, graphResourceServer);
            assert.strictEqual(graphResult, 'microsoft-graph');
            // Test with Vault resource server - should match the second provider
            const vaultResult = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, vaultResourceServer);
            assert.strictEqual(vaultResult, 'microsoft-vault');
            // Test with different resource server - should not match either
            const otherResourceServer = URI.parse('https://storage.azure.com');
            const noMatchResult = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, otherResourceServer);
            assert.strictEqual(noMatchResult, undefined);
        });
    });
    suite('authenticationSessions', () => {
        test('getSessions - base case', async () => {
            let isCalled = false;
            const provider = createProvider({
                getSessions: async () => {
                    isCalled = true;
                    return [createSession()];
                },
            });
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            const sessions = await authenticationService.getSessions(provider.id);
            assert.equal(sessions.length, 1);
            assert.ok(isCalled);
        });
        test('getSessions - authorization server is not registered', async () => {
            let isCalled = false;
            const provider = createProvider({
                getSessions: async () => {
                    isCalled = true;
                    return [createSession()];
                },
            });
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            assert.rejects(() => authenticationService.getSessions(provider.id, [], { authorizationServer: URI.parse('https://example.com') }));
            assert.ok(!isCalled);
        });
        test('createSession', async () => {
            const emitter = new Emitter();
            const provider = createProvider({
                onDidChangeSessions: emitter.event,
                createSession: async () => {
                    const session = createSession();
                    emitter.fire({ added: [session], removed: [], changed: [] });
                    return session;
                },
            });
            const changed = Event.toPromise(authenticationService.onDidChangeSessions);
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            const session = await authenticationService.createSession(provider.id, ['repo']);
            // Assert that the created session matches the expected session and the event fires
            assert.ok(session);
            const result = await changed;
            assert.deepEqual(result, {
                providerId: provider.id,
                label: provider.label,
                event: { added: [session], removed: [], changed: [] }
            });
        });
        test('removeSession', async () => {
            const emitter = new Emitter();
            const session = createSession();
            const provider = createProvider({
                onDidChangeSessions: emitter.event,
                removeSession: async () => emitter.fire({ added: [], removed: [session], changed: [] })
            });
            const changed = Event.toPromise(authenticationService.onDidChangeSessions);
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            await authenticationService.removeSession(provider.id, session.id);
            const result = await changed;
            assert.deepEqual(result, {
                providerId: provider.id,
                label: provider.label,
                event: { added: [], removed: [session], changed: [] }
            });
        });
        test('onDidChangeSessions', async () => {
            const emitter = new Emitter();
            const provider = createProvider({
                onDidChangeSessions: emitter.event,
                getSessions: async () => []
            });
            authenticationService.registerAuthenticationProvider(provider.id, provider);
            const changed = Event.toPromise(authenticationService.onDidChangeSessions);
            const session = createSession();
            emitter.fire({ added: [], removed: [], changed: [session] });
            const result = await changed;
            assert.deepEqual(result, {
                providerId: provider.id,
                label: provider.label,
                event: { added: [], removed: [], changed: [session] }
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25TZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vdGVzdC9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUUvRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsU0FBUyxhQUFhO0lBQ3JCLE9BQU8sRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUNsSCxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsWUFBOEMsRUFBRTtJQUN2RSxPQUFPO1FBQ04sd0JBQXdCLEVBQUUsS0FBSztR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