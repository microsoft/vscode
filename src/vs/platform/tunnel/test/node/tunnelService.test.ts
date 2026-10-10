/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import * as net from 'net';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ISocket, SocketCloseEvent } from '../../../../base/parts/ipc/common/ipc.net.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NodeRemoteTunnel } from '../../node/tunnelService.js';

suite('NodeRemoteTunnel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const termination of ['end', 'close', 'end then close']) {
		test(`generic socket flushes a large response on ${termination}`, async () => {
			const onData = store.add(new Emitter<VSBuffer>());
			const onEnd = store.add(new Emitter<void>());
			const onClose = store.add(new Emitter<SocketCloseEvent>());
			const remoteSocket: ISocket = {
				onData: listener => store.add(onData.event(listener)),
				onEnd: listener => store.add(onEnd.event(listener)),
				onClose: listener => store.add(onClose.event(listener)),
				write: () => { },
				end: () => { },
				drain: async () => { },
				traceSocketEvent: () => { },
				dispose: () => { }
			};

			const server = net.createServer();
			store.add(toDisposable(() => server.close()));
			server.listen(0, '127.0.0.1');
			await once(server, 'listening');

			const connection = new Promise<net.Socket>(resolve => server.once('connection', socket => {
				store.add(toDisposable(() => socket.destroy()));
				resolve(socket);
			}));
			const client = net.createConnection({ host: '127.0.0.1', port: (server.address() as net.AddressInfo).port });
			store.add(toDisposable(() => client.destroy()));
			const received: Buffer[] = [];
			client.on('data', data => received.push(data));
			client.pause();
			const ended = once(client, 'end');
			const localSocket = await connection;
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Isolate the private socket bridge from the remote agent handshake.
			NodeRemoteTunnel.prototype['_mirrorGenericSocket'](localSocket, remoteSocket);

			const body = Buffer.alloc(16 * 1024 * 1024, 'response');
			const response = Buffer.concat([
				Buffer.from(`HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`),
				body
			]);
			onData.fire(VSBuffer.wrap(response));
			assert.ok(localSocket.writableLength > 0, 'The response must still have buffered data when the remote socket terminates');

			if (termination !== 'close') {
				onEnd.fire();
			}
			if (termination !== 'end') {
				onClose.fire(undefined);
			}

			client.resume();
			await ended;
			const actual = Buffer.concat(received);
			assert.ok(actual.equals(response), `Received ${actual.length} of ${response.length} response bytes`);
		});
	}
});
