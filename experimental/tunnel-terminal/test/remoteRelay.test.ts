/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { RemoteRelay } from '../src/remoteRelay';
import { maxBufferedBytes, protocolVersion } from '../src/protocol';
import { relayMaxBatchBytes, relayMaxBatchMessages, validateRelayBatch, validateRelayMessages, validateSessionId } from '../src/relayProtocol';

async function setup(t: TestContext, options: { pollMs?: number; leaseMs?: number } = {}) {
	const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
	t.after(() => {
		for (const client of server.clients) { client.terminate(); }
		server.close();
	});
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	const errors: Error[] = [];
	let expired = false;
	const relay = new RemoteRelay(`http://127.0.0.1:${address.port}/terminal`, {
		onError: error => errors.push(error),
		onLeaseExpired: () => { expired = true; },
		pollMs: options.pollMs ?? 20,
		leaseMs: options.leaseMs ?? 10_000,
	});
	t.after(() => relay.dispose());
	const connected = new Promise<WebSocket>(resolve => server.once('connection', resolve));
	await relay.open();
	const socket = await connected;
	return { relay, socket, errors, get expired() { return expired; } };
}

test('relay command input validation bounds messages, IDs and close statuses', () => {
	assert.doesNotThrow(() => validateSessionId('12345678-1234-1234-1234-123456789abc'));
	for (const id of [null, '', 'expired', 1]) {
		assert.throws(() => validateSessionId(id));
	}
	for (const batch of [null, {}, [5], ['x'.repeat(relayMaxBatchBytes + 1)], Array(relayMaxBatchMessages + 1).fill('')]) {
		assert.throws(() => validateRelayMessages(batch));
	}
	for (const batch of [{}, { messages: [], closeCode: 999 }, { messages: [], closeCode: '1000' }]) {
		assert.throws(() => validateRelayBatch(batch));
	}
	assert.doesNotThrow(() => validateRelayBatch({ messages: ['hello'], closeCode: 1000 }));
});

test('remote relay returns ordered data and preserves normal closure', async t => {
	const state = await setup(t);
	const messages = [
		JSON.stringify({ type: 'pairing', version: protocolVersion, code: '1234-ABCD-5678' }),
		JSON.stringify({ type: 'ready', version: protocolVersion }),
		JSON.stringify({ type: 'data', data: 'hello' }),
		JSON.stringify({ type: 'exit', exitCode: 7 }),
	];
	for (const message of messages) { state.socket.send(message); }
	state.socket.close(1000);
	const received: string[] = [];
	let closeCode: number | undefined;
	while (closeCode === undefined) {
		const batch = await state.relay.read();
		received.push(...batch.messages);
		closeCode = batch.closeCode;
	}
	assert.deepStrictEqual({ received, closeCode, errors: state.errors }, { received: messages, closeCode: 1000, errors: [] });
});

test('remote relay writes input batches in order and validates every message first', async t => {
	const state = await setup(t);
	const messages = [
		JSON.stringify({ type: 'start', version: protocolVersion, cols: 80, rows: 24 }),
		JSON.stringify({ type: 'input', data: 'hello\r' }),
		JSON.stringify({ type: 'resize', cols: 120, rows: 40 }),
	];
	const received: string[] = [];
	const done = new Promise<void>(resolve => state.socket.on('message', raw => {
		received.push(raw.toString());
		if (received.length === messages.length) { resolve(); }
	}));
	await assert.rejects(state.relay.write([messages[0], '{}']), /Invalid terminal client message/);
	await state.relay.write(messages);
	await done;
	assert.deepStrictEqual(received, messages);
});

test('idle poll resolves and simultaneous reads are rejected', async t => {
	const state = await setup(t);
	const pending = state.relay.read();
	assert.throws(() => state.relay.read(), /one remote relay read/);
	assert.deepStrictEqual(await pending, { messages: [] });
});

test('disposal settles a pending read and rejects further writes', async t => {
	const state = await setup(t);
	const pending = state.relay.read();
	state.relay.dispose();
	assert.deepStrictEqual(await pending, { messages: [], closeCode: 1001 });
	await assert.rejects(state.relay.write([]), /not connected/);
});

test('loss of polling expires the remote lease even when writes continue', async t => {
	const state = await setup(t, { leaseMs: 60 });
	const closed = once(state.socket, 'close');
	await state.relay.write([JSON.stringify({ type: 'input', data: 'input' })]);
	await closed;
	assert.deepStrictEqual({ expired: state.expired, errors: state.errors.length, batch: await state.relay.read() }, {
		expired: true, errors: 1, batch: { messages: [], closeCode: 1011 },
	});
});

test('polling renews the remote lease', async t => {
	const state = await setup(t, { leaseMs: 80, pollMs: 10 });
	for (let index = 0; index < 10; index++) { await state.relay.read(); }
	assert.deepStrictEqual({ expired: state.expired, errors: state.errors }, { expired: false, errors: [] });
});

for (const [name, payload] of [['invalid JSON', '{'], ['binary', Buffer.from('binary')]] as const) {
	test(`invalid remote ${name} fails the relay`, async t => {
		const state = await setup(t);
		const pending = state.relay.read();
		state.socket.send(payload);
		assert.deepStrictEqual(await pending, { messages: [], closeCode: 1011 });
		assert.equal(state.errors.length, 1);
	});
}

test('output queue is bounded when the companion stops draining it', async t => {
	const state = await setup(t);
	const message = JSON.stringify({ type: 'data', data: 'x'.repeat(64 * 1024) });
	const closed = once(state.socket, 'close');
	for (let bytes = 0; bytes < maxBufferedBytes + message.length; bytes += message.length) {
		state.socket.send(message);
	}
	await closed;
	let total = 0;
	let code: number | undefined;
	do {
		const batch = await state.relay.read();
		validateRelayBatch(batch);
		total += batch.messages.reduce((sum, data) => sum + Buffer.byteLength(data), 0);
		code = batch.closeCode;
	} while (code === undefined);
	assert.ok(total <= maxBufferedBytes);
	assert.deepStrictEqual({ code, errors: state.errors.length }, { code: 1011, errors: 1 });
});

test('opening a disposed relay cannot establish a connection', async t => {
	const relay = new RemoteRelay('http://127.0.0.1:1/terminal', { onError: assert.fail, onLeaseExpired: assert.fail });
	t.after(() => relay.dispose());
	relay.dispose();
	await assert.rejects(relay.open(), /already been opened or closed/);
});

test('transport cannot be redirected to an arbitrary URL', async () => {
	const relay = new RemoteRelay('https://example.com/terminal', { onError: assert.fail, onLeaseExpired: assert.fail });
	await assert.rejects(relay.open(), /own loopback bridge/);
	relay.dispose();
});

test('close during connection settles open without unhandled errors', async t => {
	const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
	await once(server, 'listening');
	t.after(() => server.close());
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	const relay = new RemoteRelay(`http://127.0.0.1:${address.port}/terminal`, { onError: () => {}, onLeaseExpired: assert.fail });
	const open = relay.open();
	relay.dispose();
	await assert.rejects(open);
	await delay(5);
});
