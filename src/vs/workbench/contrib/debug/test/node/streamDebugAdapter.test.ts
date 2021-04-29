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
import { SocketDebugAdapter, NamedPipeDebugAdapter, StreamDebugAdapter } from 'vs/workbench/contrib/debug/node/debugAdapter';

function rndPort(): number {
	const min = 8000;
	const max = 9000;
	return Math.floor(Math.random() * (max - min) + min);
}

function sendInitializeRequest(debugAdapter: StreamDebugAdapter): Promise<DebugProtocol.Response> {
	return new Promise((resolve, reject) => {
		debugAdapter.sendRequest('initialize', { adapterID: 'test' }, (result) => {
			resolve(result);
		});
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
	const port = rndPort();
	const pipeName = crypto.randomBytes(10).toString('hex');
	const pipePath = platform.isWindows ? join('\\\\.\\pipe\\', pipeName) : join(tmpdir(), pipeName);

	const testCases: { testName: string, debugAdapter: StreamDebugAdapter, connectionDetail: string | number }[] = [
		{
			testName: 'NamedPipeDebugAdapter',
			debugAdapter: new NamedPipeDebugAdapter({
				type: 'pipeServer',
				path: pipePath
			}),
			connectionDetail: pipePath
		},
		{
			testName: 'SocketDebugAdapter',
			debugAdapter: new SocketDebugAdapter({
				type: 'server',
				port
			}),
			connectionDetail: port
		}
	];

	for (const testCase of testCases) {
		test(`StreamDebugAdapter (${testCase.testName}) can initialize a connection`, async () => {
			const server = net.createServer(serverConnection).listen(testCase.connectionDetail);
			const debugAdapter = testCase.debugAdapter;
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
	}
});
