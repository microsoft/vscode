/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { TerminalBridge, type BridgeCloseReason, type BridgeOptions } from '../src/bridge';
import { outputHighWatermark, outputLowWatermark, parseClientMessage, parseServerMessage, protocolVersion, type ClientMessage, type ServerMessage } from '../src/protocol';
import { FakePty } from './helpers/fakePty';

async function setup(t: TestContext, options: Partial<BridgeOptions> = {}) {
	const pty = new FakePty();
	const errors: Error[] = [];
	const closed: BridgeCloseReason[] = [];
	const starts: number[][] = [];
	const approvals: string[] = [];
	let resolveClosed: () => void = () => {};
	const done = new Promise<void>(resolve => { resolveClosed = resolve; });
	const bridge = new TerminalBridge({
		spawn: (cols, rows) => { starts.push([cols, rows]); return pty; },
		approve: async code => { approvals.push(code); return true; },
		onError: error => errors.push(error),
		onClose: reason => { closed.push(reason); resolveClosed(); },
		...options,
	});
	t.after(() => bridge.dispose());
	const connection = await bridge.start();
	async function connect() {
		const socket = new WebSocket(connection.url.replace(/^http/, 'ws'));
		t.after(() => socket.terminate());
		const messages: ServerMessage[] = [];
		socket.on('message', data => messages.push(parseServerMessage(data.toString())));
		await once(socket, 'open');
		send(socket, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
		await eventually(() => messages.some(message => message.type === 'ready' || message.type === 'error'));
		return { socket, messages };
	}
	return { bridge, pty, starts, connection, connect, errors, closed, done, approvals };
}

function send(socket: WebSocket, message: ClientMessage): void {
	socket.send(JSON.stringify(message));
}

async function eventually(check: () => boolean): Promise<void> {
	for (let i = 0; i < 100; i++) {
		if (check()) {
			return;
		}
		await delay(10);
	}
	assert.fail('Timed out waiting for a bridge event.');
}

test('validates protocol dimensions, versions and payloads', () => {
	assert.deepStrictEqual(parseClientMessage('{"type":"start","version":2,"cols":80,"rows":24}'), { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	for (const value of [
		null, [], {}, { type: 'start', version: 1, cols: 80, rows: 24 },
		{ type: 'resize', cols: 0, rows: 24 }, { type: 'resize', cols: 1001, rows: 24 },
		{ type: 'resize', cols: 80, rows: 1.5 }, { type: 'ack', chars: -1 },
		{ type: 'input', data: 'x'.repeat(16 * 1024 + 1) },
	]) {
		assert.throws(() => parseClientMessage(JSON.stringify(value)));
	}
	assert.throws(() => parseServerMessage('{"type":"exit","exitCode":-1}'));
});

test('origin and legacy-auth rejection do not spawn or consume a session', async t => {
	const state = await setup(t);
	for (const headers of [
		{ Authorization: `Bearer ${'x'.repeat(64)}` },
		{ Origin: 'https://example.com' },
	]) {
		const socket = new WebSocket(state.connection.url, { headers });
		t.after(() => socket.terminate());
		const error = await once(socket, 'error');
		assert.match(String(error[0]), /403/);
	}
	await state.connect();
	assert.deepStrictEqual({ starts: state.starts, errors: state.errors }, { starts: [[80, 24]], errors: [] });
});

test('relays input, resize, output and exit only after output is acknowledged', async t => {
	const state = await setup(t);
	const { socket, messages } = await state.connect();
	send(socket, { type: 'input', data: 'hello\r\u0003' });
	send(socket, { type: 'resize', cols: 132, rows: 43 });
	await eventually(() => state.pty.sizes.length > 0);
	state.pty.data('hello');
	state.pty.exit(7);
	await eventually(() => messages.length === 3);
	assert.deepStrictEqual(messages, [
		{ type: 'pairing', version: protocolVersion, code: state.approvals[0] },
		{ type: 'ready', version: protocolVersion }, { type: 'data', data: 'hello' },
	]);
	send(socket, { type: 'ack', chars: 5 });
	await state.done;
	assert.deepStrictEqual({
		writes: state.pty.writes, sizes: state.pty.sizes, kills: state.pty.kills,
		listeners: state.pty.listenerCount, closed: state.closed, errors: state.errors, messages,
	}, {
		writes: ['hello\r\u0003'], sizes: [[132, 43]], kills: 0, listeners: 0,
		closed: ['exited'], errors: [], messages: [
			{ type: 'pairing', version: protocolVersion, code: state.approvals[0] },
			{ type: 'ready', version: protocolVersion }, { type: 'data', data: 'hello' }, { type: 'exit', exitCode: 7 },
		],
	});
});

test('pauses and resumes the PTY at the output acknowledgement thresholds', async t => {
	const state = await setup(t);
	const { socket, messages } = await state.connect();
	state.pty.data('x'.repeat(outputHighWatermark));
	await eventually(() => messages.length === 3);
	send(socket, { type: 'ack', chars: outputHighWatermark - outputLowWatermark - 1 });
	send(socket, { type: 'resize', cols: 80, rows: 24 });
	await eventually(() => state.pty.sizes.length === 1);
	assert.deepStrictEqual({ pauses: state.pty.pauses, resumes: state.pty.resumes }, { pauses: 1, resumes: 0 });
	send(socket, { type: 'ack', chars: 1 });
	await eventually(() => state.pty.resumes === 1);
	assert.deepStrictEqual({ pauses: state.pty.pauses, resumes: state.pty.resumes, errors: state.errors }, { pauses: 1, resumes: 1, errors: [] });
});

test('disconnect kills the shell and removes listeners exactly once', async t => {
	const state = await setup(t);
	const { socket } = await state.connect();
	socket.close();
	await state.done;
	state.bridge.dispose();
	assert.deepStrictEqual({ kills: state.pty.kills, listeners: state.pty.listenerCount, closed: state.closed }, { kills: 1, listeners: 0, closed: ['disconnected'] });
});

test('stop closes a connected client and terminates its shell', async t => {
	const state = await setup(t);
	const { socket } = await state.connect();
	const closed = once(socket, 'close');
	state.bridge.dispose();
	await closed;
	assert.deepStrictEqual({ kills: state.pty.kills, closed: state.closed }, { kills: 1, closed: ['stopped'] });
});

test('refuses a second client', async t => {
	const state = await setup(t);
	await state.connect();
	const second = new WebSocket(state.connection.url);
	t.after(() => second.terminate());
	const error = await once(second, 'error');
	assert.match(String(error[0]), /409/);
	assert.deepStrictEqual(state.starts, [[80, 24]]);
});

test('invalid acknowledgements fail explicitly and kill the shell', async t => {
	const state = await setup(t);
	const { socket } = await state.connect();
	send(socket, { type: 'ack', chars: 1 });
	await state.done;
	assert.deepStrictEqual({ errors: state.errors.map(error => error.message), kills: state.pty.kills, closed: state.closed }, {
		errors: ['Invalid terminal output acknowledgement.'], kills: 1, closed: ['error'],
	});
});

for (const [name, message] of [
	['malformed JSON', '{'],
	['binary input', Buffer.from('input')],
	['duplicate start', JSON.stringify({ type: 'start', version: protocolVersion, cols: 80, rows: 24 })],
] as const) {
	test(`rejects ${name} and disposes the session`, async t => {
		const state = await setup(t);
		const { socket } = await state.connect();
		socket.send(message);
		await state.done;
		assert.deepStrictEqual({ errors: state.errors.length, kills: state.pty.kills, closed: state.closed }, { errors: 1, kills: 1, closed: ['error'] });
	});
}

test('reports spawn failure without claiming a successful session', async t => {
	const state = await setup(t, { spawn: () => { throw new Error('missing shell'); } });
	await state.connect();
	await state.done;
	assert.deepStrictEqual({ errors: state.errors.map(error => error.message), closed: state.closed }, { errors: ['missing shell'], closed: ['error'] });
});

test('expires an unused bridge without starting a shell', async t => {
	const state = await setup(t, { idleTimeoutMs: 20 });
	await state.done;
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors }, { starts: [], closed: ['expired'], errors: [] });
});

test('times out a client that never requests pairing', async t => {
	const state = await setup(t, { startTimeoutMs: 20 });
	const socket = new WebSocket(state.connection.url);
	t.after(() => socket.terminate());
	await once(socket, 'open');
	await state.done;
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors.length }, { starts: [], closed: ['error'], errors: 1 });
});

