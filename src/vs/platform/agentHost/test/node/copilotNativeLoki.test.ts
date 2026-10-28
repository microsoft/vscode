/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { isNativeEntraTokenReply, nativeLokiActiveAccountMeta, nativeLokiAuthenticationMeta, NATIVE_EMU_PROTECTED_RESOURCE, NATIVE_EMU_SCOPE, NATIVE_LOKI_BASE_URLS, NATIVE_LOKI_PROTECTED_RESOURCE, NATIVE_LOKI_SCOPE, readNativeLokiActiveAccountId, readNativeLokiAuthentication, type INativeLokiProtectedResource } from '../../common/meta/nativeLoki.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { CopilotNativeLoki } from '../../node/copilot/copilotNativeLoki.js';
import { MockAgent } from './mockAgent.js';

suite('CopilotNativeLoki', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const initial: AuthenticateParams = {
		resource: NATIVE_LOKI_PROTECTED_RESOURCE.resource,
		scopes: [NATIVE_LOKI_SCOPE],
		token: 'host-token',
		_meta: nativeLokiAuthenticationMeta({ accountId: 'microsoft-account' }),
	};
	const renewal = {
		scopes: [NATIVE_LOKI_SCOPE],
		audience: NATIVE_LOKI_SCOPE.split('/')[0],
		accountId: 'microsoft-account',
		reason: 'renewal' as const,
	};

	function createBridge(timeoutMs = 1000, baseUrl?: string, enableEmu = false) {
		const requests: INativeLokiProtectedResource[] = [];
		const bridge = store.add(new CopilotNativeLoki('/local/runtime', baseUrl, resource => requests.push(resource), new NullLogService(), timeoutMs, undefined, enableEmu));
		bridge.acceptToken({ ...initial, resource: bridge.protectedResource.resource });
		return { bridge, requests };
	}

	for (const baseUrl of NATIVE_LOKI_BASE_URLS) {
		test(`keeps authentication and renewal bound to ${baseUrl}`, async () => {
			const { bridge, requests } = createBridge(1000, baseUrl);
			const pending = bridge.acquireToken({ ...renewal, signal: new AbortController().signal });
			const reply = { ...initial, resource: baseUrl, _meta: requests[0]._meta };
			const other = NATIVE_LOKI_BASE_URLS.find(url => url !== baseUrl)!;
			assert.throws(() => bridge.acceptToken({ ...reply, resource: other }), /account-bound token/);
			bridge.acceptToken(reply);
			assert.deepStrictEqual({
				protectedResource: bridge.protectedResource.resource,
				renewalResource: requests[0].resource,
				oneShotReply: isNativeEntraTokenReply(reply),
				result: await pending,
			}, {
				protectedResource: baseUrl, renewalResource: baseUrl, oneShotReply: true,
				result: { kind: 'ok', accessToken: 'host-token', accountId: 'microsoft-account' },
			});
		});
	}

	test('rejects unapproved endpoints rather than forwarding Microsoft credentials', () => {
		for (const endpoint of ['http://msit.loki.delve.office.com/api/v1/llmapi', 'https://loki.delve.office.com/api/v1/llmapi', 'https://example.com/api/v1/llmapi']) {
			assert.throws(() => createBridge(1000, endpoint), /fixed HTTPS DF and MSIT endpoints/);
		}
	});

	test('initial identity uses the host token and account without GitHub credentials', async () => {
		const { bridge, requests } = createBridge();
		const result = await bridge.acquireToken({ scopes: [], reason: 'signIn', signal: new AbortController().signal });
		assert.deepStrictEqual({ result, requests }, {
			result: { kind: 'ok', accessToken: 'host-token', accountId: 'microsoft-account' },
			requests: [],
		});
	});

	test('the EMU audience uses the same Microsoft account without replacing its Loki token', async () => {
		const { bridge, requests } = createBridge(1000, undefined, true);
		const emuRequest = {
			scopes: [NATIVE_EMU_SCOPE],
			audience: NATIVE_EMU_SCOPE.split('/')[0],
			accountId: 'microsoft-account',
			reason: 'signIn' as const,
			signal: new AbortController().signal,
		};
		const pending = bridge.acquireToken(emuRequest);
		const challenge = requests[0];
		const metadata = readNativeLokiAuthentication(challenge);
		assert.ok(metadata?.requestId);
		const wrongAccount = { resource: challenge.resource, scopes: [NATIVE_EMU_SCOPE], token: 'wrong-account-token', _meta: nativeLokiAuthenticationMeta({ ...metadata, accountId: 'other-account' }) };
		assert.throws(() => bridge.acceptToken(wrongAccount), isCancellationError);
		bridge.acceptToken({ resource: challenge.resource, scopes: [NATIVE_EMU_SCOPE], token: 'emu-token', _meta: challenge._meta });
		const result = await pending;
		const renewal = bridge.acquireToken({ ...emuRequest, reason: 'renewal' });
		const renewalChallenge = requests[1];
		bridge.acceptToken({ resource: renewalChallenge.resource, scopes: [NATIVE_EMU_SCOPE], token: '', _meta: renewalChallenge._meta });

		assert.deepStrictEqual({
			challenge: { resource: challenge.resource, scopes: challenge.scopes_supported, metadata },
			renewalMetadata: readNativeLokiAuthentication(renewalChallenge),
			result,
			renewal: await renewal,
			activeAccount: bridge.accountId,
			bootstrap: await bridge.acquireToken({ scopes: [], reason: 'signIn', signal: new AbortController().signal }),
			oneShotReply: isNativeEntraTokenReply({ resource: challenge.resource, _meta: challenge._meta }),
		}, {
			challenge: {
				resource: NATIVE_EMU_PROTECTED_RESOURCE.resource,
				scopes: [NATIVE_EMU_SCOPE],
				metadata: { accountId: 'microsoft-account', requestId: metadata.requestId },
			},
			renewalMetadata: { accountId: 'microsoft-account', requestId: readNativeLokiAuthentication(renewalChallenge)?.requestId },
			result: { kind: 'ok', accessToken: 'emu-token', accountId: 'microsoft-account' },
			renewal: { kind: 'unavailable' },
			activeAccount: 'microsoft-account',
			bootstrap: { kind: 'ok', accessToken: 'host-token', accountId: 'microsoft-account' },
			oneShotReply: true,
		});
	});

	test('an explicitly selected account rejects another bootstrap identity', () => {
		const bridge = store.add(new CopilotNativeLoki('/local/runtime', undefined, () => { }, new NullLogService(), 1000, 'selected-account'));
		assert.throws(() => bridge.acceptToken(initial), /account-bound token/);
		bridge.acceptToken({ ...initial, _meta: nativeLokiAuthenticationMeta({ accountId: 'selected-account' }) });
		const accepted = {
			selection: readNativeLokiAuthentication(bridge.protectedResource),
			activeAccountId: readNativeLokiActiveAccountId(bridge.protectedResource),
			accountId: bridge.accountId,
		};
		bridge.acceptToken({ ...initial, token: '', _meta: nativeLokiAuthenticationMeta({ accountId: 'selected-account' }) });
		assert.deepStrictEqual({
			accepted,
			revoked: {
				selection: readNativeLokiAuthentication(bridge.protectedResource),
				activeAccountId: readNativeLokiActiveAccountId(bridge.protectedResource),
				accountId: bridge.accountId,
			},
		}, {
			accepted: {
				selection: { accountId: 'selected-account' },
				activeAccountId: 'selected-account',
				accountId: 'selected-account',
			},
			revoked: {
				selection: { accountId: 'selected-account' },
				activeAccountId: undefined,
				accountId: undefined,
			},
		});
	});

	test('publishes the accepted account separately from the selection, then clears it on sign-out and switch', () => {
		const bridge = store.add(new CopilotNativeLoki('/local/runtime', undefined, () => { }, new NullLogService()));
		const before = bridge.protectedResource._meta;
		bridge.acceptToken(initial);
		const accepted = bridge.protectedResource._meta;
		bridge.acceptToken({ ...initial, token: '' });
		const revoked = bridge.protectedResource._meta;
		bridge.acceptToken({ ...initial, token: 'other-token', _meta: nativeLokiAuthenticationMeta({ accountId: 'other-account' }) });
		const switched = bridge.protectedResource._meta;

		assert.deepStrictEqual({ before, accepted, revoked, switched }, {
			before: undefined,
			accepted: nativeLokiActiveAccountMeta('microsoft-account'),
			revoked: undefined,
			switched: nativeLokiActiveAccountMeta('other-account'),
		});
	});

	test('keeps EMU usable when Loki is revoked and rejects another account until sign-out', async () => {
		const bridge = store.add(new CopilotNativeLoki('/local/runtime', undefined, () => { }, new NullLogService(), 1000, undefined, true));
		const emu = {
			resource: NATIVE_EMU_PROTECTED_RESOURCE.resource,
			scopes: [NATIVE_EMU_SCOPE],
			token: 'emu-token',
			_meta: nativeLokiAuthenticationMeta({ accountId: 'microsoft-account' }),
		};
		bridge.acceptToken(initial);
		bridge.acceptToken(emu);
		const both = {
			lokiAccount: readNativeLokiActiveAccountId(bridge.protectedResource),
			emuAccount: readNativeLokiActiveAccountId(bridge.emuProtectedResource),
			bootstrap: await bridge.acquireToken({ scopes: [], reason: 'signIn', signal: new AbortController().signal }),
		};
		assert.throws(() => bridge.acceptToken({ ...emu, _meta: nativeLokiAuthenticationMeta({ accountId: 'different-account' }) }), isCancellationError);
		bridge.acceptToken({ ...initial, token: '' });
		const emuOnly = {
			lokiAccount: readNativeLokiActiveAccountId(bridge.protectedResource),
			emuAccount: readNativeLokiActiveAccountId(bridge.emuProtectedResource),
			bootstrap: await bridge.acquireToken({ scopes: [], reason: 'signIn', signal: new AbortController().signal }),
		};
		bridge.acceptToken({ ...emu, token: '' });
		const signedOut = bridge.accountId;

		assert.deepStrictEqual({ both, emuOnly, signedOut }, {
			both: {
				lokiAccount: 'microsoft-account',
				emuAccount: 'microsoft-account',
				bootstrap: { kind: 'ok', accessToken: 'host-token', accountId: 'microsoft-account' },
			},
			emuOnly: {
				lokiAccount: undefined,
				emuAccount: 'microsoft-account',
				bootstrap: { kind: 'ok', accessToken: 'emu-token', accountId: 'microsoft-account' },
			},
			signedOut: undefined,
		});
	});

	test('each resource acquisition asks VS Code for an account-bound token', async () => {
		const { bridge, requests } = createBridge();
		const results = [];
		for (let i = 0; i < 2; i++) {
			const pending = bridge.acquireToken({ ...renewal, signal: new AbortController().signal });
			const request = readNativeLokiAuthentication(requests[i]);
			assert.ok(request?.requestId);
			bridge.acceptToken({ ...initial, token: `renewed-${i}`, _meta: nativeLokiAuthenticationMeta(request) });
			results.push(await pending);
		}
		assert.deepStrictEqual({
			results,
			scopes: requests.map(request => request.scopes_supported),
			accounts: requests.map(request => readNativeLokiAuthentication(request)?.accountId),
			uniqueRequests: new Set(requests.map(request => readNativeLokiAuthentication(request)?.requestId)).size,
		}, {
			results: [
				{ kind: 'ok', accessToken: 'renewed-0', accountId: 'microsoft-account' },
				{ kind: 'ok', accessToken: 'renewed-1', accountId: 'microsoft-account' },
			],
			scopes: [[NATIVE_LOKI_SCOPE], [NATIVE_LOKI_SCOPE]],
			accounts: ['microsoft-account', 'microsoft-account'],
			uniqueRequests: 2,
		});
	});

	test('revocation cancels renewal and a late reply cannot restore the identity', async () => {
		const { bridge, requests } = createBridge();
		const pending = bridge.acquireToken({ ...renewal, signal: new AbortController().signal });
		bridge.acceptToken({ ...initial, token: '' });
		assert.throws(() => bridge.acceptToken({ ...initial, _meta: requests[0]._meta }), isCancellationError);
		assert.deepStrictEqual({ result: await pending, account: bridge.accountId }, { result: { kind: 'unavailable' }, account: undefined });
	});

	test('host unavailability never reuses the bootstrap token', async () => {
		const { bridge, requests } = createBridge();
		const pending = bridge.acquireToken({ ...renewal, signal: new AbortController().signal });
		bridge.acceptToken({ ...initial, token: '', _meta: requests[0]._meta });
		assert.deepStrictEqual(await pending, { kind: 'unavailable' });
	});

	test('runtime cancellation cancels renewal and rejects a late reply', async () => {
		const { bridge, requests } = createBridge();
		const controller = new AbortController();
		const pending = bridge.acquireToken({ ...renewal, signal: controller.signal });
		controller.abort();
		const result = await pending;
		assert.throws(() => bridge.acceptToken({ ...initial, _meta: requests[0]._meta }), isCancellationError);
		assert.deepStrictEqual(result, { kind: 'unavailable' });
	});

	test('disposal cancels renewal and rejects later authentication', async () => {
		const { bridge } = createBridge();
		const pending = bridge.acquireToken({ ...renewal, signal: new AbortController().signal });
		bridge.dispose();
		assert.throws(() => bridge.acceptToken(initial), isCancellationError);
		assert.deepStrictEqual(await pending, { kind: 'unavailable' });
	});

	test('missing client response produces an explicit timeout', async () => {
		const { bridge } = createBridge(1);
		await assert.rejects(bridge.acquireToken({ ...renewal, signal: new AbortController().signal }), /Timed out waiting for VS Code/);
	});

	test('invalid scopes fail and another account is never substituted', async () => {
		const { bridge, requests } = createBridge();
		assert.throws(() => bridge.acceptToken({ ...initial, scopes: ['User.Read'] }), /exact Loki scope/);
		await assert.rejects(bridge.acquireToken({ ...renewal, scopes: ['User.Read'], signal: new AbortController().signal }), /unexpected Microsoft resource/);
		const result = await bridge.acquireToken({ ...renewal, accountId: 'different-account', signal: new AbortController().signal });
		assert.deepStrictEqual({ result, requests }, { result: { kind: 'unavailable' }, requests: [] });
	});

	test('authentication replay preserves account identity but never replays callback replies', async () => {
		const accepted: AuthenticateParams[] = [];
		class Provider extends MockAgent {
			override getProtectedResources(): ProtectedResourceMetadata[] { return []; }
			async handleAuthenticationToken(params: AuthenticateParams): Promise<boolean> {
				accepted.push(params);
				return true;
			}
		}
		const provider = store.add(new Provider('copilot'));
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		await authentication.authenticate(initial, [provider]);
		await authentication.authenticate({ ...initial, token: 'renewed', _meta: nativeLokiAuthenticationMeta({ accountId: 'microsoft-account', requestId: 'request' }) }, [provider]);
		await authentication.authenticate({
			resource: NATIVE_EMU_PROTECTED_RESOURCE.resource,
			scopes: [NATIVE_EMU_SCOPE],
			token: 'emu-token',
			_meta: nativeLokiAuthenticationMeta({ accountId: 'microsoft-account', requestId: 'emu-request' }),
		}, [provider]);
		accepted.length = 0;
		await authentication.replay(provider);
		assert.deepStrictEqual({
			replayed: accepted.map(params => ({ token: params.token, metadata: readNativeLokiAuthentication(params) })),
			cached: authentication.getAuthToken(initial),
			emuCached: authentication.getAuthToken({ resource: NATIVE_EMU_PROTECTED_RESOURCE.resource, scopes: [NATIVE_EMU_SCOPE] }),
		}, {
			replayed: [{ token: 'host-token', metadata: { accountId: 'microsoft-account' } }],
			cached: 'host-token',
			emuCached: undefined,
		});
	});
});
