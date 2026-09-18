/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { spawn, type IPty } from 'node-pty';
import type WebSocket from 'ws';
import { runTerminal } from '../src/terminal.js';
import { record, text } from '../src/wire.js';
import { action, Input, messages, Output, peer, reply, rpc } from './helpers.js';

async function fixture(t: TestContext, options: {
	snapshotContent?: string;
	exited?: boolean;
	onSubscribe?(socket: WebSocket, channel: string): void;
	onAction?(socket: WebSocket, channel: string, value: Record<string, unknown>): void;
} = {}) {
	const requests: string[] = [];
	const actions: Record<string, unknown>[] = [];
	const connection = await peer(t, socket => messages(socket, (message, params) => {
		requests.push(text(message.method, 'method'));
		const channel = text(params.channel, 'channel');
		switch (message.method) {
			case 'initialize':
				assert.deepEqual(params.protocolVersions, ['0.9.0']);
				reply(socket, message, { protocolVersion: '0.9.0', serverSeq: 0, snapshots: [] });
				break;
			case 'createTerminal':
				assert.match(channel, /^agenthost-terminal:\//);
				reply(socket, message, null);
				break;
			case 'disposeTerminal':
				reply(socket, message, null);
				break;
			case 'subscribe':
				action(socket, channel, 2, { type: 'terminal/data', data: 'already-in-snapshot' });
				reply(socket, message, { snapshot: {
					resource: channel,
					fromSeq: 2,
					state: {
						content: [{ type: 'unclassified', value: options.snapshotContent ?? '' }],
						lifecycle: options.exited ? { status: 'exited', exitCode: 4 } : { status: 'running' },
					},
				} });
				options.onSubscribe?.(socket, channel);
				break;
			case 'dispatchAction': {
				const value = record(params.action, 'action');
				actions.push(value);
				options.onAction?.(socket, channel, value);
				break;
			}
		}
	}));
	const input = new Input();
	const output = new Output();
	const signals = new EventEmitter();
	t.after(() => { input.destroy(); output.destroy(); });
	const client = rpc(t, connection);
	return { input, output, signals, client, requests, actions };
}

test('renders snapshot once, ordered streaming output, and propagates exit status', { timeout: 5000 }, async t => {
	const state = await fixture(t, {
		snapshotContent: 'initial',
		onSubscribe(socket, channel) {
			action(socket, channel, 3, { type: 'terminal/data', data: ' next' });
			action(socket, channel, 4, { type: 'terminal/exited', exitCode: 7 });
		},
	});
	const code = await runTerminal(state.client, state);
	assert.deepEqual({ code, output: state.output.value, requests: state.requests, raw: state.input.isRaw }, {
		code: 7, output: 'initial next', requests: ['initialize', 'createTerminal', 'subscribe', 'disposeTerminal'], raw: false,
	});
});

test('handles a shell that already exited before subscription', { timeout: 5000 }, async t => {
	const state = await fixture(t, { exited: true, snapshotContent: 'finished' });
	assert.deepEqual({ code: await runTerminal(state.client, state), output: state.output.value }, { code: 4, output: 'finished' });
});

test('forwards Unicode input and Ctrl+C, resizes, and uses Ctrl+] only for local exit', { timeout: 5000 }, async t => {
	const state = await fixture(t);
	const raw = once(state.input, 'raw');
	const done = runTerminal(state.client, state);
	await raw;
	const bytes = Buffer.from('hello \u{1F600}\x03');
	state.input.write(bytes.subarray(0, 8));
	state.input.write(bytes.subarray(8));
	state.output.columns = 120;
	state.output.rows = 40;
	state.output.emit('resize');
	state.input.write('\x1d');
	assert.equal(await done, 0);
	assert.deepEqual({
		input: state.actions.filter(value => value.type === 'terminal/input').map(value => value.data).join(''),
		sizes: state.actions.filter(value => value.type === 'terminal/resized'),
		listeners: ['data', 'error', 'end', 'close'].map(event => state.input.listenerCount(event)),
		signals: state.signals.eventNames(),
		raw: state.input.isRaw,
	}, {
		input: 'hello \u{1F600}\x03',
		sizes: [{ type: 'terminal/resized', cols: 100, rows: 30 }, { type: 'terminal/resized', cols: 120, rows: 40 }],
		listeners: [0, 0, 0, 0], signals: [], raw: false,
	});
});

test('large pasted input does not split a surrogate pair', { timeout: 5000 }, async t => {
	const state = await fixture(t);
	const raw = once(state.input, 'raw');
	const done = runTerminal(state.client, state);
	await raw;
	const input = 'x'.repeat(4095) + '\u{1F600}' + 'y';
	state.input.write(input);
	state.input.write('\x1d');
	await done;
	const chunks = state.actions.filter(value => value.type === 'terminal/input').map(value => text(value.data, 'input'));
	assert.deepEqual(chunks, ['x'.repeat(4095), '\u{1F600}y']);
});

test('termination restores an already-raw terminal and requests remote disposal', { timeout: 5000 }, async t => {
	const state = await fixture(t);
	state.input.isRaw = true;
	const raw = once(state.input, 'raw');
	const done = runTerminal(state.client, state);
	await raw;
	state.signals.emit('SIGTERM');
	assert.deepEqual({ code: await done, raw: state.input.isRaw, lastRequest: state.requests.at(-1) }, {
		code: 143, raw: true, lastRequest: 'disposeTerminal',
	});
});

test('action rejection is not silently dropped', { timeout: 5000 }, async t => {
	const state = await fixture(t, {
		onSubscribe(socket, channel) {
			action(socket, channel, 3, { type: 'terminal/resized', cols: 80, rows: 24 }, 'Not the terminal owner');
		},
	});
	await assert.rejects(runTerminal(state.client, state), /Not the terminal owner/);
	assert.equal(state.input.isRaw, false);
});

test('disconnect reports uncertain remote cleanup and restores local terminal', { timeout: 5000 }, async t => {
	const state = await fixture(t, { onSubscribe: socket => socket.close() });
	await assert.rejects(runTerminal(state.client, state), /shell may still be running/);
	assert.equal(state.input.isRaw, false);
});

test('PTY end-to-end: run a real shell over WebSocket/AHP, forward resize and return exit status', { timeout: 20_000 }, async t => {
	let pty: IPty | undefined;
	let channel = '';
	let content = '';
	let subscribed = false;
	let seq = 0;
	let exited: number | undefined;
	let disposed = false;
	const listeners: { dispose(): void }[] = [];
	t.after(() => {
		for (const listener of listeners) { listener.dispose(); }
		if (pty && !disposed) { pty.kill(); }
	});
	const connection = await peer(t, socket => messages(socket, (message, params) => {
		switch (message.method) {
			case 'initialize':
				reply(socket, message, { protocolVersion: '0.9.0', snapshots: [], serverSeq: 0 });
				break;
			case 'createTerminal':
				channel = text(params.channel, 'terminal URI');
				pty = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', process.platform === 'win32' ? ['/Q'] : [], {
					name: 'xterm-256color',
					cols: 100,
					rows: 30,
					cwd: process.cwd(),
					env: process.env,
				});
				listeners.push(pty.onData(data => {
					content += data;
					seq++;
					if (subscribed) { action(socket, channel, seq, { type: 'terminal/data', data }); }
				}), pty.onExit(event => {
					exited = event.exitCode;
					seq++;
					if (subscribed) { action(socket, channel, seq, { type: 'terminal/exited', exitCode: exited }); }
				}));
				reply(socket, message, null);
				break;
			case 'subscribe':
				subscribed = true;
				reply(socket, message, { snapshot: {
					resource: channel, fromSeq: seq, state: {
						content: [{ type: 'unclassified', value: content }],
						lifecycle: exited === undefined ? { status: 'running' } : { status: 'exited', exitCode: exited },
					},
				} });
				break;
			case 'dispatchAction': {
				const value = record(params.action, 'action');
				if (value.type === 'terminal/input') { pty?.write(text(value.data, 'input')); }
				if (value.type === 'terminal/resized') { pty?.resize(Number(value.cols), Number(value.rows)); }
				break;
			}
			case 'disposeTerminal':
				disposed = true;
				pty?.kill();
				reply(socket, message, null);
				break;
		}
	}));
	const input = new Input();
	const output = new Output();
	t.after(() => { input.destroy(); output.destroy(); });
	const ready = once(input, 'raw');
	const done = runTerminal(rpc(t, connection), { input, output, signals: new EventEmitter() });
	await ready;
	input.write('echo TUNNEL_PTY_SUCCESS\rexit 7\r');
	assert.equal(await done, 7);
	assert.match(output.value, /TUNNEL_PTY_SUCCESS/);
	assert.deepEqual({ disposed, raw: input.isRaw }, { disposed: true, raw: false });
});