test('heartbeat detects an unresponsive client and terminates its shell', async t => {
	const state = await setup(t, { heartbeatMs: 30 });
	const socket = new WebSocket(state.connection.url, { autoPong: false });
	t.after(() => socket.terminate());
	await once(socket, 'open');
	send(socket, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await state.done;
	assert.deepStrictEqual({ kills: state.pty.kills, closed: state.closed, errors: state.errors.length }, { kills: 1, closed: ['error'], errors: 1 });
});

test('bounds output even if the PTY produces data after being paused', async t => {
	const state = await setup(t);
	await state.connect();
	state.pty.data('x'.repeat(1024 * 1024 + 1));
	await state.done;
	assert.deepStrictEqual({ kills: state.pty.kills, closed: state.closed, errors: state.errors.length }, { kills: 1, closed: ['error'], errors: 1 });
});

test('stopping during startup settles the pending start and removes its listener', async () => {
	const bridge = new TerminalBridge({ spawn: () => new FakePty(), approve: async () => true, onError: assert.fail, onClose: () => {} });
	const started = bridge.start();
	bridge.dispose();
	await assert.rejects(started, /stopped while starting/);
});

test('a bridge cannot be started twice', async t => {
	const state = await setup(t);
	await assert.rejects(state.bridge.start(), /already been started/);
});

test('input before start is rejected without creating a shell', async t => {
	const state = await setup(t);
	const socket = new WebSocket(state.connection.url);
	t.after(() => socket.terminate());
	await once(socket, 'open');
	send(socket, { type: 'input', data: 'not a shell yet' });
	await state.done;
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors.length }, { starts: [], closed: ['error'], errors: 1 });
});

