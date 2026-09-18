/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { openSocket } from '../src/tunnel.js';
import { runTerminal } from '../src/terminal.js';
import { deadline, record, text } from '../src/wire.js';
import { Input, Output, rpc } from './helpers.js';

test('opt-in: PowerShell -> WSL Bash -> PowerShell retains the same prompt prefix', {
	skip: !process.env.TUNNEL_TERMINAL_TEST_ENDPOINT || !process.env.TUNNEL_TERMINAL_TEST_WSL,
	timeout: 90_000,
}, async t => {
	const distro = process.env.TUNNEL_TERMINAL_TEST_WSL!;
	assert.match(distro, /^[a-zA-Z0-9._-]+$/, 'Use a distribution name safe for this test command.');
	const descriptor = record(JSON.parse(await readFile(process.env.TUNNEL_TERMINAL_TEST_ENDPOINT!, 'utf8')), 'test endpoint');
	const endpoint = record(descriptor.endpoint, 'endpoint address');
	if (endpoint.type !== 'tcp' || typeof endpoint.port !== 'number'
		|| !['localhost', '127.0.0.1', '::1'].includes(text(endpoint.host, 'endpoint host'))) {
		throw new Error('Live WSL tests require an explicitly supplied loopback TCP endpoint with a PowerShell default shell.');
	}
	const connection = await openSocket(connect(endpoint.port, text(endpoint.host, 'host')), `/?tkn=${encodeURIComponent(text(descriptor.connectionToken, 'connection token'))}`);
	t.after(() => connection.dispose());
	class ObservedOutput extends Output {
		override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
			super._write(chunk, encoding, callback);
			this.emit('output');
		}
	}
	const input = new Input();
	t.after(() => input.destroy());
	const output = new ObservedOutput();
	t.after(() => output.destroy());
	const ready = once(input, 'raw');
	const done = runTerminal(rpc(t, connection), { input, output, signals: new EventEmitter(), tunnelName: 'tunnel-smoke' });
	const exited = done.then(() => { throw new Error('Test terminal exited unexpectedly.'); });
	void exited.catch(() => { });
	await deadline(Promise.race([ready, exited]), 'Live prefixed terminal startup');

	async function waitForOutput(pattern: RegExp, from = 0): Promise<void> {
		let listener: (() => void) | undefined;
		try {
			await deadline(Promise.race([
				exited,
				new Promise<void>(resolve => {
					listener = () => {
						if (pattern.test(stripVTControlCharacters(output.value.slice(from)))) {
							resolve();
						}
					};
					output.on('output', listener);
					listener();
				}),
			]), `Live shell output ${pattern}`);
		} catch (error) {
			t.diagnostic(`Last terminal output: ${JSON.stringify(stripVTControlCharacters(output.value).slice(-800))}`);
			throw error;
		} finally {
			if (listener) { output.off('output', listener); }
		}
	}

	await waitForOutput(/\[tunnel-smoke\][^\r\n]*PS(?: |>)/);
	const beforeWsl = output.value.length;
	input.write(`wsl -d ${distro}\r`);
	await waitForOutput(/\[tunnel-smoke\][^\r\n]*[$#] /, beforeWsl);
	const beforeProbe = output.value.length;
	input.write('printf \'\\n__TUNNEL_WSL__%s\\n\' "$WSL_DISTRO_NAME"; exit 0\r');
	await waitForOutput(/__TUNNEL_WSL__[a-zA-Z0-9._-]+\r?\n/, beforeProbe);
	await waitForOutput(/\[tunnel-smoke\][^\r\n]*PS(?: |>)/, beforeProbe);
	input.write('exit 7\r');
	assert.equal(await done, 7);
	assert.equal(input.isRaw, false);
});
