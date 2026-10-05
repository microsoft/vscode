/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash, randomBytes } from 'crypto';
import sodium from 'libsodium-wrappers';
import { DeferredPromise } from '../../../../base/common/async.js';
import { JsonRpcErrorCodes } from '../../common/state/protocol/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MissionControlAuthentication, MissionControlSealing, resolveMissionControlOwner, sealMissionControlCredential } from '../../node/missionControl/missionControlAuthentication.js';

suite('Mission Control sealed authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = 'https://api.github.com';
	setup(() => MissionControlSealing.ready());

	function seal(sealing: MissionControlSealing, value: string, connection?: object, use = 'auth-token', target = resource): string {
		const key = sealing.advertisedKeys.find(key => key.use === use)!;
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
		const opened = sealing.open(envelope, 'mcp-auth-token', target);
		assert.strictEqual(opened.token, 'test-mcp-token');
		assert.strictEqual(opened.connection?.challenge, challenge);
		assert.match(String(opened.connection?.nonce), /^[0-9a-f]{32}$/);
		assert.throws(() => sealing.open(envelope, 'auth-token', target), /Unknown sealing key/);
		assert.throws(() => sealing.open(envelope, 'mcp-auth-token', 'https://different.test'), /context/);
		await assert.rejects(sealMissionControlCredential({ token: 'test', resource: target, key: { ...key, key_id: 'mismatched', use: 'mcp-auth-token' } }), /recipient key/);
	});

	test('opens the independently produced portable sealed-box vector', () => {
		const sealing = store.add(new MissionControlSealing([{ use: 'auth-token', privateKey: Buffer.from('aSFRt0ENOIh44Ovgwe34W2STEqRZg1CKS7TJg2yanWs=', 'base64') }]));
		const opened = sealing.open('copilot-sealed.v1.-a-KYd0rURg.AOfR8IBb-j-x6ALl6DBMtN-C-0VelwcnnRwsdDcRqy5_EoYzSifMl63NyZKMBSkIr8-tFa_v6YMXG7coG4ZAwz_Tk8IvlAiIV72hsKvT-QX6K6CflsTCyU-lyq5xIO8o8LoqSzX3EKRO2kL9B3iWAuEypz2p_gXubPV-bqbVAkYO7cMmHhKFLMrjb7aPnNSGit_Wy8nI6kPxYB5bMVDji2jcIFQGf1D_ojeLoesehHto7jT0', 'auth-token', resource);
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

	test('requires sealed values, separates purposes, and checks resources', () => {
		const sealing = store.add(new MissionControlSealing());
		assert.throws(() => sealing.open('plaintext-credential', 'auth-token', resource), /requires a sealed/);
		assert.throws(() => sealing.open(seal(sealing, 'test', undefined, 'mcp-auth-token'), 'auth-token', resource), /Unknown sealing key/);
		assert.throws(() => sealing.open(seal(sealing, 'test', undefined, 'auth-token', 'https://other.test'), 'auth-token', resource), /context/);
		const box = seal(sealing, 'test');
		const parts = box.split('.');
		const corrupted = Buffer.from(parts[3], 'base64url');
		corrupted[corrupted.length - 1] ^= 1;
		assert.throws(() => sealing.open(`${parts.slice(0, 3).join('.')}.${corrupted.toString('base64url')}`, 'auth-token', resource), /open sealed/);
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
			const auth = new MissionControlAuthentication(sealing, '123', resource, () => identity.p, false);
			const request = auth.authenticate({ resource, token: seal(sealing, 'test-owner-token') });
			const rejected = assert.rejects(request, /expired handshake/);
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
		let current = true;
		const auth = new MissionControlAuthentication(sealing, '123', resource, () => identity.p, false, () => current);
		const request = auth.authenticate({ resource, token: seal(sealing, 'test-owner-token') });
		const rejected = assert.rejects(request, /expired handshake/);
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
