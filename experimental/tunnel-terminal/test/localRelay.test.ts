/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { WebSocket, type ClientOptions } from 'ws';
import { LocalRelay, type LocalRelayOptions } from '../src/localRelay';
import { maxBufferedBytes, maxInputLength } from '../src/protocol';
import { relayMaxBatchBytes, relayMaxBatchMessages, type RelayBatch, type RemoteRelayTransport } from '../src/relayProtocol';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

class FakeRemote implements RemoteRelayTransport {
	readonly openGate = deferred<void>();
	writeGate: ReturnType<typeof deferred<void>> | undefined;
	closeGate: ReturnType<typeof deferred<void>> | undefined;
	readonly writes: string[][] = [];
	opens = 0;
	reads = 0;
	closes = 0;
	private readonly batches: RelayBatch[] = [];
	private pendingRead: ReturnType<typeof deferred<RelayBatch>> | undefined;

	constructor(open = true) {
		if (open) {
			this.openGate.resolve();
		}
	}

	async open(): Promise<void> {
		this.opens++;
		await this.openGate.promise;
	}

	async write(messages: string[]): Promise<void> {
		this.writes.push(messages);
		await this.writeGate?.promise;
	}

	async read(): Promise<RelayBatch> {
		this.reads++;
		const batch = this.batches.shift();
		if (batch) {
			return batch;
		}
		this.pendingRead = deferred<RelayBatch>();
		return this.pendingRead.promise;
	}

	push(batch: RelayBatch): void {
		if (this.pendingRead) {
			const pending = this.pendingRead;
			this.pendingRead = undefined;
			pending.resolve(batch);
		} else {
			this.batches.push(batch);
		}
	}

	async close(): Promise<void> {
		this.closes++;
		this.push({ messages: [], closeCode: 1001 });
		await this.closeGate?.promise;
	}
}

const startMessage = JSON.stringify({ type: 'start', version: 2, cols: 80, rows: 24 });
const inputMessage = JSON.stringify({ type: 'input', data: 'hello\r' });
const pairingMessage = JSON.stringify({ type: 'pairing', version: 2, code: 'ABCD-1234-5678' });
const readyMessage = JSON.stringify({ type: 'ready', version: 2 });

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, 'Condition did not become true');
		await delay(5);
	}
}

async function fixture(t: TestContext, options: Partial<LocalRelayOptions> = {}, remote = new FakeRemote()) {
	const errors: Error[] = [];
	let closes = 0;
	const relay = new LocalRelay({
		transport: remote,
		onError: error => errors.push(error),
		onClose: () => { closes++; },
		socketCloseTimeoutMs: 50,
		...options,
	});
	t.after(() => relay.dispose());
	const { url } = await relay.start();
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
	return { relay, remote, errors, url, connect, get closes() { return closes; } };
}

