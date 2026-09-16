/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID, AGENT_HOST_MICROSOFT_TUNNEL_PROTECTED_RESOURCE_ID, AgentHostTunnelAuthenticationIssuer, createAgentHostTunnelProtectedResources, getAgentHostTunnelAuthenticationIssuer } from '../../../../../../platform/agentHost/common/agentHostFeatureAuthentication.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AuthRequiredReason } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService, type AuthenticationSession, type IAuthenticationProvider } from '../../../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { CHAT_SETUP_ACTION_ID } from '../../../browser/actions/chatActions.js';
import { AgentHostAuthenticationRecovery, authenticateProtectedResources, authenticateProtectedResourcesWithToken, resolveAuthenticationInteractively, resolveSessionForResource, AgentHostAuthTokenCache, agentHostMcpServerId, resolveMcpServerAuthentication, modelRequiresAgentAuthentication, revokeAuthenticationForRemovedSessions, revokeAuthenticationForRemovedSessionsFromResources, type IAgentHostAuthenticationOptions } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';
import { createAgentModelByokMeta } from '../../../../../../platform/agentHost/common/agentModelByokMeta.js';

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { commandId: string; args: unknown[] }[] = [];
	result: unknown = { success: true, dialogSkipped: false };
	onExecute: (() => void | Promise<void>) | undefined;

	override async executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
		this.calls.push({ commandId, args });
		await this.onExecute?.();
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
	getSessions?: (providerId: string, scopes: string[] | undefined, options: any, activate: boolean) => Promise<readonly { scopes: string[]; accessToken: string; expiresAfter?: number }[]>;
	createSession?: (providerId: string, scopes: string[], options: any) => Promise<{ accessToken: string }>;
	createDynamicAuthenticationProvider?: (...args: Parameters<IAuthenticationService['createDynamicAuthenticationProvider']>) => Promise<{ readonly id: string } | undefined>;
	getProvider?: IAuthenticationService['getProvider'];
	isDynamicAuthenticationProvider?: (providerId: string) => boolean;
	isAuthenticationProviderRegistered?: (providerId: string) => boolean;
	declaredProviders?: IAuthenticationService['declaredProviders'];
	unregisterAuthenticationProvider?: (providerId: string) => void;
}): IAuthenticationService {
	return {
		getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(undefined)),
		getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
		createSession: overrides.createSession ?? (() => Promise.reject(new Error('Unexpected createSession call'))),
		createDynamicAuthenticationProvider: overrides.createDynamicAuthenticationProvider ?? (() => Promise.resolve(undefined)),
		getProvider: overrides.getProvider ?? (() => { throw new Error('Unexpected getProvider call'); }),
		isDynamicAuthenticationProvider: overrides.isDynamicAuthenticationProvider ?? (() => false),
		isAuthenticationProviderRegistered: overrides.isAuthenticationProviderRegistered ?? (() => true),
		declaredProviders: overrides.declaredProviders ?? [],
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

suite('resolveSessionForResource', () => {

	const log = new NullLogService();
	const resource = URI.parse('https://api.example.com');

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when no authorization servers provided', async () => {
		const authService = createMockAuthService({});
		const token = (await resolveSessionForResource(resource, [], ['read'], authService, log, 'test'))?.accessToken;
		assert.strictEqual(token, undefined);
	});

	test('returns undefined when no provider matches the server', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve(undefined),
		});
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
		assert.strictEqual(token, undefined);
	});

	test('maps tunnel resource identifiers directly to cached GitHub and Microsoft sessions', async () => {
		const calls: Array<{ readonly providerId: string; readonly scopes: readonly string[] | undefined }> = [];
		const authService = createMockAuthService({
			getSessions: (providerId, scopes) => {
				calls.push({ providerId, scopes });
				return Promise.resolve(scopes ? [{
					scopes,
					accessToken: `${providerId}-token`,
				}] : []);
			},
		});

		const githubToken = (await resolveSessionForResource(
			URI.parse(AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID),
			[],
			['github-scope'],
			authService,
			log,
			'test',
		))?.accessToken;
		const microsoftToken = (await resolveSessionForResource(
			URI.parse(AGENT_HOST_MICROSOFT_TUNNEL_PROTECTED_RESOURCE_ID),
			[],
			['microsoft-scope'],
			authService,
			log,
			'test',
		))?.accessToken;

		assert.deepStrictEqual({
			issuers: [
				getAgentHostTunnelAuthenticationIssuer(AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID),
				getAgentHostTunnelAuthenticationIssuer(AGENT_HOST_MICROSOFT_TUNNEL_PROTECTED_RESOURCE_ID),
			],
			tokens: [githubToken, microsoftToken],
			calls,
		}, {
			issuers: [AgentHostTunnelAuthenticationIssuer.GitHub, AgentHostTunnelAuthenticationIssuer.Microsoft],
			tokens: ['github-token', 'microsoft-token'],
			calls: [
				{ providerId: 'github', scopes: ['github-scope'] },
				{ providerId: 'microsoft', scopes: ['microsoft-scope'] },
			],
		});
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
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
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
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
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
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
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
		const token = (await resolveSessionForResource(
			resource,
			['https://auth1.example.com', 'https://auth2.example.com'],
			['read'], authService, log, 'test',
		))?.accessToken;
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

	test('disposal cancels pending authentication and rejects future use', async () => {
		const cache = new AgentHostAuthTokenCache();
		const authentication = new DeferredPromise<void>();
		const pending = cache.authenticate('https://api.example.com', ['read'], 'tok1', () => authentication.p);

		cache.dispose();
		authentication.complete();

		await assert.rejects(pending, /Canceled/);
		await assert.rejects(
			cache.authenticate('https://api.example.com', ['read'], 'tok2', async () => { }),
			/Canceled/,
		);
	});

	test('rechecks currentness when a queued cached-auth callback begins forwarding', async () => {
		const cache = new AgentHostAuthTokenCache();
		const firstAuthentication = new DeferredPromise<void>();
		const [resource] = createAgentHostTunnelProtectedResources({ github: { scopes: ['github-scope'] } });
		const first = cache.authenticate(resource.resource, resource.scopes_supported, 'first-token', () => firstAuthentication.p);
		const forwardedTokens: string[] = [];
		let current = true;
		const queued = authenticateProtectedResourcesWithToken([resource], 'queued-token', {
			authTokenCache: cache,
			isCurrent: () => current,
			authenticate: async request => { forwardedTokens.push(request.token); },
		});
		await Promise.resolve();

		current = false;
		firstAuthentication.complete();
		await first;

		await assert.rejects(queued, /Canceled/);
		assert.deepStrictEqual(forwardedTokens, []);
	});
});

