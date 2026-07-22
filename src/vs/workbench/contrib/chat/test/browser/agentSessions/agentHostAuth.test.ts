/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService, type IAuthenticationProvider } from '../../../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { CHAT_SETUP_ACTION_ID } from '../../../browser/actions/chatActions.js';
import { authenticateProtectedResources, resolveAuthenticationInteractively, resolveTokenForResource, AgentHostAuthTokenCache, agentHostMcpServerId, resolveMcpServerAuthentication, type IAgentHostAuthenticationOptions } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { commandId: string; args: unknown[] }[] = [];
	result: unknown = { success: true, dialogSkipped: false };
	onExecute: (() => void) | undefined;

	override async executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
		this.calls.push({ commandId, args });
		this.onExecute?.();
		return this.result as R;
	}
}

function createAuthInstantiationService(disposables: Pick<DisposableStore, 'add'>, authenticationService: IAuthenticationService, commandService = new TestCommandService()): TestInstantiationService {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IAuthenticationService, authenticationService);
	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(ILogService, new NullLogService());
	return instantiationService;
}

function createMockAuthService(overrides: {
	getOrActivateProviderIdForServer?: (serverUri: URI, resourceUri: URI) => Promise<string | undefined>;
	getSessions?: (providerId: string, scopes: string[] | undefined, options: any, activate: boolean) => Promise<readonly { scopes: string[]; accessToken: string }[]>;
	createSession?: (providerId: string, scopes: string[], options: any) => Promise<{ accessToken: string }>;
	createDynamicAuthenticationProvider?: (...args: Parameters<IAuthenticationService['createDynamicAuthenticationProvider']>) => Promise<{ readonly id: string } | undefined>;
	getProvider?: IAuthenticationService['getProvider'];
	isDynamicAuthenticationProvider?: (providerId: string) => boolean;
	unregisterAuthenticationProvider?: (providerId: string) => void;
}): IAuthenticationService {
	return {
		getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(undefined)),
		getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
		createSession: overrides.createSession ?? (() => Promise.reject(new Error('Unexpected createSession call'))),
		createDynamicAuthenticationProvider: overrides.createDynamicAuthenticationProvider ?? (() => Promise.resolve(undefined)),
		getProvider: overrides.getProvider ?? (() => { throw new Error('Unexpected getProvider call'); }),
		isDynamicAuthenticationProvider: overrides.isDynamicAuthenticationProvider ?? (() => false),
		unregisterAuthenticationProvider: overrides.unregisterAuthenticationProvider ?? (() => { }),
	} as unknown as IAuthenticationService;
}

suite('agentHostMcpServerId', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('is stable for the same authority, server name and resource url', () => {
		// The key must not depend on the (per-session / per-sync) customization id, so remembered
		// auth survives reloads. Same inputs must always produce the same key.
		const a = agentHostMcpServerId('remote-host', 'GitHub', 'https://api.githubcopilot.com/mcp/');
		const b = agentHostMcpServerId('remote-host', 'GitHub', 'https://api.githubcopilot.com/mcp/');
		assert.strictEqual(a, b);
		assert.strictEqual(a, 'agent-host-mcp:remote-host/GitHub/https%3A%2F%2Fapi.githubcopilot.com%2Fmcp%2F');
	});

	test('differs when authority, name or url differ', () => {
		const base = agentHostMcpServerId('host-1', 'GitHub', 'https://a.example/mcp');
		const keys = new Set([
			base,
			agentHostMcpServerId('host-2', 'GitHub', 'https://a.example/mcp'),
			agentHostMcpServerId('host-1', 'Other', 'https://a.example/mcp'),
			agentHostMcpServerId('host-1', 'GitHub', 'https://b.example/mcp'),
		]);
		assert.strictEqual(keys.size, 4);
	});
});

