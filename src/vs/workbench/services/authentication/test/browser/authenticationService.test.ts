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
import { AuthenticationProviderInformation, AuthenticationSession, AuthenticationSessionsChangeEvent, getAuthenticationSessionRequestKey, IAuthenticationProvider } from '../../common/authentication.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestExtensionService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ActivationKind } from '../../../extensions/common/extensions.js';

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
		authenticationService = disposables.add(new AuthenticationService(new TestExtensionService(), authenticationAccessService, TestEnvironmentService, new NullLogService(), TestProductService));
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
			await assert.rejects(
				() => authenticationService.getSessions(provider.id, [], { authorizationServer: URI.parse('https://example.com') }),
				/does not support the authorization server/
			);
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

		test('getSessions - forwards resource option to provider', async () => {
			let receivedResource: string | undefined;
			const provider = createProvider({
				getSessions: async (_scopes, options) => {
					receivedResource = options.resource;
					return [createSession()];
				},
			});
			authenticationService.registerAuthenticationProvider(provider.id, provider);
			await authenticationService.getSessions(provider.id, ['scope'], { resource: 'https://api.example.com/' });

			assert.strictEqual(receivedResource, 'https://api.example.com/');
		});

		test('createSession - forwards resource option to provider', async () => {
			let receivedResource: string | undefined;
			const provider = createProvider({
				createSession: async (_scopes, options) => {
					receivedResource = options.resource;
					return createSession();
				},
			});
			authenticationService.registerAuthenticationProvider(provider.id, provider);
			await authenticationService.createSession(provider.id, ['scope'], { resource: 'https://api.example.com/' });

			assert.strictEqual(receivedResource, 'https://api.example.com/');
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

suite('AuthenticationService - tryActivateProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let authenticationService: AuthenticationService;

	setup(() => {
		const storageService = disposables.add(new TestStorageService());
		const authenticationAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
		authenticationService = disposables.add(new AuthenticationService(new TestExtensionService(), authenticationAccessService, TestEnvironmentService, new NullLogService(), TestProductService));
	});

	teardown(() => {
		authenticationService.dispose();
	});

	test('should resolve when provider registers even if activateByEvent never resolves (#315841)', async () => {
		// Dispose the service created in setup to release the extension point handler,
		// so we can create a new one with a hanging activateByEvent.
		authenticationService.dispose();

		const storageService = disposables.add(new TestStorageService());
		const authAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
		// Simulate a deadlocked extension host: activateByEvent never resolves.
		const hangingExtService = new class extends TestExtensionService {
			override activateByEvent(_activationEvent: string, _activationKind?: ActivationKind): Promise<void> {
				return new Promise<void>(() => { /* never resolves */ });
			}
		};
		authenticationService = disposables.add(new AuthenticationService(hangingExtService, authAccessService, TestEnvironmentService, new NullLogService(), TestProductService));

		const provider = createProvider({ getSessions: async () => [createSession()] });

		// Start getSessions — this calls tryActivateProvider which fires activateByEvent.
		// Since activateByEvent never resolves, the old code would deadlock here.
		const sessionsPromise = authenticationService.getSessions(provider.id);

		// Simulate the local extension host registering the provider
		// while the webworker host is still stuck.
		authenticationService.registerAuthenticationProvider(provider.id, provider);

		// The Promise.race in tryActivateProvider should unblock immediately.
		const sessions = await sessionsPromise;
		assert.strictEqual(sessions.length, 1);
	});

	test('should resolve when activateByEvent completes and provider is already registered', async () => {
		const provider = createProvider({ getSessions: async () => [createSession()] });
		authenticationService.registerAuthenticationProvider(provider.id, provider);

		const sessions = await authenticationService.getSessions(provider.id);
		assert.strictEqual(sessions.length, 1);
	});
});

suite('AuthenticationService - default scopes', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	// The default scopes come from the product configuration.
	const defaultScopes = TestProductService.defaultChatAgent.providerScopes[0];

	function createService(providerScopes = TestProductService.defaultChatAgent.providerScopes): AuthenticationService {
		const storageService = disposables.add(new TestStorageService());
		const authenticationAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
		const productService = { ...TestProductService, defaultChatAgent: { ...TestProductService.defaultChatAgent, providerScopes } };
		return disposables.add(new AuthenticationService(new TestExtensionService(), authenticationAccessService, TestEnvironmentService, new NullLogService(), productService));
	}

	function session(id: string, scopes: string[]): AuthenticationSession {
		return { id, accessToken: `token-${id}`, account: { id: 'account', label: 'Account' }, scopes };
	}

	/** Registers a provider that matches scopes exactly, like the GitHub provider, and records the scopes it is asked for. */
	function registerProvider(service: AuthenticationService, id: string, sessions: AuthenticationSession[] = []): { operation: 'get' | 'create'; scopes: string[] | undefined }[] {
		const requests: { operation: 'get' | 'create'; scopes: string[] | undefined }[] = [];
		service.registerAuthenticationProvider(id, createProvider({
			id,
			label: id,
			getSessions: async scopes => {
				requests.push({ operation: 'get', scopes });
				return scopes ? sessions.filter(candidate => [...candidate.scopes].sort().join(' ') === [...scopes].sort().join(' ')) : sessions;
			},
			createSession: async scopes => {
				requests.push({ operation: 'create', scopes });
				return session('created', scopes);
			},
		}));
		return requests;
	}

	async function getError(promise: Promise<unknown>): Promise<string | undefined> {
		try {
			await promise;
			return undefined;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}

	const sessions = [
		session('wide', [...defaultScopes, 'gist', 'read:org']),
		session('minimal', ['user:email']),
		// Scope order does not matter.
		session('one-extra', ['gist', ...[...defaultScopes].reverse()]),
		session('exact', [...defaultScopes].reverse()),
	];

	test('getSessions resolves the configured defaults and keeps supersets, exact matches first', async () => {
		const service = createService();
		const requests = registerProvider(service, 'github', sessions);

		const result = await service.getSessions('github', { defaultScopes: true });

		assert.deepStrictEqual({ sessions: result.map(candidate => candidate.id), requests }, {
			sessions: ['exact', 'one-extra', 'wide'],
			requests: [{ operation: 'get', scopes: undefined }]
		});
	});

	test('additionalScopes are required on top of the defaults', async () => {
		const service = createService();
		registerProvider(service, 'github', sessions);

		const result = await service.getSessions('github', { defaultScopes: true, additionalScopes: ['gist', 'repo'] });

		assert.deepStrictEqual(result.map(candidate => candidate.id), ['one-extra', 'wide']);
	});

	test('createSession asks the provider for the resolved scopes', async () => {
		const service = createService();
		const requests = registerProvider(service, 'github');

		await service.createSession('github', { defaultScopes: true });
		await service.createSession('github', { defaultScopes: true, additionalScopes: ['gist', 'repo', 'gist'] });

		assert.deepStrictEqual(requests, [
			{ operation: 'create', scopes: defaultScopes },
			{ operation: 'create', scopes: [...defaultScopes, 'gist'] },
		]);
	});

	test('the enterprise provider uses the same defaults', async () => {
		const service = createService();
		const requests = registerProvider(service, 'github-enterprise', sessions);

		const existing = await service.getSessions('github-enterprise', { defaultScopes: true });
		await service.createSession('github-enterprise', { defaultScopes: true });

		assert.deepStrictEqual({ existing: existing.map(candidate => candidate.id), requests }, {
			existing: ['exact', 'one-extra', 'wide'],
			requests: [{ operation: 'get', scopes: undefined }, { operation: 'create', scopes: defaultScopes }]
		});
	});

	test('rejects providers without default scopes before asking the provider', async () => {
		const service = createService();
		const otherRequests = registerProvider(service, 'microsoft', sessions);
		const otherProvider = [
			await getError(service.getSessions('microsoft', { defaultScopes: true })),
			await getError(service.createSession('microsoft', { defaultScopes: true })),
		];
		const malformedAdditionalScopes = await getError(service.createSession('github', { defaultScopes: true, additionalScopes: 'gist' as unknown as string[] }));
		// Only one service at a time can handle the authentication extension point.
		service.dispose();

		// The product fallback used when running without a product.json has no provider scopes.
		const unconfigured = createService([]);
		const unconfiguredRequests = registerProvider(unconfigured, 'github', sessions);
		const emptyConfiguration = [
			await getError(unconfigured.getSessions('github', { defaultScopes: true })),
			await getError(unconfigured.createSession('github', { defaultScopes: true })),
		];

		assert.deepStrictEqual({
			otherProvider,
			emptyConfiguration,
			malformedAdditionalScopes,
			requests: [...otherRequests, ...unconfiguredRequests],
		}, {
			otherProvider: [
				`Authentication provider 'microsoft' does not define default scopes.`,
				`Authentication provider 'microsoft' does not define default scopes.`,
			],
			emptyConfiguration: [
				`Authentication provider 'github' does not define default scopes.`,
				`Authentication provider 'github' does not define default scopes.`,
			],
			malformedAdditionalScopes: 'The additional scopes of a default scopes request must be an array of strings.',
			requests: [],
		});
	});

	test('request keys distinguish default scopes requests from scope lists', () => {
		assert.deepStrictEqual({
			reorderedAdditionalScopes: getAuthenticationSessionRequestKey({ defaultScopes: true, additionalScopes: ['b', 'a'] }) === getAuthenticationSessionRequestKey({ defaultScopes: true, additionalScopes: ['a', 'b', 'a'] }),
			emptyAdditionalScopes: getAuthenticationSessionRequestKey({ defaultScopes: true, additionalScopes: [] }) === getAuthenticationSessionRequestKey({ defaultScopes: true }),
			scopeList: getAuthenticationSessionRequestKey({ defaultScopes: true }) === getAuthenticationSessionRequestKey(defaultScopes),
			emptyScopeList: getAuthenticationSessionRequestKey({ defaultScopes: true }) === getAuthenticationSessionRequestKey([]),
		}, {
			reorderedAdditionalScopes: true,
			emptyAdditionalScopes: true,
			scopeList: false,
			emptyScopeList: false,
		});
	});
});
