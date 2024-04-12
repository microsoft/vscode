/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as crypto from 'crypto';
import * as net from 'net';
import * as platform from 'vs/base/common/platform';
import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import * as ports from 'vs/base/node/ports';
import { SocketDebugAdapter, NamedPipeDebugAdapter, StreamDebugAdapter } from 'vs/workbench/contrib/debug/node/debugAdapter';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';


function sendInitializeRequest(debugAdapter: StreamDebugAdapter): Promise<DebugProtocol.Response> {
	return new Promise((resolve, reject) => {
		debugAdapter.sendRequest('initialize', { adapterID: 'test' }, (result) => {
			resolve(result);
		}, 3000);
	});
}

function serverConnection(socket: net.Socket) {
	socket.on('data', (data: Buffer) => {
		const str = data.toString().split('\r\n')[2];
		const request = JSON.parse(str);
		const response: any = {
			seq: request.seq,
			request_seq: request.seq,
			type: 'response',
			command: request.command
		};
		if (request.arguments.adapterID === 'test') {
			response.success = true;
		} else {
			response.success = false;
			response.message = 'failed';
		}

		const responsePayload = JSON.stringify(response);
		socket.write(`Content-Length: ${responsePayload.length}\r\n\r\n${responsePayload}`);
	});
}

suite('Debug - StreamDebugAdapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test(`StreamDebugAdapter (NamedPipeDebugAdapter) can initialize a connection`, async () => {

		const pipeName = crypto.randomBytes(10).toString('hex');
		const pipePath = platform.isWindows ? join('\\\\.\\pipe\\', pipeName) : join(tmpdir(), pipeName);
		const server = await new Promise<net.Server>((resolve, reject) => {
			const server = net.createServer(serverConnection);
			server.once('listening', () => resolve(server));
			server.once('error', reject);
			server.listen(pipePath);
		});

		const debugAdapter = new NamedPipeDebugAdapter({
			type: 'pipeServer',
			path: pipePath
		});
		try {
			await debugAdapter.startSession();
			const response: DebugProtocol.Response = await sendInitializeRequest(debugAdapter);
			assert.strictEqual(response.command, 'initialize');
			assert.strictEqual(response.request_seq, 1);
			assert.strictEqual(response.success, true, response.message);
		} finally {
			await debugAdapter.stopSession();
			server.close();
			debugAdapter.dispose();
		}
	});

	test(`StreamDebugAdapter (SocketDebugAdapter) can initialize a connection`, async () => {

		const rndPort = Math.floor(Math.random() * 1000 + 8000);
		const port = await ports.findFreePort(rndPort, 10 /* try 10 ports */, 3000 /* try up to 3 seconds */, 87 /* skip 87 ports between attempts */);
		const server = net.createServer(serverConnection).listen(port);
		const debugAdapter = new SocketDebugAdapter({
			type: 'server',
			port
		});
		try {
			await debugAdapter.startSession();
			const response: DebugProtocol.Response = await sendInitializeRequest(debugAdapter);
			assert.strictEqual(response.command, 'initialize');
			assert.strictEqual(response.request_seq, 1);
			assert.strictEqual(response.success, true, response.message);
		} finally {
			await debugAdapter.stopSession();
			server.close();
			debugAdapter.dispose();
		}
	});
});
