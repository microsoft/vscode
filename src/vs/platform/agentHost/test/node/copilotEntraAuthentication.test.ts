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
			getConnectedClientTransportCounts: () => connection.token.isCancellationRequested ? new Map() : new Map([['client', 1]]),
			requestWorkspaceTrust: async () => false,
			requestMcpAuthentication: async () => false,
		}));
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const bridge = store.add(new CopilotEntraAuthentication(authentication));
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return bridge.getProtectedResources(); }
			override async authenticate() { return false; }
			override validateAuthentication(params: AuthenticateParams, connection?: CancellationToken) { bridge.validateAuthentication(params, connection); }
			override handleAuthenticationToken(params: AuthenticateParams, connection?: CancellationToken) { return bridge.authenticate(params, connection); }
		}();
		const tokenProvider = bridge.options.tokenProvider;
		assert.ok(tokenProvider);
		const acquire = (request: EntraTokenProviderArgs, token = CancellationToken.None) => tokenProvider(request, token as Parameters<EntraTokenProvider>[1]);
		const credential = (resource = copilotEntraDiscoveryResource, scopes = ['User.Read'], accountId = 'selected', label?: string): AuthenticateParams => ({
			resource, scopes, token: 'synthetic-resource-credential', expiresIn: 3600,
			_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId, ...(label !== undefined ? { label } : {}) }),
		});
		const authenticate = (params: AuthenticateParams, lifetime = connection.token) => authentication.authenticate(params, [provider], undefined, lifetime);
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
			await assert.rejects(f.authenticate(params), /Microsoft credential|original account/i);
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

	test('cache bypass while disconnected advertises expired without replaying the old token or revoking identity', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
		await f.authenticate(credential);
		f.connection.cancel();
		f.registration.dispose();
		const refresh = await f.acquire({ ...request, skipCachedAccessToken: true });
		const requirement = f.bridge.authenticationRequired.get();
		assert.ok(requirement);
		const missing = await f.acquire(request);
		const replacement = store.add(new CancellationTokenSource());
		await assert.rejects(f.authenticate(credential, replacement.token), /replacement credential/i);
		await f.authenticate({ ...f.credential(requirement.resource.resource, request.scopes), token: 'renewed-credential' }, replacement.token);
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

	test('a second live client cannot replay the token challenged at the host', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
		await f.authenticate(credential);
		await f.acquire({ ...request, skipCachedAccessToken: true });
		const secondClient = store.add(new CancellationTokenSource());
		await assert.rejects(f.authenticate(credential, secondClient.token), /replacement credential/i);
		assert.deepStrictEqual({
			retry: await f.acquire(request),
			reason: f.bridge.authenticationRequired.get()?.reason,
			identity: await f.acquire(identity),
		}, {
			retry: { kind: 'unavailable' },
			reason: AuthRequiredReason.Expired, identity: { kind: 'identity', accountId: 'selected' },
		});
	});

	test('an unchanged cache-bypass flag accepts a replacement once, then challenges a later rejection', async () => {
		const f = fixture();
		await f.signIn();
		const request = { ...tokenRequest(), skipCachedAccessToken: true };
		const resource = copilotEntraResources.get(copilotEntraEmuAudience)!;
		await f.acquire(request);
		await f.authenticate({ ...f.credential(resource, request.scopes), token: 'first-replacement' });
		const first = await f.acquire(request);
		const challengedAgain = await f.acquire(request);
		await f.authenticate({ ...f.credential(resource, request.scopes), token: 'second-replacement' });
		assert.deepStrictEqual({ first, challengedAgain, second: await f.acquire(request) }, {
			first: { kind: 'token', accountId: 'selected', accessToken: 'first-replacement' },
			challengedAgain: { kind: 'unavailable' },
			second: { kind: 'token', accountId: 'selected', accessToken: 'second-replacement' },
		});
	});

	test('a non-owner withdrawal preserves authority and canonical credentials before any provider mutation', async () => {
		const f = fixture();
		await f.signIn();
		const secondClient = store.add(new CancellationTokenSource());
		let providerMutations = 0;
		const observer = new class extends mock<IAgent>() {
			override getProtectedResources() { return []; }
			override async handleAuthenticationToken() { providerMutations++; return false; }
		}();
		await assert.rejects(f.authentication.authenticate({
			resource: copilotEntraDiscoveryResource, scopes: ['User.Read'], token: '',
		}, [f.provider, observer], undefined, secondClient.token), /own.*Microsoft/i);
		assert.deepStrictEqual({
			providerMutations,
			identity: await f.acquire(identity),
			stored: f.authentication.getAuthToken({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] }),
		}, {
			providerMutations: 0,
			identity: { kind: 'identity', accountId: 'selected' },
			stored: 'synthetic-resource-credential',
		});
	});

	test('a delayed withdrawal from a still-connected old owner cannot revoke a replacement authority', async () => {
		const f = fixture();
		await f.signIn();
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		const replacement = store.add(new CancellationTokenSource());
		await f.acquire(identity);
		await f.authenticate(f.credential(undefined, undefined, 'replacement'), replacement.token);
		await assert.rejects(f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' }), /own.*Microsoft/i);
		assert.deepStrictEqual({
			identity: await f.acquire(identity),
			storedAccount: f.authentication.getAuthAccount({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] })?.accountId,
		}, { identity: { kind: 'identity', accountId: 'replacement' }, storedAccount: 'replacement' });
	});

	test('a credential that expires while disconnected stays quarantined until the same account supplies a replacement', async () => {
		await runWithFakedTimers({}, async () => {
			const f = fixture();
			await f.signIn();
			let revoked = 0;
			store.add(f.bridge.onDidRevoke(() => revoked++));
			const request = tokenRequest();
			await f.acquire(request);
			const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
			await f.authenticate({ ...credential, expiresIn: 1 });
			f.connection.cancel();
			f.registration.dispose();
			await timeout(1_001);
			const expired = f.acquire(request);
			const reason = f.bridge.authenticationRequired.get()?.reason;
			const replacement = store.add(new CancellationTokenSource());
			await assert.rejects(f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' }, replacement.token), /own.*Microsoft/i);
			await assert.rejects(f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' }), /unavailable/i);
			await assert.rejects(f.authenticate(credential, replacement.token), /replacement credential/i);
			await assert.rejects(f.authenticate(f.credential(credential.resource, request.scopes, 'other'), replacement.token), /original account/i);
			await f.authenticate({ ...credential, token: 'renewed-credential' }, replacement.token);
			assert.deepStrictEqual({
				expired, reason, revoked,
				renewed: f.acquire(request),
				identity: f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' }),
			}, {
				expired: { kind: 'unavailable' }, reason: AuthRequiredReason.Expired,
				revoked: 0,
				renewed: { kind: 'token', accountId: 'selected', accessToken: 'renewed-credential' },
				identity: { kind: 'identity', accountId: 'selected' },
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

	for (const end of ['disconnect', 'lastSourceRemoved'] as const) {
		test(`${end} retains accepted identity and resource credentials without revocation`, async () => {
			const f = fixture();
			await f.signIn('Selected account');
			const requests = [tokenRequest(), tokenRequest(copilotEntraM365Audience)];
			for (const request of requests) {
				await f.acquire(request);
				await f.authenticate(f.credential(copilotEntraResources.get(request.audience!), request.scopes));
			}
			let revoked = 0;
			const changes: string[] = [];
			store.add(f.bridge.onDidRevoke(() => revoked++));
			store.add(f.authentication.onDidChangeAuthToken(event => changes.push(event.resource)));
			if (end === 'disconnect') {
				f.connection.cancel();
			} else {
				f.registration.dispose();
			}
			assert.deepStrictEqual({
				revoked, changes,
				renewal: await f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' }),
				tokens: await Promise.all(requests.map(request => f.acquire(request))),
				graph: f.authentication.getAuthToken({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] }),
				resources: f.bridge.getProtectedResources(),
			}, {
				revoked: 0, changes: [],
				renewal: { kind: 'identity', accountId: 'selected', username: 'Selected account' },
				tokens: requests.map(() => ({ kind: 'token', accountId: 'selected', accessToken: 'synthetic-resource-credential' })),
				graph: 'synthetic-resource-credential',
				resources: [{ resource: copilotEntraDiscoveryResource, authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: ['User.Read'] }],
			});
		});
	}

	test('explicit sign-out forgets accepted credentials and rejects late replies', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
		await f.authenticate(credential);
		let revoked = 0;
		store.add(f.bridge.onDidRevoke(() => revoked++));
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		await assert.rejects(f.authenticate(credential), /advertised requirement/i);
		assert.deepStrictEqual({
			revoked,
			renewal: await f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' }),
			stored: f.authentication.getAuthToken({ resource: credential.resource, scopes: request.scopes }),
			resources: f.bridge.getProtectedResources(),
		}, { revoked: 1, renewal: { kind: 'unavailable' }, stored: undefined, resources: [] });
	});

	for (const kind of ['identity', 'resource'] as const) {
		test(`disconnect rejects an in-flight ${kind} delivery without withdrawing accepted host authority`, async () => {
			const f = fixture();
			if (kind === 'resource') {
				await f.signIn();
				await f.acquire(tokenRequest());
			} else {
				await f.acquire(identity);
			}
			let revoked = 0;
			store.add(f.bridge.onDidRevoke(() => revoked++));
			const params = kind === 'identity' ? f.credential() : f.credential(copilotEntraResources.get(copilotEntraEmuAudience), tokenRequest().scopes);
			const gate = new DeferredPromise<void>();
			const started = new DeferredPromise<void>();
			const delayed = new class extends mock<IAgent>() {
				override getProtectedResources() { return []; }
				override async handleAuthenticationToken() { started.complete(); await gate.p; return false; }
			}();
			const write = f.authentication.authenticate(params, [f.provider, delayed], undefined, f.connection.token);
			const rejected = assert.rejects(write, /unavailable/i);
			await started.p;
			f.connection.cancel();
			gate.complete();
			await rejected;
			assert.deepStrictEqual({
				revoked,
				stored: f.authentication.getAuthToken({ resource: params.resource, scopes: params.scopes }),
				identity: await f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' }),
			}, {
				revoked: 0, stored: undefined,
				identity: kind === 'resource' ? { kind: 'identity', accountId: 'selected' } : { kind: 'unavailable' },
			});
		});
	}

	test('a delayed initial identity cannot overwrite another account accepted before it commits', async () => {
		const f = fixture();
		await f.acquire(identity);
		const gate = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const delayed = new class extends mock<IAgent>() {
			override getProtectedResources() { return []; }
			override async handleAuthenticationToken() { started.complete(); await gate.p; return false; }
		}();
		const params = { ...f.credential(), scopes: ['User.Read', 'additional'] };
		const write = f.authentication.authenticate(params, [f.provider, delayed], undefined, f.connection.token);
		const rejected = assert.rejects(write, /original account/i);
		await started.p;
		const secondClient = store.add(new CancellationTokenSource());
		await f.authenticate(f.credential(undefined, undefined, 'replacement'), secondClient.token);
		gate.complete();
		await rejected;
		assert.deepStrictEqual({
			identity: await f.acquire(identity),
			stale: f.authentication.getAuthCredential({ resource: params.resource, scopes: params.scopes }),
			account: f.authentication.getAuthAccount({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] })?.accountId,
		}, { identity: { kind: 'identity', accountId: 'replacement' }, stale: undefined, account: 'replacement' });
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
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		assert.deepStrictEqual(resources, []);
	});
});
