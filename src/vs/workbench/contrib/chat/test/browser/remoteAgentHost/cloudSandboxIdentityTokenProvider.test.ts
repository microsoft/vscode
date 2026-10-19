/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxRequestError } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AuthenticationSession } from '../../../../../services/authentication/common/authentication.js';
import { CloudSandboxIdentityTokenProvider, ICloudSandboxIdentityTokenResponse } from '../../../browser/remoteAgentHost/cloudSandboxIdentityTokenProvider.js';

suite('CloudSandboxIdentityTokenProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const accountKey = 'account-a';
	const session: AuthenticationSession = { accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] };

	function createProvider(
		requestToken: (session: AuthenticationSession, token: CancellationToken) => Promise<ICloudSandboxIdentityTokenResponse | null | undefined>,
		resolveAuthentication: () => Promise<{ readonly accountKey: string; readonly session: AuthenticationSession } | undefined> = async () => ({ accountKey, session }),
	): CloudSandboxIdentityTokenProvider {
		return store.add(new CloudSandboxIdentityTokenProvider(resolveAuthentication, requestToken));
	}

	test('refreshes near expiry and when explicitly requested', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let requests = 0;
		const provider = createProvider(async () => ({ token: `identity-${++requests}`, expires_in: 120 }));
		const values = [(await provider.getIdentityToken(accountKey, CancellationToken.None)).token];
		await timeout(89_999);
		values.push((await provider.getIdentityToken(accountKey, CancellationToken.None)).token);
		await timeout(1);
		values.push((await provider.getIdentityToken(accountKey, CancellationToken.None)).token);
		values.push((await provider.getIdentityToken(accountKey, CancellationToken.None, true)).token);
		assert.deepStrictEqual({ values, requests }, { values: ['identity-1', 'identity-1', 'identity-2', 'identity-3'], requests: 3 });
	}));

	test('uses the earlier reported expiry and does not invent a missing lifetime', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let requests = 0;
		const now = Date.now();
		const provider = createProvider(async () => [
			{ token: 'both', expires_in: 120, expires_at: new Date(now + 60_000).toISOString() },
			{ token: 'absolute', expires_at: new Date(now + 90_000).toISOString() },
			{ token: 'unknown' },
		][Math.min(requests++, 2)]);
		const values = [
			await provider.getIdentityToken(accountKey, CancellationToken.None),
			await provider.getIdentityToken(accountKey, CancellationToken.None, true),
			await provider.getIdentityToken(accountKey, CancellationToken.None, true),
			await provider.getIdentityToken(accountKey, CancellationToken.None),
		];
		assert.deepStrictEqual({ values, requests }, {
			values: [
				{ token: 'both', expiresAt: now + 60_000 },
				{ token: 'absolute', expiresAt: now + 90_000 },
				{ token: 'unknown', expiresAt: undefined },
				{ token: 'unknown', expiresAt: undefined },
			],
			requests: 4,
		});
	}));

	for (const [name, response] of [
		['null', null],
		['missing token', {}],
		['empty token', { token: ' ' }],
		['invalid expiry type', { token: 'private-identity', expires_at: 42 }],
		['invalid expiry date', { token: 'private-identity', expires_at: 'invalid' }],
		['expired token', { token: 'private-identity', expires_at: '1970-01-01T00:00:00Z' }],
		['zero lifetime', { token: 'private-identity', expires_in: 0 }],
		['negative lifetime', { token: 'private-identity', expires_in: -1 }],
		['fractional lifetime', { token: 'private-identity', expires_in: 0.5 }],
		['string lifetime', { token: 'private-identity', expires_in: '60' }],
		['overflowing lifetime', { token: 'private-identity', expires_in: Number.MAX_SAFE_INTEGER }],
	] as const) {
		test(`rejects ${name} without caching or exposing the response`, async () => {
			let requests = 0;
			const provider = createProvider(async () => ++requests === 1 ? response : { token: 'valid', expires_in: 120 });
			await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), error =>
				error instanceof Error && /identity.*(invalid|expired)/.test(error.message) && !error.message.includes('private-identity'));
			const identity = await provider.getIdentityToken(accountKey, CancellationToken.None);
			assert.deepStrictEqual({ token: identity.token, requests }, { token: 'valid', requests: 2 });
		});
	}

	test('shares an exchange without letting one cancelled caller cancel another', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const source = store.add(new CancellationTokenSource());
		let requests = 0;
		const provider = createProvider(async () => {
			requests++;
			await timeout(10);
			return { token: 'shared', expires_in: 120 };
		});
		const cancelled = assert.rejects(provider.getIdentityToken(accountKey, source.token), isCancellationError);
		const active = provider.getIdentityToken(accountKey, CancellationToken.None, true);
		await timeout(1);
		source.cancel();
		await cancelled;
		assert.deepStrictEqual({ token: (await active).token, requests }, { token: 'shared', requests: 1 });
	}));

	test('cancels an abandoned exchange and ignores its late result', async () => {
		const source = store.add(new CancellationTokenSource());
		const issued = new DeferredPromise<CancellationToken>();
		const response = new DeferredPromise<ICloudSandboxIdentityTokenResponse>();
		let requests = 0;
		const provider = createProvider(async (_session, token) => {
			if (++requests === 1) {
				void issued.complete(token);
				return response.p;
			}
			return { token: 'current', expires_in: 120 };
		});
		const cancelled = assert.rejects(provider.getIdentityToken(accountKey, source.token), isCancellationError);
		const requestToken = await issued.p;
		source.cancel();
		await cancelled;
		const current = await provider.getIdentityToken(accountKey, CancellationToken.None);
		await response.complete({ token: 'abandoned', expires_in: 120 });
		const cached = await provider.getIdentityToken(accountKey, CancellationToken.None);
		assert.deepStrictEqual({ cancelled: requestToken.isCancellationRequested, current: current.token, cached: cached.token, requests }, {
			cancelled: true, current: 'current', cached: 'current', requests: 2,
		});
	});

	test('clearing discards cached and in-flight credentials', async () => {
		const issued = new DeferredPromise<void>();
		const response = new DeferredPromise<ICloudSandboxIdentityTokenResponse>();
		let requests = 0;
		const provider = createProvider(async () => {
			if (++requests === 2) {
				void issued.complete();
				return response.p;
			}
			return { token: `identity-${requests}`, expires_in: 120 };
		});
		await provider.getIdentityToken(accountKey, CancellationToken.None);
		provider.clear();
		const cancelled = assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), isCancellationError);
		await issued.p;
		provider.clear();
		await cancelled;
		const current = await provider.getIdentityToken(accountKey, CancellationToken.None);
		await response.complete({ token: 'obsolete', expires_in: 120 });
		const cached = await provider.getIdentityToken(accountKey, CancellationToken.None);
		assert.deepStrictEqual({ current: current.token, cached: cached.token, requests }, { current: 'identity-3', cached: 'identity-3', requests: 3 });
	});

	test('clearing cancels unresolved account lookup before any exchange', async () => {
		const authentication = new DeferredPromise<{ accountKey: string; session: AuthenticationSession } | undefined>();
		let signedOut = false;
		let requests = 0;
		const provider = createProvider(async () => {
			requests++;
			return { token: 'identity', expires_in: 120 };
		}, () => signedOut ? Promise.resolve(undefined) : authentication.p);
		const cancelled = assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), isCancellationError);
		signedOut = true;
		provider.clear();
		await cancelled;
		await authentication.complete({ accountKey, session });
		await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), CloudSandboxAuthenticationRequiredError);
		assert.strictEqual(requests, 0);
	});

	test('rejects a different account and replaces the cache when authentication changes', async () => {
		let authentication = { accountKey, session };
		const credentials: string[] = [];
		const provider = createProvider(async session => {
			credentials.push(session.accessToken);
			return { token: `identity-${credentials.length}`, expires_in: 120 };
		}, async () => authentication);
		await assert.rejects(provider.getIdentityToken('account-b', CancellationToken.None), isCancellationError);
		const first = await provider.getIdentityToken(accountKey, CancellationToken.None);
		authentication = { accountKey, session: { ...session, accessToken: 'rotated' } };
		const rotated = await provider.getIdentityToken(accountKey, CancellationToken.None);
		authentication = { accountKey: 'account-b', session: { ...session, accessToken: 'second-account', account: { id: 'b', label: 'b' } } };
		await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), isCancellationError);
		const second = await provider.getIdentityToken('account-b', CancellationToken.None);
		assert.deepStrictEqual({ first: first.token, rotated: rotated.token, second: second.token, credentials }, {
			first: 'identity-1', rotated: 'identity-2', second: 'identity-3', credentials: ['tok', 'rotated', 'second-account'],
		});
	});

	for (const status of [403, 429]) {
		test(`preserves long HTTP ${status} rate limits across calls and credential rotation`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			let accessToken = 'first';
			let requests = 0;
			const retries: (number | undefined)[] = [];
			const provider = createProvider(async () => {
				if (++requests === 1) {
					throw new CloudSandboxRequestError(status, 'rate limited', 60);
				}
				return { token: 'identity', expires_in: 120 };
			}, async () => ({ accountKey, session: { ...session, accessToken } }));
			const isRateLimit = (error: unknown) => {
				if (!(error instanceof CloudSandboxRequestError) || error.statusCode !== status) {
					return false;
				}
				retries.push(error.retryAfterSeconds);
				return true;
			};
			await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), isRateLimit);
			accessToken = 'second';
			provider.clear();
			await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), isRateLimit);
			await timeout(60_000);
			const identity = await provider.getIdentityToken(accountKey, CancellationToken.None);
			assert.deepStrictEqual({ token: identity.token, retries, requests }, { token: 'identity', retries: [60, 60], requests: 2 });
		}));
	}

	for (const retryAfter of [0, undefined]) {
		test(`bounds repeated rate limits with Retry-After ${retryAfter}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const started = Date.now();
			const times: number[] = [];
			const provider = createProvider(async () => {
				times.push(Date.now() - started);
				throw new CloudSandboxRequestError(429, 'rate limited', retryAfter);
			});
			await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), CloudSandboxRequestError);
			assert.deepStrictEqual(times, retryAfter === 0 ? [0, 0, 0, 0] : [0, 1000, 3000, 7000]);
		}));
	}

	test('cancels the last caller during a rate-limit wait', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const source = store.add(new CancellationTokenSource());
		let requests = 0;
		const provider = createProvider(async () => {
			requests++;
			throw new CloudSandboxRequestError(429, 'rate limited', 2);
		});
		const cancelled = assert.rejects(provider.getIdentityToken(accountKey, source.token), isCancellationError);
		await timeout(1);
		source.cancel();
		await cancelled;
		await timeout(2000);
		assert.strictEqual(requests, 1);
	}));

	test('does not initialize or exchange after cancellation or disposal', async () => {
		let initializations = 0;
		let requests = 0;
		const provider = createProvider(async () => {
			requests++;
			return { token: 'identity', expires_in: 120 };
		}, async () => {
			initializations++;
			return { accountKey, session };
		});
		await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.Cancelled), isCancellationError);
		provider.dispose();
		await assert.rejects(provider.getIdentityToken(accountKey, CancellationToken.None), isCancellationError);
		assert.deepStrictEqual({ initializations, requests }, { initializations: 0, requests: 0 });
	});
});
