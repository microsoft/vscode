/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { spawn, type IPty } from 'node-pty';
import type WebSocket from 'ws';
import { runTerminal } from '../src/terminal.js';
import { disableWin32InputMode } from '../src/terminalModes.js';
import { record, text } from '../src/wire.js';
import { action, Input, messages, Output, peer, reply, rpc } from './helpers.js';

async function fixture(t: TestContext, options: {
	snapshotContent?: string;
	exited?: boolean;
	title?: string;
	input?: Input;
	output?: Output;
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
						title: options.title,
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
	const input = options.input ?? new Input();
	const output = options.output ?? new Output();
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
		code: 7, output: `initial next${disableWin32InputMode}`, requests: ['initialize', 'createTerminal', 'subscribe', 'disposeTerminal'], raw: false,
	});
});

test('handles a shell that already exited before subscription', { timeout: 5000 }, async t => {
	const state = await fixture(t, { exited: true, snapshotContent: 'finished' });
	assert.deepEqual({ code: await runTerminal(state.client, state), output: state.output.value }, { code: 4, output: `finished${disableWin32InputMode}` });
});

test('initializes a PowerShell prompt before forwarding keyboard input', { timeout: 5000 }, async t => {
	let script = '';
	let acknowledge!: (value: { socket: WebSocket; channel: string; id: string }) => void;
	const sent = new Promise<{ socket: WebSocket; channel: string; id: string }>(resolve => { acknowledge = resolve; });
	const state = await fixture(t, {
		title: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
		onAction(socket, channel, value) {
			if (value.type !== 'terminal/input') { return; }
			script += text(value.data, 'input');
			if (script.endsWith('\r')) {
				const id = /\]777;tunnel-prompt;(?<id>[\da-f-]+);ok/.exec(script)?.groups?.id;
				if (id) { acknowledge({ socket, channel, id }); }
			}
		},
	});
	const raw = once(state.input, 'raw');
	const done = runTerminal(state.client, { ...state, tunnelName: 'my-machine' });
	const ack = await sent;
	assert.deepEqual({ raw: state.input.isRaw, dataListeners: state.input.listenerCount('data') }, { raw: false, dataListeners: 0 });
	state.input.write('echo ready\r');
	assert.ok(state.actions.filter(value => value.type === 'terminal/input').every(value => !text(value.data, 'input').includes('echo ready')));
	const marker = `\x1b]777;tunnel-prompt;${ack.id};ok\x07`;
	action(ack.socket, ack.channel, 3, { type: 'terminal/data', data: `setup output\r\n${marker.slice(0, 15)}` });
	action(ack.socket, ack.channel, 4, { type: 'terminal/data', data: `${marker.slice(15)}[my-machine] PS> ` });
	await raw;
	state.input.write('\x1d');
	await done;
	assert.match(state.output.value, /\[my-machine\] PS> /);
	assert.doesNotMatch(state.output.value, /\x1b\]777;tunnel-prompt;/);
	assert.ok(state.actions.some(value => value.type === 'terminal/input' && text(value.data, 'input').includes('echo ready')));
});

test('prompt initialization failure prevents keyboard handoff and disposes the terminal', { timeout: 5000 }, async t => {
	let script = '';
	const state = await fixture(t, {
		title: 'powershell.exe',
		onAction(socket, channel, value) {
			if (value.type !== 'terminal/input') { return; }
			script += text(value.data, 'input');
			const id = /\]777;tunnel-prompt;(?<id>[\da-f-]+);error/.exec(script)?.groups?.id;
			if (id && script.endsWith('\r')) {
				action(socket, channel, 3, { type: 'terminal/data', data: `setup failed\r\n\x1b]777;tunnel-prompt;${id};error\x07` });
			}
		},
	});
	await assert.rejects(runTerminal(state.client, { ...state, tunnelName: 'my-machine' }), /Remote prompt initialization failed/);
	assert.deepEqual({ raw: state.input.isRaw, lastRequest: state.requests.at(-1) }, { raw: false, lastRequest: 'disposeTerminal' });
	assert.match(state.output.value, /setup failed/);
});

test('missing prompt acknowledgement times out without forwarding keyboard input', { timeout: 5000 }, async t => {
	const state = await fixture(t, { title: 'pwsh.exe' });
	await assert.rejects(runTerminal(state.client, { ...state, tunnelName: 'my-machine', promptTimeoutMs: 20 }), /prompt initialization.*timed out/i);
	assert.deepEqual({ raw: state.input.isRaw, lastRequest: state.requests.at(-1) }, { raw: false, lastRequest: 'disposeTerminal' });
});