async function denied(url: string, options?: ClientOptions): Promise<number> {
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

test('local relay forwards original packets, buffers during open, and delivers final messages before clean close', async t => {
	const remote = new FakeRemote(false);
	const f = await fixture(t, {}, remote);
	assert.deepStrictEqual(new URL(f.url).hostname, '127.0.0.1');
	const client = await f.connect();
	client.socket.send(startMessage);
	client.socket.send(inputMessage);
	await delay(20);
	assert.deepStrictEqual({ writes: remote.writes, messages: client.messages }, { writes: [], messages: [] });
	remote.openGate.resolve();
	await waitFor(() => remote.writes.flat().length === 2);
	remote.push({ messages: [pairingMessage, readyMessage] });
	await waitFor(() => client.messages.length === 2);
	const ack = JSON.stringify({ type: 'ack', chars: 3 });
	client.socket.send(ack);
	await waitFor(() => remote.writes.flat().length === 3);
	const finalMessages = [JSON.stringify({ type: 'data', data: 'bye' }), JSON.stringify({ type: 'exit', exitCode: 0 })];
	remote.push({ messages: finalMessages, closeCode: 1000 });
	assert.deepStrictEqual({
		closeCode: await client.closed,
		messages: client.messages,
		writes: remote.writes.flat(),
		closes: f.closes,
		errors: f.errors,
	}, {
		closeCode: 1000,
		messages: [pairingMessage, readyMessage, ...finalMessages],
		writes: [startMessage, inputMessage, ack],
		closes: 1,
		errors: [],
	});
	await assert.rejects(f.relay.start(), /already/);
});

test('local relay batches writes sequentially within byte and message limits', async t => {
	const remote = new FakeRemote(false);
	const f = await fixture(t, {}, remote);
	const client = await f.connect();
	const input = JSON.stringify({ type: 'input', data: 'x'.repeat(maxInputLength) });
	const messages = [startMessage, ...Array.from({ length: 250 }, () => JSON.stringify({ type: 'ack', chars: 1 })), ...Array.from({ length: 30 }, () => input)];
	for (const message of messages) {
		client.socket.send(message);
	}
	await delay(30);
	remote.writeGate = deferred<void>();
	remote.openGate.resolve();
	await waitFor(() => remote.writes.length === 1);
	await delay(20);
	assert.equal(remote.writes.length, 1);
	remote.writeGate.resolve();
	await waitFor(() => remote.writes.flat().length === messages.length);
	assert.deepStrictEqual(remote.writes.flat(), messages);
	assert.ok(remote.writes.every(batch => batch.length <= relayMaxBatchMessages && batch.reduce((sum, message) => sum + Buffer.byteLength(message), 0) <= relayMaxBatchBytes));
});

test('local relay rejects Origin, Authorization, invalid paths and duplicate clients without claiming the endpoint', async t => {
	const f = await fixture(t);
	const rejected = await Promise.all([
		denied(f.url, { origin: 'https://example.com' }),
		denied(f.url, { headers: { Origin: '' } }),
		denied(f.url, { headers: { Authorization: 'Bearer test' } }),
		denied(f.url.replace('/terminal', '/other')),
		denied(`${f.url}?redirect=elsewhere`),
	]);
	const httpStatus = await new Promise<number | undefined>((resolve, reject) => {
		get(f.url, response => {
			response.resume();
			resolve(response.statusCode);
		}).on('error', reject);
	});
	assert.deepStrictEqual({ rejected, httpStatus, opens: f.remote.opens }, { rejected: [403, 403, 403, 404, 404], httpStatus: 404, opens: 0 });
	const client = await f.connect();
	client.socket.send(startMessage);
	assert.equal(await denied(f.url), 409);
	client.socket.close();
	await client.closed;
	await waitFor(() => f.remote.closes === 1);
	await assert.rejects(denied(f.url), /ECONNREFUSED/);
});

for (const [label, payload] of [
	['input before start', inputMessage],
	['invalid client packet', '{"type":"launchShell"}'],
	['binary client packet', Buffer.from(startMessage)],
] as const) {
	test(`local relay rejects ${label}`, async t => {
		const f = await fixture(t);
		const client = await f.connect();
		client.socket.send(payload);
		assert.deepStrictEqual({ code: await client.closed, writes: f.remote.writes.length, errors: f.errors.length }, { code: 1011, writes: 0, errors: 1 });
	});
}

test('local relay rejects duplicate starts and stops the remote', async t => {
	const f = await fixture(t);
	const client = await f.connect();
	client.socket.send(startMessage);
	client.socket.send(startMessage);
	assert.equal(await client.closed, 1011);
	assert.ok(f.remote.closes >= 1);
	assert.match(f.errors[0].message, /already been started/);
});

for (const stage of ['opening', 'writing'] as const) {
	test(`local relay bounds all pending input while ${stage}`, async t => {
		const remote = new FakeRemote(stage !== 'opening');
		if (stage === 'writing') {
			remote.writeGate = deferred<void>();
		}
		const f = await fixture(t, {}, remote);
		const client = await f.connect();
		client.socket.send(startMessage);
		const message = JSON.stringify({ type: 'input', data: 'x'.repeat(maxInputLength) });
		for (let bytes = 0; bytes <= maxBufferedBytes; bytes += Buffer.byteLength(message)) {
			client.socket.send(message);
		}
		assert.equal(await client.closed, 1011);
		assert.match(f.errors[0].message, /buffer limit/);
		remote.openGate.resolve();
		remote.writeGate?.resolve();
		const writes = remote.writes.length;
		await delay(20);
		assert.equal(remote.writes.length, writes);
	});
}

for (const closeCode of [1001, 1008, 1006, 1011]) {
	test(`local relay maps remote close ${closeCode} without losing the final packet`, async t => {
		const f = await fixture(t);
		const client = await f.connect();
		client.socket.send(startMessage);
		const message = JSON.stringify({ type: 'error', message: 'Not approved' });
		f.remote.push({ messages: [message], closeCode });
		assert.deepStrictEqual({ code: await client.closed, messages: client.messages }, { code: closeCode === 1001 ? 1001 : 1011, messages: [message] });
	});
}

for (const batch of [
	{ messages: ['{"type":"invalid"}'] },
	{ messages: [JSON.stringify({ type: 'data', data: 'x'.repeat(relayMaxBatchBytes) })] },
	{ messages: Array.from({ length: relayMaxBatchMessages + 1 }, () => readyMessage) },
	{ messages: [], closeCode: 7 },
]) {
	test(`local relay validates remote batch ${JSON.stringify(batch).slice(0, 60)}`, async t => {
		const f = await fixture(t);
		const client = await f.connect();
		client.socket.send(startMessage);
		f.remote.push(batch);
		assert.deepStrictEqual({ code: await client.closed, messages: client.messages, errors: f.errors.length }, { code: 1011, messages: [], errors: 1 });
	});
}

test('local relay expires unused endpoints and closes remote state', async t => {
	const f = await fixture(t, { idleTimeoutMs: 20 });
	await waitFor(() => f.closes === 1);
	assert.deepStrictEqual({ opens: f.remote.opens, closes: f.remote.closes, errors: f.errors }, { opens: 0, closes: 1, errors: [] });
	await assert.rejects(denied(f.url), /ECONNREFUSED/);
});

test('local relay enforces the client start deadline', async t => {
	const f = await fixture(t, { startTimeoutMs: 25 });
	const client = await f.connect();
	assert.equal(await client.closed, 1011);
	assert.match(f.errors[0].message, /did not start/);
});

test('local relay handles heartbeat locally and detects a dead client', async t => {
	const f = await fixture(t, { heartbeatMs: 20 });
	const client = await f.connect({ autoPong: false });
	let pings = 0;
	client.socket.on('ping', () => { pings++; });
	client.socket.send(startMessage);
	assert.deepStrictEqual({ code: await client.closed, writes: f.remote.writes.flat(), pings }, { code: 1011, writes: [startMessage], pings: 1 });
	assert.match(f.errors[0].message, /stopped responding/);
});

test('local relay answers client pings locally and keeps healthy clients connected', async t => {
	const f = await fixture(t, { heartbeatMs: 15 });
	const client = await f.connect();
	client.socket.send(startMessage);
	const pong = once(client.socket, 'pong');
	client.socket.ping('local-only');
	await pong;
	await delay(70);
	assert.deepStrictEqual({ state: client.socket.readyState, writes: f.remote.writes.flat(), errors: f.errors }, { state: WebSocket.OPEN, writes: [startMessage], errors: [] });
});

for (const operation of ['open', 'read', 'write'] as const) {
	test(`local relay times out a hung remote ${operation}`, async t => {
		const remote = new FakeRemote(operation !== 'open');
		if (operation === 'write') {
			remote.writeGate = deferred<void>();
		}
		const f = await fixture(t, { [`${operation}TimeoutMs`]: 25 }, remote);
		const client = await f.connect();
		client.socket.send(startMessage);
		assert.equal(await client.closed, 1011);
		assert.match(f.errors[0].message, new RegExp(`${operation} operation timed out`));
		assert.ok(remote.closes >= 1);
		remote.openGate.resolve();
		remote.writeGate?.resolve();
	});
}

test('local relay closes late opens after disposal and never forwards stale queued writes', async t => {
	const remote = new FakeRemote(false);
	const f = await fixture(t, {}, remote);
	const client = await f.connect();
	client.socket.send(startMessage);
	client.socket.send(inputMessage);
	await delay(20);
	f.relay.dispose();
	f.relay.dispose();
	assert.equal(await client.closed, 1001);
	remote.openGate.resolve();
	await waitFor(() => remote.closes === 2);
	assert.deepStrictEqual({ writes: remote.writes, reads: remote.reads, closes: f.closes, errors: f.errors }, { writes: [], reads: 0, closes: 1, errors: [] });
});

test('local relay disposal cancels a pending read and ignores its late result', async t => {
	const f = await fixture(t);
	const client = await f.connect();
	client.socket.send(startMessage);
	await waitFor(() => f.remote.reads > 0);
	f.relay.dispose();
	f.remote.push({ messages: [readyMessage], closeCode: 1000 });
	assert.deepStrictEqual({ code: await client.closed, messages: client.messages }, { code: 1001, messages: [] });
});

test('local relay disposal prevents queued writes after an in-flight write completes', async t => {
	const remote = new FakeRemote();
	remote.writeGate = deferred<void>();
	const f = await fixture(t, {}, remote);
	const client = await f.connect();
	client.socket.send(startMessage);
	await waitFor(() => remote.writes.length === 1);
	client.socket.send(inputMessage);
	client.socket.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
	await delay(20);
	f.relay.dispose();
	remote.writeGate.resolve();
	await client.closed;
	await delay(20);
	assert.deepStrictEqual(remote.writes, [[startMessage]]);
});

test('local relay validation errors do not expose packet content in diagnostics', async t => {
	const f = await fixture(t);
	const client = await f.connect();
	client.socket.send(startMessage);
	f.remote.push({ messages: ['private-credential'] });
	assert.equal(await client.closed, 1011);
	assert.equal(f.errors[0].message, 'Invalid terminal server message.');
});

test('local relay reports remote close failures and timeouts after local cleanup', async t => {
	for (const timeout of [false, true]) {
		const remote = new FakeRemote();
		remote.closeGate = deferred<void>();
		const f = await fixture(t, { closeTimeoutMs: 20 }, remote);
		f.relay.dispose();
		if (!timeout) {
			remote.closeGate.reject(new Error('Rejected close'));
		}
		await waitFor(() => f.errors.length === 1);
		assert.match(f.errors[0].message, timeout ? /close operation timed out/ : /could not be closed/);
		await assert.rejects(denied(f.url), /ECONNREFUSED/);
	}
});

test('local relay can be disposed while its listener is starting', async () => {
	let closes = 0;
	const remote = new FakeRemote();
	const relay = new LocalRelay({ transport: remote, onError: () => { }, onClose: () => { closes++; } });
	const starting = relay.start();
	relay.dispose();
	await assert.rejects(starting, /stopped while starting/);
	assert.deepStrictEqual({ closes, remoteCloses: remote.closes }, { closes: 1, remoteCloses: 1 });
});
