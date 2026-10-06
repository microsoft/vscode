/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createPublicKey, generateKeyPairSync, randomUUID, sign, verify, type JsonWebKey } from 'crypto';
import { EventEmitter } from 'events';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises';
import { realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { hasKey } from '../../../../base/common/types.js';
import { Emitter } from '../../../../base/common/event.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MissionControlControlVerifier, type IMissionControlSigningKey } from '../../node/missionControl/missionControlControl.js';
import { MissionControlProtocolServer, type IMissionControlSocket } from '../../node/missionControl/missionControlProtocolServer.js';
import { MissionControlEnvironment } from '../../node/missionControl/missionControlEnvironment.js';
import type { IProtocolTransport } from '../../common/state/sessionTransport.js';
import { MissionControlSessionMirror } from '../../node/missionControl/missionControlSessionMirror.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';

const prefix = 'user.owner.env.environment';
const order = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

class FakeWpsSocket extends EventEmitter implements IMissionControlSocket {
	readonly publishes: { group: string; data: { kind: string; data: object } }[] = [];
	readonly joins: string[] = [];
	readonly acknowledgements: number[] = [];
	readonly publishAckIds: number[] = [];
	readonly userEvents: { readonly event: string; readonly data: object }[] = [];
	closed = false;
	constructor(private readonly _ackSuccess = true, private readonly _manualPublishAcks = false) { super(); }

	send(data: string): void {
		const frame = JSON.parse(data) as { type: string; event?: string; ackId?: number; group?: string; data?: { kind: string; data: object }; sequenceId?: number };
		if (frame.type === 'event' && frame.event && frame.data) {
			this.userEvents.push({ event: frame.event, data: frame.data });
			if (frame.ackId) {
				this.publishAckIds.push(frame.ackId);
			}
		}
		if (frame.type === 'joinGroup' && frame.group) {
			this.joins.push(frame.group);
		}
		if (frame.type === 'sendToGroup' && frame.group && frame.data) {
			this.publishes.push({ group: frame.group, data: frame.data });
			if (frame.ackId) {
				this.publishAckIds.push(frame.ackId);
			}
		}
		if (frame.type === 'sequenceAck' && frame.sequenceId) {
			this.acknowledgements.push(frame.sequenceId);
		}
		if (frame.ackId && !(this._manualPublishAcks && (frame.type === 'sendToGroup' || frame.type === 'event'))) {
			this.emit('message', JSON.stringify({ type: 'ack', ackId: frame.ackId, success: this._ackSuccess }));
		}
	}

	deliver(group: string, data: object, sequenceId: number): void {
		this.emit('message', JSON.stringify({ type: 'message', from: 'group', group, dataType: 'json', data: { kind: 'message', data }, sequenceId }));
	}

	close(): void {
		this.closed = true;
	}
}

suite('Mission Control WPS', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function signingFixture(kid = 'test-key') {
		const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
		const key: IMissionControlSigningKey = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid, kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig' };
		const signedControl = <T extends { kind: string }>(payload: T, nonce: string, environment = 'environment') => {
			const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256', kid: key.kid })).toString('base64url');
			const claims = Buffer.from(JSON.stringify({
				iat: Math.floor(Date.now() / 1000), jti: nonce, user_id: 'owner', environment_id: environment, kind: payload.kind, payload,
			})).toString('base64url');
			const input = `${header}.${claims}`;
			const signature = sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' });
			const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
			if (s > order / 2n) {
				Buffer.from((order - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
			}
			return { ...payload, signature: `${input}.${signature.toString('base64url')}` };
		};
		const signed = (clientId: string, nonce: string, passive = false, environment = 'environment') =>
			signedControl({ kind: 'spawn_request', client_id: clientId, spawn_request_id: `spawn-${nonce}`, passive }, nonce, environment);
		return { key, signed, signedControl };
	}

	test('rejects stale, mismatched, spoofed, and replayed control before opening a lane', () => {
		const { key, signed } = signingFixture();
		const verifier = new MissionControlControlVerifier('environment', 'owner', [key]);
		const valid = signed('client-a', 'nonce-a');
		const stale = new MissionControlControlVerifier('environment', 'owner', [key], () => Date.now() + 600_000);
		const rejection = (action: () => void) => {
			try {
				action();
				return 'accepted';
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		};
		assert.deepStrictEqual({
			first: verifier.verify(valid).client_id,
			replay: rejection(() => verifier.verify(valid)),
			environment: rejection(() => verifier.verify(signed('client-b', 'nonce-b', false, 'other'))),
			spoof: rejection(() => verifier.verify({ ...signed('client-c', 'nonce-c'), passive: true })),
			stale: rejection(() => stale.verify(signed('client-d', 'nonce-d'))),
			owner: rejection(() => new MissionControlControlVerifier('environment', 'other', [key]).verify(signed('client-e', 'nonce-e'))),
		}, {
			first: 'client-a',
			replay: 'Replay or exhausted control replay window',
			environment: 'Control request does not match this environment',
			spoof: 'Control request does not match this environment',
			stale: 'Control request does not match this environment',
			owner: 'Control request does not match this environment',
		});
	});

	for (const kind of ['spawn_request', 'backfill_request'] as const) {
		test(`rejects a cryptographically valid high-S ${kind} without consuming the nonce`, () => {
			const { key, signedControl } = signingFixture();
			const payload = kind === 'spawn_request'
				? { kind, client_id: 'client-a', spawn_request_id: 'spawn-a', passive: false }
				: { kind, environment_id: 'environment', session_id: 'ahp-session:/session', ns: 'ahp', from_seq: 0, to_seq: 0, request_id: 'request-a' };
			const low = signedControl(payload, `nonce-${kind}`);
			const [header, claims, encodedSignature] = low.signature.split('.');
			const signature = Buffer.from(encodedSignature, 'base64url');
			const lowS = BigInt(`0x${signature.subarray(32).toString('hex')}`);
			Buffer.from((order - lowS).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
			const high = { ...low, signature: `${header}.${claims}.${signature.toString('base64url')}` };
			assert.deepStrictEqual({
				lowS: lowS <= order / 2n,
				highS: order - lowS > order / 2n,
				validSignature: verify('sha256', Buffer.from(`${header}.${claims}`), {
					key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363',
				}, signature),
			}, { lowS: true, highS: true, validSignature: true });
			const verifier = new MissionControlControlVerifier('environment', 'owner', [key]);
			const verifyRequest = kind === 'spawn_request' ? (value: typeof low) => verifier.verify(value) : (value: typeof low) => verifier.verifyBackfill(value);
			assert.throws(() => verifyRequest(high), /Invalid Mission Control signature/);
			assert.doesNotThrow(() => verifyRequest(low));
		});
	}

	test('failed WPS join rejects the handshake and closes the socket', async () => {
		const { key } = signingFixture();
		const socket = new FakeWpsSocket(false);
		const errors: Error[] = [];
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]),
			() => socket, error => errors.push(error),
		));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await assert.rejects(ready, /connection closed before joining/);
		assert.deepStrictEqual({ closed: socket.closed, errors: errors.map(error => error.message) }, {
			closed: true, errors: ['Mission Control WPS operation rejected'],
		});
	});

	test('reports an unexpected socket close without logging its untrusted reason', async () => {
		const { key } = signingFixture();
		const socket = new FakeWpsSocket();
		const errors: Error[] = [];
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]),
			() => socket, error => errors.push(error),
		));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		socket.emit('close', 1008, Buffer.from('untrusted closure text'));
		socket.emit('close', 1008, Buffer.from('duplicate'));
		assert.deepStrictEqual({ closed: socket.closed, errors: errors.map(error => error.message) }, {
			closed: true, errors: ['Mission Control WPS socket closed (code 1008)'],
		});
	});

	test('reports a socket error once', async () => {
		const { key } = signingFixture();
		const socket = new FakeWpsSocket();
		const errors: Error[] = [];
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]),
			() => socket, error => errors.push(error),
		));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		const failure = new Error('Socket connection failed');
		socket.emit('error', failure);
		socket.emit('close', 1006);
		server.dispose();
		assert.deepStrictEqual({ closed: socket.closed, errors }, { closed: true, errors: [failure] });
	});

	test('does not report socket events after intentional disposal', async () => {
		const { key } = signingFixture();
		const socket = new FakeWpsSocket();
		const errors: Error[] = [];
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]),
			() => socket, error => errors.push(error),
		));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		server.dispose();
		socket.emit('close', 1000);
		socket.emit('error', new Error('After disposal'));
		assert.deepStrictEqual({ closed: socket.closed, errors }, { closed: true, errors: [] });
	});

	test('signing-key rotation revokes the removed key without resetting replay protection', () => {
		const original = signingFixture();
		const rotated = signingFixture('rotated-key');
		const verifier = new MissionControlControlVerifier('environment', 'owner', [original.key]);
		const accepted = original.signed('client-a', 'already-seen');
		verifier.verify(accepted);
		verifier.updateKeys([original.key, rotated.key]);
		assert.throws(() => verifier.verify(accepted), /Replay/);
		verifier.verify(rotated.signed('client-b', 'new-key'));
		verifier.updateKeys([rotated.key]);
		assert.throws(() => verifier.verify(original.signed('client-c', 'removed-key')), /Untrusted/);
	});

	test('publishes a closure after teardown and gives a successor a different generation', async () => {
		const { key, signed } = signingFixture();
		const socket = new FakeWpsSocket();
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]), () => socket,
		));
		const lanes: IProtocolTransport[] = [];
		let teardownObserved = false;
		store.add(server.onConnection(lane => {
			lanes.push(lane);
			store.add(lane.onClose(() => { teardownObserved = true; }));
			store.add(lane.onMessage(message => lane.send({ jsonrpc: '2.0', id: hasKey(message, { id: true }) ? message.id : 0, result: null })));
		}));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		socket.deliver(`${prefix}.control`, signed('client-a', 'generation'), 1);
		socket.deliver(`${prefix}.client.client-a.to-host`, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: 'client-a' } }, 2);
		lanes[0].dispose();
		assert.strictEqual(teardownObserved, true);
		socket.deliver(`${prefix}.client.client-a.to-host`, { jsonrpc: '2.0', id: 2, method: 'reconnect', params: { clientId: 'client-a' } }, 3);
		const frames = socket.publishes.map(frame => frame.data as { kind: string; generation?: number });
		assert.deepStrictEqual(frames.map(frame => frame.kind), ['message', 'closed', 'message']);
		assert.strictEqual(frames[0].generation, frames[1].generation);
		assert.ok(Number.isSafeInteger(frames[0].generation));
		assert.notStrictEqual(frames[0].generation, frames[2].generation);
		assert.strictEqual(lanes.length, 2);
	});

	test('reclaims a silent lane after the advertised window without a closure notice', async () => {
		const clock = sinon.useFakeTimers();
		const { key, signed } = signingFixture();
		const socket = new FakeWpsSocket();
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]), () => socket,
		));
		try {
			let lane: IProtocolTransport | undefined;
			let closed = false;
			store.add(server.onConnection(value => { lane = value; store.add(value.onClose(() => { closed = true; })); }));
			const ready = server.connect();
			socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
			await ready;
			socket.deliver(`${prefix}.control`, signed('client-a', 'idle'), 1);
			const timeout = lane?.relayHandshakeMeta?.['copilot.keepAliveTimeoutMs'];
			assert.strictEqual(timeout, 900_000);
			await clock.tickAsync(899_999);
			assert.strictEqual(closed, false);
			await clock.tickAsync(1);
			assert.strictEqual(closed, true);
			assert.strictEqual(socket.publishes.length, 0);
		} finally {
			server.dispose();
			clock.restore();
		}
	});

	test('serializes AHP publishes behind acknowledgements without reordering', async () => {
		const { key, signed } = signingFixture();
		const socket = new FakeWpsSocket(true, true);
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]), () => socket,
		));
		store.add(server.onConnection(lane => {
			lane.send({ jsonrpc: '2.0', id: 1, result: null });
			lane.send({ jsonrpc: '2.0', id: 2, result: null });
		}));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		socket.deliver(`${prefix}.control`, signed('client-a', 'serial'), 1);
		const beforeAck = socket.publishes.length;
		socket.emit('message', JSON.stringify({ type: 'ack', ackId: socket.publishAckIds[0], success: true }));
		assert.deepStrictEqual({ beforeAck, ids: socket.publishes.map(frame => (frame.data.data as { id: number }).id) }, {
			beforeAck: 1, ids: [1, 2],
		});
	});

	test('overlapping handshakes replace the pending connection instead of leaving a stuck lane', async () => {
		const { key, signed } = signingFixture();
		const socket = new FakeWpsSocket();
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]), () => socket,
		));
		const lanes: IProtocolTransport[] = [];
		store.add(server.onConnection(lane => {
			lanes.push(lane);
			store.add(lane.onMessage(message => {
				if (hasKey(message, { id: true }) && message.id === 2) {
					lane.send({ jsonrpc: '2.0', id: 2, result: {} });
				}
			}));
		}));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		socket.deliver(`${prefix}.control`, signed('client-a', 'overlap'), 1);
		socket.deliver(`${prefix}.client.client-a.to-host`, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: 'client-a' } }, 2);
		socket.deliver(`${prefix}.client.client-a.to-host`, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { clientId: 'client-a' } }, 3);
		assert.strictEqual(lanes.length, 2);
		assert.deepStrictEqual(socket.publishes.map(frame => frame.data.kind), ['closed', 'message']);
	});

	test('mirrors authoritative actions as user events and accepts only signed retained backfill', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const { key, signedControl } = signingFixture();
			const socket = new FakeWpsSocket();
			const mirror = store.add(new MissionControlSessionMirror('environment', {}, new NullLogService()));
			const session = 'ahp-session:/mirror-test';
			mirror.registerSession(session);
			const server = store.add(new MissionControlProtocolServer(
				{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control`, ingest_ack: `${prefix}.ingest-ack` } },
				'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]), () => socket, undefined, undefined, undefined, mirror,
			));
			const ready = server.connect();
			socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
			await ready;
			store.add(mirror.attach(event => server.publishMirrorEvent(event)));
			mirror.enqueue({ channel: session, serverSeq: 7, origin: undefined, action: { type: ActionType.SessionTitleChanged, title: 'Mirrored title' } }, session);
			await clock.tickAsync(2);
			const original = socket.userEvents[0];
			assert.strictEqual(original.event, 'sessionEvents');
			assert.strictEqual(mirror.getSessionStatus(session).retainedFrames, 1);
			const request = signedControl({ kind: 'backfill_request', environment_id: 'environment', session_id: session, ns: 'ahp', from_seq: 0, to_seq: 0, request_id: 'backfill-test' }, 'backfill-nonce');
			socket.deliver(`${prefix}.control`, request, 1);
			await clock.tickAsync(2);
			assert.deepStrictEqual(socket.userEvents[1], original);
			socket.deliver(`${prefix}.ingest-ack`, { watermarks: { [session]: { ahp: 0 } } }, 2);
			assert.strictEqual(mirror.getSessionStatus(session).retainedFrames, 0);
			assert.deepStrictEqual(socket.joins, [`${prefix}.control`, `${prefix}.ingest-ack`]);
			server.dispose();
			mirror.dispose();
		} finally {
			clock.restore();
		}
	});

	for (const { name, count, title } of [
		{ name: 'frame count', count: 600, title: 'Title' },
		{ name: 'byte budget', count: 48, title: 'x'.repeat(512 * 1024) },
	]) {
		test(`backpressures historical mirror ${name} without disconnecting interactive lanes`, async () => {
			const clock = sinon.useFakeTimers();
			const { key, signed } = signingFixture();
			const socket = new FakeWpsSocket(true, true);
			const mirror = store.add(new MissionControlSessionMirror('environment', {}, new NullLogService()));
			const session = 'ahp-session:/large-mirror';
			mirror.registerSession(session);
			for (let index = 0; index < count; index++) {
				assert.strictEqual(mirror.enqueue({ channel: session, serverSeq: index, origin: undefined, action: { type: ActionType.SessionTitleChanged, title: `${title} ${index}` } }, session), true);
			}
			const server = store.add(new MissionControlProtocolServer(
				{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control`, ingest_ack: `${prefix}.ingest-ack` } },
				'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]),
				() => socket, undefined, undefined, undefined, mirror,
			));
			store.add(server.onConnection(lane => {
				store.add(lane.onMessage(() => lane.send({ jsonrpc: '2.0', id: 1, result: null })));
			}));
			try {
				const ready = server.connect();
				socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
				await ready;
				store.add(mirror.attach(event => server.publishMirrorEvent(event)));
				await clock.tickAsync(5);
				const beforeDrain = { sent: socket.userEvents.length, retained: mirror.getSessionStatus(session).retainedFrames, closed: server.isClosed };
				socket.deliver(`${prefix}.control`, signed('client-a', 'mirror-pressure'), 1);
				socket.deliver(`${prefix}.client.client-a.to-host`, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: 'client-a' } }, 2);
				for (let index = 0; index < count + 2 && socket.userEvents.length < count; index++) {
					const ackId = socket.publishAckIds[index];
					assert.ok(ackId !== undefined, 'Mirror must resume when transport capacity becomes available');
					socket.emit('message', JSON.stringify({ type: 'ack', ackId, success: true }));
					await clock.tickAsync(1);
				}
				assert.deepStrictEqual({
					beforeDrain, mirrored: socket.userEvents.length, replies: socket.publishes.length,
					retained: mirror.getSessionStatus(session).retainedFrames, failure: mirror.getSessionStatus(session).failure, closed: server.isClosed,
				}, {
					beforeDrain: { sent: 1, retained: count, closed: false }, mirrored: count, replies: 1,
					retained: count, failure: undefined, closed: false,
				});
			} finally {
				server.dispose();
				mirror.dispose();
				clock.restore();
			}
		});
	}

	test('failed relay startup marks the registered environment offline', async () => {
		const path = await mkdtemp(join(tmpdir(), 'mission-control-failed-start-'));
		try {
			const { key } = signingFixture();
			const socket = new FakeWpsSocket(false);
			const requests: { path: string; status?: unknown; name?: string }[] = [];
			const fakeFetch: typeof fetch = async (input, init) => {
				const url = new URL(input.toString());
				const body = init?.body ? JSON.parse(init.body.toString()) as { status?: string; name?: string } : undefined;
				requests.push({ path: url.pathname, status: body?.status, name: body?.name });
				return Response.json(url.pathname.endsWith('jwks.json') ? { keys: [key] } : {
					id: 'environment', kind: 'user-local', user_id: 'owner', owner_id: 'owner', owner_type: 'user',
					webpubsub: { url: 'ws://127.0.0.1/fake', access_token: 'fake-wps-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: `${prefix}.control` } },
				});
			};
			const service = store.add(new MissionControlEnvironment({
				userDataPath: path,
				name: 'VS Code OSS',
				fetch: fakeFetch,
				attach: () => ({ dispose() { } }),
				onError: () => { },
				socketFactory: () => {
					queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
					return socket;
				}
			}
			));
			await assert.rejects(service.configure({ baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-local-token', roots: [path] }), /connection closed before joining/);
			assert.deepStrictEqual({ requests, closed: socket.closed }, {
				requests: [
					{ path: '/cmc_internal/api/agents/environments/register', status: undefined, name: 'VS Code OSS' },
					{ path: '/cmc_internal/api/agents/environments/.well-known/jwks.json', status: undefined, name: undefined },
					{ path: '/cmc_internal/api/agents/environments/environment/heartbeat', status: 'offline', name: 'VS Code OSS' },
				],
				closed: true,
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('joins verified client lanes, binds initialize, and publishes responses on to-client', async () => {
		const { key, signed } = signingFixture();
		const socket = new FakeWpsSocket();
		const errors: Error[] = [];
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]),
			() => socket, error => errors.push(error),
		));
		const lanes: IProtocolTransport[] = [];
		store.add(server.onConnection(lane => {
			lanes.push(lane);
			store.add(lane.onMessage(message => lane.send({ jsonrpc: '2.0', id: hasKey(message, { id: true }) ? message.id : 0, result: null })));
		}));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		socket.deliver(`${prefix}.control`, signed('client-a', 'nonce-a'), 1);
		const toHost = `${prefix}.client.client-a.to-host`;
		socket.deliver(toHost, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: 'wrong' } }, 2);
		socket.deliver(`${prefix}.control`, signed('client-b', 'nonce-b', true), 3);
		socket.deliver(`${prefix}.client.client-b.to-host`, { jsonrpc: '2.0', id: 2, method: 'ping', params: {} }, 4);
		socket.deliver(`${prefix}.client.client-b.to-host`, { jsonrpc: '2.0', id: 2, method: 'ping', params: {} }, 4);
		let credentialLaneClosed = false;
		store.add(lanes[1].onClose(() => { credentialLaneClosed = true; }));
		socket.deliver(`${prefix}.client.client-b.to-host`, { jsonrpc: '2.0', id: 3, method: 'authenticate', params: { token: 'fake-sensitive-token' } }, 5);
		assert.deepStrictEqual({
			joins: socket.joins,
			firstClosed: socket.closed,
			secondPassive: lanes[1].relayPassive,
			publishes: socket.publishes.map(frame => frame.group),
			acks: socket.acknowledgements,
			errors: errors.map(error => error.message),
			credentialLaneClosed,
			credentialPublished: socket.publishes.some(frame => JSON.stringify(frame).includes('fake-sensitive-token')),
		}, {
			joins: [`${prefix}.control`, toHost, `${prefix}.client.client-b.to-host`],
			firstClosed: false,
			secondPassive: true,
			publishes: [`${prefix}.client.client-a.to-client`, `${prefix}.client.client-b.to-client`, `${prefix}.client.client-b.to-client`],
			acks: [1, 2, 3, 4, 4, 5],
			errors: [],
			credentialLaneClosed: true,
			credentialPublished: false,
		});
	});

	test('fresh signed spawn retries reuse the lane without changing its role', async () => {
		const { key, signed } = signingFixture();
		const socket = new FakeWpsSocket();
		const errors: string[] = [];
		const server = store.add(new MissionControlProtocolServer(
			{ url: 'ws://127.0.0.1/fake', access_token: 'fake-token', groups: { control: `${prefix}.control` } },
			'owner', 'environment', new MissionControlControlVerifier('environment', 'owner', [key]),
			() => socket, error => errors.push(error.message),
		));
		const lanes: IProtocolTransport[] = [];
		store.add(server.onConnection(lane => lanes.push(lane)));
		const ready = server.connect();
		socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' }));
		await ready;
		socket.deliver(`${prefix}.control`, signed('client-a', 'first'), 1);
		socket.deliver(`${prefix}.control`, signed('client-a', 'retry'), 2);
		socket.deliver(`${prefix}.control`, signed('client-a', 'changed-role', true), 3);
		assert.deepStrictEqual({ laneCount: lanes.length, joins: socket.joins, passive: lanes[0].relayPassive, errors }, {
			laneCount: 1,
			joins: [`${prefix}.control`, `${prefix}.client.client-a.to-host`],
			passive: false,
			errors: ['Mission Control cannot change the role of an existing client lane'],
		});
	});

	test('registers the process identity, heartbeats, and refuses account rebinding', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-test-'));
		const clock = sinon.useFakeTimers();
		try {
			const { key } = signingFixture();
			const sockets: FakeWpsSocket[] = [];
			const errors: string[] = [];
			const requests: { path: string; bearer: boolean; body: Record<string, unknown> | undefined }[] = [];
			const environment = {
				id: 'environment', kind: 'user-local', user_id: 'owner', owner_id: 'owner', owner_type: 'user',
				webpubsub: { url: 'ws://127.0.0.1/fake', access_token: 'fake-wps-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: `${prefix}.control` } },
			};
			const fakeFetch: typeof fetch = async (input, init) => {
				const url = new URL(input.toString());
				requests.push({
					path: url.pathname,
					bearer: init?.headers !== undefined && Object.hasOwn(init.headers, 'Authorization'),
					body: init?.body ? JSON.parse(init.body.toString()) as Record<string, unknown> : undefined,
				});
				return Response.json(url.pathname.endsWith('jwks.json') ? { keys: [key] }
					: url.pathname.endsWith('/token') ? { ...environment.webpubsub, wps_endpoint: environment.webpubsub.url, expires_at: new Date(clock.now + 120_000).toISOString() } : environment);
			};
			const service = store.add(new MissionControlEnvironment({
				userDataPath: path,
				name: 'VS Code OSS',
				fetch: fakeFetch,
				attach: () => ({ dispose() { } }),
				onError: error => errors.push(error instanceof Error ? error.message : String(error)),
				socketFactory: () => {
					const socket = new FakeWpsSocket();
					sockets.push(socket);
					queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
					return socket;
				}
			}
			));
			const options = { baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-local-token', roots: [path] };
			await service.configure(options);
			await clock.tickAsync(60_000);
			sockets[0].emit('close', 1006);
			await clock.tickAsync(60_000);
			const persisted = (JSON.parse(await readFile(join(path, 'agent-host-mission-control-id'), 'utf8')) as { id: string }).id;
			const rebind = await service.configure({ ...options, accountId: 'other' }).then(() => 'accepted', () => 'rejected');
			await service.configure(undefined);
			assert.deepStrictEqual({
				requests: requests.map(request => [request.path, request.bearer, request.body?.kind, request.body?.compute_id]),
				persisted: /^[0-9a-f-]{36}$/.test(persisted),
				rebind,
				controlJoined: sockets.flatMap(socket => socket.joins),
				offline: requests.at(-1)?.body?.status,
				closed: sockets.every(socket => socket.closed),
				errors,
			}, {
				requests: [
					['/cmc_internal/api/agents/environments/register', true, 'user-local', persisted],
					['/cmc_internal/api/agents/environments/.well-known/jwks.json', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/environment/heartbeat', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/environment/token', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/environment/heartbeat', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/environment/heartbeat', true, undefined, undefined],
				],
				persisted: true,
				rebind: 'rejected',
				controlJoined: [`${prefix}.control`, `${prefix}.control`],
				offline: 'offline',
				closed: true,
				errors: ['Mission Control WPS socket closed (code 1006)'],
			});
			service.dispose();
		} finally {
			clock.restore();
			await rm(path, { recursive: true });
		}
	});

	suite('heartbeat Retry-After', () => {
		async function withEnvironment(
			replies: readonly { retryAfter?: string; status?: number; body?: string }[],
			run: (fixture: {
				service: MissionControlEnvironment;
				clock: sinon.SinonFakeTimers;
				heartbeats: { time: number; status: string }[];
				errors: string[];
				sockets: FakeWpsSocket[];
				options: { baseUrl: string; live: boolean; accountId: string; credential: string; roots: string[] };
				changeIdentityAuthority: (base: string) => void;
				tokens: number[];
				directory: string;
				attachments: { initialRoots: readonly string[]; getRoots: () => readonly string[] }[];
				requests: { path: string; credential: string | null; body?: Record<string, unknown> }[];
				delayHeartbeat: () => { started: Promise<void>; complete: (response?: Response) => Promise<void> };
				delayIdentity: () => { started: Promise<void>; complete: (response: Response) => Promise<void> };
				changePolicy: (policy: Record<string, unknown> | undefined) => Promise<void>;
			}) => Promise<void>,
			bootstrapLifetime?: number,
			openWorkspace = false,
		): Promise<void> {
			const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-retry-after-'));
			const clock = sinon.useFakeTimers({ now: Date.UTC(2026, 9, 2), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
			let service: MissionControlEnvironment | undefined;
			try {
				const { key } = signingFixture();
				const heartbeats: { time: number; status: string }[] = [];
				const errors: string[] = [];
				const sockets: FakeWpsSocket[] = [];
				const tokens: number[] = [];
				const requests: { path: string; credential: string | null; body?: Record<string, unknown> }[] = [];
				const attachments: { initialRoots: readonly string[]; getRoots: () => readonly string[] }[] = [];
				let delayedHeartbeat: { started: DeferredPromise<void>; response: DeferredPromise<Response> } | undefined;
				let delayedIdentity: { started: DeferredPromise<void>; response: DeferredPromise<Response> } | undefined;
				let policy: Record<string, unknown> | undefined;
				let policyReported: DeferredPromise<void> | undefined;
				const policyChanged = store.add(new Emitter<void>());
				let identityApiBase = 'https://api.github.com';
				const identityAuthorityChanged = store.add(new Emitter<void>());
				const environment = {
					id: 'environment', kind: 'user-local', user_id: '123', owner_id: '123', owner_type: 'user',
					webpubsub: { url: 'wss://wps.test/client/hubs/test', access_token: 'fake-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: 'user.123.env.environment.control' }, ...(bootstrapLifetime === undefined ? {} : { expires_at: new Date(clock.now + bootstrapLifetime).toISOString() }) },
				};
				service = store.add(new MissionControlEnvironment({
					userDataPath: path,
					name: 'Test Machine (VS Code OSS)',
					fetch: async (input, init) => {
						const url = new URL(input.toString());
						requests.push({ path: url.pathname, credential: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined });
						if (url.pathname.endsWith('/register')) {
							await policyReported?.complete();
							policyReported = undefined;
						}
						if (url.pathname === '/user' && delayedIdentity) {
							const delayed = delayedIdentity;
							delayedIdentity = undefined;
							await delayed.started.complete();
							return delayed.response.p;
						}
						if (url.pathname.endsWith('/token')) {
							tokens.push(clock.now - Date.UTC(2026, 9, 2));
							return Response.json({ ...environment.webpubsub, wps_endpoint: environment.webpubsub.url, expires_at: new Date(clock.now + 120_000).toISOString() });
						}
						if (url.pathname.endsWith('/heartbeat')) {
							const reply = replies[heartbeats.length];
							heartbeats.push({ time: clock.now - Date.UTC(2026, 9, 2), status: (JSON.parse(String(init?.body)) as { status: string }).status });
							if (delayedHeartbeat) {
								const delayed = delayedHeartbeat;
								delayedHeartbeat = undefined;
								await delayed.started.complete();
								return delayed.response.p;
							}
							const responseOptions: ResponseInit = { status: reply?.status ?? 200, headers: reply?.retryAfter === undefined ? {} : { 'rEtRy-AfTeR': reply.retryAfter } };
							return reply?.body === undefined ? Response.json(environment, responseOptions) : new Response(reply.body, responseOptions);
						}
						return Response.json(url.pathname === '/user' ? { id: 123, type: 'User' } : url.pathname.endsWith('/jwks.json') ? { keys: [key] } : environment);
					},
					attach: (_server, initialRoots, getRoots) => {
						attachments.push({ initialRoots, getRoots });
						return { dispose() { } };
					},
					onError: error => errors.push(error instanceof Error ? error.message : String(error)),
					socketFactory: () => {
						const socket = new FakeWpsSocket();
						sockets.push(socket);
						queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
						return socket;
					},
					getRemoteControlPolicy: async () => policy,
					getIdentityApiBase: () => identityApiBase,
					onDidChangeIdentityAuthority: identityAuthorityChanged.event,
					onDidChangeRemoteControlPolicy: policyChanged.event
				}
				));
				const options = { baseUrl: 'https://api.github.com', live: true, accountId: '123', credential: 'fake-token', roots: openWorkspace ? [path] : [] };
				await service.configure(options);
				await run({
					service, clock, heartbeats, errors, sockets, options, tokens, directory: path, attachments, requests,
					delayHeartbeat: () => {
						const started = new DeferredPromise<void>();
						const response = new DeferredPromise<Response>();
						delayedHeartbeat = { started, response };
						return { started: started.p, complete: value => response.complete(value ?? Response.json(environment)) };
					},
					delayIdentity: () => {
						const started = new DeferredPromise<void>();
						const response = new DeferredPromise<Response>();
						delayedIdentity = { started, response };
						return { started: started.p, complete: value => response.complete(value) };
					},
					changePolicy: value => {
						policy = value;
						const reported = new DeferredPromise<void>();
						policyReported = reported;
						policyChanged.fire();
						return reported.p;
					},
					changeIdentityAuthority: base => {
						identityApiBase = base;
						identityAuthorityChanged.fire();
					},
				});
			} finally {
				service?.dispose();
				clock.restore();
				await rm(path, { recursive: true });
			}
		}

		test('rotates expiring access tokens during load shedding without reconnecting a healthy socket', async () => {
			await withEnvironment([{ retryAfter: '300' }], async ({ clock, heartbeats, errors, sockets, tokens }) => {
				await clock.tickAsync(89_999);
				assert.deepStrictEqual(tokens, []);
				await clock.tickAsync(1);
				assert.deepStrictEqual({ tokens, heartbeats, sockets: sockets.length, errors }, {
					tokens: [90_000], heartbeats: [{ time: 0, status: 'online' }], sockets: 1, errors: [],
				});
			}, 120_000);
		});

		test('refreshes the host-owned name on startup, periodic, recovery, and withdrawal heartbeats', async () => {
			await withEnvironment([], async ({ service, clock, requests, sockets, options }) => {
				const hostName = 'Test Machine (VS Code OSS)';
				const snapshot = () => {
					let storedName: string | undefined;
					let registrations = 0;
					for (const request of requests) {
						if (request.path.endsWith('/register')) {
							storedName = `${hostName}-assigned-${++registrations}`;
						} else if (request.path.endsWith('/heartbeat') && typeof request.body?.name === 'string') {
							storedName = request.body.name;
						}
					}
					return storedName;
				};
				const startup = snapshot();
				await clock.tickAsync(60_000);
				const periodic = snapshot();
				sockets[0].emit('close', 1006);
				await clock.tickAsync(1000);
				const recovery = snapshot();
				await service.configure(undefined);
				const withdrawal = snapshot();
				await service.configure(options);
				assert.deepStrictEqual({
					startup, periodic, recovery, withdrawal, reregistration: snapshot(),
					registrations: requests.filter(request => request.path.endsWith('/register')).map(request => request.body?.name),
					heartbeatNames: [...new Set(requests.filter(request => request.path.endsWith('/heartbeat')).map(request => request.body?.name))],
				}, {
					startup: hostName, periodic: hostName, recovery: hostName, withdrawal: hostName, reregistration: hostName,
					registrations: [hostName, hostName], heartbeatNames: [hostName],
				});
			});
		});

		for (const scenario of [
			{ name: 'delta-seconds on the initial online heartbeat', value: '120', delay: 120_000 },
			{ name: 'HTTP-date', value: new Date(Date.UTC(2026, 9, 2) + 120_000).toUTCString(), delay: 120_000 },
			{ name: 'long waits without timer overflow', value: '2147484', delay: 2_147_484_000 },
			{ name: 'the default interval when absent', value: undefined, delay: 60_000 },
			{ name: 'the default minimum for short delays', value: '10', delay: 60_000 },
			{ name: 'zero', value: '0', delay: 60_000 },
			{ name: 'a past HTTP-date', value: new Date(Date.UTC(2026, 9, 1)).toUTCString(), delay: 60_000 },
			{ name: 'negative values', value: '-1', delay: 60_000, invalid: true },
			{ name: 'fractional seconds', value: '1.5', delay: 60_000, invalid: true },
			{ name: 'malformed values', value: 'not-a-delay', delay: 60_000, invalid: true },
		]) {
			test(`honors ${scenario.name} and resumes the default cadence`, async () => {
				await withEnvironment([{ retryAfter: scenario.value }], async ({ clock, heartbeats, errors }) => {
					await clock.tickAsync(scenario.delay - 1);
					const beforeDeadline = heartbeats.length;
					await clock.tickAsync(1);
					await clock.tickAsync(59_999);
					const beforeDefaultInterval = heartbeats.length;
					await clock.tickAsync(1);
					assert.deepStrictEqual({ beforeDeadline, beforeDefaultInterval, heartbeats, errors }, {
						beforeDeadline: 1,
						beforeDefaultInterval: 2,
						heartbeats: [{ time: 0, status: 'online' }, { time: scenario.delay, status: 'online' }, { time: scenario.delay + 60_000, status: 'online' }],
						errors: scenario.invalid ? ['Mission Control heartbeat returned an invalid Retry-After header'] : [],
					});
				});
			});
		}

		for (const response of [
			{ name: '429', status: 429, error: 'Mission Control request failed (429)' },
			{ name: '503', status: 503, error: 'Mission Control request failed (503)' },
			{ name: 'invalid JSON on a successful response', status: 200, error: 'Mission Control returned invalid JSON' },
		]) {
			test(`honors the header before handling ${response.name}`, async () => {
				await withEnvironment([{}, { status: response.status, retryAfter: '240', body: 'not-json' }], async ({ clock, heartbeats, errors }) => {
					await clock.tickAsync(60_000);
					await clock.tickAsync(239_999);
					const beforeDeadline = heartbeats.length;
					await clock.tickAsync(1);
					assert.deepStrictEqual({ beforeDeadline, heartbeats, errors }, {
						beforeDeadline: 2,
						heartbeats: [{ time: 0, status: 'online' }, { time: 60_000, status: 'online' }, { time: 300_000, status: 'online' }],
						errors: [response.error],
					});
				});
			});
		}

		test('relay recovery does not bypass the heartbeat delay for its online update', async () => {
			await withEnvironment([{ retryAfter: '240' }], async ({ clock, heartbeats, errors, sockets }) => {
				sockets[0].emit('close', 1006);
				await clock.tickAsync(500);
				const socketsAfterRecovery = sockets.length;
				await clock.tickAsync(239_499);
				const beforeDeadline = heartbeats.length;
				await clock.tickAsync(1);
				assert.deepStrictEqual({ socketsAfterRecovery, beforeDeadline, heartbeats, errors }, {
					socketsAfterRecovery: 2,
					beforeDeadline: 1,
					heartbeats: [{ time: 0, status: 'online' }, { time: 240_000, status: 'online' }],
					errors: ['Mission Control WPS socket closed (code 1006)'],
				});
			});
		});

		test('disable and re-enable preserve the delay, including the offline heartbeat', async () => {
			await withEnvironment([{ retryAfter: '300' }], async ({ service, clock, heartbeats, errors, options }) => {
				await clock.tickAsync(60_000);
				await service.configure(undefined);
				await clock.tickAsync(60_000);
				const whileDisabled = heartbeats.length;
				await service.configure(options);
				await clock.tickAsync(179_999);
				const beforeDeadline = heartbeats.length;
				await clock.tickAsync(1);
				await service.configure(undefined);
				await clock.tickAsync(300_000);
				assert.deepStrictEqual({ whileDisabled, beforeDeadline, heartbeats, errors }, {
					whileDisabled: 1,
					beforeDeadline: 1,
					heartbeats: [{ time: 0, status: 'online' }, { time: 300_000, status: 'online' }, { time: 300_000, status: 'offline' }],
					errors: [],
				});
			});
		});

		test('changing the GitHub authority closes the relay immediately and withdraws registration', async () => {
			await withEnvironment([], async ({ service, clock, heartbeats, errors, sockets, changeIdentityAuthority }) => {
				changeIdentityAuthority('https://api.enterprise.test');
				const closedImmediately = sockets.every(socket => socket.closed);
				await service.configure(undefined);
				const afterWithdrawal = heartbeats.length;
				await clock.tickAsync(120_000);
				assert.deepStrictEqual({ closedImmediately, afterWithdrawal, heartbeats, errors }, {
					closedImmediately: true,
					afterWithdrawal: 2,
					heartbeats: [{ time: 0, status: 'online' }, { time: 0, status: 'offline' }],
					errors: [],
				});
			});
		});

		for (const status of [401, 403, 503]) {
			test(`credential refresh fences an old in-flight ${status} without losing Retry-After or suspending the new configuration`, async () => {
				await withEnvironment([], async ({ service, clock, options, errors, sockets, heartbeats, delayHeartbeat, requests }) => {
					const delayed = delayHeartbeat();
					await clock.tickAsync(60_000);
					await delayed.started;
					await service.configure({ ...options, credential: 'refreshed-token' });
					const beforeOldReply = { sockets: sockets.length, closed: sockets.map(socket => socket.closed) };
					await delayed.complete(new Response('{}', { status, headers: { 'Retry-After': '240' } }));
					await clock.tickAsync(239_999);
					const beforeDeadline = heartbeats.length;
					await clock.tickAsync(1);
					assert.deepStrictEqual({
						beforeOldReply, beforeDeadline, heartbeats, errors,
						latestCredential: requests.filter(request => request.path.endsWith('/heartbeat')).at(-1)?.credential,
						active: service.isEnabled && !sockets.at(-1)?.closed,
					}, {
						beforeOldReply: { sockets: 2, closed: [true, false] },
						beforeDeadline: 3,
						heartbeats: [{ time: 0, status: 'online' }, { time: 60_000, status: 'online' }, { time: 60_000, status: 'online' }, { time: 300_000, status: 'online' }],
						errors: [`Mission Control request failed (${status})`],
						latestCredential: 'Bearer refreshed-token',
						active: true,
					});
				});
			});
		}

		test('a successful stale check-in cannot replace or stop the refreshed relay', async () => {
			await withEnvironment([], async ({ service, clock, options, sockets, delayHeartbeat, requests, errors }) => {
				const delayed = delayHeartbeat();
				await clock.tickAsync(60_000);
				await delayed.started;
				await service.configure({ ...options, credential: 'refreshed-token' });
				await delayed.complete();
				await clock.tickAsync(60_000);
				assert.deepStrictEqual({
					sockets: sockets.length, closed: sockets.map(socket => socket.closed), errors,
					latestCredential: requests.filter(request => request.path.endsWith('/heartbeat')).at(-1)?.credential,
				}, {
					sockets: 2, closed: [true, false], errors: [], latestCredential: 'Bearer refreshed-token',
				});
			});
		});

		for (const openWorkspace of [false, true]) {
			test(`adds trusted same-owner roots without rebinding the ${openWorkspace ? 'initial workspace' : 'empty-window'} default`, async () => {
				await withEnvironment([], async ({ service, options, directory, attachments, sockets, requests }) => {
					const additional = await mkdtemp(join(directory, 'additional-'));
					await service.configure({ ...options, roots: [additional] });
					await service.configure({ ...options, roots: [additional] });
					const initial = openWorkspace ? [realpathSync(directory)] : [];
					assert.deepStrictEqual({
						initialRoots: attachments[0].initialRoots,
						currentRoots: attachments[0].getRoots(),
						sockets: sockets.length,
						registrations: requests.filter(request => request.path.endsWith('/register')).length,
					}, {
						initialRoots: initial, currentRoots: [...initial, realpathSync(additional)], sockets: 1, registrations: 1,
					});
				}, undefined, openWorkspace);
			});
		}

		test('withdrawal clears explicit grants and re-enables with a new registration default', async () => {
			await withEnvironment([], async ({ service, options, directory, attachments, sockets }) => {
				const workspaceA = realpathSync(directory);
				const workspaceB = realpathSync(await mkdtemp(join(directory, 'workspace-b-')));
				await service.configure({ ...options, roots: [workspaceB] });
				const whileActive = { initialRoots: attachments[0].initialRoots, roots: attachments[0].getRoots() };
				await service.configure({ ...options, roots: [workspaceB], credential: 'refreshed-token' });
				const afterCredentialRefresh = { initialRoots: attachments[1].initialRoots, roots: attachments[1].getRoots() };
				const disabling = service.configure(undefined, options.accountId);
				const withdrawnRoots = attachments[1].getRoots();
				await disabling;
				await service.configure({ ...options, roots: [workspaceB], credential: 'refreshed-token' });
				assert.deepStrictEqual({
					whileActive, afterCredentialRefresh, withdrawnRoots,
					reenabled: { initialRoots: attachments[2].initialRoots, roots: attachments[2].getRoots() },
					closed: sockets.map(socket => socket.closed),
				}, {
					whileActive: { initialRoots: [workspaceA], roots: [workspaceA, workspaceB] },
					afterCredentialRefresh: { initialRoots: [workspaceA], roots: [workspaceA, workspaceB] },
					withdrawnRoots: [],
					reenabled: { initialRoots: [workspaceB], roots: [workspaceB] },
					closed: [true, true, false],
				});
			}, undefined, true);
		});

		test('withdraws immediately during identity refresh and allows the pinned owner to reconfigure after signout', async () => {
			await withEnvironment([], async ({ service, options, sockets, delayIdentity, requests }) => {
				const delayed = delayIdentity();
				const refreshing = service.configure({ ...options, credential: 'refreshed-token' });
				await delayed.started;
				const disabling = service.configure(undefined);
				const withdrawn = { enabled: service.isEnabled, closed: sockets.every(socket => socket.closed) };
				await delayed.complete(Response.json({ id: 123, type: 'User' }));
				await Promise.all([refreshing, disabling]);
				const attachmentsBeforeReenable = sockets.length;
				await service.configure(options);
				assert.deepStrictEqual({
					withdrawn, attachmentsBeforeReenable, sockets: sockets.length,
					enabled: service.isEnabled,
					registrations: requests.filter(request => request.path.endsWith('/register')).length,
				}, {
					withdrawn: { enabled: false, closed: true }, attachmentsBeforeReenable: 1, sockets: 2, enabled: true, registrations: 2,
				});
			});
		});

		test('settings/consent disable closes ingress synchronously while the offline request is pending', async () => {
			await withEnvironment([], async ({ service, options, sockets, delayHeartbeat, clock, heartbeats }) => {
				const delayed = delayHeartbeat();
				const disabling = service.configure(undefined);
				const withdrawn = { enabled: service.isEnabled, closed: sockets.every(socket => socket.closed) };
				await delayed.started;
				await delayed.complete(new Response('{}', { headers: { 'Retry-After': '300' } }));
				await disabling;
				await service.configure(options);
				await clock.tickAsync(299_999);
				const beforeDeadline = heartbeats.length;
				await clock.tickAsync(1);
				assert.deepStrictEqual({ withdrawn, beforeDeadline, heartbeats }, {
					withdrawn: { enabled: false, closed: true },
					beforeDeadline: 2,
					heartbeats: [{ time: 0, status: 'online' }, { time: 0, status: 'offline' }, { time: 300_000, status: 'online' }],
				});
			});
		});

		test('a rejected foreign account cannot withdraw the pinned owner or close its relay', async () => {
			await withEnvironment([{ retryAfter: '300' }], async ({ service, options, sockets, clock, heartbeats, requests, errors }) => {
				await assert.rejects(service.configure({ ...options, accountId: 'other' }), /another local account/);
				const requestCount = requests.length;
				await assert.rejects(service.configure(undefined, 'other'), /Only the Agent Host owner/);
				const immediatelyAfterRefusal = {
					enabled: service.isEnabled, environmentId: service.environmentId,
					closed: sockets[0].closed, extraRequests: requests.length - requestCount,
				};
				await clock.tickAsync(299_999);
				const beforeDeadline = heartbeats.length;
				await clock.tickAsync(1);
				assert.deepStrictEqual({ immediatelyAfterRefusal, beforeDeadline, heartbeats, sockets: sockets.length, errors }, {
					immediatelyAfterRefusal: { enabled: true, environmentId: 'environment', closed: false, extraRequests: 0 },
					beforeDeadline: 1,
					heartbeats: [{ time: 0, status: 'online' }, { time: 300_000, status: 'online' }],
					sockets: 1, errors: [],
				});
			});
		});

		test('account-bound owner withdrawal is immediate and preserves Retry-After across re-enable', async () => {
			await withEnvironment([{ retryAfter: '300' }], async ({ service, options, sockets, clock, heartbeats, errors }) => {
				const disabling = service.configure(undefined, options.accountId);
				const withdrawn = { enabled: service.isEnabled, closed: sockets[0].closed };
				await disabling;
				await service.configure(options, 'other');
				await clock.tickAsync(299_999);
				const beforeDeadline = heartbeats.length;
				await clock.tickAsync(1);
				assert.deepStrictEqual({ withdrawn, beforeDeadline, heartbeats, sockets: sockets.length, errors }, {
					withdrawn: { enabled: false, closed: true },
					beforeDeadline: 1,
					heartbeats: [{ time: 0, status: 'online' }, { time: 300_000, status: 'online' }],
					sockets: 2, errors: [],
				});
			});
		});

		test('rejects owner and live scope conflicts without replacing the first grant', async () => {
			await withEnvironment([], async ({ service, options, sockets, attachments, directory }) => {
				for (const conflicting of [
					{ ...options, accountId: 'other', roots: [directory] },
					{ ...options, baseUrl: 'https://other.test', roots: [directory] },
					{ ...options, requireConnectionBinding: true, roots: [directory] },
				]) {
					await assert.rejects(service.configure(conflicting), /another local account|already configured/);
				}
				assert.deepStrictEqual({ enabled: service.isEnabled, sockets: sockets.length, closed: sockets[0].closed, roots: attachments[0].getRoots() }, {
					enabled: true, sockets: 1, closed: false, roots: [],
				});
				await service.configure(undefined);
				await assert.rejects(service.configure({ ...options, accountId: 'other' }), /another local account/);
			});
		});

		test('reports changed and removed managed policy immediately without parsing it or losing heartbeat Retry-After', async () => {
			await withEnvironment([{ retryAfter: '300' }], async ({ changePolicy, clock, requests, heartbeats, sockets, errors }) => {
				await changePolicy({ mode: 'disabled' });
				await clock.tickAsync(1000);
				await changePolicy(undefined);
				await clock.tickAsync(298_999);
				const beforeDeadline = heartbeats.length;
				await clock.tickAsync(1);
				assert.deepStrictEqual({
					policies: requests.filter(request => request.path.endsWith('/register')).map(request => request.body?.managed_settings),
					beforeDeadline, heartbeats, sockets: sockets.length, errors,
				}, {
					policies: [undefined, { remoteControl: { mode: 'disabled' } }, undefined],
					beforeDeadline: 1,
					heartbeats: [{ time: 0, status: 'online' }, { time: 300_000, status: 'online' }],
					sockets: 1, errors: [],
				});
			});
		});
	});

	function createIdentityService(userData: string, computeIds: string[], names?: string[]): MissionControlEnvironment {
		const { key } = signingFixture();
		return store.add(new MissionControlEnvironment({
			userDataPath: userData,
			name: 'VS Code OSS',
			fetch: async (input, init) => {
				const url = new URL(input.toString());
				if (url.pathname.endsWith('/register')) {
					const body = JSON.parse(String(init?.body)) as { compute_id: string; name: string };
					computeIds.push(body.compute_id);
					names?.push(body.name);
				}
				return Response.json(url.pathname.endsWith('/jwks.json') ? { keys: [key] } : {
					id: 'environment', user_id: 'owner', owner_id: 'owner', owner_type: 'user', kind: 'user-local',
					webpubsub: { url: 'ws://127.0.0.1/fake', access_token: 'fake-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: `${prefix}.control` } },
				});
			},
			attach: () => ({ dispose() { } }),
			onError: error => { throw error; },
			socketFactory: () => {
				const socket = new FakeWpsSocket();
				queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
				return socket;
			}
		}
		));
	}

	test('reuses compute identity across windows and restarts, but not different user-data directories', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-identity-'));
		try {
			const computeIds: string[] = [];
			const names: string[] = [];
			const options = { baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-token', roots: [path] };
			const createService = (userData: string) => createIdentityService(userData, computeIds, names);
			const first = createService(join(path, 'normal'));
			await Promise.all([first.configure(options), first.configure(options)]);
			const registrationsForTwoWindows = computeIds.length;
			await first.configure(undefined);
			first.dispose();
			const restarted = createService(join(path, 'normal'));
			await restarted.configure(options);
			const separateProfile = createService(join(path, 'isolated'));
			await separateProfile.configure(options);
			assert.deepStrictEqual({
				registrationsForTwoWindows,
				restartIdentityMatches: computeIds[0] === computeIds[1],
				isolatedIdentityDiffers: computeIds[0] !== computeIds[2],
				registrations: computeIds.length,
				names,
			}, {
				registrationsForTwoWindows: 1, restartIdentityMatches: true, isolatedIdentityDiffers: true, registrations: 3,
				names: ['VS Code OSS', 'VS Code OSS', 'VS Code OSS'],
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('copied identity records rotate only the copy and preserve both identities across restart', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-copy-'));
		try {
			const originalDirectory = join(path, 'original');
			const copiedDirectory = join(path, 'copy');
			const filename = 'agent-host-mission-control-id';
			const computeIds: string[] = [];
			const options = { baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-token', roots: [path] };
			const original = createIdentityService(originalDirectory, computeIds);
			await original.configure(options);
			const originalRecord = await readFile(join(originalDirectory, filename), 'utf8');
			await mkdir(copiedDirectory);
			await copyFile(join(originalDirectory, filename), join(copiedDirectory, filename));
			const copied = createIdentityService(copiedDirectory, computeIds);
			await copied.configure(options);
			const copiedRecord: object = JSON.parse(await readFile(join(copiedDirectory, filename), 'utf8'));
			original.dispose();
			copied.dispose();
			await createIdentityService(originalDirectory, computeIds).configure(options);
			await createIdentityService(copiedDirectory, computeIds).configure(options);
			assert.deepStrictEqual({
				originalUnchanged: await readFile(join(originalDirectory, filename), 'utf8') === originalRecord,
				copyIsDistinct: computeIds[0] !== computeIds[1],
				stableOriginal: computeIds[0] === computeIds[2],
				stableCopy: computeIds[1] === computeIds[3],
				copiedRecord,
			}, {
				originalUnchanged: true, copyIsDistinct: true, stableOriginal: true, stableCopy: true,
				copiedRecord: { version: 1, id: computeIds[1], userDataDirectory: realpathSync(copiedDirectory) },
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('migrates a legacy compute UUID in place without changing its identity', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-legacy-'));
		try {
			const filename = join(path, 'agent-host-mission-control-id');
			const legacyId = randomUUID();
			await writeFile(filename, legacyId, { mode: 0o600, flag: 'wx' });
			const computeIds: string[] = [];
			const options = { baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-token', roots: [path] };
			const first = createIdentityService(path, computeIds);
			await first.configure(options);
			first.dispose();
			await createIdentityService(path, computeIds).configure(options);
			assert.deepStrictEqual({
				computeIds,
				record: JSON.parse(await readFile(filename, 'utf8')),
			}, {
				computeIds: [legacyId, legacyId],
				record: { version: 1, id: legacyId, userDataDirectory: realpathSync(path) },
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('canonical directory aliases reuse the same compute identity', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-canonical-'));
		try {
			const originalDirectory = join(path, 'original');
			const alias = join(path, 'alias');
			const computeIds: string[] = [];
			const options = { baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-token', roots: [path] };
			await createIdentityService(originalDirectory, computeIds).configure(options);
			await symlink(originalDirectory, alias, 'junction');
			await createIdentityService(alias, computeIds).configure(options);
			assert.deepStrictEqual({
				sameIdentity: computeIds[0] === computeIds[1],
				record: JSON.parse(await readFile(join(alias, 'agent-host-mission-control-id'), 'utf8')),
			}, {
				sameIdentity: true,
				record: { version: 1, id: computeIds[0], userDataDirectory: realpathSync(originalDirectory) },
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('registration metadata is bounded and late answers cannot register a disabled host', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-metadata-timeout-'));
		const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		try {
			const metadata = new DeferredPromise<number>();
			const started = new DeferredPromise<void>();
			const requests: string[] = [];
			const service = store.add(new MissionControlEnvironment({
				userDataPath: path,
				name: 'VS Code OSS',
				fetch: async input => {
					requests.push(input.toString());
					return Response.json({ id: 123, type: 'User' });
				},
				attach: () => { throw new Error('Timed-out registration must not attach a server'); },
				onError: error => { throw error; },
				getSessionCount: () => { started.complete(); return metadata.p; },
				getRemoteControlPolicy: async () => undefined
			}
			));
			const configuring = service.configure({ baseUrl: 'https://api.github.com', live: true, accountId: '123', credential: 'fake-token', roots: [] });
			const rejected = assert.rejects(configuring, /registration metadata timed out/);
			await started.p;
			await clock.tickAsync(15_000);
			await rejected;
			await metadata.complete(42);
			await clock.tickAsync(60_000);
			assert.deepStrictEqual(requests, ['https://api.github.com/user']);
			service.dispose();
		} finally {
			clock.restore();
			await rm(path, { recursive: true });
		}
	});

	test('live registration does not require a local workspace or create a client connection', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-host-only-'));
		try {
			const { key } = signingFixture();
			const requestPaths: string[] = [];
			let attachedRoots: readonly string[] | undefined;
			const service = store.add(new MissionControlEnvironment({
				userDataPath: path,
				name: 'VS Code OSS',
				fetch: async input => {
					const url = new URL(input.toString());
					requestPaths.push(url.pathname);
					return Response.json(url.pathname === '/user' ? { id: 123, type: 'User' } : url.pathname.endsWith('/jwks.json') ? { keys: [key] } : {
						id: 'environment', user_id: '123', owner_id: '123', owner_type: 'user', kind: 'user-local',
						webpubsub: { url: 'wss://wps.test/client/hubs/test', access_token: 'fake-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: 'user.123.env.environment.control' } },
					});
				},
				attach: (_server, roots) => { attachedRoots = roots; return { dispose() { } }; },
				onError: error => { throw error; },
				socketFactory: () => {
					const socket = new FakeWpsSocket();
					queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
					return socket;
				},
				getRemoteControlPolicy: async () => undefined
			}
			));
			await service.configure({ baseUrl: 'https://api.github.com', live: true, accountId: '123', credential: 'fake-token', roots: [] });
			assert.deepStrictEqual({ requestPaths, attachedRoots }, {
				requestPaths: ['/user', '/cmc_internal/api/agents/environments/register', '/cmc_internal/api/agents/environments/.well-known/jwks.json', '/cmc_internal/api/agents/environments/environment/heartbeat'],
				attachedRoots: [],
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});
});
