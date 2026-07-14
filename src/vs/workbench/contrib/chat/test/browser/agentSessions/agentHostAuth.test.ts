/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { authenticateProtectedResources, resolveAuthenticationInteractively, resolveTokenForResource, AgentHostAuthTokenCache, agentHostMcpServerId, resolveMcpServerAuthentication } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';

function createMockAuthService(overrides: {
	getOrActivateProviderIdForServer?: (serverUri: URI, resourceUri: URI) => Promise<string | undefined>;
	getSessions?: (providerId: string, scopes: string[] | undefined, options: any, activate: boolean) => Promise<readonly { scopes: string[]; accessToken: string }[]>;
	createSession?: (providerId: string, scopes: string[], options: any) => Promise<{ accessToken: string }>;
}): IAuthenticationService {
	return {
		getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(undefined)),
		getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
		createSession: overrides.createSession ?? (() => Promise.reject(new Error('Unexpected createSession call'))),
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

	test('first token for a resource is reported as changed', () => {
		const cache = new AgentHostAuthTokenCache();
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1'), true);
	});

	test('repeating the same token for the same resource is reported as unchanged', () => {
		const cache = new AgentHostAuthTokenCache();
		cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1');
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1'), false);
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1'), false);
	});

	test('a different token for the same resource is reported as changed', () => {
		const cache = new AgentHostAuthTokenCache();
		cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1');
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok2'), true);
		// And the new token is now the cached one.
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok2'), false);
	});

	test('tokens for distinct scopes are tracked independently', () => {
		const cache = new AgentHostAuthTokenCache();
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'read-token'), true);
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['write'], 'write-token'), true);
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'read-token'), false);
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['write'], 'write-token'), false);
	});

	test('tokens for distinct resources are tracked independently', () => {
		const cache = new AgentHostAuthTokenCache();
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1'), true);
		assert.strictEqual(cache.updateAndIsChanged('https://other.example.com', ['read'], 'tok1'), true);
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1'), false);
		assert.strictEqual(cache.updateAndIsChanged('https://other.example.com', ['read'], 'tok1'), false);
	});

	test('clear forgets every cached token', () => {
		const cache = new AgentHostAuthTokenCache();
		cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1');
		cache.updateAndIsChanged('https://other.example.com', ['read'], 'tok2');
		cache.clear();
		assert.strictEqual(cache.updateAndIsChanged('https://api.example.com', ['read'], 'tok1'), true);
		assert.strictEqual(cache.updateAndIsChanged('https://other.example.com', ['read'], 'tok2'), true);
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
});

suite('authenticateProtectedResources', () => {

	const log = new NullLogService();
	const protectedResource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};

	ensureNoDisposablesAreLeakedInTestSuite();

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

		await authenticateProtectedResources(agents, {
			authTokenCache: cache,
			authenticationService: authService,
			logPrefix: '[AgentHost]',
			logService: log,
			authenticate: async request => {
				requests.push(request);
			},
		});
		await authenticateProtectedResources(agents, {
			authTokenCache: cache,
			authenticationService: authService,
			logPrefix: '[AgentHost]',
			logService: log,
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token' }]);
	});
});

suite('resolveAuthenticationInteractively', () => {

	const log = new NullLogService();
	const protectedResource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses an existing token before prompting for a new session', async () => {
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

		const success = await resolveAuthenticationInteractively([protectedResource], {
			authTokenCache: new AgentHostAuthTokenCache(),
			authenticationService: authService,
			logPrefix: '[AgentHost]',
			logService: log,
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.strictEqual(success, true);
		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'existing-token' }]);
		assert.strictEqual(createSessionCalls, 0);
	});

	test('creates a session when no existing token is available', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([]),
			createSession: async () => ({ accessToken: 'new-token' }),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];

		const success = await resolveAuthenticationInteractively([protectedResource], {
			authTokenCache: new AgentHostAuthTokenCache(),
			authenticationService: authService,
			logPrefix: '[AgentHost]',
			logService: log,
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.strictEqual(success, true);
		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'new-token' }]);
	});
});