suite('resolveTokenForResource', () => {

	const log = new NullLogService();
	const resource = URI.parse('https://api.example.com');

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when no authorization servers provided', async () => {
		const authService = createMockAuthService({});
		const token = await resolveTokenForResource(resource, [], ['read'], authService, log, 'test');
		assert.strictEqual(token, undefined);
	});

	test('returns undefined when no provider matches the server', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve(undefined),
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, undefined);
	});

	test('returns token from exact scope match', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes && scopes.length === 1 && scopes[0] === 'read') {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'exact-token' }]);
				}
				return Promise.resolve([]);
			},
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, 'exact-token');
	});

	test('falls back to narrowest superset session when exact match fails', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes !== undefined) {
					// Exact match returns empty
					return Promise.resolve([]);
				}
				// All sessions — return two superset options
				return Promise.resolve([
					{ scopes: ['read', 'write', 'admin'], accessToken: 'wide-token' },
					{ scopes: ['read', 'write'], accessToken: 'narrow-token' },
				]);
			},
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, 'narrow-token');
	});

	test('returns undefined when no session has matching scopes', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes !== undefined) {
					return Promise.resolve([]);
				}
				// No session contains the 'read' scope
				return Promise.resolve([
					{ scopes: ['write'], accessToken: 'wrong-token' },
				]);
			},
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, undefined);
	});

	test('tries multiple authorization servers in order', async () => {
		const calls: string[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: (serverUri) => {
				calls.push(serverUri.toString());
				if (serverUri.toString() === 'https://auth2.example.com/') {
					return Promise.resolve('provider-2');
				}
				return Promise.resolve(undefined);
			},
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'server2-token' }]),
		});
		const token = await resolveTokenForResource(
			resource,
			['https://auth1.example.com', 'https://auth2.example.com'],
			['read'], authService, log, 'test',
		);
		assert.strictEqual(token, 'server2-token');
		assert.strictEqual(calls.length, 2);
	});
});

suite('AgentHostAuthTokenCache', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the first token and skips it after completion', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		const authenticate = async () => { authenticateCalls++; };

		const results = [
			await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate),
			await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate),
		];

		assert.deepStrictEqual({ results, authenticateCalls }, { results: [true, false], authenticateCalls: 1 });
	});

	test('same-token callers await the in-flight authentication', async () => {
		const cache = new AgentHostAuthTokenCache();
		const authentication = new DeferredPromise<void>();
		let authenticateCalls = 0;
		const authenticate = async () => {
			authenticateCalls++;
			await authentication.p;
		};
		let secondSettled = false;

		const first = cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate);
		const second = cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate).then(result => {
			secondSettled = true;
			return result;
		});
		await Promise.resolve();
		const beforeCompletion = { authenticateCalls, secondSettled };
		authentication.complete();

		assert.deepStrictEqual({
			beforeCompletion,
			results: await Promise.all([first, second]),
			authenticateCalls,
		}, {
			beforeCompletion: { authenticateCalls: 1, secondSettled: false },
			results: [true, false],
			authenticateCalls: 1,
		});
	});

	test('different tokens are serialized for the same resource and scopes', async () => {
		const cache = new AgentHostAuthTokenCache();
		const firstAuthentication = new DeferredPromise<void>();
		const calls: string[] = [];

		const first = cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
			await firstAuthentication.p;
		});
		const second = cache.authenticate('https://api.example.com', ['read'], 'tok2', async () => {
			calls.push('tok2');
		});
		await Promise.resolve();
		const beforeCompletion = [...calls];
		firstAuthentication.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({ beforeCompletion, calls }, { beforeCompletion: ['tok1'], calls: ['tok1', 'tok2'] });
	});

	test('a completed token waits for a newer in-flight authentication', async () => {
		const cache = new AgentHostAuthTokenCache();
		const newerAuthentication = new DeferredPromise<void>();
		const calls: string[] = [];
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
		});
		const newer = cache.authenticate('https://api.example.com', ['read'], 'tok2', async () => {
			calls.push('tok2');
			await newerAuthentication.p;
		});
		let olderSettled = false;
		const older = cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
		}).then(result => {
			olderSettled = true;
			return result;
		});
		await Promise.resolve();
		const beforeCompletion = { calls: [...calls], olderSettled };
		newerAuthentication.complete();

		assert.deepStrictEqual({
			beforeCompletion,
			results: await Promise.all([newer, older]),
			calls,
		}, {
			beforeCompletion: { calls: ['tok1', 'tok2'], olderSettled: false },
			results: [true, true],
			calls: ['tok1', 'tok2', 'tok1'],
		});
	});

	test('clear cancels queued authentication from the previous generation', async () => {
		const cache = new AgentHostAuthTokenCache();
		const firstAuthentication = new DeferredPromise<void>();
		const calls: string[] = [];
		const first = cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
			await firstAuthentication.p;
		});
		const queued = cache.authenticate('https://api.example.com', ['read'], 'tok2', async () => {
			calls.push('tok2');
		});
		cache.clear();
		await cache.authenticate('https://api.example.com', ['read'], 'tok3', async () => {
			calls.push('tok3');
		});
		firstAuthentication.complete();

		await assert.rejects(first);
		await assert.rejects(queued);
		assert.deepStrictEqual(calls, ['tok1', 'tok3']);
	});

	test('scoped clear does not cancel unrelated in-flight authentication', async () => {
		const cache = new AgentHostAuthTokenCache();
		const unrelatedAuthentication = new DeferredPromise<void>();
		let unrelatedCalls = 0;
		const unrelated = cache.authenticate('https://other.example.com', ['read'], 'other-token', async () => {
			unrelatedCalls++;
			await unrelatedAuthentication.p;
		});
		cache.clear('https://api.example.com', ['read']);
		unrelatedAuthentication.complete();

		assert.deepStrictEqual({
			result: await unrelated,
			unrelatedCalls,
			repeated: await cache.authenticate('https://other.example.com', ['read'], 'other-token', async () => {
				unrelatedCalls++;
			}),
		}, {
			result: true,
			unrelatedCalls: 1,
			repeated: false,
		});
	});

	test('tokens for distinct scopes and resources are tracked independently', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		const authenticate = async () => { authenticateCalls++; };

		await Promise.all([
			cache.authenticate('https://api.example.com', ['read'], 'read-token', authenticate),
			cache.authenticate('https://api.example.com', ['write'], 'write-token', authenticate),
			cache.authenticate('https://other.example.com', ['read'], 'read-token', authenticate),
		]);

		assert.strictEqual(authenticateCalls, 3);
	});

	test('failed authentication is not cached', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		await assert.rejects(cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			authenticateCalls++;
			throw new Error('failed');
		}), /failed/);
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			authenticateCalls++;
		});

		assert.strictEqual(authenticateCalls, 2);
	});

	test('clear forgets every completed token', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		const authenticate = async () => { authenticateCalls++; };
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate);
		await cache.authenticate('https://other.example.com', ['read'], 'tok2', authenticate);
		cache.clear();
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate);
		await cache.authenticate('https://other.example.com', ['read'], 'tok2', authenticate);

		assert.strictEqual(authenticateCalls, 4);
	});
});

