/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash, randomBytes } from 'crypto';
import sodium from 'libsodium-wrappers';
import { stub, restore } from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../common/state/protocol/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MissionControlAuthentication, MissionControlSealing, resolveMissionControlOwner, sealMissionControlCredential } from '../../node/missionControl/missionControlAuthentication.js';

suite('Mission Control sealed authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = 'https://api.github.com';
	setup(() => MissionControlSealing.ready());
	teardown(() => restore());

	function seal(sealing: MissionControlSealing, value: string, connection?: object, use = 'auth-token', target = resource): string {
		const key = sealing.advertisedKeys.find(key => key.use === use && key.algorithm === 'x25519-sealedbox')!;
		const box = sodium.crypto_box_seal(JSON.stringify({ cty: 'text', ctx: { purpose: use, resource: target, ...(connection ? { connection } : {}) }, value }), Buffer.from(key.public_key, 'base64'));
		return `copilot-sealed.v1.${key.key_id}.${Buffer.from(box).toString('base64url')}`;
	}

	test('trusted local sealing produces purpose-specific, resource-bound portable tokens', async () => {
		const sealing = store.add(new MissionControlSealing());
		const key = sealing.advertisedKeys.find(key => key.use === 'mcp-auth-token');
		assert.ok(key);
		const challenge = randomBytes(16).toString('hex');
		const target = 'https://mcp.example.test';
		const envelope = await sealMissionControlCredential({ token: 'test-mcp-token', resource: target, key: { ...key, use: 'mcp-auth-token' }, challenge });
		const opened = await sealing.open(envelope, 'mcp-auth-token', target);
		assert.strictEqual(opened.token, 'test-mcp-token');
		assert.strictEqual(opened.connection?.challenge, challenge);
		assert.match(String(opened.connection?.nonce), /^[0-9a-f]{32}$/);
		await assert.rejects(sealing.open(envelope, 'auth-token', target), { code: AhpErrorCodes.Conflict });
		await assert.rejects(sealing.open(envelope, 'mcp-auth-token', 'https://different.test'), /context/);
		await assert.rejects(sealMissionControlCredential({ token: 'test', resource: target, key: { ...key, key_id: 'mismatched', use: 'mcp-auth-token' } }), /recipient key/);
	});

	test('opens the independently produced portable sealed-box vector', async () => {
		const sealing = store.add(new MissionControlSealing([{ use: 'auth-token', privateKey: Buffer.from('aSFRt0ENOIh44Ovgwe34W2STEqRZg1CKS7TJg2yanWs=', 'base64') }]));
		const opened = await sealing.open('copilot-sealed.v1.-a-KYd0rURg.AOfR8IBb-j-x6ALl6DBMtN-C-0VelwcnnRwsdDcRqy5_EoYzSifMl63NyZKMBSkIr8-tFa_v6YMXG7coG4ZAwz_Tk8IvlAiIV72hsKvT-QX6K6CflsTCyU-lyq5xIO8o8LoqSzX3EKRO2kL9B3iWAuEypz2p_gXubPV-bqbVAkYO7cMmHhKFLMrjb7aPnNSGit_Wy8nI6kPxYB5bMVDji2jcIFQGf1D_ojeLoesehHto7jT0', 'auth-token', resource);
		assert.deepStrictEqual({
			key: sealing.advertisedKeys[0].key_id,
			tokenHash: createHash('sha256').update(opened.token).digest('hex'),
			connection: opened.connection,
		}, {
			key: '-a-KYd0rURg',
			tokenHash: '50ca8da854b9006de85269d122e0d0f77a9cc86f9b20a0691b4b7b7ce2a557b2',
			connection: undefined,
		});
	});

	test('requires sealed values, separates purposes, and checks resources', async () => {
		const sealing = store.add(new MissionControlSealing());
		await assert.rejects(sealing.open('plaintext-credential', 'auth-token', resource), /requires a sealed/);
		await assert.rejects(sealing.open(seal(sealing, 'test', undefined, 'mcp-auth-token'), 'auth-token', resource), { code: AhpErrorCodes.Conflict });
		await assert.rejects(sealing.open(seal(sealing, 'test', undefined, 'auth-token', 'https://other.test'), 'auth-token', resource), /context/);
		const box = seal(sealing, 'test');
		const parts = box.split('.');
		const corrupted = Buffer.from(parts[3], 'base64url');
		corrupted[corrupted.length - 1] ^= 1;
		await assert.rejects(sealing.open(`${parts.slice(0, 3).join('.')}.${corrupted.toString('base64url')}`, 'auth-token', resource), /open sealed/);
	});

	for (const valid of [true, false]) {
		test(`decodes the decrypted view and scrubs its bytes after ${valid ? 'successful' : 'failed'} parsing`, async () => {
			const sealing = store.add(new MissionControlSealing());
			const token = seal(sealing, 'test-token');
			const bytes = Buffer.from(valid ? JSON.stringify({
				cty: 'text', ctx: { purpose: 'auth-token', resource }, value: 'test-token',
			}) : 'invalid-json');
			const allocation = Buffer.concat([Buffer.from([1]), bytes, Buffer.from([2])]);
			const plaintext = allocation.subarray(1, allocation.length - 1);
			const byteOpener: { crypto_box_seal_open(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array } = sodium;
			stub(byteOpener, 'crypto_box_seal_open').returns(plaintext);
			if (valid) {
				assert.deepStrictEqual(await sealing.open(token, 'auth-token', resource), { token: 'test-token', connection: undefined });
			} else {
				await assert.rejects(sealing.open(token, 'auth-token', resource), /Invalid sealed authentication plaintext/);
			}
			assert.deepStrictEqual(allocation, Buffer.concat([Buffer.from([1]), Buffer.alloc(bytes.length), Buffer.from([2])]));
		});
	}

	test('advertises independent keys for both algorithms and purposes with identical MC and AHP projections', () => {
		const sealing = store.add(new MissionControlSealing());
		const keys = sealing.advertisedKeys;
		assert.deepStrictEqual({
			algorithmsAndPurposes: keys.map(key => ({ use: key.use, algorithm: key.algorithm })),
			distinctKeys: new Set(keys.map(key => key.key_id)).size,
			validFingerprints: keys.every(key => {
				const publicKey = Buffer.from(key.public_key, 'base64');
				return publicKey.length === 32 && publicKey.toString('base64') === key.public_key
					&& createHash('sha256').update(publicKey).digest().subarray(0, 8).toString('base64url') === key.key_id;
			}),
			matchingRootKeys: JSON.stringify(sealing.rootMeta['copilot.encryptionKeys']) === JSON.stringify(keys.map(key => ({
				keyId: key.key_id, use: key.use, algorithm: key.algorithm, publicKey: key.public_key,
			}))),
		}, {
			algorithmsAndPurposes: [
				{ use: 'auth-token', algorithm: 'x25519-sealedbox' },
				{ use: 'auth-token', algorithm: 'hpke-x25519-hkdf-sha256-aes256gcm' },
				{ use: 'mcp-auth-token', algorithm: 'x25519-sealedbox' },
				{ use: 'mcp-auth-token', algorithm: 'hpke-x25519-hkdf-sha256-aes256gcm' },
			],
			distinctKeys: 4, validFingerprints: true, matchingRootKeys: true,
		});
	});

	// CIRCL-produced fixtures also used by github/mobile-ios's AgentHost encryption tests.
	for (const fixture of [
		{
			use: 'auth-token' as const,
			privateKey: 'd2xGszB9vJT6h7qel9yVGt7zKOh1SCwd/73rssqR4Vw=',
			token: 'copilot-sealed.v1.gBmD7I97I3M.Zu5EAvyzwT3jdUzI52a80dtrOXiXc73mpQYWnX5Yh2DV8BIn3rWb7OAXv_4yXroflijFfYabbNQuo9C4Swroy7GMS-bmHAcP8DRO0P3uj7S7t9-JvTViBiIU59exgv77TqxX6Er6nSH4HowgPzFyDkHEeXtPP2HhV2RBrBEjUDTARaPC0AKhAeHWP5zz1A8Cjofo11JSShZ0lUit4gsWeYWLjgw',
			resource,
			value: 'independent_auth_fixture',
		},
		{
			use: 'mcp-auth-token' as const,
			privateKey: 'F3/TNCLN6v7vVgTP1THtLEQdKaPaRZ7VDUH5TARD4dc=',
			token: 'copilot-sealed.v1.hPy02MM3V3Y.IQRoWFTlPtbcZpWB74Inv2OdQQ3IHEfK4JiB9E0OI0uNx81dp5Vw7e3ny906gHQkoxH-FYstz-7miRdVj3ZHaUpqe1S8NXZxWvIQK_sSOC61dttfkjgck6cAqx9Lgm-qkvORUyoEo2-xLnepkN-YiYpPH10AF9r-sr9Y9NwveVmDd6oj873QwuUy_NjmJTviZzo078_ZqNYGaJYpzZb2ba959mfyILzyEonnyPU',
			resource: 'https://mcp.example/resource',
			value: 'independent_mcp_fixture',
		},
	]) {
		test(`opens independent iOS ${fixture.use} HPKE fixture and rejects tampering and retargeting`, async () => {
			const sealing = store.add(new MissionControlSealing([{
				use: fixture.use, algorithm: 'hpke-x25519-hkdf-sha256-aes256gcm', privateKey: Buffer.from(fixture.privateKey, 'base64'),
			}]));
			assert.deepStrictEqual(await sealing.open(fixture.token, fixture.use, fixture.resource), {
				token: fixture.value, connection: undefined,
			});
			await assert.rejects(sealing.open(fixture.token, fixture.use, 'https://different.test'), { code: JsonRpcErrorCodes.InvalidParams });
			const otherUse = fixture.use === 'auth-token' ? 'mcp-auth-token' : 'auth-token';
			await assert.rejects(sealing.open(fixture.token, otherUse, fixture.resource), { code: AhpErrorCodes.Conflict });
			const parts = fixture.token.split('.');
			const corrupted = Buffer.from(parts[3], 'base64url');
			corrupted[corrupted.length - 1] ^= 1;
			await assert.rejects(sealing.open(`${parts.slice(0, 3).join('.')}.${corrupted.toString('base64url')}`, fixture.use, fixture.resource), {
				code: JsonRpcErrorCodes.InvalidParams,
			});
		});
	}

	test('HPKE rejects an independently sealed plaintext whose purpose disagrees with its recipient key', async () => {
		const sealing = store.add(new MissionControlSealing([{
			use: 'auth-token',
			algorithm: 'hpke-x25519-hkdf-sha256-aes256gcm',
			privateKey: Buffer.from('DuL7xrRknlLZbVZRF/X2yUuiZw/eODvJQMaZRhYdFvA=', 'base64'),
		}]));
		await assert.rejects(sealing.open(
			'copilot-sealed.v1.6iuHDlS4PXM.0FHEDfKKmkZ9d4ybM24iKFncwixlu903zk58OH9XtGvKfGumA5Wumia87TuTbyvINOa9lquOgaxV7nf-nTtRUQRFjPYHvv8CCRUK-cEYTDlXe0Z2_dEj-xZV4LYyb9YPJjeLe2DmAk91k33z-4csA1R3YDpIHK8itpcv1rhrkzfY_ZZ7eGq2ECypp-A1',
			'auth-token', resource,
		), /Invalid sealed authentication context/);
	});

	test('unknown keys trigger iOS key-refresh recovery, but malformed envelopes do not', async () => {
		const sealing = store.add(new MissionControlSealing());
		const previous = store.add(new MissionControlSealing());
		await assert.rejects(sealing.open(seal(previous, 'old-key-token'), 'auth-token', resource), { code: AhpErrorCodes.Conflict });
		for (const token of [
			'copilot-sealed.v2.AAAAAAAAAAA.' + Buffer.alloc(48).toString('base64url'),
			'copilot-sealed.v1.invalid.' + Buffer.alloc(48).toString('base64url'),
			'copilot-sealed.v1.AAAAAAAAAAA.AA',
			'copilot-sealed.v1.AAAAAAAAAAA.' + Buffer.alloc(49).toString('base64'),
		]) {
			await assert.rejects(sealing.open(token, 'auth-token', resource), { code: JsonRpcErrorCodes.InvalidParams });
		}
	});

	test('HPKE authenticates owner and MCP tokens while retaining binding and purpose checks', async () => {
		const sealing = store.add(new MissionControlSealing());
		const keys = sealing.advertisedKeys.filter(key => key.algorithm === 'hpke-x25519-hkdf-sha256-aes256gcm');
		const authKey = keys.find(key => key.use === 'auth-token')!;
		const mcpKey = keys.find(key => key.use === 'mcp-auth-token')!;
		const fetcher: typeof fetch = async () => Response.json({ id: 123, type: 'User' });
		const auth = new MissionControlAuthentication(sealing, '123', resource, fetcher, true);
		const challenge = (auth.handshakeMeta['copilot.authChallenge'] as { challenge: string }).challenge;
		const ownerEnvelope = await sealMissionControlCredential({ resource, token: 'hpke-owner', key: { ...authKey, use: 'auth-token' }, challenge });
		const mcpResource = 'https://mcp.example.test';
		const mcpEnvelope = await sealMissionControlCredential({
			resource: mcpResource, token: 'hpke-mcp', key: { ...mcpKey, use: 'mcp-auth-token' }, challenge,
		});
		const owner = auth.authenticate({ resource, token: ownerEnvelope });
		const mcp = auth.authenticate({ resource: mcpResource, token: mcpEnvelope });
		assert.deepStrictEqual(await Promise.all([owner, mcp]), [
			{ resource, token: 'hpke-owner' }, { resource: mcpResource, token: 'hpke-mcp' },
		]);
		await assert.rejects(auth.authenticate({ resource, token: ownerEnvelope }), /replayed/);
		auth.beginHandshake();
		await assert.rejects(auth.authenticate({ resource, token: ownerEnvelope }), /binding/);
		const unbound = await sealMissionControlCredential({ resource, token: 'hpke-owner', key: { ...authKey, use: 'auth-token' } });
		await assert.rejects(auth.authenticate({ resource, token: unbound }), /connection-bound/);
		const transition = new MissionControlAuthentication(sealing, '123', resource, fetcher, false);
		assert.deepStrictEqual(await transition.authenticate({ resource, token: unbound }), { resource, token: 'hpke-owner' });
		const foreign = new MissionControlAuthentication(sealing, '123', resource, async () => Response.json({ id: 456, type: 'User' }), false);
		await assert.rejects(foreign.authenticate({ resource, token: unbound }), /registered owner/);
	});

	for (const transition of ['handshake', 'close', 'authority'] as const) {
		test(`asynchronous decryption cannot authenticate or validate identity after ${transition}`, async () => {
			const sealing = store.add(new MissionControlSealing());
			const opened = new DeferredPromise<{ token: string }>();
			stub(sealing, 'open').returns(opened.p);
			let current = true;
			const fetcher = stub().resolves(Response.json({ id: 123, type: 'User' }));
			const auth = new MissionControlAuthentication(sealing, '123', resource, fetcher, false, () => current);
			const request = auth.authenticate({ resource, token: 'sealed-placeholder' });
			const rejection = assert.rejects(request, /expired handshake/);
			if (transition === 'handshake') {
				auth.beginHandshake();
			} else if (transition === 'close') {
				auth.dispose();
			} else {
				current = false;
			}
			await opened.complete({ token: 'owner-token' });
			await rejection;
			assert.deepStrictEqual({ authorized: auth.authenticated, identityRequests: fetcher.callCount }, {
				authorized: false, identityRequests: 0,
			});
		});
	}

	test('MCP waits for asynchronous owner decryption and cannot proceed after a failed owner check', async () => {
		const sealing = store.add(new MissionControlSealing());
		const opened = new DeferredPromise<{ token: string }>();
		const opening = stub(sealing, 'open').returns(opened.p);
		const auth = new MissionControlAuthentication(sealing, '123', resource, async () => Response.json({ id: 456, type: 'User' }), false);
		const owner = auth.authenticate({ resource, token: 'owner-envelope' });
		const mcp = auth.authenticate({ resource: 'https://mcp.example.test', token: 'mcp-envelope' });
		const rejected = Promise.all([
			assert.rejects(owner, /registered owner/),
			assert.rejects(mcp, /registered owner/),
		]);
		await opened.complete({ token: 'foreign-owner' });
		await rejected;
		assert.deepStrictEqual({ openings: opening.callCount, authorized: auth.authenticated }, {
			openings: 1, authorized: false,
		});
	});

	test('disposal clears advertised keys, scrubs owned private bytes, and fences in-flight HPKE opening', async () => {
		const privateKey = randomBytes(32);
		const sealing = store.add(new MissionControlSealing([{
			use: 'auth-token', algorithm: 'hpke-x25519-hkdf-sha256-aes256gcm', privateKey,
		}]));
		const key = sealing.advertisedKeys[0];
		const token = await sealMissionControlCredential({ resource, token: 'owner-token', key: { ...key, use: 'auth-token' } });
		const pending = sealing.open(token, 'auth-token', resource);
		const rejected = assert.rejects(pending, /closed/);
		sealing.dispose();
		await rejected;
		await assert.rejects(sealing.open(token, 'auth-token', resource), /closed/);
		assert.deepStrictEqual({ advertised: sealing.advertisedKeys, zeroed: privateKey.every(byte => byte === 0) }, {
			advertised: [], zeroed: true,
		});
	});

	test('binds credentials to the owner and a one-time handshake generation', async () => {
		const sealing = store.add(new MissionControlSealing());
		const identityRequests: { redirect?: RequestRedirect; credential: boolean }[] = [];
		const fetcher: typeof fetch = async (_url, init) => {
			identityRequests.push({ redirect: init?.redirect, credential: new Headers(init?.headers).get('Authorization') === 'Bearer test-owner-token' });
			return Response.json({ id: 123, type: 'User' });
		};
		const auth = new MissionControlAuthentication(sealing, '123', resource, fetcher, true);
		const challenge = (auth.handshakeMeta['copilot.authChallenge'] as { challenge: string }).challenge;
		const binding = { challenge, nonce: randomBytes(16).toString('hex'), issuedAt: Math.floor(Date.now() / 1000) };
		const envelope = seal(sealing, 'test-owner-token', binding);
		const accepted = await auth.authenticate({ resource, token: envelope });
		await assert.rejects(auth.authenticate({ resource, token: envelope }), /replayed/);
		await assert.rejects(auth.authenticate({ resource, token: seal(sealing, 'test-owner-token') }), /connection-bound/);
		auth.beginHandshake();
		await assert.rejects(auth.authenticate({ resource, token: seal(sealing, 'test-owner-token', { ...binding, nonce: randomBytes(16).toString('hex') }) }), /binding/);
		assert.deepStrictEqual({ accepted, identityRequests }, {
			accepted: { resource, token: 'test-owner-token' },
			identityRequests: [{ redirect: 'error', credential: true }],
		});
	});

	test('supports MC pre-sealed tokens in explicit transition mode but refuses another owner', async () => {
		const sealing = store.add(new MissionControlSealing());
		const auth = new MissionControlAuthentication(sealing, '123', resource, async () => Response.json({ id: 123, type: 'User' }), false);
		const accepted = await auth.authenticate({ resource, token: seal(sealing, 'test-owner-token') });
		const foreign = new MissionControlAuthentication(sealing, '123', resource, async () => Response.json({ id: 456, type: 'User' }), false);
		await assert.rejects(foreign.authenticate({ resource, token: seal(sealing, 'other-owner-token') }), /registered owner/);
		await assert.rejects(auth.authenticate({ resource, token: seal(sealing, 'test-owner-token', { challenge: 'wrong' }) }), /binding/);
		assert.deepStrictEqual({ token: accepted.token, required: (auth.handshakeMeta['copilot.authChallenge'] as { required: boolean }).required }, {
			token: 'test-owner-token', required: false,
		});
	});

	test('refuses failed identity validation and non-user principals', async () => {
		await assert.rejects(resolveMissionControlOwner(async () => new Response('', { status: 401 }), resource, 'test'), /401/);
		await assert.rejects(resolveMissionControlOwner(async () => Response.json({ id: 123, type: 'Bot' }), resource, 'test'), /user identity/);
	});

	for (const { status, headers, code } of [
		{ status: 401, headers: new Headers(), code: JsonRpcErrorCodes.InvalidParams },
		{ status: 403, headers: new Headers(), code: JsonRpcErrorCodes.InvalidParams },
		{ status: 403, headers: new Headers({ 'Retry-After': '10' }), code: JsonRpcErrorCodes.InternalError },
		{ status: 403, headers: new Headers({ 'X-RateLimit-Remaining': '0' }), code: JsonRpcErrorCodes.InternalError },
		{ status: 429, headers: new Headers(), code: JsonRpcErrorCodes.InternalError },
		{ status: 503, headers: new Headers(), code: JsonRpcErrorCodes.InternalError },
	]) {
		test(`identity HTTP ${status} with ${JSON.stringify([...headers])} distinguishes rejection from a host fault`, async () => {
			const sealing = store.add(new MissionControlSealing());
			const auth = new MissionControlAuthentication(sealing, '123', resource,
				async () => new Response('', { status, headers }), false);
			await assert.rejects(auth.authenticate({ resource, token: seal(sealing, 'owner-token') }), { code });
			assert.strictEqual(auth.authenticated, false);
		});
	}

	for (const transition of ['handshake', 'close'] as const) {
		test(`does not authorize a stale credential after ${transition}`, async () => {
			const sealing = store.add(new MissionControlSealing());
			const identity = new DeferredPromise<Response>();
			const identityStarted = new DeferredPromise<void>();
			const auth = new MissionControlAuthentication(sealing, '123', resource, () => {
				void identityStarted.complete();
				return identity.p;
			}, false);
			const request = auth.authenticate({ resource, token: seal(sealing, 'test-owner-token') });
			const rejected = assert.rejects(request, /expired handshake/);
			await identityStarted.p;
			if (transition === 'handshake') {
				auth.beginHandshake();
			} else {
				auth.dispose();
			}
			await identity.complete(Response.json({ id: 123, type: 'User' }));
			await rejected;
			assert.strictEqual(auth.authenticated, false);
		});
	}

	test('MCP authentication cannot establish the owner identity or retarget a credential', async () => {
		const sealing = store.add(new MissionControlSealing());
		const mcpResource = 'https://mcp.example.test';
		const auth = new MissionControlAuthentication(sealing, '123', resource, async () => Response.json({ id: 123, type: 'User' }), false);
		await assert.rejects(auth.authenticate({ resource: mcpResource, token: seal(sealing, 'mcp-token', undefined, 'mcp-auth-token', mcpResource) }), /relay identity/);
		await auth.authenticate({ resource, token: seal(sealing, 'owner-token') });
		const accepted = await auth.authenticate({ resource: mcpResource, token: seal(sealing, 'mcp-token', undefined, 'mcp-auth-token', mcpResource) });
		await assert.rejects(auth.authenticate({ resource: 'https://attacker.test', token: seal(sealing, 'mcp-token', undefined, 'mcp-auth-token', mcpResource) }), /context/);
		assert.deepStrictEqual({ authorized: auth.authenticated, token: accepted.token }, { authorized: true, token: 'mcp-token' });
		auth.beginHandshake();
		assert.strictEqual(auth.authenticated, false);
	});

	test('validates Enterprise identity at the trusted API base rather than the MC origin', async () => {
		const sealing = store.add(new MissionControlSealing());
		const api = 'https://github.enterprise.test/api/v3';
		const requests: string[] = [];
		const auth = new MissionControlAuthentication(sealing, '123', api, async input => {
			requests.push(input.toString());
			return Response.json({ id: 123, type: 'User' });
		}, false);
		await auth.authenticate({ resource: api, token: seal(sealing, 'enterprise-token', undefined, 'auth-token', api) });
		assert.deepStrictEqual({ authorized: auth.authenticated, requests }, { authorized: true, requests: [`${api}/user`] });
	});

	test('identity-authority changes invalidate an outstanding owner check', async () => {
		const sealing = store.add(new MissionControlSealing());
		const identity = new DeferredPromise<Response>();
		const identityStarted = new DeferredPromise<void>();
		let current = true;
		const auth = new MissionControlAuthentication(sealing, '123', resource, () => {
			void identityStarted.complete();
			return identity.p;
		}, false, () => current);
		const request = auth.authenticate({ resource, token: seal(sealing, 'test-owner-token') });
		const rejected = assert.rejects(request, /expired handshake/);
		await identityStarted.p;
		current = false;
		await identity.complete(Response.json({ id: 123, type: 'User' }));
		await rejected;
		assert.strictEqual(auth.authenticated, false);
	});

	test('concurrently restored MCP credentials wait for the same-handshake identity check', async () => {
		const sealing = store.add(new MissionControlSealing());
		const identity = new DeferredPromise<Response>();
		const auth = new MissionControlAuthentication(sealing, '123', resource, () => identity.p, false);
		const owner = auth.authenticate({ resource, token: seal(sealing, 'owner-token') });
		const mcpResource = 'https://mcp.example.test';
		const mcp = auth.authenticate({ resource: mcpResource, token: seal(sealing, 'mcp-token', undefined, 'mcp-auth-token', mcpResource) });
		let installed = false;
		void mcp.then(() => { installed = true; });
		await Promise.resolve();
		const beforeOwnerCheck = installed;
		await identity.complete(Response.json({ id: 123, type: 'User' }));
		await owner;
		const result = await mcp;
		assert.deepStrictEqual({ beforeOwnerCheck, authorized: auth.authenticated, token: result.token }, {
			beforeOwnerCheck: false, authorized: true, token: 'mcp-token',
		});
	});
});
