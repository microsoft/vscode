/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { WebSocket, type ClientOptions } from 'ws';
import { LocalRelayPool, type LocalRelayPoolOptions } from '../src/localRelayPool';
import { parseClientMessage } from '../src/protocol';
import { maxTerminalSessions, relayApprovalPendingMessage, relayCapacityMessage, validateSessionId, type RelayBatch, type RemoteRelayTransport } from '../src/relayProtocol';

class EchoRemote implements RemoteRelayTransport {
	opening: Promise<void> | undefined;
	writing: Promise<void> | undefined;
	closes = 0;
	reads = 0;
	readonly writes: string[][] = [];
	private readonly batches: RelayBatch[] = [];
	private pending: { resolve(batch: RelayBatch): void; reject(error: Error): void } | undefined;

	async open(): Promise<void> {
		await this.opening;
	}

	async read(): Promise<RelayBatch> {
		this.reads++;
		const batch = this.batches.shift();
		if (batch) {
			return batch;
		}
		return new Promise<RelayBatch>((resolve, reject) => { this.pending = { resolve, reject }; });
	}

	async write(messages: string[]): Promise<void> {
		this.writes.push(messages);
		await this.writing;
		for (const text of messages) {
			const message = parseClientMessage(text);
			if (message.type === 'input') {
				this.push({ messages: [JSON.stringify({ type: 'data', data: message.data })] });
			}
		}
	}

	async close(): Promise<void> {
		this.closes++;
		this.push({ messages: [], closeCode: 1001 });
	}

	push(batch: RelayBatch): void {
		if (this.pending) {
			const pending = this.pending;
			this.pending = undefined;
			pending.resolve(batch);
		} else {
			this.batches.push(batch);
		}
	}

	failRead(): void {
		assert.ok(this.pending);
		this.pending.reject(new Error('The remote read lease expired.'));
		this.pending = undefined;
	}
}

const startMessage = JSON.stringify({ type: 'start', version: 2, cols: 80, rows: 24 });
const input = (data: string) => JSON.stringify({ type: 'input', data });
const output = (data: string) => JSON.stringify({ type: 'data', data });

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, 'Condition did not become true');
		await delay(5);
	}
}

async function fixture(t: TestContext, options: Partial<LocalRelayPoolOptions> = {}) {
	const sessions: { id: string; remote: EchoRemote }[] = [];
	const errors: Error[] = [];
	let stops = 0;
	let closes = 0;
	const pool = new LocalRelayPool({
		createTransport: id => {
			const remote = new EchoRemote();
			sessions.push({ id, remote });
			return remote;
		},
		stop: async () => { stops++; },
		onError: error => errors.push(error),
		onClose: () => { closes++; },
		socketCloseTimeoutMs: 50,
		...options,
	});
	t.after(() => pool.dispose());
	const { url } = await pool.start();
	const connect = async (clientOptions?: ClientOptions) => {
		const socket = new WebSocket(url, clientOptions);
		t.after(() => socket.terminate());
		socket.on('error', () => { });
		const messages: string[] = [];
		socket.on('message', data => messages.push(data.toString()));
		const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
		await once(socket, 'open');
		return { socket, messages, closed };
	};
	return { pool, url, sessions, errors, connect, get stops() { return stops; }, get closes() { return closes; } };
}

async function rejected(url: string, options?: ClientOptions): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const socket = new WebSocket(url, options);
		socket.on('error', reject);
		socket.once('open', () => {
			socket.terminate();
			reject(new Error('The connection should not have been accepted'));
		});
		socket.once('unexpected-response', (_request, response) => {
			response.resume();
			socket.terminate();
			resolve(response.statusCode ?? 0);
		});
	});
}

test('local relay pool isolates simultaneous echo streams and survives a client disconnect', async t => {
	const f = await fixture(t);
	const first = await f.connect();
	const second = await f.connect();
	first.socket.send(startMessage);
	second.socket.send(startMessage);
	first.socket.send(input('first'));
	second.socket.send(input('second'));
	await waitFor(() => first.messages.length === 1 && second.messages.length === 1);
	assert.deepStrictEqual([first.messages, second.messages], [[output('first')], [output('second')]]);
	assert.equal(new Set(f.sessions.map(session => session.id)).size, 2);
	for (const session of f.sessions) {
		validateSessionId(session.id);
	}
	first.socket.close();
	await first.closed;
	second.socket.send(input('still alive'));
	await waitFor(() => second.messages.length === 2);
	assert.deepStrictEqual({ messages: second.messages, stops: f.stops, closes: f.closes, errors: f.errors }, {
		messages: [output('second'), output('still alive')], stops: 0, closes: 0, errors: [],
	});
	const third = await f.connect();
	third.socket.send(startMessage);
	third.socket.send(input('reused'));
	await waitFor(() => third.messages.length === 1);
	assert.deepStrictEqual(third.messages, [output('reused')]);
});