suite('resolveMcpServerAuthentication', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses challenge scopes without replacing the protected resource scope catalog', async () => {
		const requestedScopes: (readonly string[] | undefined)[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				requestedScopes.push(scopes);
				return Promise.resolve([]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['repo', 'read:org', 'notifications'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'server-id',
			mcpServerName: 'Example',
			mcpServerUrl: 'https://mcp.example.com',
			scopes: ['notifications'],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, requestedScopes }, {
			result: false,
			requestedScopes: [['notifications']],
		});
	});

	test('uses supported scopes when the challenge does not specify scopes', async () => {
		const requestedScopes: (readonly string[])[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				requestedScopes.push(scopes ?? []);
				return Promise.resolve([]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.slack.com',
			resource_name: 'Slack API',
			authorization_servers: ['https://mcp.slack.com'],
			scopes_supported: ['search:read.public', 'chat:write'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'slack',
			mcpServerName: 'Slack',
			mcpServerUrl: 'https://mcp.slack.com',
			scopes: [],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, requestedScopes }, {
			result: false,
			requestedScopes: [['search:read.public', 'chat:write']],
		});
	});

	test('does not eagerly request GitHub MCP supported scopes', async () => {
		const requestedScopes: (readonly string[])[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				requestedScopes.push(scopes ?? []);
				return Promise.resolve([]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://api.githubcopilot.com/mcp',
			resource_name: 'GitHub MCP Server',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['repo', 'notifications'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'github',
			mcpServerName: 'GitHub',
			mcpServerUrl: 'https://api.githubcopilot.com/mcp',
			scopes: [],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, requestedScopes }, {
			result: false,
			requestedScopes: [[]],
		});
	});

	test('does not attempt dynamic provider creation without user interaction', async () => {
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, createMockAuthService({}));
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(ILogService, logService);

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.example.com',
			authorization_servers: ['not-a-valid-authorization-server'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'server-id',
			mcpServerName: 'Example',
			mcpServerUrl: 'https://mcp.example.com',
			scopes: [],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, warnings }, {
			result: false,
			warnings: [],
		});
	});

	test('restores a persisted configured provider without user interaction', async () => {
		const dynamicProviderId = 'https://mcp.slack.com/ https://mcp.slack.com';
		const providerCreations: string[] = [];
		const authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		let isProviderActive = false;
		const authService = createMockAuthService({
			isDynamicAuthenticationProvider: providerId => providerId === dynamicProviderId && isProviderActive,
			createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
				providerCreations.push(clientId ?? '');
				isProviderActive = true;
				return { id: dynamicProviderId };
			},
			getSessions: () => Promise.resolve([{
				id: 'slack-session',
				scopes: ['search:read.public'],
				accessToken: 'slack-token',
				account: { id: 'account-id', label: 'Slack Account' },
			}]),
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'Slack Account',
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve({ clientId: 'slack-client-id' }),
		});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.slack.com',
			authorization_servers: ['https://mcp.slack.com'],
			scopes_supported: ['search:read.public'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'slack',
			mcpServerName: 'Slack',
			mcpServerUrl: 'https://mcp.slack.com',
			oauthClient: { clientId: 'slack-client-id' },
			scopes: [],
			authorizationServerMetadataFetcher: async authorizationServer => ({
				metadata: {
					issuer: authorizationServer,
					response_types_supported: ['code'],
				},
				discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
				errors: [],
			}),
			authenticate: async request => {
				authenticateRequests.push(request);
			},
		});

		assert.deepStrictEqual({ result, providerCreations, authenticateRequests }, {
			result: true,
			providerCreations: ['slack-client-id'],
			authenticateRequests: [{
				resource: 'https://mcp.slack.com',
				scopes: ['search:read.public'],
				token: 'slack-token',
			}],
		});
	});

	test('uses configured public and confidential clients when creating a dynamic provider', async () => {
		const dynamicProviderId = 'https://mcp.slack.com/ https://mcp.slack.com';
		const providerCreations: { authorizationServer: string; resource: string | undefined; clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const sessionRequests: { clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const sessionCreations: { clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const removedProviders: string[] = [];
		let registeredClient: { clientId?: string; clientSecret?: string } | undefined;
		let getSessionsCall = 0;
		const provider: IAuthenticationProvider = {
			id: dynamicProviderId,
			label: 'Slack',
			supportsMultipleAccounts: false,
			onDidChangeSessions: Event.None,
			getSessions: () => Promise.reject(new Error('Unexpected provider getSessions call')),
			createSession: () => Promise.reject(new Error('Unexpected provider createSession call')),
			removeSession: () => Promise.reject(new Error('Unexpected provider removeSession call')),
		};
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.reject(new Error('Configured clients must not use a built-in provider')),
			getSessions: (_providerId, _scopes, options) => {
				sessionRequests.push({ clientId: options.clientId, clientSecret: options.clientSecret });
				getSessionsCall++;
				return Promise.resolve(getSessionsCall === 1 ? [{
					scopes: ['search:read.public'],
					accessToken: 'public-token',
					account: { id: 'account-id', label: 'Slack Account' },
				}] : []);
			},
			createSession: (_providerId, _scopes, options) => {
				sessionCreations.push({ clientId: options.clientId, clientSecret: options.clientSecret });
				return Promise.resolve({
					id: 'confidential-session',
					accessToken: 'confidential-token',
					account: { id: 'account-id', label: 'Slack Account' },
					scopes: ['search:read.public'],
				});
			},
			createDynamicAuthenticationProvider: async (authorizationServer, _metadata, resource, clientId, clientSecret) => {
				providerCreations.push({
					authorizationServer: authorizationServer.toString(true),
					resource: resource?.resource,
					clientId,
					clientSecret,
				});
				registeredClient = { clientId, clientSecret };
				return { id: dynamicProviderId };
			},
			getProvider: () => provider,
			isDynamicAuthenticationProvider: providerId => providerId === dynamicProviderId && registeredClient !== undefined,
			unregisterAuthenticationProvider: providerId => {
				removedProviders.push(providerId);
				registeredClient = undefined;
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
			updateAllowedMcpServers: () => { },
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'Slack Account',
			updateAccountPreference: () => { },
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve(registeredClient),
			removeDynamicProvider: async providerId => {
				removedProviders.push(providerId);
			},
		});
		instantiationService.stub(ILogService, new NullLogService());

		const results: boolean[] = [];
		for (const oauthClient of [
			{ clientId: 'public-client-id' },
			{ clientId: 'confidential-client-id', clientSecret: 'confidential-client-secret' },
		]) {
			results.push(await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
				resource: 'https://mcp.slack.com',
				authorization_servers: ['https://mcp.slack.com'],
				scopes_supported: ['search:read.public'],
			}, {
				allowInteraction: true,
				logPrefix: '[AgentHost]',
				mcpServerId: 'slack',
				mcpServerName: 'Slack',
				mcpServerUrl: 'https://mcp.slack.com',
				oauthClient,
				scopes: ['search:read.public'],
				authorizationServerMetadataFetcher: async authorizationServer => ({
					metadata: {
						issuer: authorizationServer,
						response_types_supported: ['code'],
					},
					discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
					errors: [],
				}),
				authenticate: async request => {
					authenticateRequests.push(request);
				},
			}));
		}

		assert.deepStrictEqual({
			results,
			providerCreations,
			sessionRequests,
			sessionCreations,
			authenticateRequests,
			removedProviders,
		}, {
			results: [true, true],
			providerCreations: [
				{
					authorizationServer: 'https://mcp.slack.com/',
					resource: 'https://mcp.slack.com',
					clientId: 'public-client-id',
					clientSecret: undefined,
				},
				{
					authorizationServer: 'https://mcp.slack.com/',
					resource: 'https://mcp.slack.com',
					clientId: 'confidential-client-id',
					clientSecret: 'confidential-client-secret',
				},
			],
			sessionRequests: [
				{ clientId: 'public-client-id', clientSecret: undefined },
				{ clientId: 'confidential-client-id', clientSecret: 'confidential-client-secret' },
			],
			sessionCreations: [
				{ clientId: 'confidential-client-id', clientSecret: 'confidential-client-secret' },
			],
			authenticateRequests: [
				{
					resource: 'https://mcp.slack.com',
					scopes: ['search:read.public'],
					token: 'public-token',
				},
				{
					resource: 'https://mcp.slack.com',
					scopes: ['search:read.public'],
					token: 'confidential-token',
				},
			],
			removedProviders: [dynamicProviderId, dynamicProviderId],
		});
	});
});