test('pairing displays the same code to both sides and never spawns before approval', async t => {
	let allow: (value: boolean) => void = () => {};
	let approvalCode = '';
	const state = await setup(t, {
		approve: code => {
			approvalCode = code;
			return new Promise<boolean>(resolve => { allow = resolve; });
		},
	});
	const socket = new WebSocket(state.connection.url);
	t.after(() => socket.terminate());
	const messages: ServerMessage[] = [];
	socket.on('message', raw => messages.push(parseServerMessage(raw.toString())));
	await once(socket, 'open');
	send(socket, { type: 'start', version: protocolVersion, cols: 92, rows: 28 });
	await eventually(() => messages.length === 1);
	assert.match(approvalCode, /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
	assert.deepStrictEqual({ starts: state.starts, messages }, { starts: [], messages: [{ type: 'pairing', version: protocolVersion, code: approvalCode }] });
	allow(true);
	await eventually(() => messages.length === 2);
	assert.deepStrictEqual({ starts: state.starts, ready: messages[1] }, { starts: [[92, 28]], ready: { type: 'ready', version: protocolVersion } });
});

test('denied pairing never creates a shell and closes the attempt', async t => {
	const state = await setup(t, { approve: async () => false });
	await state.connect();
	await state.done;
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors.map(error => error.message) }, {
		starts: [], closed: ['error'], errors: ['The connection request was not approved.'],
	});
});

test('approval callback failure is surfaced without creating a shell', async t => {
	const state = await setup(t, { approve: async () => { throw new Error('approval UI failed'); } });
	await state.connect();
	await state.done;
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors.map(error => error.message) }, {
		starts: [], closed: ['error'], errors: ['approval UI failed'],
	});
});

test('approval after expiry cannot create a shell', async t => {
	let allow: (value: boolean) => void = () => {};
	const state = await setup(t, { approvalTimeoutMs: 25, approve: () => new Promise<boolean>(resolve => { allow = resolve; }) });
	const socket = new WebSocket(state.connection.url);
	t.after(() => socket.terminate());
	await once(socket, 'open');
	send(socket, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await state.done;
	allow(true);
	await delay(10);
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors.map(error => error.message) }, {
		starts: [], closed: ['error'], errors: ['Connection approval timed out.'],
	});
});

test('approval after disconnect cannot create a shell', async t => {
	let allow: (value: boolean) => void = () => {};
	const state = await setup(t, { approve: () => new Promise<boolean>(resolve => { allow = resolve; }) });
	const socket = new WebSocket(state.connection.url);
	t.after(() => socket.terminate());
	await once(socket, 'open');
	const pairing = once(socket, 'message');
	send(socket, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await pairing;
	socket.close();
	await state.done;
	allow(true);
	await delay(10);
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors }, { starts: [], closed: ['disconnected'], errors: [] });
});

test('input while approval is pending fails without starting the shell', async t => {
	let allow: (value: boolean) => void = () => {};
	const state = await setup(t, { approve: () => new Promise<boolean>(resolve => { allow = resolve; }) });
	const socket = new WebSocket(state.connection.url);
	t.after(() => socket.terminate());
	await once(socket, 'open');
	const pairing = once(socket, 'message');
	send(socket, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await pairing;
	send(socket, { type: 'input', data: 'not approved' });
	await state.done;
	allow(true);
	await delay(10);
	assert.deepStrictEqual({ starts: state.starts, closed: state.closed, errors: state.errors.length }, { starts: [], closed: ['error'], errors: 1 });
});
