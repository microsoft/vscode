/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { generateKeyPairSync, sign, type JsonWebKey } from 'crypto';
import { EventEmitter } from 'events';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { hasKey } from '../../../../base/common/types.js';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MissionControlControlVerifier, type IMissionControlSigningKey } from '../../node/missionControlControl.js';
import { MissionControlProtocolServer, type IMissionControlSocket } from '../../node/missionControlProtocolServer.js';
import { ExperimentalMissionControlEnvironment } from '../../node/missionControlEnvironment.js';
import type { IProtocolTransport } from '../../common/state/sessionTransport.js';

const prefix = 'user.owner.env.environment';
const order = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

class FakeWpsSocket extends EventEmitter implements IMissionControlSocket {
	readonly publishes: { group: string; data: { kind: string; data: object } }[] = [];
	readonly joins: string[] = [];
	readonly acknowledgements: number[] = [];
	readonly publishAckIds: number[] = [];
	closed = false;
	constructor(private readonly _ackSuccess = true, private readonly _manualPublishAcks = false) { super(); }

	send(data: string): void {
		const frame = JSON.parse(data) as { type: string; ackId?: number; group?: string; data?: { kind: string; data: object }; sequenceId?: number };
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
		if (frame.ackId && !(this._manualPublishAcks && frame.type === 'sendToGroup')) {
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

suite('Experimental Mission Control WPS', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function signingFixture() {
		const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
		const key: IMissionControlSigningKey = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: 'test-key', kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig' };
		const signed = (clientId: string, nonce: string, passive = false, environment = 'environment') => {
			const payload = { kind: 'spawn_request', client_id: clientId, spawn_request_id: `spawn-${nonce}`, passive };
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
		return { key, signed };
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
	});

	test('failed relay startup marks the registered environment offline', async () => {
		const path = await mkdtemp(join(tmpdir(), 'mission-control-failed-start-'));
		try {
			const { key } = signingFixture();
			const socket = new FakeWpsSocket(false);
			const requests: { path: string; status?: unknown }[] = [];
			const fakeFetch: typeof fetch = async (input, init) => {
				const url = new URL(input.toString());
				requests.push({ path: url.pathname, status: init?.body ? (JSON.parse(init.body.toString()) as { status?: string }).status : undefined });
				return Response.json(url.pathname.endsWith('jwks.json') ? { keys: [key] } : {
					id: 'environment', kind: 'user-local', user_id: 'owner', owner_id: 'owner', owner_type: 'user',
					webpubsub: { url: 'ws://127.0.0.1/fake', access_token: 'fake-wps-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: `${prefix}.control` } },
				});
			};
			const service = store.add(new ExperimentalMissionControlEnvironment(
				path, fakeFetch, () => ({ dispose() { } }), () => { },
				() => {
					queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
					return socket;
				},
			));
			await assert.rejects(service.configure({ baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-local-token', roots: [path] }), /connection closed before joining/);
			assert.deepStrictEqual({ requests, closed: socket.closed }, {
				requests: [
					{ path: '/cmc_internal/api/agents/environments/register', status: undefined },
					{ path: '/cmc_internal/api/agents/environments/.well-known/jwks.json', status: undefined },
					{ path: '/cmc_internal/api/agents/environments/environment/heartbeat', status: 'offline' },
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
			publishes: [`${prefix}.client.client-b.to-client`],
			acks: [1, 2, 3, 4, 4, 5],
			errors: [],
			credentialLaneClosed: true,
			credentialPublished: false,
		});
	});

	test('registers the process identity, heartbeats, and refuses account rebinding', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-test-'));
		const clock = sinon.useFakeTimers();
		try {
			const { key } = signingFixture();
			const sockets: FakeWpsSocket[] = [];
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
				return Response.json(url.pathname.endsWith('jwks.json') ? { keys: [key] } : environment);
			};
			const service = store.add(new ExperimentalMissionControlEnvironment(
				path, fakeFetch, () => ({ dispose() { } }), () => { throw new Error('Unexpected WPS failure'); },
				() => {
					const socket = new FakeWpsSocket();
					sockets.push(socket);
					queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
					return socket;
				},
			));
			const options = { baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-local-token', roots: [path] };
			await service.configure(options);
			await clock.tickAsync(60_000);
			sockets[0].emit('close');
			await clock.tickAsync(60_000);
			const persisted = (await readFile(join(path, 'agent-host-mission-control-id'), 'utf8')).trim();
			const rebind = await service.configure({ ...options, accountId: 'other' }).then(() => 'accepted', () => 'rejected');
			await service.configure(undefined);
			assert.deepStrictEqual({
				requests: requests.map(request => [request.path, request.bearer, request.body?.kind, request.body?.compute_id]),
				persisted: /^[0-9a-f-]{36}$/.test(persisted),
				rebind,
				controlJoined: sockets.flatMap(socket => socket.joins),
				offline: requests.at(-1)?.body?.status,
				closed: sockets.every(socket => socket.closed),
			}, {
				requests: [
					['/cmc_internal/api/agents/environments/register', true, 'user-local', persisted],
					['/cmc_internal/api/agents/environments/.well-known/jwks.json', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/environment/heartbeat', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/environment/heartbeat', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/.well-known/jwks.json', true, undefined, undefined],
					['/cmc_internal/api/agents/environments/environment/heartbeat', true, undefined, undefined],
				],
				persisted: true,
				rebind: 'rejected',
				controlJoined: [`${prefix}.control`, `${prefix}.control`],
				offline: 'offline',
				closed: true,
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
				service: ExperimentalMissionControlEnvironment;
				clock: sinon.SinonFakeTimers;
				heartbeats: { time: number; status: string }[];
				errors: string[];
				sockets: FakeWpsSocket[];
				options: { baseUrl: string; live: boolean; accountId: string; credential: string; roots: string[] };
			}) => Promise<void>,
		): Promise<void> {
			const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-retry-after-'));
			const clock = sinon.useFakeTimers({ now: Date.UTC(2026, 9, 2), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
			let service: ExperimentalMissionControlEnvironment | undefined;
			try {
				const { key } = signingFixture();
				const heartbeats: { time: number; status: string }[] = [];
				const errors: string[] = [];
				const sockets: FakeWpsSocket[] = [];
				const environment = {
					id: 'environment', kind: 'user-local', user_id: '123', owner_id: '123', owner_type: 'user',
					webpubsub: { url: 'wss://wps.test/client/hubs/test', access_token: 'fake-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: 'user.123.env.environment.control' } },
				};
				service = store.add(new ExperimentalMissionControlEnvironment(
					path,
					async (input, init) => {
						const url = new URL(input.toString());
						if (url.pathname.endsWith('/heartbeat')) {
							const reply = replies[heartbeats.length];
							heartbeats.push({ time: clock.now - Date.UTC(2026, 9, 2), status: (JSON.parse(String(init?.body)) as { status: string }).status });
							const responseOptions: ResponseInit = { status: reply?.status ?? 200, headers: reply?.retryAfter === undefined ? {} : { 'rEtRy-AfTeR': reply.retryAfter } };
							return reply?.body === undefined ? Response.json(environment, responseOptions) : new Response(reply.body, responseOptions);
						}
						return Response.json(url.pathname === '/user' ? { id: 123, type: 'User' } : url.pathname.endsWith('/jwks.json') ? { keys: [key] } : environment);
					},
					() => ({ dispose() { } }),
					error => errors.push(error instanceof Error ? error.message : String(error)),
					() => {
						const socket = new FakeWpsSocket();
						sockets.push(socket);
						queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
						return socket;
					},
					undefined,
					async () => undefined,
				));
				const options = { baseUrl: 'https://api.github.com', live: true, accountId: '123', credential: 'fake-token', roots: [] };
				await service.configure(options);
				await run({ service, clock, heartbeats, errors, sockets, options });
			} finally {
				service?.dispose();
				clock.restore();
				await rm(path, { recursive: true });
			}
		}

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
			await withEnvironment([{}, { retryAfter: '240' }], async ({ clock, heartbeats, errors, sockets }) => {
				sockets[0].emit('close');
				await clock.tickAsync(60_000);
				const socketsAfterRecovery = sockets.length;
				await clock.tickAsync(239_999);
				const beforeDeadline = heartbeats.length;
				await clock.tickAsync(1);
				assert.deepStrictEqual({ socketsAfterRecovery, beforeDeadline, heartbeats, errors }, {
					socketsAfterRecovery: 2,
					beforeDeadline: 2,
					heartbeats: [{ time: 0, status: 'online' }, { time: 60_000, status: 'offline' }, { time: 300_000, status: 'online' }],
					errors: [],
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
	});

	test('reuses compute identity across windows and restarts, but not different user-data directories', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-identity-'));
		try {
			const { key } = signingFixture();
			const computeIds: string[] = [];
			const options = { baseUrl: 'http://127.0.0.1:9999/', accountId: 'owner', credential: 'fake-token', roots: [path] };
			const createService = (userData: string) => store.add(new ExperimentalMissionControlEnvironment(
				userData,
				async (input, init) => {
					const url = new URL(input.toString());
					if (url.pathname.endsWith('/register')) {
						computeIds.push((JSON.parse(String(init?.body)) as { compute_id: string }).compute_id);
					}
					return Response.json(url.pathname.endsWith('/jwks.json') ? { keys: [key] } : {
						id: 'environment', user_id: 'owner', owner_id: 'owner', owner_type: 'user', kind: 'user-local',
						webpubsub: { url: 'ws://127.0.0.1/fake', access_token: 'fake-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: `${prefix}.control` } },
					});
				},
				() => ({ dispose() { } }),
				error => { throw error; },
				() => {
					const socket = new FakeWpsSocket();
					queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
					return socket;
				},
			));
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
			}, {
				registrationsForTwoWindows: 1, restartIdentityMatches: true, isolatedIdentityDiffers: true, registrations: 3,
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('live registration does not require a local workspace or create a client connection', async () => {
		const path = await mkdtemp(join(process.cwd(), '.build', 'mission-control-host-only-'));
		try {
			const { key } = signingFixture();
			const requestPaths: string[] = [];
			let attachedRoots: readonly string[] | undefined;
			const service = store.add(new ExperimentalMissionControlEnvironment(
				path,
				async input => {
					const url = new URL(input.toString());
					requestPaths.push(url.pathname);
					return Response.json(url.pathname === '/user' ? { id: 123, type: 'User' } : url.pathname.endsWith('/jwks.json') ? { keys: [key] } : {
						id: 'environment', user_id: '123', owner_id: '123', owner_type: 'user', kind: 'user-local',
						webpubsub: { url: 'wss://wps.test/client/hubs/test', access_token: 'fake-token', subprotocol: 'json.reliable.webpubsub.azure.v1', groups: { control: 'user.123.env.environment.control' } },
					});
				},
				(_server, roots) => { attachedRoots = roots; return { dispose() { } }; },
				error => { throw error; },
				() => {
					const socket = new FakeWpsSocket();
					queueMicrotask(() => socket.emit('message', JSON.stringify({ type: 'system', event: 'connected' })));
					return socket;
				},
				undefined,
				async () => undefined,
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