test('local relay pool reuses the same URL after clean exits and approval denials', async t => {
	const f = await fixture(t);
	for (const closeCode of [1000, 1011, 1000]) {
		const client = await f.connect();
		client.socket.send(startMessage);
		const final = closeCode === 1000
			? [output('final'), JSON.stringify({ type: 'exit', exitCode: 0 })]
			: [JSON.stringify({ type: 'error', message: 'Not approved' })];
		f.sessions.at(-1)!.remote.push({ messages: final, closeCode });
		assert.deepStrictEqual({ code: await client.closed, messages: client.messages }, { code: closeCode, messages: final });
	}
	assert.deepStrictEqual({ sessions: f.sessions.length, stops: f.stops, closes: f.closes }, { sessions: 3, stops: 0, closes: 0 });
});

test('local relay pool counts ten pending clients, rejects the eleventh, and reuses a freed slot', async t => {
	const sessions: EchoRemote[] = [];
	const f = await fixture(t, {
		createTransport: () => {
			const remote = new EchoRemote();
			remote.opening = new Promise<void>(() => { });
			sessions.push(remote);
			return remote;
		},
	});
	const clients = await Promise.all(Array.from({ length: maxTerminalSessions }, () => f.connect()));
	assert.equal(await rejected(f.url), 409);
	clients[0].socket.close();
	await clients[0].closed;
	const replacement = await f.connect();
	assert.deepStrictEqual({
		sessions: sessions.length,
		remainingOpen: clients.slice(1).every(client => client.socket.readyState === WebSocket.OPEN),
		replacementOpen: replacement.socket.readyState,
		stops: f.stops,
	}, { sessions: 11, remainingOpen: true, replacementOpen: WebSocket.OPEN, stops: 0 });
});

test('local relay pool keeps request restrictions on its reusable listener', async t => {
	const f = await fixture(t);
	assert.deepStrictEqual(await Promise.all([
		rejected(f.url, { origin: 'https://example.com' }),
		rejected(f.url, { headers: { Authorization: 'Bearer denied' } }),
		rejected(`${f.url}?session=anything`),
		rejected(f.url.replace('/terminal', '/other')),
	]), [403, 403, 404, 404]);
	assert.equal(f.sessions.length, 0);
	const client = await f.connect();
	assert.equal(client.socket.readyState, WebSocket.OPEN);
});

test('local relay pool disposal stops every session and the remote bridge exactly once', async t => {
	const f = await fixture(t);
	const clients = await Promise.all(Array.from({ length: 3 }, () => f.connect()));
	for (const client of clients) {
		client.socket.send(startMessage);
	}
	await waitFor(() => f.sessions.every(session => session.remote.reads > 0));
	f.pool.dispose();
	f.pool.dispose();
	assert.deepStrictEqual({
		codes: await Promise.all(clients.map(client => client.closed)),
		remoteCloses: f.sessions.map(session => session.remote.closes),
		stops: f.stops,
		closes: f.closes,
	}, { codes: [1001, 1001, 1001], remoteCloses: [1, 1, 1], stops: 1, closes: 1 });
	await assert.rejects(rejected(f.url), /ECONNREFUSED/);
});

for (const message of [relayApprovalPendingMessage, relayCapacityMessage]) {
	test(`local relay pool forwards safe admission errors before close: ${message}`, async t => {
		let attempts = 0;
		const f = await fixture(t, {
			createTransport: () => {
				const remote = new EchoRemote();
				if (++attempts === 2) {
					remote.opening = Promise.reject(new Error(message));
				}
				return remote;
			},
		});
		const first = await f.connect();
		first.socket.send(startMessage);
		const denied = await f.connect();
		assert.deepStrictEqual({ code: await denied.closed, messages: denied.messages }, {
			code: 1011, messages: [JSON.stringify({ type: 'error', message })],
		});
		first.socket.send(input('unaffected'));
		await waitFor(() => first.messages.length === 1);
		const third = await f.connect();
		third.socket.send(startMessage);
		third.socket.send(input('later'));
		await waitFor(() => third.messages.length === 1);
		assert.deepStrictEqual({ first: first.messages, third: third.messages, errors: f.errors.length, stops: f.stops }, {
			first: [output('unaffected')], third: [output('later')], errors: 1, stops: 0,
		});
	});
}

