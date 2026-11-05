/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { EntraTokenProvider, EntraTokenProviderArgs } from '@github/copilot-sdk';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { autorun } from '../../../../base/common/observable.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams, IAgent } from '../../common/agent.js';
import { copilotEntraAuthorizationServer, copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import { authenticationAccountMeta } from '../../common/meta/agentAuthenticationAccount.js';
import { AuthRequiredReason } from '../../common/state/sessionActions.js';
import { AuthenticateTargetKind } from '../../common/state/sessionProtocol.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { CopilotEntraAuthentication } from '../../node/copilot/copilotEntraAuthentication.js';

suite('Copilot Entra authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const identity: EntraTokenProviderArgs = { kind: 'identity', clientId: copilotEntraClientId, reason: 'signIn' };

	function tokenRequest(audience = copilotEntraEmuAudience): Extract<EntraTokenProviderArgs, { kind: 'token' }> {
		return { kind: 'token', clientId: copilotEntraClientId, reason: 'renewal', accountId: 'selected', audience, scopes: [`${audience}/.default`], skipCachedAccessToken: false };
	}

	function fixture() {
		const connections = store.add(new AgentHostClientConnectionService());
		const connection = store.add(new CancellationTokenSource());
		const registration = store.add(connections.registerSource({
			hasSeenClient: () => true,
			isClientConnected: () => !connection.token.isCancellationRequested,
			isLocalClient: () => true,
			usesLegacyChatUris: () => false,
			getConnectedClientTransportCounts: () => new Map([['client', 1]]),
			requestWorkspaceTrust: async () => false,
			requestMcpAuthentication: async () => false,
		}));
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const bridge = store.add(new CopilotEntraAuthentication(connections, authentication));
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return bridge.getProtectedResources(); }
			override async authenticate() { return false; }
			override handleAuthenticationToken(params: AuthenticateParams, connection?: CancellationToken) { return bridge.authenticate(params, connection); }
		}();
		const tokenProvider = bridge.options.tokenProvider;
		assert.ok(tokenProvider);
		const acquire = (request: EntraTokenProviderArgs, token = CancellationToken.None) => tokenProvider(request, token as Parameters<EntraTokenProvider>[1]);
		const credential = (resource = copilotEntraDiscoveryResource, scopes = ['User.Read'], accountId = 'selected', label?: string): AuthenticateParams => ({
			resource, scopes, token: 'synthetic-resource-credential', expiresIn: 3600,
			_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId, ...(label !== undefined ? { label } : {}) }),
		});
		const authenticate = (params: AuthenticateParams) => authentication.authenticate(params, [provider], undefined, connection.token);
		const signIn = async (label?: string) => {
			assert.deepStrictEqual(await acquire(identity), { kind: 'unavailable' });
			assert.deepStrictEqual(await authenticate(credential(undefined, undefined, undefined, label)), { authenticated: true });
			return acquire(identity);
		};
		return { bridge, authentication, provider, acquire, credential, authenticate, signIn, connection, registration };
	}

	test('a missing identity returns synchronously and advertises Graph without waiting for a client', async () => {
		const f = fixture();
		const result = f.acquire(identity);
		assert.deepStrictEqual({ result, requirement: f.bridge.authenticationRequired.get() }, {
			result: { kind: 'unavailable' },
			requirement: {
				resource: { resource: copilotEntraDiscoveryResource, authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: ['User.Read'] },
				reason: AuthRequiredReason.Required,
			},
		});
	});

	test('returns the supplied identity and display metadata on sign-in and cached renewal', async () => {
		const f = fixture();
		const initial = await f.signIn('Selected account');
		assert.deepStrictEqual([initial, await f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' })], [
			{ kind: 'identity', accountId: 'selected', username: 'Selected account' },
			{ kind: 'identity', accountId: 'selected', username: 'Selected account' },
		]);
	});

	for (const audience of [copilotEntraEmuAudience, copilotEntraM365Audience]) {
		test(`returns unavailable without revocation, then consumes a later credential for ${audience}`, async () => {
			const f = fixture();
			await f.signIn();
			let revoked = 0;
			store.add(f.bridge.onDidRevoke(() => revoked++));
			const request = tokenRequest(audience);
			const missing = f.acquire(request);
			const requirement = f.bridge.authenticationRequired.get();
			assert.ok(requirement);
			await f.authenticate(f.credential(requirement.resource.resource, request.scopes));
			assert.deepStrictEqual({
				missing, resource: requirement.resource.resource, result: await f.acquire(request), revoked,
				identity: await f.acquire({ ...identity, reason: 'renewal', accountId: 'selected' }),
				current: f.bridge.authenticationRequired.get(),
			}, {
				missing: { kind: 'unavailable' }, resource: copilotEntraResources.get(audience),
				result: { kind: 'token', accountId: 'selected', accessToken: 'synthetic-resource-credential' },
				revoked: 0, identity: { kind: 'identity', accountId: 'selected' }, current: undefined,
			});
		});
	}

	test('retains simultaneous resource requirements so either supplied credential can be retried', async () => {
		const f = fixture();
		await f.signIn();
		const emu = tokenRequest();
		const m365 = tokenRequest(copilotEntraM365Audience);
		await f.acquire(emu);
		await f.acquire(m365);
		const resources = f.bridge.getProtectedResources();
		await f.authenticate(f.credential(copilotEntraResources.get(copilotEntraM365Audience), m365.scopes));
		assert.deepStrictEqual({
			resources: resources.map(resource => resource.resource),
			emu: await f.acquire(emu), m365: await f.acquire(m365),
		}, {
			resources: [copilotEntraDiscoveryResource, ...copilotEntraResources.values()],
			emu: { kind: 'unavailable' },
			m365: { kind: 'token', accountId: 'selected', accessToken: 'synthetic-resource-credential' },
		});
	});

	test('rejects mismatched account, scopes, expiry and malformed display metadata', async () => {
		const f = fixture();
		await f.signIn('Shared label');
		const request = tokenRequest();
		await f.acquire(request);
		const resource = copilotEntraResources.get(copilotEntraEmuAudience)!;
		const valid = f.credential(resource, request.scopes, 'selected', 'Different label');
		const invalid = [
			f.credential(resource, request.scopes, 'other', 'Shared label'),
			f.credential(resource, ['different']),
			{ ...valid, expiresIn: -1 },
			{ ...valid, _meta: { 'vscode.authentication.account': { providerId: 'microsoft', accountId: 'selected', label: 42 } } },
		];
		for (const params of invalid) {
			assert.deepStrictEqual(await f.authenticate(params), { authenticated: false });
		}
		await f.authenticate(valid);
		assert.deepStrictEqual(await f.acquire({ ...identity, reason: 'renewal', accountId: 'selected' }), { kind: 'identity', accountId: 'selected', username: 'Shared label' });
	});

	test('never uses unscoped, expired or foreign-account credentials from the shared store', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		const resource = copilotEntraResources.get(copilotEntraEmuAudience)!;
		const otherProvider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate() { return true; }
		}();
		const params = f.credential(resource, request.scopes);
		const outcomes = [];
		for (const stored of [{ ...params, scopes: undefined }, { ...params, expiresIn: -1 }, f.credential(resource, request.scopes, 'other')]) {
			f.authentication.invalidateAuthTokens(resource);
			await f.authentication.authenticate(stored, [otherProvider]);
			outcomes.push(await f.acquire(request));
		}
		assert.deepStrictEqual(outcomes, outcomes.map(() => ({ kind: 'unavailable' })));
	});

	test('cache bypass advertises expired without replaying the old token or revoking identity', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		await f.authenticate(f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes));
		const refresh = await f.acquire({ ...request, skipCachedAccessToken: true });
		const requirement = f.bridge.authenticationRequired.get();
		assert.ok(requirement);
		const missing = await f.acquire(request);
		await f.authenticate({ ...f.credential(requirement.resource.resource, request.scopes), token: 'renewed-credential' });
		assert.deepStrictEqual({ refresh, missing, reason: requirement.reason, renewed: await f.acquire(request), identity: await f.acquire(identity) }, {
			refresh: { kind: 'unavailable' }, missing: { kind: 'unavailable' }, reason: AuthRequiredReason.Expired,
			renewed: { kind: 'token', accountId: 'selected', accessToken: 'renewed-credential' }, identity: { kind: 'identity', accountId: 'selected' },
		});
	});

	test('a normal retry cannot downgrade an expired requirement and authorize replay', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire({ ...request, skipCachedAccessToken: true });
		await f.acquire(request);
		assert.strictEqual(f.bridge.authenticationRequired.get()?.reason, AuthRequiredReason.Expired);
	});

	test('a credential that expires in the shared store produces an expired challenge', async () => {
		await runWithFakedTimers({}, async () => {
			const f = fixture();
			await f.signIn();
			const request = tokenRequest();
			await f.acquire(request);
			const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
			await f.authenticate({ ...credential, expiresIn: 1 });
			await timeout(1_001);
			assert.deepStrictEqual({ result: f.acquire(request), reason: f.bridge.authenticationRequired.get()?.reason }, {
				result: { kind: 'unavailable' }, reason: AuthRequiredReason.Expired,
			});
		});
	});

	test('forceInteractive does not silently reuse the established identity', async () => {
		const f = fixture();
		await f.signIn();
		assert.deepStrictEqual(await f.acquire({ ...identity, reason: 'forceInteractive' }), { kind: 'unavailable' });
		assert.strictEqual(f.bridge.authenticationRequired.get()?.resource.resource, copilotEntraDiscoveryResource);
	});

	test('cancellation returns immediately without clearing the established authority or advertising work', async () => {
		const f = fixture();
		await f.signIn('Selected account');
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		assert.deepStrictEqual({
			result: await f.acquire(tokenRequest(), cancellation.token),
			requirement: f.bridge.authenticationRequired.get(),
			identity: await f.acquire(identity),
		}, { result: { kind: 'cancelled' }, requirement: undefined, identity: { kind: 'identity', accountId: 'selected', username: 'Selected account' } });
	});

	for (const end of ['signOut', 'disconnect', 'unavailable'] as const) {
		test(`${end} forgets resource credentials and rejects late replies`, async () => {
			const f = fixture();
			await f.signIn('Selected account');
			const request = tokenRequest();
			await f.acquire(request);
			const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
			await f.authenticate(credential);
			if (end === 'signOut') {
				await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
			} else if (end === 'disconnect') {
				f.connection.cancel();
			} else {
				f.registration.dispose();
			}
			assert.deepStrictEqual({
				renewal: await f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' }),
				late: await f.authenticate(credential),
				stored: f.authentication.getAuthToken({ resource: credential.resource, scopes: request.scopes }),
				resources: f.bridge.getProtectedResources(),
			}, { renewal: { kind: 'unavailable' }, late: { authenticated: false }, stored: undefined, resources: [] });
		});
	}

	test('withdrawal prevents an in-flight authentication write from repopulating the shared store', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const params = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
		const gate = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const delayed = new class extends mock<IAgent>() {
			override getProtectedResources() { return []; }
			override async handleAuthenticationToken() { started.complete(); await gate.p; return false; }
		}();
		const write = f.authentication.authenticate(params, [f.provider, delayed], undefined, f.connection.token);
		await started.p;
		f.connection.cancel();
		gate.complete();
		await write;
		assert.strictEqual(f.authentication.getAuthToken({ resource: params.resource, scopes: params.scopes }), undefined);
	});

	test('invalidating a resource preserves unrelated credentials and targeted MCP tokens', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const resource = copilotEntraResources.get(copilotEntraEmuAudience)!;
		await f.authenticate(f.credential(resource, request.scopes));
		const replayed: string[] = [];
		const other = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource: 'https://api.github.com' }]; }
			override async authenticate() { return true; }
			override async handleAuthenticationToken(params: AuthenticateParams) {
				replayed.push(params.token);
				return params.target !== undefined;
			}
		}();
		await f.authentication.authenticate({ resource: 'https://api.github.com', token: 'github-credential' }, [other]);
		await f.authentication.authenticate({
			resource, token: 'mcp-credential', scopes: request.scopes,
			target: { kind: AuthenticateTargetKind.McpServer, session: 'other-agent:/opaque-session', customizationId: 'mcp' },
		}, [other]);
		replayed.length = 0;
		f.authentication.invalidateAuthTokens(resource);
		await f.authentication.replay(other);
		assert.deepStrictEqual({
			graph: f.authentication.getAuthToken({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] }),
			github: f.authentication.getAuthToken({ resource: 'https://api.github.com' }),
			emu: f.authentication.getAuthToken({ resource, scopes: request.scopes }),
			targetRetained: replayed.includes('mcp-credential'),
		}, { graph: 'synthetic-resource-credential', github: 'github-credential', emu: undefined, targetRetained: true });
	});

	test('unsupported client, tenant, account or resource returns unavailable without changing the identity', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		const requests: EntraTokenProviderArgs[] = [
			{ ...identity, accountId: 'other' }, { ...request, clientId: 'other-client' }, { ...request, tenant: 'other-tenant' },
			{ ...request, audience: copilotEntraM365Audience }, { ...request, scopes: [] },
		];
		assert.deepStrictEqual(await Promise.all(requests.map(request => f.acquire(request))), requests.map(() => ({ kind: 'unavailable' })));
	});

	test('resource publication follows credentials and authority rather than a pending SDK callback', async () => {
		const f = fixture();
		let resources: string[] = [];
		store.add(autorun(reader => { resources = f.bridge.getProtectedResources(reader).map(resource => resource.resource); }));
		await f.signIn();
		await f.acquire(tokenRequest());
		assert.deepStrictEqual(resources, [copilotEntraDiscoveryResource, copilotEntraResources.get(copilotEntraEmuAudience)]);
		f.connection.cancel();
		assert.deepStrictEqual(resources, []);
	});
});
