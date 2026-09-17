/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { join } from 'node:path';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { TerminalBridge, type BridgeCloseReason } from '../src/bridge';
import { spawnPtyHost } from '../src/ptyHostClient';
import { parseServerMessage, type ClientMessage } from '../src/protocol';

const hostPath = join(process.cwd(), 'dist', 'ptyHost.cjs');

test('isolated native PTY sends output and exits without retaining its helper', async t => {
	const pty = spawnPtyHost({
		executable: process.execPath, args: ['-e', 'console.log("NATIVE_PTY_OK"); process.exitCode = 7;'],
		cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
	}, hostPath);
	t.after(() => pty.kill());
	const errors: Error[] = [];
	let data = '';
	t.after(() => dataListener.dispose());
	const dataListener = pty.onData(text => { data += text; });
	const errorListener = pty.onError?.(error => errors.push(error));
	t.after(() => errorListener?.dispose());
	const exit = await new Promise<{ exitCode: number }>(resolve => {
		const subscription = pty.onExit(resolve);
		t.after(() => subscription.dispose());
	});
	assert.deepStrictEqual({ containsOutput: data.includes('NATIVE_PTY_OK'), exitCode: exit.exitCode, errors }, { containsOutput: true, exitCode: 7, errors: [] });
});

test('authenticated bridge drives a real shell with remote environment, resize and exit status', async t => {
	const errors: Error[] = [];
	const closed: BridgeCloseReason[] = [];
	const bridge = new TerminalBridge({
		spawn: (cols, rows) => spawnPtyHost({
			executable: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
			args: process.platform === 'win32' ? ['/d', '/q'] : [],
			cols, rows, cwd: process.cwd(), env: { ...process.env, BRIDGE_TEST_VALUE: 'real-remote-value' },
		}, hostPath),
		onError: error => errors.push(error),
		onClose: reason => closed.push(reason),
	});
	t.after(() => bridge.dispose());
	const connection = await bridge.start();
	const socket = new WebSocket(connection.url, { headers: { Authorization: `Bearer ${connection.token}` } });
	t.after(() => socket.terminate());
	let output = '';
	let exitCode: number | undefined;
	const send = (message: ClientMessage) => socket.send(JSON.stringify(message));
	socket.on('message', raw => {
		const message = parseServerMessage(raw.toString());
		switch (message.type) {
			case 'ready':
				send({ type: 'resize', cols: 100, rows: 32 });
				send({
					type: 'input',
					data: process.platform === 'win32' ? 'echo %BRIDGE_TEST_VALUE%\r\nexit 9\r\n' : 'printf "%s\\n" "$BRIDGE_TEST_VALUE"; exit 9\n',
				});
				break;
			case 'data':
				output += message.data;
				send({ type: 'ack', chars: message.data.length });
				break;
			case 'exit':
				exitCode = message.exitCode;
				break;
			case 'error':
				errors.push(new Error(message.message));
				break;
		}
	});
	await once(socket, 'open');
	send({ type: 'start', version: 1, cols: 80, rows: 24 });
	await once(socket, 'close');
	assert.deepStrictEqual({ containsOutput: output.includes('real-remote-value'), exitCode, errors }, { containsOutput: true, exitCode: 9, errors: [] });
});

test('disconnect cleans up a running native shell and helper', async t => {
	const pty = spawnPtyHost({
		executable: process.execPath, args: ['-e', 'console.log("RUNNING"); setInterval(() => {}, 1000);'],
		cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
	}, hostPath);
	t.after(() => pty.kill());
	const errors: Error[] = [];
	const errorListener = pty.onError?.(error => errors.push(error));
	t.after(() => errorListener?.dispose());
	const exited = new Promise<void>(resolve => {
		const subscription = pty.onExit(() => resolve());
		t.after(() => subscription.dispose());
	});
	await new Promise<void>(resolve => {
		const subscription = pty.onData(data => { if (data.includes('RUNNING')) { resolve(); } });
		t.after(() => subscription.dispose());
	});
	pty.kill();
	await exited;
	assert.deepStrictEqual(errors, []);
});

test('missing shell produces an explicit failure from the native helper', async t => {
	const errors: Error[] = [];
	const bridge = new TerminalBridge({
		spawn: (cols, rows) => spawnPtyHost({
			executable: join(process.cwd(), 'missing-terminal-executable'),
			args: [], cols, rows, cwd: process.cwd(), env: process.env,
		}, hostPath),
		onError: error => errors.push(error),
		onClose: () => {},
	});
	t.after(() => bridge.dispose());
	const connection = await bridge.start();
	const socket = new WebSocket(connection.url, { headers: { Authorization: `Bearer ${connection.token}` } });
	t.after(() => socket.terminate());
	await once(socket, 'open');
	socket.send(JSON.stringify({ type: 'start', version: 1, cols: 80, rows: 24 } satisfies ClientMessage));
	await once(socket, 'close');
	assert.equal(errors.length, 1);
});
