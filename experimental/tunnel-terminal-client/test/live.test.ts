/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { test } from 'node:test';
import { openSocket } from '../src/tunnel.js';
import { runTerminal } from '../src/terminal.js';
import { deadline, record, text } from '../src/wire.js';
import { Input, Output, rpc } from './helpers.js';

test('opt-in: real local agent host initializes a prefixed shell and disposes it', {
	skip: !process.env.TUNNEL_TERMINAL_TEST_ENDPOINT,
	timeout: 60_000,
}, async t => {
	const descriptor = record(JSON.parse(await readFile(process.env.TUNNEL_TERMINAL_TEST_ENDPOINT!, 'utf8')), 'test endpoint');
	const endpoint = record(descriptor.endpoint, 'endpoint address');
	if (endpoint.type !== 'tcp' || typeof endpoint.port !== 'number'
		|| !['localhost', '127.0.0.1', '::1'].includes(text(endpoint.host, 'endpoint host'))) {
		throw new Error('Live tests require an explicitly supplied loopback TCP endpoint.');
	}
	const stream = connect(endpoint.port, text(endpoint.host, 'host'));
	const connection = await openSocket(stream, `/?tkn=${encodeURIComponent(text(descriptor.connectionToken, 'connection token'))}`);
	t.after(() => connection.dispose());
	const client = rpc(t, connection);
	const input = new Input();
	const output = new Output();
	const signals = new EventEmitter();
	t.after(() => { input.destroy(); output.destroy(); });
	const ready = once(input, 'raw');
	const done = runTerminal(client, { input, output, signals, tunnelName: 'tunnel-smoke' });
	// Race readiness against setup failure so an incompatible host fails promptly.
	await deadline(Promise.race([ready, done.then(() => { throw new Error('Shell exited before input became ready.'); })]), 'Live terminal startup');
	output.columns = 120;
	output.rows = 40;
	output.emit('resize');
	input.write('echo TUNNEL_REAL_HOST_SUCCESS\rexit 7\r');
	assert.equal(await done, 7);
	assert.match(output.value, /TUNNEL_REAL_HOST_SUCCESS/);
	assert.match(output.value, /\[tunnel-smoke\]/);
	assert.equal(input.isRaw, false);
});