test('local relay pool isolates lease failures to their session', async t => {
	const f = await fixture(t);
	const first = await f.connect();
	const second = await f.connect();
	first.socket.send(startMessage);
	second.socket.send(startMessage);
	await waitFor(() => f.sessions.every(session => session.remote.reads > 0));
	f.sessions[0].remote.failRead();
	assert.equal(await first.closed, 1011);
	second.socket.send(input('lease unaffected'));
	await waitFor(() => second.messages.length === 1);
	assert.deepStrictEqual({ messages: second.messages, errors: f.errors.length, stops: f.stops }, {
		messages: [output('lease unaffected')], errors: 1, stops: 0,
	});
});

test('local relay pool isolates write timeouts and per-client start deadlines', async t => {
	const f = await fixture(t, { writeTimeoutMs: 25, startTimeoutMs: 80 });
	const stalled = await f.connect();
	f.sessions[0].remote.writing = new Promise<void>(() => { });
	stalled.socket.send(startMessage);
	const healthy = await f.connect();
	healthy.socket.send(startMessage);
	assert.equal(await stalled.closed, 1011);
	const unused = await f.connect();
	assert.equal(await unused.closed, 1011);
	healthy.socket.send(input('alive'));
	await waitFor(() => healthy.messages.length === 1);
	assert.deepStrictEqual({ messages: healthy.messages, stops: f.stops, errors: f.errors.length }, {
		messages: [output('alive')], stops: 0, errors: 2,
	});
});

test('local relay pool isolates heartbeat failure to the unresponsive client', async t => {
	const f = await fixture(t, { heartbeatMs: 20 });
	const dead = await f.connect({ autoPong: false });
	dead.socket.send(startMessage);
	const healthy = await f.connect();
	healthy.socket.send(startMessage);
	assert.equal(await dead.closed, 1011);
	healthy.socket.send(input('healthy heartbeat'));
	await waitFor(() => healthy.messages.length === 1);
	assert.deepStrictEqual({ messages: healthy.messages, stops: f.stops, errors: f.errors.length }, {
		messages: [output('healthy heartbeat')], stops: 0, errors: 1,
	});
});

test('local relay pool closes late opens after stop without forwarding stale writes', async t => {
	let completeOpen!: () => void;
	const remote = new EchoRemote();
	remote.opening = new Promise<void>(resolve => { completeOpen = resolve; });
	const f = await fixture(t, { createTransport: () => remote });
	const client = await f.connect();
	client.socket.send(startMessage);
	client.socket.send(input('discarded'));
	await delay(20);
	f.pool.dispose();
	assert.equal(await client.closed, 1001);
	completeOpen();
	await waitFor(() => remote.closes === 2);
	assert.deepStrictEqual({ writes: remote.writes, stops: f.stops }, { writes: [], stops: 1 });
});

test('local relay pool has no unused-listener expiry from client deadlines', async t => {
	const f = await fixture(t, { startTimeoutMs: 10, openTimeoutMs: 10, readTimeoutMs: 10 });
	await delay(70);
	const client = await f.connect();
	client.socket.send(startMessage);
	client.socket.send(input('first connection'));
	await waitFor(() => client.messages.length === 1);
	client.socket.close();
	await client.closed;
	await delay(70);
	const next = await f.connect();
	next.socket.send(startMessage);
	next.socket.send(input('later connection'));
	await waitFor(() => next.messages.length === 1);
	assert.deepStrictEqual({ messages: next.messages, stops: f.stops, closes: f.closes }, { messages: [output('later connection')], stops: 0, closes: 0 });
});

test('local relay pool reports a hung remote stop after closing its listener', async t => {
	const f = await fixture(t, { stop: () => new Promise<void>(() => { }), closeTimeoutMs: 20 });
	f.pool.dispose();
	await waitFor(() => f.errors.length === 1);
	assert.match(f.errors[0].message, /stop operation timed out/);
	await assert.rejects(rejected(f.url), /ECONNREFUSED/);
});

test('local relay pool disposal cancels an in-flight listener start', async () => {
	let stops = 0;
	const pool = new LocalRelayPool({
		createTransport: () => new EchoRemote(),
		stop: async () => { stops++; },
		onError: () => { },
		onClose: () => { },
	});
	const starting = pool.start();
	pool.dispose();
	await assert.rejects(starting, /stopped while starting/);
	assert.equal(stops, 1);
});