test('cancelling prompt initialization exits promptly and disposes the terminal', { timeout: 5000 }, async t => {
	let script = '';
	let sent!: () => void;
	const commandSent = new Promise<void>(resolve => { sent = resolve; });
	const state = await fixture(t, {
		title: 'pwsh.exe',
		onAction(_socket, _channel, value) {
			if (value.type === 'terminal/input') {
				script += text(value.data, 'input');
				if (script.endsWith('\r')) { sent(); }
			}
		},
	});
	const done = runTerminal(state.client, { ...state, tunnelName: 'my-machine' });
	await commandSent;
	state.signals.emit('SIGTERM');
	assert.deepEqual({ code: await done, raw: state.input.isRaw, lastRequest: state.requests.at(-1) }, {
		code: 143, raw: false, lastRequest: 'disposeTerminal',
	});
});

test('unsupported shells receive a warning, not a PowerShell initialization command', { timeout: 5000 }, async t => {
	const state = await fixture(t, { title: 'cmd.exe' });
	const raw = once(state.input, 'raw');
	const done = runTerminal(state.client, { ...state, tunnelName: 'my-machine' });
	await raw;
	state.input.write('\x1d');
	await done;
	assert.match(state.output.value, /Prompt prefix not installed/);
	assert.equal(state.actions.some(value => value.type === 'terminal/input'), false);
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
	const state = await fixture(t, { snapshotContent: '\x1b[?9001h', onSubscribe: socket => socket.close() });
	await assert.rejects(runTerminal(state.client, state), /shell may still be running/);
	assert.equal(state.input.isRaw, false);
	assert.ok(state.output.value.endsWith(disableWin32InputMode));
});

for (const ending of ['exit', 'escape', 'signal'] as const) {
	test(`Win32 input mode is disabled after remote ${ending}`, { timeout: 5000 }, async t => {
		const state = await fixture(t, {
			snapshotContent: '\x1b[?9001h',
			onAction(socket, channel, value) {
				if (ending === 'exit' && value.type === 'terminal/input') {
					action(socket, channel, 3, { type: 'terminal/exited', exitCode: 0 });
				}
			},
		});
		const raw = once(state.input, 'raw');
		const done = runTerminal(state.client, state);
		await raw;
		if (ending === 'exit') {
			state.input.write('exit\r');
		} else if (ending === 'escape') {
			state.input.write('\x1d');
		} else {
			state.signals.emit('SIGTERM');
		}
		await done;
		assert.deepEqual({ output: state.output.value, raw: state.input.isRaw }, {
			output: `\x1b[?9001h${disableWin32InputMode}`, raw: false,
		});
	});
}

test('flushes the keyboard reset before restoring cooked input', { timeout: 5000 }, async t => {
	const order: string[] = [];
	class ObservedInput extends Input {
		override setRawMode(value: boolean): this {
			if (!value) { order.push('cooked'); }
			return super.setRawMode(value);
		}
	}
	class DelayedOutput extends Output {
		override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
			if (chunk.toString() === disableWin32InputMode) {
				order.push('reset queued');
				void setImmediate().then(() => {
					order.push('reset flushed');
					super._write(chunk, encoding, callback);
				});
			} else {
				super._write(chunk, encoding, callback);
			}
		}
	}
	const state = await fixture(t, { input: new ObservedInput(), output: new DelayedOutput() });
	const raw = once(state.input, 'raw');
	const done = runTerminal(state.client, state);
	await raw;
	state.input.write('\x1d');
	await done;
	assert.deepEqual(order, ['reset queued', 'reset flushed', 'cooked']);
});

test('a failed keyboard reset is reported and local raw input is still restored', { timeout: 5000 }, async t => {
	class FailedResetOutput extends Output {
		override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
			if (chunk.toString() === disableWin32InputMode) {
				callback(new Error('Test reset failure'));
			} else {
				super._write(chunk, encoding, callback);
			}
		}
	}
	const state = await fixture(t, { output: new FailedResetOutput() });
	const raw = once(state.input, 'raw');
	const done = runTerminal(state.client, state);
	const rejected = assert.rejects(done, /terminal output/i);
	await raw;
	state.input.write('\x1d');
	await rejected;
	await setImmediate();
	assert.deepEqual({ raw: state.input.isRaw, errors: state.output.listenerCount('error') }, { raw: false, errors: 0 });
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