suite('authenticateProtectedResources', () => {

	const protectedResource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('skips authenticate when the cached token is unchanged', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes) {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'cached-token' }]);
				}

				return Promise.resolve([]);
			},
		});
		const cache = new AgentHostAuthTokenCache();
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token' }]);
	});
});

suite('resolveAuthenticationInteractively', () => {

	const protectedResource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses an existing token before prompting and dedupes repeated checks', async () => {
		let createSessionCalls = 0;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes) {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'existing-token' }]);
				}

				return Promise.resolve([]);
			},
			createSession: async () => {
				createSessionCalls++;
				return { accessToken: 'new-token' };
			},
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const cache = new AgentHostAuthTokenCache();
		const instantiationService = createAuthInstantiationService(disposables, authService);

		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		};
		const results = [
			await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options),
			await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options),
		];

		assert.deepStrictEqual({ results, requests, createSessionCalls }, {
			results: [true, true],
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'existing-token' }],
			createSessionCalls: 0,
		});
	});

	test('uses the product sign-in flow and forwards its token', async () => {
		let signedIn = false;
		const commandService = new TestCommandService();
		commandService.onExecute = () => signedIn = true;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve(signedIn ? [{ scopes: ['read'], accessToken: 'signed-in-token' }] : []),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);

		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual({ success, commandCalls: commandService.calls, requests }, {
			success: true,
			commandCalls: [{
				commandId: CHAT_SETUP_ACTION_ID,
				args: [undefined, {
					forceSignInDialog: true,
					additionalScopes: ['read'],
					dialogTitle: 'Sign in to use GitHub Copilot',
					disableChatViewReveal: true,
					returnResult: true,
				}],
			}],
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'signed-in-token' }],
		});
	});

	test('does not fall back to direct provider login when product sign-in is canceled', async () => {
		const commandService = new TestCommandService();
		commandService.result = { success: undefined, dialogSkipped: false };
		let createSessionCalls = 0;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([]),
			createSession: async () => {
				createSessionCalls++;
				return { accessToken: 'unexpected-token' };
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);

		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ success, createSessionCalls }, { success: false, createSessionCalls: 0 });
	});

	test('propagates product sign-in failures', async () => {
		const commandService = new TestCommandService();
		commandService.result = { success: false, dialogSkipped: false, error: new Error('Bad credentials') };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([]),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);

		await assert.rejects(instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		}), /Bad credentials/);
	});
});
