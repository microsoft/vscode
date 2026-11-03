/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { EntraTokenProviderArgs } from '@github/copilot-sdk';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { autorun, waitForState } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { copilotEntraAuthorizationServer, copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience } from '../../common/copilotEntraAuthentication.js';
import { authenticationAccountMeta } from '../../common/meta/agentAuthenticationAccount.js';
import { AuthRequiredReason } from '../../common/state/sessionActions.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { CopilotEntraAuthentication } from '../../node/copilot/copilotEntraAuthentication.js';

suite('Copilot Entra authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const identity: EntraTokenProviderArgs = { kind: 'identity', clientId: copilotEntraClientId, reason: 'signIn' };

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
		const bridge = store.add(new CopilotEntraAuthentication(connections));
		const provider = bridge.options.tokenProvider;
		assert.ok(provider);
		const acquire = (request: EntraTokenProviderArgs, token = CancellationToken.None) => Promise.resolve(provider(request, token));
		const credential = (resource = copilotEntraDiscoveryResource, scopes = ['User.Read'], accountId = 'selected'): AuthenticateParams => ({
			resource,
			scopes,
			token: 'synthetic-resource-credential',
			expiresIn: 3600,
			_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId }),
		});
		const signIn = async () => {
			const result = acquire(identity);
			await waitForState(bridge.authenticationRequired);
			await bridge.authenticate(credential(), connection.token);
			return result;
		};
		const authenticate = (params: AuthenticateParams) => bridge.authenticate(params, connection.token);
		return { bridge, acquire, authenticate, credential, signIn, connection, registration };
	}

	test('requests Graph credentials and returns only the selected account to the runtime', async () => {
		const f = fixture();
		const result = f.acquire(identity);
		const requirement = await waitForState(f.bridge.authenticationRequired);
		await f.authenticate(f.credential());
		assert.deepStrictEqual({ requirement, result: await result, current: f.bridge.authenticationRequired.get() }, {
			requirement: {
				resource: { resource: copilotEntraDiscoveryResource, authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: ['User.Read'] },
				reason: AuthRequiredReason.Required,
			},
			result: { kind: 'identity', accountId: 'selected' },
			current: undefined,
		});
	});

	for (const [audience, resource] of [
		[copilotEntraEmuAudience, 'https://github.com/login/oauth/access_token'],
		[copilotEntraM365Audience, 'https://df.loki.delve.office.com/api/v1/llmapi'],
	]) {
		test(`renews ${audience} through the advertised resource without caching its token`, async () => {
			const f = fixture();
			await f.signIn();
			const scopes = [`${audience}/.default`];
			const results = [];
			for (const skipCachedAccessToken of [false, true]) {
				const result = f.acquire({ kind: 'token', clientId: copilotEntraClientId, reason: 'renewal', accountId: 'selected', audience, scopes, skipCachedAccessToken });
				const requirement = await waitForState(f.bridge.authenticationRequired);
				await f.authenticate(f.credential(resource, scopes));
				results.push({ requirement, result: await result });
			}
			assert.deepStrictEqual(results, [AuthRequiredReason.Required, AuthRequiredReason.Expired].map(reason => ({
				requirement: { resource: { resource, authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: scopes }, reason },
				result: { kind: 'token', accountId: 'selected', accessToken: 'synthetic-resource-credential' },
			})));
		});
	}

	test('rejects credentials for another account or scope and leaves the original acquisition pending', async () => {
		const f = fixture();
		await f.signIn();
		const scopes = [`${copilotEntraEmuAudience}/user_impersonation`];
		const result = f.acquire({ kind: 'token', clientId: copilotEntraClientId, reason: 'renewal', accountId: 'selected', audience: copilotEntraEmuAudience, scopes, skipCachedAccessToken: false });
		const requirement = await waitForState(f.bridge.authenticationRequired);
		await assert.rejects(f.authenticate(f.credential(requirement.resource.resource, scopes, 'other')), /original account/);
		await assert.rejects(f.authenticate(f.credential(requirement.resource.resource, ['different'])), /pending acquisition/);
		assert.strictEqual(await f.authenticate(f.credential('https://unrelated.example', scopes)), false);
		await f.authenticate(f.credential(requirement.resource.resource, scopes));
		assert.deepStrictEqual(await result, { kind: 'token', accountId: 'selected', accessToken: 'synthetic-resource-credential' });
	});

	test('returns unavailable instead of substituting an account, client, tenant or resource', async () => {
		const f = fixture();
		await f.signIn();
		const token: EntraTokenProviderArgs = {
			kind: 'token', clientId: copilotEntraClientId, reason: 'renewal', accountId: 'selected',
			audience: copilotEntraEmuAudience, scopes: [`${copilotEntraEmuAudience}/user_impersonation`], skipCachedAccessToken: false,
		};
		const requests: EntraTokenProviderArgs[] = [
			{ ...identity, accountId: 'other' },
			{ ...token, accountId: 'other' },
			{ ...token, clientId: 'other-client' },
			{ ...token, tenant: 'other-tenant' },
			{ ...token, audience: copilotEntraM365Audience },
			{ ...token, scopes: [] },
			{ ...token, audience: 'other-resource', scopes: ['other-resource/.default'] },
		];
		assert.deepStrictEqual(await Promise.all(requests.map(request => f.acquire(request))), requests.map(() => ({ kind: 'unavailable' })));
	});

	for (const end of ['signOut', 'disconnect', 'unavailable'] as const) {
		test(`${end} withdraws authority and rejects late replies`, async () => {
			const f = fixture();
			await f.signIn();
			const scopes = [`${copilotEntraEmuAudience}/.default`];
			const result = f.acquire({ kind: 'token', clientId: copilotEntraClientId, reason: 'renewal', accountId: 'selected', audience: copilotEntraEmuAudience, scopes, skipCachedAccessToken: false });
			const requirement = await waitForState(f.bridge.authenticationRequired);
			if (end === 'signOut') {
				await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
			} else if (end === 'disconnect') {
				f.connection.cancel();
			} else {
				f.registration.dispose();
			}
			await assert.rejects(f.authenticate(f.credential(requirement.resource.resource, scopes)), /pending acquisition|authority is unavailable/);
			assert.deepStrictEqual({
				result: await result,
				renewal: await f.acquire({ ...identity, reason: 'renewal', accountId: 'selected' }),
				requirement: f.bridge.authenticationRequired.get(),
			}, { result: { kind: 'unavailable' }, renewal: { kind: 'unavailable' }, requirement: undefined });
		});
	}

	test('disconnect before the first identity reply completes the callback as unavailable', async () => {
		const f = fixture();
		const result = f.acquire(identity);
		await waitForState(f.bridge.authenticationRequired);
		f.registration.dispose();
		await assert.rejects(f.authenticate(f.credential()), /pending acquisition/);
		assert.deepStrictEqual(await result, { kind: 'unavailable' });
	});

	test('uses SDK cancellation only to release the pending callback', async () => {
		const f = fixture();
		const cancellation = store.add(new CancellationTokenSource());
		const result = f.acquire(identity, cancellation.token);
		await waitForState(f.bridge.authenticationRequired);
		cancellation.cancel();
		assert.deepStrictEqual(await result, { kind: 'cancelled' });
		await assert.rejects(f.authenticate(f.credential()), /pending acquisition/);
	});

	test('does not stop a GitHub-only runtime when clients disconnect without Microsoft authority', async () => {
		const f = fixture();
		let revoked = 0;
		store.add(f.bridge.onDidRevoke(() => revoked++));
		f.registration.dispose();
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		assert.strictEqual(revoked, 0);
	});

	test('accepts a repeated discovery credential without consuming another resource acquisition', async () => {
		const f = fixture();
		await f.signIn();
		const scopes = [`${copilotEntraEmuAudience}/.default`];
		const result = f.acquire({ kind: 'token', clientId: copilotEntraClientId, reason: 'renewal', accountId: 'selected', scopes, skipCachedAccessToken: false });
		const requirement = await waitForState(f.bridge.authenticationRequired);
		await f.authenticate(f.credential());
		await f.authenticate(f.credential(requirement.resource.resource, scopes));
		assert.deepStrictEqual({
			result: await result,
			advertised: f.bridge.getProtectedResources().map(resource => resource.resource),
		}, {
			result: { kind: 'token', accountId: 'selected', accessToken: 'synthetic-resource-credential' },
			advertised: [copilotEntraDiscoveryResource],
		});
	});

	test('does not use missing account provenance or a replay without a live connection as authority', async () => {
		const f = fixture();
		const result = f.acquire(identity);
		await waitForState(f.bridge.authenticationRequired);
		await assert.rejects(f.bridge.authenticate(f.credential()), /authority is unavailable/);
		await assert.rejects(f.authenticate({ ...f.credential(), _meta: undefined }), /account provenance/);
		await f.authenticate(f.credential());
		assert.deepStrictEqual(await result, { kind: 'identity', accountId: 'selected' });
	});

	test('times out an unanswered acquisition and rejects a late reply', async () => {
		await runWithFakedTimers({}, async () => {
			const f = fixture();
			const cancellation = store.add(new CancellationTokenSource());
			await assert.rejects(f.acquire(identity, cancellation.token), /acquisition timed out/);
			await assert.rejects(f.authenticate(f.credential()), /pending acquisition/);
			assert.deepStrictEqual(f.bridge.getProtectedResources(), []);
		});
	});

	test('publishes resource removal when an idle authenticated connection ends', async () => {
		const f = fixture();
		const resources: string[][] = [];
		store.add(autorun(reader => {
			resources.push(f.bridge.getProtectedResources(reader).map(resource => resource.resource));
		}));
		await f.signIn();
		f.connection.cancel();
		assert.deepStrictEqual(resources, [[], [copilotEntraDiscoveryResource], [copilotEntraDiscoveryResource], [copilotEntraDiscoveryResource], []]);
	});

	test('does not deliver an accepted credential after authority was withdrawn before the callback completes', async () => {
		const f = fixture();
		const result = f.acquire(identity);
		await waitForState(f.bridge.authenticationRequired);
		const accepted = f.authenticate(f.credential());
		f.connection.cancel();
		await accepted;
		assert.deepStrictEqual(await result, { kind: 'unavailable' });
	});
});
