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
import { CloudSandboxAuthenticationRequiredError, CloudSandboxRequestError, ICloudSandboxAuthenticationTarget, ICloudSandboxSealedToken, ICloudSandboxSealTokenRequest } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AuthenticationSession } from '../../../../../services/authentication/common/authentication.js';
import { CloudSandboxIdentityTokenProvider, ICloudSandboxIdentityTokenResponse } from '../../../browser/remoteAgentHost/cloudSandboxIdentityTokenProvider.js';

suite('CloudSandboxIdentityTokenProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const accountKey = 'account-a';
	const session: AuthenticationSession = { accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] };

	function createProvider(
		requestToken: (session: AuthenticationSession, token: CancellationToken) => Promise<ICloudSandboxIdentityTokenResponse | null | undefined>,
		resolveAuthentication: () => Promise<{ readonly accountKey: string; readonly session: AuthenticationSession } | undefined> = async () => ({ accountKey, session }),
		sealToken: (session: AuthenticationSession, request: ICloudSandboxSealTokenRequest, token: CancellationToken) => Promise<ICloudSandboxSealedToken> = async () => { throw new Error('Unexpected sealing request'); },
	): CloudSandboxIdentityTokenProvider {
		return store.add(new CloudSandboxIdentityTokenProvider(resolveAuthentication, requestToken, sealToken));
	}

	suite('authentication preparation', () => {
		const target = { environmentId: 'env-1', resource: 'https://api.github.com' };
		const sealed: ICloudSandboxSealedToken = {
			encrypted_github_token: 'copilot-sealed.v1.test-key.test-ciphertext',
			host_encryption_key: { key_id: 'test-key', use: 'auth-token', public_key: 'test-public-key', algorithm: 'x25519-sealedbox' },
		};

		async function readError<T>(promise: Promise<T>): Promise<Error> {
			try {
				await promise;
			} catch (error) {
				assert.ok(error instanceof Error);
				return error;
			}
			assert.fail('Expected authentication preparation to fail.');
		}

		for (const cached of [false, true]) {
			test(`already cancelled preparation does not start work ${cached ? 'with' : 'without'} a cached identity`, async () => {
				let authentications = 0;
				let mints = 0;
				let seals = 0;
				const provider = createProvider(async () => {
					mints++;
					return { token: 'identity', expires_in: 120 };
				}, async () => {
					authentications++;
					return { accountKey, session };
				}, async () => {
					seals++;
					return sealed;
				});
				if (cached) {
					await provider.getIdentityToken(accountKey, CancellationToken.None);
				}
				const error = await readError(provider.prepareSandboxAuthentication(accountKey, Promise.resolve(target), CancellationToken.Cancelled));
				assert.deepStrictEqual({ cancelled: isCancellationError(error), authentications, mints, seals }, {
					cancelled: true, authentications: cached ? 1 : 0, mints: cached ? 1 : 0, seals: 0,
				});
			});
		}

		test('mints before the environment is ready and seals only after both complete', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
			const mintStarted = new DeferredPromise<void>();
			const events: string[] = [];
			const started = Date.now();
			const provider = createProvider(async () => {
				events.push('mint');
				void mintStarted.complete();
				return { token: 'identity', expires_in: 120 };
			}, undefined, async (session, request) => {
				events.push(`seal:${session.accessToken}:${request.environmentId}:${request.token}`);
				return sealed;
			});
			const prepared = provider.prepareSandboxAuthentication(accountKey, environment.p, CancellationToken.None);
			await mintStarted.p;
			const beforeEnvironment = [...events];
			events.push('environment ready');
			await environment.complete(target);
			assert.deepStrictEqual({ beforeEnvironment, result: await prepared, events }, {
				beforeEnvironment: ['mint'],
				result: { ...sealed, ...target, expiresAt: started + 120_000 },
				events: ['mint', 'environment ready', 'seal:tok:env-1:identity'],
			});
		}));

		test('waits for minting when the environment is already ready', async () => {
			const mint = new DeferredPromise<ICloudSandboxIdentityTokenResponse>();
			const mintStarted = new DeferredPromise<void>();
			const events: string[] = [];
			const provider = createProvider(() => {
				events.push('mint');
				void mintStarted.complete();
				return mint.p;
			}, undefined, async () => { events.push('seal'); return sealed; });
			const prepared = provider.prepareSandboxAuthentication(accountKey, Promise.resolve(target), CancellationToken.None);
			await mintStarted.p;
			const beforeToken = [...events];
			await mint.complete({ token: 'identity' });
			assert.deepStrictEqual({ beforeToken, result: await prepared, events }, {
				beforeToken: ['mint'], result: { ...sealed, ...target, expiresAt: undefined }, events: ['mint', 'seal'],
			});
		});

		for (const delay of [89_999, 90_000, 121_000]) {
			test(`rechecks token expiry after ${delay}ms of environment preparation`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
				const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
				const started = Date.now();
				let mints = 0;
				const sealedIdentities: string[] = [];
				const provider = createProvider(async () => ({ token: `identity-${++mints}`, expires_in: 120 }), undefined, async (_session, request) => {
					sealedIdentities.push(request.token);
					return sealed;
				});
				const prepared = provider.prepareSandboxAuthentication(accountKey, environment.p, CancellationToken.None);
				await timeout(delay);
				await environment.complete(target);
				const result = await prepared;
				const refreshed = delay >= 90_000;
				assert.deepStrictEqual({ mints, sealedIdentities, expiresAt: result.expiresAt }, {
					mints: refreshed ? 2 : 1,
					sealedIdentities: [refreshed ? 'identity-2' : 'identity-1'],
					expiresAt: started + 120_000 + (refreshed ? delay : 0),
				});
			}));
		}

		test('does not invent an expiry or remint an unknown lifetime after waiting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
			let mints = 0;
			const provider = createProvider(async () => { mints++; return { token: 'identity' }; }, undefined, async () => sealed);
			const prepared = provider.prepareSandboxAuthentication(accountKey, environment.p, CancellationToken.None);
			await timeout(120_000);
			await environment.complete(target);
			assert.deepStrictEqual({ result: await prepared, mints }, { result: { ...sealed, ...target, expiresAt: undefined }, mints: 1 });
		}));

		test('forced preparation replaces a cached identity credential', async () => {
			let mints = 0;
			const sealedIdentities: string[] = [];
			const provider = createProvider(async () => ({ token: `identity-${++mints}`, expires_in: 120 }), undefined, async (_session, request) => {
				sealedIdentities.push(request.token);
				return sealed;
			});
			await provider.getIdentityToken(accountKey, CancellationToken.None);
			await provider.prepareSandboxAuthentication(accountKey, Promise.resolve(target), CancellationToken.None, true);
			assert.deepStrictEqual({ mints, sealedIdentities }, { mints: 2, sealedIdentities: ['identity-2'] });
		});

		test('one cancelled preparation does not cancel another caller sharing the mint', async () => {
			const source = store.add(new CancellationTokenSource());
			const mint = new DeferredPromise<ICloudSandboxIdentityTokenResponse>();
			const mintStarted = new DeferredPromise<CancellationToken>();
			let mints = 0;
			const seals: string[] = [];
			const provider = createProvider((_session, token) => {
				mints++;
				void mintStarted.complete(token);
				return mint.p;
			}, undefined, async (_session, request) => { seals.push(request.environmentId); return sealed; });
			const cancelled = readError(provider.prepareSandboxAuthentication(accountKey, Promise.resolve(target), source.token));
			const active = provider.prepareSandboxAuthentication(accountKey, Promise.resolve({ ...target, environmentId: 'env-2' }), CancellationToken.None);
			const mintToken = await mintStarted.p;
			source.cancel();
			const error = await cancelled;
			const mintCancelled = mintToken.isCancellationRequested;
			await mint.complete({ token: 'shared', expires_in: 120 });
			const result = await active;
			assert.deepStrictEqual({ cancelled: isCancellationError(error), mintCancelled, mints, seals, environmentId: result.environmentId }, {
				cancelled: true, mintCancelled: false, mints: 1, seals: ['env-2'], environmentId: 'env-2',
			});
		});

		test('environment failure cancels an abandoned mint and preserves the original error', async () => {
			const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
			const mint = new DeferredPromise<ICloudSandboxIdentityTokenResponse>();
			const mintStarted = new DeferredPromise<CancellationToken>();
			let mints = 0;
			const provider = createProvider((_session, token) => {
				if (++mints === 1) {
					void mintStarted.complete(token);
					return mint.p;
				}
				return Promise.resolve({ token: 'current', expires_in: 120 });
			});
			const failed = readError(provider.prepareSandboxAuthentication(accountKey, environment.p, CancellationToken.None));
			const mintToken = await mintStarted.p;
			const error = new Error('Environment creation failed');
			await environment.error(error);
			const result = await failed;
			await mint.complete({ token: 'obsolete', expires_in: 120 });
			const identity = await provider.getIdentityToken(accountKey, CancellationToken.None);
			assert.deepStrictEqual({ sameError: result === error, cancelled: mintToken.isCancellationRequested, identity: identity.token, mints }, {
				sameError: true, cancelled: true, identity: 'current', mints: 2,
			});
		});

		for (const phase of ['waiting for the environment', 'sealing']) {
			test(`account changes cancel preparation while ${phase}`, async () => {
				const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
				const mintStarted = new DeferredPromise<void>();
				const sealStarted = new DeferredPromise<CancellationToken>();
				const sealResponse = new DeferredPromise<ICloudSandboxSealedToken>();
				let seals = 0;
				const provider = createProvider(async () => { void mintStarted.complete(); return { token: 'identity', expires_in: 120 }; }, undefined, (_session, _request, token) => {
					seals++;
					void sealStarted.complete(token);
					return sealResponse.p;
				});
				const failed = readError(provider.prepareSandboxAuthentication(accountKey, environment.p, CancellationToken.None));
				await mintStarted.p;
				let sealToken: CancellationToken | undefined;
				if (phase === 'sealing') {
					await environment.complete(target);
					sealToken = await sealStarted.p;
				}
				provider.clear();
				const error = await failed;
				if (phase !== 'sealing') {
					await environment.complete(target);
				}
				await sealResponse.complete(sealed);
				assert.deepStrictEqual({ cancelled: isCancellationError(error), seals, sealCancelled: sealToken?.isCancellationRequested }, {
					cancelled: true, seals: phase === 'sealing' ? 1 : 0, sealCancelled: phase === 'sealing' ? true : undefined,
				});
			});
		}

		test('does not seal a prefetched token after an unannounced GitHub credential change', async () => {
			const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
			const minted = new DeferredPromise<void>();
			let accessToken = 'old';
			let seals = 0;
			const provider = createProvider(async () => { void minted.complete(); return { token: 'identity', expires_in: 120 }; },
				async () => ({ accountKey, session: { ...session, accessToken } }), async () => { seals++; return sealed; });
			const failed = readError(provider.prepareSandboxAuthentication(accountKey, environment.p, CancellationToken.None));
			await minted.p;
			accessToken = 'new';
			await environment.complete(target);
			assert.deepStrictEqual({ cancelled: isCancellationError(await failed), seals }, { cancelled: true, seals: 0 });
		});

		test('rejects a token that expires during sealing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const provider = createProvider(async () => ({ token: 'identity', expires_in: 120 }), undefined, async () => { await timeout(120_000); return sealed; });
			const error = await readError(provider.prepareSandboxAuthentication(accountKey, Promise.resolve(target), CancellationToken.None));
			assert.strictEqual(error.message, 'The sandbox identity token expired while preparing authentication. Try connecting again.');
		}));

		test('disposal cancels preparation while the environment remains pending', async () => {
			const minted = new DeferredPromise<void>();
			const environment = new DeferredPromise<ICloudSandboxAuthenticationTarget>();
			const provider = createProvider(async () => { void minted.complete(); return { token: 'identity', expires_in: 120 }; });
			const failed = readError(provider.prepareSandboxAuthentication(accountKey, environment.p, CancellationToken.None));
			await minted.p;
			provider.dispose();
			const error = await failed;
			await environment.complete(target);
			assert.ok(isCancellationError(error));
		});
	});

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
			const provider = createProvider(async () => {
				if (++requests === 1) {
					throw new CloudSandboxRequestError(status, 'rate limited', 60);
				}
				return { token: 'identity', expires_in: 120 };
			}, async () => ({ accountKey, session: { ...session, accessToken } }));
			const readRateLimit = async () => {
				try {
					await provider.getIdentityToken(accountKey, CancellationToken.None);
				} catch (error) {
					assert.ok(error instanceof CloudSandboxRequestError);
					return { statusCode: error.statusCode, retryAfterSeconds: error.retryAfterSeconds };
				}
				assert.fail('Expected identity-token acquisition to be rate limited.');
			};
			const beforeRotation = await readRateLimit();
			accessToken = 'second';
			provider.clear();
			const afterRotation = await readRateLimit();
			await timeout(60_000);
			const identity = await provider.getIdentityToken(accountKey, CancellationToken.None);
			assert.deepStrictEqual({ token: identity.token, beforeRotation, afterRotation, requests }, {
				token: 'identity',
				beforeRotation: { statusCode: status, retryAfterSeconds: 60 },
				afterRotation: { statusCode: status, retryAfterSeconds: 60 },
				requests: 2,
			});
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
