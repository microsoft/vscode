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
import { AuthenticationProviderInformation, AuthenticationSessionsChangeEvent, IAuthenticationProvider } from '../../common/authentication.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestExtensionService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';

function createSession() {
	return { id: 'session1', accessToken: 'token1', account: { id: 'account', label: 'Account' }, scopes: ['test'] };
}

function createProvider(overrides: Partial<IAuthenticationProvider> = {}): IAuthenticationProvider {
	return {
		supportsMultipleAccounts: false,
		onDidChangeSessions: new Emitter<AuthenticationSessionsChangeEvent>().event,
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

	let authenticationService: AuthenticationService;

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
			const provider: AuthenticationProviderInformation = {
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
			const provider: AuthenticationProviderInformation = {
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
			const provider: AuthenticationProviderInformation = {
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
			const provider: AuthenticationProviderInformation = {
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
			const provider1: AuthenticationProviderInformation = {
				id: 'github',
				label: 'GitHub',
				authorizationServerGlobs: ['https://github.com/*']
			};
			const provider2: AuthenticationProviderInformation = {
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
			const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
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
			const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
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
			const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
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