suite('AgentHostAuthenticationRecovery', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels recovery when its enablement generation becomes stale', async () => {
		const sessions = new DeferredPromise<readonly { scopes: string[]; accessToken: string }[]>();
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => sessions.p,
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const authenticateCalls: string[] = [];
		let current = true;
		const recoveryPromise = recovery.recover({
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		}, {
			logPrefix: '[AgentHost]',
			isCurrent: () => current,
			authenticate: async request => { authenticateCalls.push(request.token); },
		});

		current = false;
		recovery.clear();
		sessions.complete([{ scopes: ['read'], accessToken: 'tok-1' }]);

		await assert.rejects(recoveryPromise, /Canceled/);
		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 0,
			authenticateCalls: [],
		});
	});

	test('force-forwards the post-sign-in token when session-change handling repopulates the cache', async () => {
		const token = { value: 'tok-1' };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [{ scopes, accessToken: token.value }] : []),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const cache = new AgentHostAuthTokenCache();
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await recovery.recover(resource, options);
		commandService.onExecute = async () => {
			token.value = 'tok-2';
			await cache.authenticate(resource.resource, resource.scopes_supported, token.value, async () => {
				authenticateCalls.push(token.value);
			});
		};
		await recovery.recover(resource, options);

		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 1,
			authenticateCalls: ['tok-1', 'tok-2', 'tok-2'],
		});

		await recovery.recover(resource, options);
		assert.strictEqual(commandService.calls.length, 2);
	});

	test('does not forward credential removal and resets escalation when the current token disappears', async () => {
		const token = { value: 'tok-1' as string | undefined };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(token.value && scopes ? [{ scopes, accessToken: token.value }] : []),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await recovery.recover(resource, options);
		token.value = undefined;
		await recovery.recover(resource, options);
		token.value = 'tok-1';
		await recovery.recover(resource, options);

		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 0,
			authenticateCalls: ['tok-1', 'tok-1'],
		});
	});

	test('serializes optional tunnel issuer alternatives and forwards only one cached credential', async () => {
		const authService = createMockAuthService({
			getSessions: (providerId, scopes) => Promise.resolve(scopes ? [{
				scopes,
				accessToken: `${providerId}-token`,
			}] : []),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resources = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
			microsoft: { scopes: ['microsoft-scope'] },
		});
		const authenticateCalls: string[] = [];

		await Promise.all(resources.map(resource => recovery.recover(resource, {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(`${request.resource}:${request.token}`); },
		}, AuthRequiredReason.Required)));

		assert.deepStrictEqual({
			authenticateCalls,
			commandCalls: commandService.calls,
			reconcilableResources: recovery.reconcilableProtectedResources,
		}, {
			authenticateCalls: [`${resources[0].resource}:github-token`],
			commandCalls: [],
			reconcilableResources: [resources[0]],
		});
	});

	test('does not force optional tunnel sign-in when no cached token is available', async () => {
		const authService = createMockAuthService({
			getSessions: providerId => Promise.resolve(providerId === 'microsoft' ? [{
				scopes: ['microsoft-scope'],
				accessToken: 'microsoft-token',
			}] : []),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resources = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
			microsoft: { scopes: ['microsoft-scope'] },
		});
		const authenticateCalls: string[] = [];

		await Promise.all(resources.map(resource => recovery.recover(resource, {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(`${request.resource}:${request.token}`); },
		}, AuthRequiredReason.Required)));
		await recovery.recover(resources[1], {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(`${request.resource}:${request.token}`); },
		}, AuthRequiredReason.Expired);

		assert.deepStrictEqual({
			authenticateCalls,
			commandCalls: commandService.calls,
		}, {
			authenticateCalls: [`${resources[1].resource}:microsoft-token`],
			commandCalls: [],
		});
	});

	test('does not forward a tunnel credential after recovery is cleared', async () => {
		const sessions = new DeferredPromise<readonly { scopes: string[]; accessToken: string }[]>();
		const sessionLookupStarted = new DeferredPromise<void>();
		const authService = createMockAuthService({
			getSessions: (_providerId, scopes) => {
				if (scopes) {
					sessionLookupStarted.complete();
					return sessions.p;
				}
				return Promise.resolve([]);
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const [github] = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
		});
		const authenticateCalls: string[] = [];

		const recoveryPromise = recovery.recover(github, {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		});
		await sessionLookupStarted.p;
		recovery.clear();
		sessions.complete([{ scopes: ['github-scope'], accessToken: 'stale-token' }]);

		await assert.rejects(recoveryPromise, /Canceled/);
		assert.deepStrictEqual(authenticateCalls, []);
	});

	test('disposal cancels a pending credential resolution before it can forward', async () => {
		const sessions = new DeferredPromise<readonly { scopes: string[]; accessToken: string }[]>();
		const lookupStarted = new DeferredPromise<void>();
		const authService = createMockAuthService({
			getSessions: (_providerId, scopes) => {
				if (scopes) {
					lookupStarted.complete();
					return sessions.p;
				}
				return Promise.resolve([]);
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const [resource] = createAgentHostTunnelProtectedResources({ github: { scopes: ['github-scope'] } });
		const authenticateCalls: string[] = [];
		const pending = recovery.recover(resource, {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		});
		await lookupStarted.p;

		recovery.dispose();
		sessions.complete([{ scopes: ['github-scope'], accessToken: 'stale-token' }]);

		await assert.rejects(pending, /Canceled/);
		assert.deepStrictEqual(authenticateCalls, []);
	});

	test('retains only successfully forwarded challenges for session reconciliation and removes definitive sign-out', async () => {
		const token = { value: 'token' as string | undefined };
		let rejectForward = true;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(token.value && scopes ? [{ scopes, accessToken: token.value }] : []),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async () => {
				if (rejectForward) {
					throw new Error('rejected');
				}
			},
		};

		await assert.rejects(
			recovery.recover(resource, options),
			/rejected/,
		);
		const afterFailure = recovery.reconcilableProtectedResources;
		rejectForward = false;
		await recovery.recover(resource, options);
		const afterSuccess = recovery.reconcilableProtectedResources;
		token.value = undefined;
		await recovery.recover(resource, options);

		assert.deepStrictEqual({
			afterFailure,
			afterSuccess,
			afterSignOut: recovery.reconcilableProtectedResources,
		}, {
			afterFailure: [],
			afterSuccess: [resource],
			afterSignOut: [],
		});
	});

	test('retries a retained requirement when a cached session becomes available', async () => {
		const token = { value: undefined as string | undefined };
		const authService = createMockAuthService({
			getSessions: (_providerId, scopes) => Promise.resolve(token.value && scopes ? [{ scopes, accessToken: token.value }] : []),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const [resource] = createAgentHostTunnelProtectedResources({ github: { scopes: ['github-scope'] } });
		const requirement = { channel: 'ahp-root://', resource, reason: AuthRequiredReason.Required };
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await recovery.recover(resource, options);
		token.value = 'available-token';
		await recovery.retry([requirement], options);

		assert.deepStrictEqual(authenticateCalls, ['available-token']);
	});

	test('retries skipped GitHub fallback after the active Microsoft issuer signs out', async () => {
		const tokens: Record<string, string | undefined> = {
			github: undefined,
			microsoft: 'microsoft-token',
		};
		const authService = createMockAuthService({
			getSessions: (providerId, scopes) => Promise.resolve(tokens[providerId] && scopes ? [{
				scopes,
				accessToken: tokens[providerId]!,
			}] : []),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resources = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
			microsoft: { scopes: ['microsoft-scope'] },
		});
		const requirements = resources.map(resource => ({ channel: 'ahp-root://' as const, resource, reason: AuthRequiredReason.Required }));
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(`${request.resource}:${request.token}`); },
		};

		await Promise.all(resources.map(resource => recovery.recover(resource, options)));
		tokens.microsoft = undefined;
		tokens.github = 'github-token';
		await instantiationService.invokeFunction(
			revokeAuthenticationForRemovedSessionsFromResources,
			recovery.reconcilableProtectedResources,
			'microsoft',
			[{
				id: 'microsoft-session',
				account: { id: 'microsoft-account', label: 'Microsoft Account' },
				scopes: ['microsoft-scope'],
				accessToken: 'microsoft-token',
			}],
			options,
		);
		await recovery.retry(requirements, options);

		assert.deepStrictEqual({
			authenticateCalls,
			reconcilableResources: recovery.reconcilableProtectedResources,
		}, {
			authenticateCalls: [
				`${resources[1].resource}:microsoft-token`,
				`${resources[1].resource}:`,
				`${resources[0].resource}:github-token`,
			],
			reconcilableResources: [resources[0]],
		});
	});

	test('falls back to GitHub when the active Microsoft provider is unavailable', async () => {
		let microsoftUnavailable = false;
		const tokens: Record<string, string | undefined> = {
			github: undefined,
			microsoft: 'microsoft-token',
		};
		const authService = createMockAuthService({
			getSessions: (providerId, scopes) => {
				if (providerId === 'microsoft' && microsoftUnavailable) {
					return Promise.reject(new Error('provider unavailable'));
				}
				return Promise.resolve(tokens[providerId] && scopes ? [{ scopes, accessToken: tokens[providerId]! }] : []);
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resources = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
			microsoft: { scopes: ['microsoft-scope'] },
		});
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(`${request.resource}:${request.token}`); },
		};

		await Promise.all(resources.map(resource => recovery.recover(resource, options)));
		microsoftUnavailable = true;
		tokens.github = 'github-token';
		await recovery.retry(resources.map(resource => ({
			channel: 'ahp-root://' as const,
			resource,
			reason: AuthRequiredReason.Required,
		})), options);

		assert.deepStrictEqual(authenticateCalls, [
			`${resources[1].resource}:microsoft-token`,
			`${resources[0].resource}:github-token`,
		]);
	});

	test('falls back to GitHub when the active Microsoft challenge cannot refresh an expired token', async () => {
		const tokens: Record<string, string | undefined> = {
			github: undefined,
			microsoft: 'microsoft-token',
		};
		const authService = createMockAuthService({
			getSessions: (providerId, scopes) => Promise.resolve(tokens[providerId] && scopes ? [{
				scopes,
				accessToken: tokens[providerId]!,
			}] : []),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const resources = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
			microsoft: { scopes: ['microsoft-scope'] },
		});
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(`${request.resource}:${request.token}`); },
		};

		await Promise.all(resources.map(resource => recovery.recover(resource, options)));
		tokens.github = 'github-token';
		await recovery.retry(resources.map(resource => ({
			channel: 'ahp-root://' as const,
			resource,
			reason: AuthRequiredReason.Expired,
		})), options);

		assert.deepStrictEqual(authenticateCalls, [
			`${resources[1].resource}:microsoft-token`,
			`${resources[0].resource}:github-token`,
		]);
	});

	test('runs a challenge after an equivalent retained recovery already in flight', async () => {
		const retainedResolution = new DeferredPromise<readonly { scopes: string[]; accessToken: string }[]>();
		const retainedResolutionStarted = new DeferredPromise<void>();
		let exactLookupCount = 0;
		const authService = createMockAuthService({
			getSessions: (_providerId, scopes) => {
				if (!scopes) {
					return Promise.resolve([]);
				}
				exactLookupCount++;
				if (exactLookupCount === 2) {
					retainedResolutionStarted.complete();
					return retainedResolution.p;
				}
				return Promise.resolve([{ scopes, accessToken: 'token' }]);
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const [resource] = createAgentHostTunnelProtectedResources({ github: { scopes: ['scope-a', 'scope-b'] } });
		const requirement = { channel: 'ahp-root://' as const, resource, reason: AuthRequiredReason.Required };
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};
		await recovery.recover(resource, options);
		const retained = recovery.retry([requirement], options);
		await retainedResolutionStarted.p;

		const challenge = recovery.recover({ ...resource, scopes_supported: ['scope-b', 'scope-a'] }, options);
		retainedResolution.complete([{ scopes: ['scope-a', 'scope-b'], accessToken: 'token' }]);
		await Promise.all([retained, challenge]);

		assert.deepStrictEqual(authenticateCalls, ['token', 'token']);
	});

	test('clear cancels a challenge follow-up queued behind retained recovery', async () => {
		const retainedResolution = new DeferredPromise<readonly { scopes: string[]; accessToken: string }[]>();
		const retainedResolutionStarted = new DeferredPromise<void>();
		let exactLookupCount = 0;
		const authService = createMockAuthService({
			getSessions: (_providerId, scopes) => {
				if (!scopes) {
					return Promise.resolve([]);
				}
				exactLookupCount++;
				if (exactLookupCount === 2) {
					retainedResolutionStarted.complete();
					return retainedResolution.p;
				}
				return Promise.resolve([{ scopes, accessToken: exactLookupCount === 1 ? 'initial-token' : 'resurrected-token' }]);
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const [resource] = createAgentHostTunnelProtectedResources({ github: { scopes: ['scope'] } });
		const requirement = { channel: 'ahp-root://' as const, resource, reason: AuthRequiredReason.Required };
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};
		await recovery.recover(resource, options);
		const retained = recovery.retry([requirement], options);
		await retainedResolutionStarted.p;
		const challenge = recovery.recover(resource, options, AuthRequiredReason.Required);

		recovery.clear();
		retainedResolution.complete([{ scopes: ['scope'], accessToken: 'initial-token' }]);

		await assert.rejects(retained, /Canceled/);
		await assert.rejects(challenge, /Canceled/);
		assert.deepStrictEqual(authenticateCalls, ['initial-token']);
	});

	test('queues Expired challenge semantics behind a pending Required challenge', async () => {
		const token = { value: 'initial-token' };
		const requiredForwardStarted = new DeferredPromise<void>();
		const releaseRequiredForward = new DeferredPromise<void>();
		const authService = createMockAuthService({
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [{ scopes, accessToken: token.value }] : []),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = disposables.add(instantiationService.createInstance(AgentHostAuthenticationRecovery));
		const [resource] = createAgentHostTunnelProtectedResources({ github: { scopes: ['scope'] } });
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				authenticateCalls.push(request.token);
				if (request.token === 'required-token') {
					requiredForwardStarted.complete();
					await releaseRequiredForward.p;
				}
			},
		};
		await recovery.recover(resource, options);
		token.value = 'required-token';
		const required = recovery.recover(resource, options, AuthRequiredReason.Required);
		await requiredForwardStarted.p;
		token.value = 'expired-token';
		const expired = recovery.recover(resource, options, AuthRequiredReason.Expired);

		releaseRequiredForward.complete();
		await Promise.all([required, expired]);

		assert.deepStrictEqual(authenticateCalls, ['initial-token', 'required-token', 'expired-token']);
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
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
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
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
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
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
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

	test('does not create a dynamic provider silently without a persisted registration', async () => {
		const warnings: string[] = [];
		const providerCreations: string[] = [];
		const metadataRequests: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, createMockAuthService({
			createDynamicAuthenticationProvider: async authorizationServer => {
				providerCreations.push(authorizationServer.toString(true));
				return undefined;
			},
		}));
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve(undefined),
		});
		instantiationService.stub(ILogService, logService);

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.example.com',
			authorization_servers: ['https://auth.example.com'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'server-id',
			mcpServerName: 'Example',
			mcpServerUrl: 'https://mcp.example.com',
			scopes: [],
			authorizationServerMetadataFetcher: async authorizationServer => {
				metadataRequests.push(authorizationServer);
				throw new Error('Unexpected metadata request');
			},
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, warnings, metadataRequests, providerCreations }, {
			result: false,
			warnings: [],
			metadataRequests: [],
			providerCreations: [],
		});
	});

	test('restores a persisted dynamically registered provider without user interaction', async () => {
		const dynamicProviderId = 'https://mcp.notion.com/ https://mcp.notion.com/mcp';
		const providerCreations: { clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const sessionRequests: { silent: boolean | undefined }[] = [];
		const authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const authService = createMockAuthService({
			createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId, clientSecret) => {
				providerCreations.push({ clientId, clientSecret });
				return { id: dynamicProviderId };
			},
			getSessions: (_providerId, _scopes, options) => {
				sessionRequests.push({ silent: options.silent });
				return Promise.resolve([{
					id: 'notion-session',
					scopes: [],
					accessToken: 'notion-token',
					account: { id: 'account-id', label: 'Notion Account' },
				}]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'Notion Account',
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve({ clientId: 'notion-client-id', clientSecret: 'notion-client-secret' }),
		});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.notion.com/mcp',
			authorization_servers: ['https://mcp.notion.com'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'notion',
			mcpServerName: 'notion',
			mcpServerUrl: 'https://mcp.notion.com/mcp',
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

		assert.deepStrictEqual({ result, providerCreations, sessionRequests, authenticateRequests }, {
			result: true,
			providerCreations: [{ clientId: 'notion-client-id', clientSecret: 'notion-client-secret' }],
			sessionRequests: [{ silent: true }],
			authenticateRequests: [{
				resource: 'https://mcp.notion.com/mcp',
				scopes: [],
				token: 'notion-token',
			}],
		});
	});

	test('serializes authentication transactions for different configured clients', async () => {
		const dynamicProviderId = 'https://mcp.example.com/ https://mcp.example.com/resource';
		const firstSessionStarted = new DeferredPromise<void>();
		const firstSessionGate = new DeferredPromise<void>();
		const providerCreations: string[] = [];
		const sessionRequests: string[] = [];
		const authenticateRequests: string[] = [];
		let activeClient: string | undefined;
		let providerActive = false;
		const authService = createMockAuthService({
			isDynamicAuthenticationProvider: providerId => providerId === dynamicProviderId && providerActive,
			createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
				activeClient = clientId;
				providerActive = true;
				providerCreations.push(clientId ?? '');
				return { id: dynamicProviderId };
			},
			unregisterAuthenticationProvider: () => {
				providerActive = false;
			},
			getSessions: async () => {
				const clientId = activeClient ?? '';
				sessionRequests.push(clientId);
				if (clientId === 'first-client') {
					firstSessionStarted.complete();
					await firstSessionGate.p;
				}
				return [{
					id: `${clientId}-session`,
					scopes: [],
					accessToken: `${clientId}-token`,
					account: { id: 'account-id', label: 'MCP Account' },
				}];
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'MCP Account',
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve(activeClient ? { clientId: activeClient } : undefined),
			removeDynamicProvider: async () => {
				activeClient = undefined;
			},
		});
		instantiationService.stub(ILogService, new NullLogService());
		const protectedResource = {
			resource: 'https://mcp.example.com/resource',
			authorization_servers: ['https://mcp.example.com'],
		};
		const options = (clientId: string) => ({
			allowInteraction: true,
			logPrefix: '[AgentHost]',
			mcpServerId: 'example',
			mcpServerName: 'Example',
			mcpServerUrl: 'https://mcp.example.com/resource',
			oauthClient: { clientId },
			scopes: [],
			authorizationServerMetadataFetcher: async (authorizationServer: string) => ({
				metadata: {
					issuer: authorizationServer,
					response_types_supported: ['code'],
				},
				discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
				errors: [],
			}),
			authenticate: async (request: { token: string }) => {
				authenticateRequests.push(request.token);
			},
		});

		const first = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options('first-client'));
		const second = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options('second-client'));
		await firstSessionStarted.p;
		const beforeResolution = {
			providerCreations: [...providerCreations],
			sessionRequests: [...sessionRequests],
		};
		firstSessionGate.complete();
		const results = await Promise.all([first, second]);

		assert.deepStrictEqual({
			beforeResolution,
			results,
			providerCreations,
			sessionRequests,
			authenticateRequests,
		}, {
			beforeResolution: {
				providerCreations: ['first-client'],
				sessionRequests: ['first-client'],
			},
			results: [true, true],
			providerCreations: ['first-client', 'second-client'],
			sessionRequests: ['first-client', 'second-client'],
			authenticateRequests: ['first-client-token', 'second-client-token'],
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

suite('modelRequiresAgentAuthentication', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const requiredResource: ProtectedResourceMetadata = { resource: 'https://api.github.com', required: true };
	const byokModel = {
		id: 'gemini/gemini-2.5-pro',
		_meta: createAgentModelByokMeta('gemini/Gemini/gemini-2.5-pro'),
	};
	const copilotModel = { id: 'gpt-5' };
	const agent = {
		models: [byokModel, copilotModel],
		protectedResources: [requiredResource],
	} as AgentInfo;

	test('bypasses required agent auth only for an advertised BYOK model', () => {
		const optionalResourceAgent = { ...agent, protectedResources: [{ ...requiredResource, required: false }] };
		const optionalResourceAgentWithoutByok = { ...optionalResourceAgent, models: [copilotModel] } as AgentInfo;
		assert.deepStrictEqual({
			byokEnabled: modelRequiresAgentAuthentication(agent, { id: byokModel.id }, true),
			byokDisabled: modelRequiresAgentAuthentication(agent, { id: byokModel.id }, false),
			copilot: modelRequiresAgentAuthentication(agent, { id: copilotModel.id }, true),
			unknown: modelRequiresAgentAuthentication(agent, { id: 'unknown' }, true),
			noSelection: modelRequiresAgentAuthentication(agent, undefined, true),
			optionalResourceByok: modelRequiresAgentAuthentication(optionalResourceAgent, { id: byokModel.id }, true),
			optionalResourceCopilot: modelRequiresAgentAuthentication(optionalResourceAgent, { id: copilotModel.id }, true),
			optionalResourceUnknown: modelRequiresAgentAuthentication(optionalResourceAgent, { id: 'unknown' }, true),
			optionalResourceSignedOutDisabled: modelRequiresAgentAuthentication(optionalResourceAgent, { id: copilotModel.id }, false),
			optionalResourceWithoutByok: modelRequiresAgentAuthentication(optionalResourceAgentWithoutByok, { id: copilotModel.id }, true),
			noProtectedResource: modelRequiresAgentAuthentication({ ...agent, protectedResources: [] }, { id: copilotModel.id }, true),
		}, {
			byokEnabled: false,
			byokDisabled: true,
			copilot: true,
			unknown: true,
			noSelection: true,
			optionalResourceByok: false,
			optionalResourceCopilot: true,
			optionalResourceUnknown: true,
			optionalResourceSignedOutDisabled: false,
			optionalResourceWithoutByok: false,
			noProtectedResource: false,
		});
	});
});

suite('authenticateProtectedResources', () => {

	const protectedResource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};

	const removedSession = (scopes: readonly string[]): AuthenticationSession => ({
		id: `session-${scopes.join('-')}`,
		accessToken: 'removed-token',
		account: { id: 'account-1', label: 'Account' },
		scopes,
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('skips authenticate when the cached token is unchanged', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes) {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'cached-token', expiresAfter: 3_600_000 }]);
				}

				return Promise.resolve([]);
			},
		});
		const cache = new AgentHostAuthTokenCache();
		const requests: { resource: string; scopes?: readonly string[]; token: string; expiresIn?: number }[] = [];
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

		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token', expiresIn: 3600 }]);
	});

	test('forwards a token without a malformed session expiry', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [{ scopes: ['read'], accessToken: 'cached-token', expiresAfter: 0 }] : []),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string; expiresIn?: number }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token' }]);
	});

	test('does not infer credential removal when a previously available token disappears', async () => {
		let token: string | undefined = 'cached-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes && token) {
					return Promise.resolve([{ scopes: ['read'], accessToken: token }]);
				}

				return Promise.resolve([]);
			},
		});
		const cache = new AgentHostAuthTokenCache();
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		};

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		token = undefined;
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);

		assert.deepStrictEqual(requests, [
			{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token' },
		]);
	});

	test('does not clear shared authentication while the provider is not ready', async () => {
		let providerReady = false;
		let sharedHostToken: string | undefined = 'other-client-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve(providerReady ? 'provider-1' : undefined),
			isAuthenticationProviderRegistered: () => providerReady,
			declaredProviders: [{
				id: 'provider-1',
				label: 'Provider',
				authorizationServerGlobs: ['https://auth.example.com/*'],
			}],
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'healthy-client-token' }]),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		};

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		providerReady = true;
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'healthy-client-token' }],
			sharedHostToken: 'healthy-client-token',
		});
	});

	test('clears shared authentication after an explicit session removal', async () => {
		let sharedHostToken: string | undefined = 'healthy-client-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'provider-1', [removedSession(['read'])], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		});

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: '' }],
			sharedHostToken: undefined,
		});
	});

	test('clears an observed tunnel credential after its built-in authentication session is removed', async () => {
		const authService = createMockAuthService({
			getSessions: () => Promise.resolve([]),
		});
		const [resource] = createAgentHostTunnelProtectedResources({
			github: { scopes: ['tunnel:manage'] },
		});
		const requests: Array<{ readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }> = [];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(
			revokeAuthenticationForRemovedSessionsFromResources,
			[resource],
			'github',
			[removedSession(['tunnel:manage'])],
			{
				authTokenCache: new AgentHostAuthTokenCache(),
				logPrefix: '[AgentHost]',
				authenticate: async request => { requests.push(request); },
			},
		);

		assert.deepStrictEqual(requests, [{
			resource: AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID,
			scopes: ['tunnel:manage'],
			token: '',
		}]);
	});

	test('forwards the surviving token instead of revoking when another account remains', async () => {
		let sharedHostToken: string | undefined = 'removed-account-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'surviving-account-token' }]),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'provider-1', [removedSession(['read'])], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		});

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'surviving-account-token' }],
			sharedHostToken: 'surviving-account-token',
		});
	});

	test('leaves resources the removed session could not satisfy untouched', async () => {
		// One provider commonly serves several resources with different scope sets.
		// Signing out of an account that never covered a resource must not make this
		// client re-evaluate -- and possibly revoke -- a credential another client owns.
		let sharedHostToken: string | undefined = 'other-client-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'provider-1', [removedSession(['repo'])], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		});

		assert.deepStrictEqual({ requests, sharedHostToken }, { requests: [], sharedHostToken: 'other-client-token' });
	});

	test('repairs host authentication after an external clear without replacing the cache', async () => {
		let sharedHostToken: string | undefined;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'healthy-client-token' }]),
		});
		const cache = new AgentHostAuthTokenCache();
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		};

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		sharedHostToken = undefined;
		cache.clear();
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [
				{ resource: protectedResource.resource, scopes: ['read'], token: 'healthy-client-token' },
				{ resource: protectedResource.resource, scopes: ['read'], token: 'healthy-client-token' },
			],
			sharedHostToken: 'healthy-client-token',
		});
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
		commandService.onExecute = () => { signedIn = true; };
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

	test('uses the existing Microsoft tunnel sign-in without Copilot onboarding', async () => {
		const commandService = new TestCommandService();
		const sessionCreations: Array<{ readonly providerId: string; readonly scopes: readonly string[] }> = [];
		const authService = createMockAuthService({
			getSessions: () => Promise.resolve([]),
			createSession: async (providerId, scopes) => {
				sessionCreations.push({ providerId, scopes });
				return { accessToken: 'microsoft-tunnel-token' };
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const [, microsoft] = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
			microsoft: { scopes: ['microsoft-scope'] },
		});
		const requests: Array<{ readonly resource: string; readonly token: string }> = [];

		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [microsoft], {
			logPrefix: '[AgentHost]',
			authenticate: async request => { requests.push(request); },
		});

		assert.deepStrictEqual({
			success,
			sessionCreations,
			commandCalls: commandService.calls,
			requests,
		}, {
			success: true,
			sessionCreations: [{ providerId: 'microsoft', scopes: ['microsoft-scope'] }],
			commandCalls: [],
			requests: [{ resource: microsoft.resource, scopes: ['microsoft-scope'], token: 'microsoft-tunnel-token' }],
		});
	});

	test('treats declining optional tunnel sign-in as no token', async () => {
		const commandService = new TestCommandService();
		const authService = createMockAuthService({
			getSessions: () => Promise.resolve([]),
			createSession: () => Promise.reject(new CancellationError()),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const [github] = createAgentHostTunnelProtectedResources({
			github: { scopes: ['github-scope'] },
		});
		const requests: string[] = [];

		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [github], {
			logPrefix: '[AgentHost]',
			authenticate: async request => { requests.push(request.token); },
		});

		assert.deepStrictEqual({
			success,
			commandCalls: commandService.calls,
			requests,
		}, {
			success: false,
			commandCalls: [],
			requests: [],
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
