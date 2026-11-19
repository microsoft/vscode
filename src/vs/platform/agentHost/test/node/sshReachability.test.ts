/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as net from 'net';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { probeSSHServer } from '../../node/sshReachability.js';

suite('probeSSHServer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function probe(onConnection: ((socket: net.Socket) => void) | undefined, timeoutMs = 2000) {
		const server = net.createServer(socket => {
			socket.on('error', () => { /* the probe closes its end */ });
			onConnection?.(socket);
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as net.AddressInfo).port;
		try {
			return await probeSSHServer('127.0.0.1', port, timeoutMs);
		} finally {
			server.close();
		}
	}

	test('classifies servers by their SSH identification string', async () => {
		const results = {
			// The identification string may be split across packets and preceded by other lines.
			ssh: await probe(socket => { socket.write('Welcome\r\nSS'); setTimeout(() => socket.write('H-2.0-OpenSSH_9.6\r\n'), 10); }),
			nonSSH: await probe(socket => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')),
			silent: await probe(undefined, 100),
		};
		assert.deepStrictEqual(results, { ssh: 'reachable', nonSSH: 'unreachable', silent: 'unreachable' });
	});

	test('refused connections are unreachable', async () => {
		const server = net.createServer();
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as net.AddressInfo).port;
		await new Promise<void>(resolve => server.close(() => resolve()));
		assert.strictEqual(await probeSSHServer('127.0.0.1', port, 2000), 'unreachable');
	});
});
