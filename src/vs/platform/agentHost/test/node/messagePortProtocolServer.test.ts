/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { JSON_RPC_PARSE_ERROR, type ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../../common/state/sessionTransport.js';
import { MessagePortProtocolServer } from '../../node/messagePortProtocolServer.js';

suite('MessagePortProtocolServer', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('isolates raw frames for each connected IPC client', async () => {
		const server = ds.add(new MessagePortProtocolServer<string>());
		const frames = new Map<string, string[]>();
		const messages = new Map<string, ProtocolMessage[]>();
		const transports: IProtocolTransport[] = [];

		for (const client of ['one', 'two']) {
			frames.set(client, []);
			messages.set(client, []);
			ds.add(server.listen<string>(client, 'frame')(frame => frames.get(client)!.push(frame)));
		}
		ds.add(server.onConnection(transport => {
			const index = transports.push(transport) - 1;
			ds.add(transport.onMessage(message => messages.get(index === 0 ? 'one' : 'two')!.push(message)));
		}));

		await server.call('one', 'connect');
		await server.call('two', 'connect');
		await server.call('one', 'send', '{"jsonrpc":"2.0","id":1,"method":"one"}');
		await server.call('two', 'send', '{"jsonrpc":"2.0","id":2,"method":"two"}');
		transports[0].send({ jsonrpc: '2.0', id: 1, result: { client: 'one' } });
		transports[1].send({ jsonrpc: '2.0', id: 2, result: { client: 'two' } });

		assert.deepStrictEqual({ messages, frames }, {
			messages: new Map([
				['one', [{ jsonrpc: '2.0', id: 1, method: 'one' }]],
				['two', [{ jsonrpc: '2.0', id: 2, method: 'two' }]],
			]),
			frames: new Map([
				['one', ['{"jsonrpc":"2.0","id":1,"result":{"client":"one"}}']],
				['two', ['{"jsonrpc":"2.0","id":2,"result":{"client":"two"}}']],
			]),
		});
	});

	test('returns a parse error to only the client that sends malformed JSON', async () => {
		const server = ds.add(new MessagePortProtocolServer<string>());
		const frames = new Map<string, string[]>([['one', []], ['two', []]]);
		const received: ProtocolMessage[] = [];

		for (const client of frames.keys()) {
			ds.add(server.listen<string>(client, 'frame')(frame => frames.get(client)!.push(frame)));
		}
		ds.add(server.onConnection(transport => ds.add(transport.onMessage(message => received.push(message)))));

		await server.call('one', 'connect');
		await server.call('two', 'connect');
		await server.call('one', 'send', '{invalid');

		assert.deepStrictEqual({ frames, received }, {
			frames: new Map([
				['one', [JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: JSON_RPC_PARSE_ERROR, message: 'Parse error' } })]],
				['two', []],
			]),
			received: [],
		});
	});

	test('closes independent transports on IPC disconnect and channel close', async () => {
		const server = ds.add(new MessagePortProtocolServer<string>());
		const closed = new Map<string, number>([['one', 0], ['two', 0]]);
		const messages = new Map<string, ProtocolMessage[]>([['one', []], ['two', []]]);

		for (const client of closed.keys()) {
			ds.add(server.listen<void>(client, 'close')(() => closed.set(client, closed.get(client)! + 1)));
		}
		let connection = 0;
		ds.add(server.onConnection(transport => {
			const client = connection++ === 0 ? 'one' : 'two';
			ds.add(transport.onMessage(message => messages.get(client)!.push(message)));
		}));

		await server.call('one', 'connect');
		await server.call('two', 'connect');
		server.closeClient('one');
		await assert.rejects(() => server.call('one', 'send', '{"jsonrpc":"2.0","method":"closed"}'), /not connected/);
		await server.call('two', 'send', '{"jsonrpc":"2.0","method":"open"}');
		await server.call('two', 'close');

		assert.deepStrictEqual({ closed, messages }, {
			closed: new Map([['one', 1], ['two', 1]]),
			messages: new Map([
				['one', []],
				['two', [{ jsonrpc: '2.0', method: 'open' }]],
			]),
		});
	});
});
