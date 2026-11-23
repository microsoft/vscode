/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as net from 'net';
import type * as wsTypes from 'ws';
import { useFakeTimers } from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { WebSocketProtocolServer } from '../../node/webSocketTransport.js';
import { getProtocolMessageSize } from '../../common/state/sessionTransport.js';
import { ProtocolLivenessMonitor } from '../../common/protocolLivenessMonitor.js';

suite('WebSocketProtocolServer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('validates the decoded connection token', async () => {
		const validatedTokens: unknown[] = [];
		const server = store.add(await WebSocketProtocolServer.create({
			port: 0,
			connectionTokenValidate: token => {
				validatedTokens.push(token);
				return token === 'valid token';
			},
		}, new NullLogService()));
		await server.whenListening;

		const transport = Event.toPromise(server.onConnection);
		const socket = await connect(`ws://127.0.0.1:${server.boundPort}/?${connectionTokenQueryName}=valid+token`);
		store.add(toDisposable(() => socket.close()));
		const accepted = store.add(await transport);

		assert.deepStrictEqual(validatedTokens, ['valid token']);
		const message = Event.toPromise(accepted.onMessage);
		const text = '{ "jsonrpc":"2.0", "method":"tcp/data", "params": { "channel":"ahp-tcp:/test", "data":"\\u005aA==" } }';
		socket.send(text);
		assert.strictEqual(getProtocolMessageSize(await message), text.length * 2);
	});

	test('accepts connections without a token when no validator is configured', async () => {
		const server = store.add(await WebSocketProtocolServer.create({ port: 0 }, new NullLogService()));
		await server.whenListening;
		const transport = Event.toPromise(server.onConnection);
		const socket = await connect(`ws://127.0.0.1:${server.boundPort}/`);
		store.add(toDisposable(() => socket.close()));
		const accepted = store.add(await transport);
		const message = Event.toPromise(accepted.onMessage);
		const text = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientId":"test","protocolVersions":["1.0.0"]}}';
		socket.send(text);
		assert.deepStrictEqual(await message, JSON.parse(text));
	});

	test('partial uploads keep the watchdog alive beyond its silence deadline', async () => {
		const server = store.add(await WebSocketProtocolServer.create({ port: 0 }, new NullLogService()));
		await server.whenListening;
		const connection = Event.toPromise(server.onConnection);
		const socket = await connect(`ws://127.0.0.1:${server.boundPort}/`);
		store.add(toDisposable(() => socket.close()));
		const accepted = store.add(await connection);
		assert.ok(accepted.onDidReceiveData);

		const clock = useFakeTimers({ now: 0, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		store.add(toDisposable(() => clock.restore()));
		let timedOut = false;
		let messageCount = 0;
		const liveness = store.add(new ProtocolLivenessMonitor({
			pingIntervalMs: 10_000, timeoutMs: 20_000,
			loadEstimator: { hasHighLoad: () => false },
			canCheck: () => true,
			onPing: () => { },
			onTimeout: () => { timedOut = true; },
		}));
		store.add(accepted.onDidReceiveData(() => liveness.recordInboundTraffic()));
		store.add(accepted.onMessage(() => messageCount++));
		liveness.reset();
		try {
			for (const fragment of ['{"jsonrpc":', '"2.0",', '"id":1,', '"result":null}']) {
				await clock.tickAsync(10_000);
				const activity = Event.toPromise(accepted.onDidReceiveData);
				socket.send(fragment, { fin: false });
				await activity;
			}
			const duringUpload = { elapsedMs: clock.now, timedOut, messageCount };
			const message = Event.toPromise(accepted.onMessage);
			socket.send('', { fin: true });
			const completedMessage = await message;
			await clock.tickAsync(29_999);
			const beforeDeadline = timedOut;
			await clock.tickAsync(1);
			assert.deepStrictEqual({ duringUpload, completedMessage, beforeDeadline, timedOut }, {
				duringUpload: { elapsedMs: 40_000, timedOut: false, messageCount: 0 },
				completedMessage: { jsonrpc: '2.0', id: 1, result: null },
				beforeDeadline: false,
				timedOut: true,
			});
		} finally {
			liveness.dispose();
			clock.restore();
		}
	});

	for (const query of ['', `?${connectionTokenQueryName}=wrong`]) {
		test(`rejects ${query ? 'invalid' : 'missing'} connection tokens when a validator is configured`, async () => {
			const server = store.add(await WebSocketProtocolServer.create({
				port: 0,
				connectionTokenValidate: token => token === 'valid',
			}, new NullLogService()));
			await server.whenListening;

			const response = await sendUpgradeRequest(server.boundPort!, `/${query}`);
			assert.strictEqual(response.split('\r\n', 1)[0], 'HTTP/1.1 403 Forbidden');
		});
	}

	test('rejects a malformed request URL without stopping the server', async () => {
		const server = store.add(await WebSocketProtocolServer.create({
			port: 0,
			connectionTokenValidate: token => token === 'valid',
		}, new NullLogService()));
		await server.whenListening;

		const response = await sendUpgradeRequest(server.boundPort!, 'http://[invalid');
		const transport = Event.toPromise(server.onConnection);
		const socket = await connect(`ws://127.0.0.1:${server.boundPort}/?${connectionTokenQueryName}=valid`);
		store.add(toDisposable(() => socket.close()));
		store.add(await transport);

		assert.strictEqual(response.split('\r\n', 1)[0], 'HTTP/1.1 400 Bad Request');
	});
});

async function connect(url: string): Promise<wsTypes.WebSocket> {
	const { WebSocket } = await import('ws');
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		socket.once('open', () => resolve(socket));
		socket.once('error', reject);
	});
}

function sendUpgradeRequest(port: number, requestTarget: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
			socket.end([
				`GET ${requestTarget} HTTP/1.1`,
				'Host: localhost',
				'Connection: Upgrade',
				'Upgrade: websocket',
				'Sec-WebSocket-Version: 13',
				'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
				'',
				'',
			].join('\r\n'));
		});
		const chunks: Buffer[] = [];
		socket.on('data', chunk => chunks.push(Buffer.from(chunk)));
		socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
		socket.on('error', reject);
	});
}
