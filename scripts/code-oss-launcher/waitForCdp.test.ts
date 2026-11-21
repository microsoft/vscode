/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { waitForCdp } from './waitForCdp.ts';

test('readiness requires a successful CDP version response, not just an HTTP listener', async () => {
	let ready = false;
	const server = http.createServer((request, response) => {
		assert.equal(request.url, '/json/version');
		response.end(ready ? JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/test' }) : '<html>not CDP</html>');
	});
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		const port = (server.address() as AddressInfo).port;
		assert.deepStrictEqual(await waitForCdp(process.pid, port, 200), { status: 'timeout' });
		ready = true;
		const result = await waitForCdp(process.pid, port, 2000);
		assert.equal(result.status, 'ready');
	} finally {
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
});

test('an unresponsive endpoint respects the deadline', async () => {
	const server = http.createServer(() => { });
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		assert.deepStrictEqual(await waitForCdp(process.pid, (server.address() as AddressInfo).port, 100), { status: 'timeout' });
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
});

test('reports when the launched process exits before readiness', async () => {
	const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
	await once(child, 'exit');
	assert.deepStrictEqual(await waitForCdp(child.pid!, 1, 2000), { status: 'exited' });
});

test('oversized responses are disconnected before the server finishes sending', async () => {
	let disconnected = 0;
	const server = http.createServer((_request, response) => {
		response.on('close', () => disconnected++);
		response.write('x'.repeat(65 * 1024));
	});
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		assert.deepStrictEqual(await waitForCdp(process.pid, (server.address() as AddressInfo).port, 300), { status: 'timeout' });
		assert.ok(disconnected > 0);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
});
