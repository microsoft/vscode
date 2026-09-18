/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { TerminalBridge } from '../src/bridge';
import { spawnPtyHost } from '../src/ptyHostClient';
import { LocalRelay } from '../src/localRelay';
import { RemoteRelay } from '../src/remoteRelay';

test('standalone client crosses both companion relays with pairing, Unicode, Ctrl+C, resize and remote exit code', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'tunnel-terminal-client-'));
	const clientPath = join(directory, 'client.cjs');
	await copyFile(join(process.cwd(), 'dist', 'client.cjs'), clientPath);
	let stopClient: (() => Promise<void>) | undefined;
	t.after(async () => {
		await stopClient?.();
		await unlink(clientPath);
		await rmdir(directory);
	});
	const hostPath = join(process.cwd(), 'dist', 'ptyHost.cjs');
	const errors: Error[] = [];
	let pairingCode = '';
	let approve: (value: boolean) => void = () => {};
	const remoteProgram = `
		process.stdin.setRawMode(true);
		process.stdin.setEncoding('utf8');
		console.log('REMOTE_READY');
		process.stdout.on('resize', () => console.log('REMOTE_SIZE:' + process.stdout.columns + 'x' + process.stdout.rows));
		process.stdin.on('data', data => {
			if (data.includes('\\x03')) { console.log('REMOTE_CTRL_C'); }
			else if (data.includes('quit')) { process.exit(13); }
			else { console.log('REMOTE_INPUT:' + data); }
		});
	`;
	const bridge = new TerminalBridge({
		approve: code => {
			pairingCode = code;
			return new Promise<boolean>(resolve => { approve = resolve; });
		},
		spawn: (cols, rows) => spawnPtyHost({
			executable: process.execPath, args: ['-e', remoteProgram], cols, rows,
			cwd: process.cwd(), env: process.env,
		}, hostPath),
		onError: error => errors.push(error),
		onClose: () => {},
	});
	t.after(() => bridge.dispose());
	const remoteConnection = await bridge.start();
	const remoteRelay = new RemoteRelay(remoteConnection.url, {
		onError: error => errors.push(error),
		onLeaseExpired: () => bridge.dispose('disconnected'),
	});
	t.after(() => remoteRelay.dispose());
	const localRelay = new LocalRelay({
		transport: {
			open: async () => { await delay(5); await remoteRelay.open(); },
			read: async () => structuredClone(await remoteRelay.read()),
			write: async messages => { await delay(5); await remoteRelay.write(structuredClone(messages)); },
			close: async () => remoteRelay.dispose(),
		},
		onError: error => errors.push(error),
		onClose: () => {},
	});
	t.after(() => localRelay.dispose());
	const connection = await localRelay.start();
	assert.notEqual(connection.url, remoteConnection.url);
	const localTerminal = spawnPtyHost({
		executable: process.execPath, args: [clientPath, connection.url],
		cols: 80, rows: 24, cwd: directory, env: process.env,
	}, hostPath);
	t.after(() => localTerminal.kill());
	let output = '';
	const dataSubscription = localTerminal.onData(data => { output += data; });
	t.after(() => dataSubscription.dispose());
	const errorSubscription = localTerminal.onError?.(error => errors.push(error));
	t.after(() => errorSubscription?.dispose());
	const exit = new Promise<{ exitCode: number }>(resolve => {
		const subscription = localTerminal.onExit(resolve);
		t.after(() => subscription.dispose());
	});
	stopClient = async () => {
		localTerminal.kill();
		await exit;
	};
	const waitForOutput = async (pattern: RegExp) => {
		for (let i = 0; i < 500; i++) {
			if (pattern.test(output)) {
				return;
			}
			await delay(10);
		}
		assert.fail(`Missing expected terminal output ${pattern}. Errors: ${errors.map(error => error.message).join('; ')}`);
	};
	await waitForOutput(/Pairing code: [A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/);
	assert.ok(output.includes(pairingCode));
	assert.ok(!output.includes('REMOTE_READY'));
	approve(true);
	await waitForOutput(/REMOTE_READY/);
	localTerminal.write('\u03bb\u4e2d\r');
	await waitForOutput(/REMOTE_INPUT:\u03bb\u4e2d/);
	localTerminal.write('\x03');
	await waitForOutput(/REMOTE_CTRL_C/);
	localTerminal.resize(101, 31);
	await waitForOutput(/REMOTE_SIZE:101x31/);
	localTerminal.write('quit\r');
	const result = await exit;
	assert.deepStrictEqual({ exitCode: result.exitCode, errors }, { exitCode: 13, errors: [] });
});
