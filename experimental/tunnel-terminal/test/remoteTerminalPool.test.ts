/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { RemoteTerminalPool, TerminalApprovalGate, type RemoteTerminalPoolOptions } from '../src/remoteTerminalPool';
import { parseServerMessage, protocolVersion, type ClientMessage, type ServerMessage } from '../src/protocol';
import { maxTerminalSessions } from '../src/relayProtocol';
import { FakePty } from './helpers/fakePty';

function setup(t: TestContext, options: Partial<RemoteTerminalPoolOptions> = {}) {
	const ptys: FakePty[] = [];
	const errors: Error[] = [];
	const pool = new RemoteTerminalPool({
		spawn: () => {
			const pty = new FakePty();
			ptys.push(pty);
			return pty;
		},
		approve: async () => true,
		onError: error => errors.push(error),
		pollMs: 10,
		...options,
	});
	t.after(() => pool.dispose());
	const write = (id: string, message: ClientMessage) => pool.getRelay(id).write([JSON.stringify(message)]);
	const read = async (id: string, type: ServerMessage['type']) => {
		const messages: ServerMessage[] = [];
		while (!messages.some(message => message.type === type)) {
			const batch = await pool.getRelay(id).read();
			messages.push(...batch.messages.map(parseServerMessage));
			assert.ok(batch.closeCode === undefined || messages.some(message => message.type === type), `Closed without ${type}`);
		}
		return messages;
	};
	const start = async (id = randomUUID()) => {
		await pool.open(id);
		await write(id, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
		await read(id, 'ready');
		return id;
	};
	return { pool, ptys, errors, start, write, read };
}

test('remote pool isolates simultaneous shell input, output and dimensions', async t => {
	const state = setup(t);
	const first = await state.start();
	const second = await state.start();
	await state.write(first, { type: 'input', data: 'first input' });
	await state.write(second, { type: 'input', data: 'second input' });
	await state.write(second, { type: 'resize', cols: 120, rows: 40 });
	state.ptys[0].data('FIRST');
	state.ptys[1].data('SECOND');
	const firstOutput = await state.read(first, 'data');
	const secondOutput = await state.read(second, 'data');
	assert.deepStrictEqual({
		writes: state.ptys.map(pty => pty.writes), sizes: state.ptys.map(pty => pty.sizes),
		firstOutput, secondOutput, errors: state.errors,
	}, {
		writes: [['first input'], ['second input']], sizes: [[], [[120, 40]]],
		firstOutput: [{ type: 'data', data: 'FIRST' }], secondOutput: [{ type: 'data', data: 'SECOND' }], errors: [],
	});
});

test('one shell exit leaves its sibling alive and permits another session', async t => {
	const state = setup(t);
	const first = await state.start();
	const second = await state.start();
	state.ptys[0].exit(7);
	await state.read(first, 'exit');
	state.pool.close(first);
	await state.write(second, { type: 'input', data: 'still alive' });
	const third = await state.start();
	state.pool.close(third);
	assert.deepStrictEqual({ count: state.ptys.length, kills: state.ptys.map(pty => pty.kills), siblingInput: state.ptys[1].writes }, {
		count: 3, kills: [0, 0, 1], siblingInput: ['still alive'],
	});
});

test('exactly ten concurrent shells are allowed and closing one releases capacity', async t => {
	const state = setup(t);
	const ids: string[] = [];
	for (let index = 0; index < maxTerminalSessions; index++) {
		ids.push(await state.start());
	}
	await assert.rejects(state.pool.open(randomUUID()), /already has 10 sessions/);
	state.pool.close(ids[4]);
	await state.start();
	assert.deepStrictEqual({ count: state.ptys.length, kills: state.ptys.reduce((count, pty) => count + pty.kills, 0), errors: state.errors }, { count: 11, kills: 1, errors: [] });
});

test('one pending approval is allowed, including a disconnected but still visible dialog', async t => {
	let approve: (value: boolean) => void = () => {};
	let prompt = true;
	const state = setup(t, { approve: () => prompt ? new Promise<boolean>(resolve => { approve = resolve; }) : Promise.resolve(true) });
	const first = randomUUID();
	await state.pool.open(first);
	await state.write(first, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await state.read(first, 'pairing');
	await assert.rejects(state.pool.open(randomUUID()), /awaiting approval/);
	state.pool.close(first);
	await assert.rejects(state.pool.open(randomUUID()), /awaiting approval/);
	prompt = false;
	approve(true);
	await delay(0);
	await state.start();
	assert.deepStrictEqual({ spawned: state.ptys.length, errors: state.errors }, { spawned: 1, errors: [] });
});

test('denial closes only that attempt and allows a later approved client', async t => {
	let allowed = false;
	const state = setup(t, { approve: async () => allowed });
	const denied = randomUUID();
	await state.pool.open(denied);
	await state.write(denied, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await state.read(denied, 'error');
	state.pool.close(denied);
	allowed = true;
	await state.start();
	assert.deepStrictEqual({ spawned: state.ptys.length, errors: state.errors.length }, { spawned: 1, errors: 1 });
});

test('a stale approval after timeout cannot start a shell', async t => {
	let approve: (value: boolean) => void = () => {};
	const state = setup(t, { approvalTimeoutMs: 25, approve: () => new Promise<boolean>(resolve => { approve = resolve; }) });
	const id = randomUUID();
	await state.pool.open(id);
	await state.write(id, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await state.read(id, 'error');
	approve(true);
	await delay(10);
	assert.deepStrictEqual({ spawned: state.ptys.length, errors: state.errors.length }, { spawned: 0, errors: 1 });
});

test('stopping a pool kills all shells, settles reads and refuses new clients', async t => {
	const state = setup(t);
	const first = await state.start();
	const second = await state.start();
	const readFirst = state.pool.getRelay(first).read();
	const readSecond = state.pool.getRelay(second).read();
	state.pool.dispose();
	const results = await Promise.all([readFirst, readSecond]);
	await assert.rejects(state.pool.open(randomUUID()), /stopped/);
	assert.deepStrictEqual({ kills: state.ptys.map(pty => pty.kills), results }, { kills: [1, 1], results: [{ messages: [], closeCode: 1001 }, { messages: [], closeCode: 1001 }] });
});

test('lease expiry kills only the non-reading session', async t => {
	const state = setup(t, { leaseMs: 80, pollMs: 10 });
	const first = await state.start();
	const second = await state.start();
	for (let index = 0; index < 12; index++) { await state.pool.getRelay(second).read(); }
	assert.throws(() => state.pool.getRelay(first), /not connected/);
	assert.deepStrictEqual(state.ptys.map(pty => pty.kills), [1, 0]);
});

test('closed sessions are released after a bounded final-output retention period', async t => {
	const state = setup(t, { retentionMs: 25 });
	const id = await state.start();
	state.ptys[0].exit(0);
	await state.read(id, 'exit');
	await delay(80);
	assert.throws(() => state.pool.getRelay(id), /not connected/);
});

test('a pending dialog continues to gate approval across bridge restarts', async t => {
	const gate = new TerminalApprovalGate();
	let approve: (value: boolean) => void = () => {};
	const first = setup(t, { approvalGate: gate, approve: () => new Promise<boolean>(resolve => { approve = resolve; }) });
	const id = randomUUID();
	await first.pool.open(id);
	await first.write(id, { type: 'start', version: protocolVersion, cols: 80, rows: 24 });
	await first.read(id, 'pairing');
	first.pool.dispose();
	const second = setup(t, { approvalGate: gate });
	await assert.rejects(second.pool.open(randomUUID()), /awaiting approval/);
	approve(true);
	await delay(0);
	await second.start();
	assert.deepStrictEqual([first.ptys.length, second.ptys.length], [0, 1]);
});
