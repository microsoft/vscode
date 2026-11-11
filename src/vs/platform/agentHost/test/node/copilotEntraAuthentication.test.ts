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
import { CopilotEntraAuthentication, copilotEntraDiscoveryMetadata } from '../../node/copilot/copilotEntraAuthentication.js';

suite('Copilot Entra authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const identity: EntraTokenProviderArgs = { kind: 'identity', clientId: copilotEntraClientId, reason: 'signIn' };

	function tokenRequest(audience = copilotEntraEmuAudience): Extract<EntraTokenProviderArgs, { kind: 'token' }> {
		return { kind: 'token', clientId: copilotEntraClientId, reason: 'renewal', accountId: 'selected', audience, scopes: [`${audience}/.default`], skipCachedAccessToken: false };
	}

	function fixture() {
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const bridge = store.add(new CopilotEntraAuthentication(authentication));
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return bridge.getProtectedResources(); }
			override async authenticate() { return false; }
			override validateAuthentication(params: AuthenticateParams) { bridge.validateAuthentication(params); }
			override handleAuthenticationToken(params: AuthenticateParams) { return bridge.authenticate(params); }
		}();
		const tokenProvider = bridge.options.tokenProvider;
		assert.ok(tokenProvider);
		const acquire = (request: EntraTokenProviderArgs, token = CancellationToken.None) => tokenProvider(request, token as Parameters<EntraTokenProvider>[1]);
		const credential = (resource = copilotEntraDiscoveryResource, scopes = ['User.Read'], accountId = 'selected', label?: string): AuthenticateParams => ({
			resource, scopes, token: 'synthetic-resource-credential', expiresIn: 3600,
			_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId, ...(label !== undefined ? { label } : {}) }),
		});
		const authenticate = (params: AuthenticateParams) => authentication.authenticate(params, [provider]);
		const signIn = async (label?: string) => {
			assert.deepStrictEqual(await acquire(identity), { kind: 'unavailable' });
			assert.deepStrictEqual(await authenticate(credential(undefined, undefined, undefined, label)), { authenticated: true });
			return acquire(identity);
		};
		return { bridge, authentication, provider, acquire, credential, authenticate, signIn };
	}

	test('a missing identity returns synchronously and advertises Graph without waiting for a client', async () => {
		const f = fixture();
		const result = f.acquire(identity);
		assert.deepStrictEqual({ result, requirement: f.bridge.authenticationRequired.get() }, {
			result: { kind: 'unavailable' },
			requirement: {
				resource: { resource: copilotEntraDiscoveryResource, authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: ['User.Read'], required: false },
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

	test('discovery requires canonical acceptance rather than provider delivery alone', async () => {
		const f = fixture();
		await f.acquire(identity);
		const credential = f.credential();
		await f.bridge.authenticate(credential);
		assert.throws(() => f.bridge.authorizeDiscovery(credential), /authority is unavailable/);
		await f.authenticate(credential);
		assert.deepStrictEqual({
			accountId: f.bridge.authorizeDiscovery(credential),
			identity: await f.acquire(identity),
		}, { accountId: 'selected', identity: { kind: 'identity', accountId: 'selected' } });
	});

	for (const label of ['Selected display name', undefined, ' \t ']) {
		test(`discovery authority preserves ${label?.trim() ? 'supplied' : label === undefined ? 'absent' : 'blank'} metadata for SDK identity recovery`, async () => {
			const f = fixture();
			await f.signIn(label);
			const accountId = f.bridge.authorizeDiscovery(f.credential(undefined, undefined, undefined, label));
			assert.deepStrictEqual({
				accountId,
				initial: await f.acquire(identity),
				renewed: await f.acquire({ ...identity, reason: 'renewal', accountId }),
				pending: f.bridge.authenticationRequired.get(),
			}, {
				accountId: 'selected',
				initial: { kind: 'identity', accountId: 'selected', ...(label?.trim() ? { username: label } : {}) },
				renewed: { kind: 'identity', accountId: 'selected', ...(label?.trim() ? { username: label } : {}) },
				pending: undefined,
			});
		});
	}

	test('discovery and selection match opaque IDs instead of labels and preserve authority metadata', async () => {
		const f = fixture();
		await f.signIn('Shared label');
		f.bridge.authorizeDiscovery(f.credential(undefined, undefined, undefined, 'Shared label'));
		assert.throws(() => f.bridge.authorizeDiscovery(f.credential(undefined, undefined, 'other', 'Shared label')), /original account/);
		assert.throws(() => f.bridge.validateSelection(f.credential(undefined, undefined, 'other', 'Shared label'), copilotEntraDiscoveryMetadata), /original account/);
		f.bridge.validateSelection(f.credential(undefined, undefined, undefined, 'Changed display'), copilotEntraDiscoveryMetadata);
		assert.deepStrictEqual(await f.acquire({ ...identity, reason: 'renewal', accountId: 'selected' }), {
			kind: 'identity', accountId: 'selected', username: 'Shared label',
		});
	});

	test('discovery rejects malformed labels and drops display metadata on sign-out', async () => {
		const f = fixture();
		assert.throws(() => f.bridge.authorizeDiscovery({
			...f.credential(),
			_meta: { 'vscode.authentication.account': { providerId: 'microsoft', accountId: 'selected', label: 42 } },
		}), /account provenance/);
		const before = await f.acquire({ ...identity, reason: 'renewal', accountId: 'selected' });
		await f.signIn('Previous label');
		f.bridge.authorizeDiscovery(f.credential(undefined, undefined, undefined, 'Previous label'));
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		const after = await f.acquire({ ...identity, reason: 'renewal', accountId: 'selected' });
		await f.acquire(identity);
		await f.authenticate(f.credential(undefined, undefined, 'replacement'));
		f.bridge.authorizeDiscovery(f.credential(undefined, undefined, 'replacement'));
		assert.deepStrictEqual({ before, after, replacement: await f.acquire(identity) }, {
			before: { kind: 'unavailable' }, after: { kind: 'unavailable' },
			replacement: { kind: 'identity', accountId: 'replacement' },
		});
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

	test('cache bypass advertises expired without replaying the old token or revoking identity', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
		await f.authenticate(credential);
		const refresh = await f.acquire({ ...request, skipCachedAccessToken: true });
		const requirement = f.bridge.authenticationRequired.get();
		assert.ok(requirement);
		const missing = await f.acquire(request);
		await assert.rejects(f.authenticate(credential), /replacement credential/i);
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

	test('a client cannot replay the token challenged at the host', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
		await f.authenticate(credential);
		await f.acquire({ ...request, skipCachedAccessToken: true });
		await assert.rejects(f.authenticate(credential), /replacement credential/i);
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

	test('a withdrawal from any client clears authority and advertises the loss so a credential can be re-supplied', async () => {
		const f = fixture();
		await f.signIn();
		let revoked = 0;
		store.add(f.bridge.onDidRevoke(() => revoked++));
		const observed: string[] = [];
		const observer = new class extends mock<IAgent>() {
			override getProtectedResources() { return []; }
			override async handleAuthenticationToken(params: AuthenticateParams) { observed.push(params.token); return false; }
		}();
		await f.authentication.authenticate({
			resource: copilotEntraDiscoveryResource, scopes: ['User.Read'], token: '',
		}, [f.provider, observer]);
		assert.deepStrictEqual({
			revoked, observed,
			identity: await f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' }),
			stored: f.authentication.getAuthToken({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] }),
			requirement: f.bridge.authenticationRequired.get(),
		}, {
			revoked: 1, observed: [''],
			identity: { kind: 'unavailable' },
			stored: undefined,
			requirement: {
				resource: { resource: copilotEntraDiscoveryResource, authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: ['User.Read'], required: false },
				reason: AuthRequiredReason.Expired,
			},
		});
	});

	test('a repeated withdrawal keeps the advertised requirement, and another account can then sign in', async () => {
		const f = fixture();
		await f.signIn();
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		const reason = f.bridge.authenticationRequired.get()?.reason;
		await f.authenticate(f.credential(undefined, undefined, 'replacement'));
		assert.deepStrictEqual({
			reason,
			identity: await f.acquire(identity),
			storedAccount: f.authentication.getAuthAccount({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] })?.accountId,
		}, { reason: AuthRequiredReason.Expired, identity: { kind: 'identity', accountId: 'replacement' }, storedAccount: 'replacement' });
	});

	test('an expired credential stays quarantined until the same account supplies a replacement', async () => {
		await runWithFakedTimers({}, async () => {
			const f = fixture();
			await f.signIn();
			let revoked = 0;
			store.add(f.bridge.onDidRevoke(() => revoked++));
			const request = tokenRequest();
			await f.acquire(request);
			const credential = f.credential(copilotEntraResources.get(copilotEntraEmuAudience), request.scopes);
			await f.authenticate({ ...credential, expiresIn: 1 });
			await timeout(1_001);
			const expired = f.acquire(request);
			const reason = f.bridge.authenticationRequired.get()?.reason;
			await assert.rejects(f.authenticate(credential), /replacement credential/i);
			await assert.rejects(f.authenticate(f.credential(credential.resource, request.scopes, 'other')), /original account/i);
			await f.authenticate({ ...credential, token: 'renewed-credential' });
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

	test('replay re-validates stored credentials without mutating anything: the bound identity passes, another account or an unadvertised scope is rejected', async () => {
		const f = fixture();
		await f.signIn();
		const request = tokenRequest();
		await f.acquire(request);
		const resource = copilotEntraResources.get(copilotEntraEmuAudience)!;
		await f.authenticate({ ...f.credential(resource, request.scopes), token: 'satisfied-resource' });
		const m365 = copilotEntraResources.get(copilotEntraM365Audience)!;
		const foreignStore = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource: m365 }]; }
			override async authenticate() { return true; }
		}();
		await f.authentication.authenticate({ ...f.credential(m365, [`${copilotEntraM365Audience}/.default`], 'other'), token: 'other-account' }, [foreignStore]);
		await f.authentication.authenticate({ ...f.credential(m365, ['unrequested']), token: 'unrequested-scope' }, [foreignStore]);
		await f.acquire(tokenRequest(copilotEntraM365Audience));
		const replayed: Record<string, string> = {};
		const changes: string[] = [];
		store.add(f.authentication.onDidChangeAuthToken(event => changes.push(event.resource)));
		await f.authentication.replay(new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return f.bridge.getProtectedResources(); }
			override async authenticate() { return false; }
			override async handleAuthenticationToken(params: AuthenticateParams) {
				try {
					const accepted = await f.bridge.authenticate(params);
					replayed[params.token] = accepted ? 'accepted' : 'ignored';
					return accepted;
				} catch (error) {
					replayed[params.token] = error instanceof Error ? error.message : 'rejected';
					throw error;
				}
			}
		}());
		assert.deepStrictEqual({
			replayed, changes,
			identity: await f.acquire({ ...identity, accountId: 'selected', reason: 'renewal' }),
			token: await f.acquire(request),
			foreign: await f.acquire(tokenRequest(copilotEntraM365Audience)),
		}, {
			replayed: {
				'synthetic-resource-credential': 'accepted',
				// A satisfied resource is no longer advertised, so its stored credential stays in the canonical store untouched.
				'satisfied-resource': 'Microsoft credential does not satisfy the advertised requirement.',
				'other-account': 'Microsoft authentication requires the original account.',
				'unrequested-scope': 'Microsoft credential does not satisfy the advertised requirement.',
			},
			changes: [],
			identity: { kind: 'identity', accountId: 'selected' },
			token: { kind: 'token', accountId: 'selected', accessToken: 'satisfied-resource' },
			foreign: { kind: 'unavailable' },
		});
	});

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
			resources: f.bridge.getProtectedResources().map(resource => resource.resource),
		}, { revoked: 1, renewal: { kind: 'unavailable' }, stored: undefined, resources: [copilotEntraDiscoveryResource] });
	});

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
		const write = f.authentication.authenticate(params, [f.provider, delayed]);
		const rejected = assert.rejects(write, /original account/i);
		await started.p;
		await f.authenticate(f.credential(undefined, undefined, 'replacement'));
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
		assert.deepStrictEqual(resources, [copilotEntraDiscoveryResource]);
	});
});
