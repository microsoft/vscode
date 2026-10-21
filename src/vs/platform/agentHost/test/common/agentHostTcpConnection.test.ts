/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer, decodeBase64 } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { hasKey } from '../../../../base/common/types.js';
import { vNumber, vObj, vString } from '../../../../base/common/validation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostChannelScheduler } from '../../common/agentHostChannelDelivery.js';
import { AgentHostTcpConnection, agentHostTcpReceiveLimits } from '../../common/agentHostTcpConnection.js';
import { isJsonRpcNotification, type JsonRpcNotification } from '../../common/state/sessionProtocol.js';
import { getProtocolMessageSize, parseProtocolMessage, type IProtocolTransport } from '../../common/state/sessionTransport.js';

suite('AgentHostTcpConnection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(windowBytes = agentHostTcpReceiveLimits.windowBytes, autoCredit = true, maximumFrameBytes = agentHostTcpReceiveLimits.maximumFrameBytes) {
		const sent: JsonRpcNotification[] = [];
		let sentBytes = 0;
		let bufferedAmount = 0;
		const credit = () => {
			const message = parseProtocolMessage(JSON.stringify({
				jsonrpc: '2.0', method: 'channel/credit', params: { channel: 'ahp-tcp:/write', consumedBytes: sentBytes },
			}));
			assert.ok(isJsonRpcNotification(message));
			scheduler.acceptMessage(message);
		};
		const transport: IProtocolTransport = {
			onMessage: Event.None, onClose: Event.None, dispose() { },
			get bufferedAmount() { return bufferedAmount; },
			send(message) {
				const parsed = parseProtocolMessage(JSON.stringify(message));
				assert.ok(isJsonRpcNotification(parsed));
				sent.push(parsed);
				if (parsed.method === 'tcp/data' || parsed.method === 'tcp/eof') {
					sentBytes += JSON.stringify(message).length * 2;
					if (autoCredit) {
						credit();
					}
				}
			},
		};
		const scheduler = store.add(new AgentHostChannelScheduler(transport, () => assert.fail('Unexpected scheduler failure')));
		const stream = store.add(new AgentHostTcpConnection('ahp-tcp:/write', {
			clientReceive: { windowBytes, maximumFrameBytes }, hostReceive: agentHostTcpReceiveLimits,
		}, true, transport, scheduler, () => { }));
		return {
			stream, sent, credit,
			setBufferedAmount: (bytes: number) => bufferedAmount = bytes,
			resumeCredit: () => { autoCredit = true; credit(); },
		};
	}

	test('rejects concurrent writes without dropping the accepted write or closing the stream', async () => {
		const h = fixture();
		const first = h.stream.write(VSBuffer.fromString('first'));
		await assert.rejects(h.stream.write(VSBuffer.fromString('rejected')), /pending write/);
		await first;
		await h.stream.write(VSBuffer.fromString('second'));
		const payloads = h.sent.filter(message => message.method === 'tcp/data').map(message =>
			decodeBase64(vObj({ data: vString() }).validateOrThrow(message.params).data).toString());
		assert.deepStrictEqual(payloads, ['first', 'second']);
	});

	for (const maximumFrameBytes of [1024, agentHostTcpReceiveLimits.maximumFrameBytes]) {
		test(`splits writes larger than the window into standalone TCP messages within ${maximumFrameBytes}-byte frames`, async () => {
			const h = fixture(8192, true, maximumFrameBytes);
			const input = VSBuffer.fromString('abcdefgh'.repeat(64 * 1024));
			await h.stream.write(input);
			assert.ok(h.sent.every(message => message.method === 'tcp/data' && JSON.stringify(message).length * 2 <= maximumFrameBytes));
			const data = h.sent.map(message => decodeBase64(vObj({ data: vString() }).validateOrThrow(message.params).data));
			assert.deepStrictEqual(VSBuffer.concat(data), input);
		});
	}

	test('end waits for the accepted write and drain waits for its completion', async () => {
		const h = fixture();
		const write = h.stream.write(VSBuffer.alloc(64 * 1024));
		const end = h.stream.end();
		await Promise.all([write, end, h.stream.drain()]);
		await assert.rejects(h.stream.write(VSBuffer.fromString('late')), /ended/);
		assert.deepStrictEqual(h.sent.map(message => message.method), [
			...Array.from({ length: h.sent.length - 1 }, () => 'tcp/data'), 'tcp/eof',
		]);
	});

	test('repeated end calls wait for the blocked write and send EOF only once', async () => {
		const h = fixture(1, false);
		const writing = h.stream.write(VSBuffer.alloc(64 * 1024));
		const ending = h.stream.end();
		const endingAgain = h.stream.end();
		let drained = false;
		const draining = h.stream.drain().then(() => drained = true);
		await timeout(0);
		assert.deepStrictEqual({ methods: h.sent.map(message => message.method), drained }, { methods: ['tcp/data'], drained: false });
		h.resumeCredit();
		await Promise.all([writing, ending, endingAgain, draining]);
		assert.strictEqual(h.sent.filter(message => message.method === 'tcp/eof').length, 1);
		assert.strictEqual(h.sent.at(-1)?.method, 'tcp/eof');
	});

	test('drain waits for peer credit even after the write completes', async () => {
		const h = fixture(agentHostTcpReceiveLimits.windowBytes, false);
		await h.stream.write(VSBuffer.fromString('uncredited'));
		let drained = false;
		const draining = h.stream.drain().then(() => drained = true);
		await timeout(0);
		assert.strictEqual(drained, false);
		h.credit();
		await draining;
		assert.strictEqual(drained, true);
	});

	test('empty writes do not leave a pending write behind', async () => {
		const h = fixture();
		await h.stream.write(VSBuffer.alloc(0));
		await h.stream.write(VSBuffer.fromString('data'));
		await h.stream.end();
		assert.deepStrictEqual(h.sent.map(message => message.method), ['tcp/data', 'tcp/eof']);
	});

	test('transport loss rejects a blocked write, repeated end calls, and drain', async () => {
		const h = fixture();
		h.setBufferedAmount(256 * 1024);
		const write = assert.rejects(h.stream.write(VSBuffer.fromString('blocked')), /disconnected/);
		const end = assert.rejects(h.stream.end(), /disconnected/);
		const endAgain = assert.rejects(h.stream.end(), /disconnected/);
		const drain = assert.rejects(h.stream.drain(), /disconnected/);
		h.stream.fail(new Error('Transport disconnected'), false);
		await Promise.all([write, end, endAgain, drain]);
		assert.deepStrictEqual(h.sent, []);
	});

	test('tiny receive windows do not fragment TCP data that fits the maximum frame size', async () => {
		const h = fixture(1);
		await h.stream.write(VSBuffer.alloc(64 * 1024));
		await h.stream.end();
		assert.ok(h.sent.every(message => (message.method === 'tcp/data' || message.method === 'tcp/eof')
			&& JSON.stringify(message).length * 2 <= agentHostTcpReceiveLimits.maximumFrameBytes));
	});

	for (const isHost of [false, true]) {
		test(`retains 1100 one-byte writes before the ${isHost ? 'host' : 'client'} starts reading`, async () => {
			const channel = 'ahp-tcp:/small';
			const sent: Parameters<IProtocolTransport['send']>[0][] = [];
			const failures: Error[] = [];
			const transport: IProtocolTransport = {
				onMessage: Event.None, onClose: Event.None, dispose() { },
				send: message => { sent.push(message); },
			};
			const scheduler = store.add(new AgentHostChannelScheduler(transport, error => failures.push(error)));
			const stream = store.add(new AgentHostTcpConnection(channel, {
				clientReceive: agentHostTcpReceiveLimits, hostReceive: agentHostTcpReceiveLimits,
			}, isHost, transport, scheduler, error => failures.push(error)));
			let receivedBytes = 0;
			const receive = (message: JsonRpcNotification) => {
				const parsed = parseProtocolMessage(JSON.stringify(message));
				assert.ok(isJsonRpcNotification(parsed));
				receivedBytes += getProtocolMessageSize(parsed);
				assert.strictEqual(scheduler.acceptMessage(parsed), true);
			};
			if (!isHost) {
				receive({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: { resource: channel, state: {}, fromSeq: 0 } } });
				await stream.ready;
			}
			for (let i = 0; i < 1100; i++) {
				receive({ jsonrpc: '2.0', method: 'tcp/data', params: { channel, data: 'YQ==' } });
			}
			assert.deepStrictEqual(failures, []);
			for (let i = 0; i < 1100; i++) {
				assert.strictEqual((await stream.read())?.toString(), 'a');
			}
			receive({ jsonrpc: '2.0', method: 'tcp/eof', params: { channel } });
			assert.strictEqual(await stream.read(), undefined);
			stream.flushCredit();
			let creditedBytes = 0;
			for (const message of sent) {
				assert.ok(hasKey(message, { method: true, params: true }) && message.method === 'channel/credit');
				const credit = vObj({ channel: vString(), consumedBytes: vNumber() }).validateOrThrow(message.params);
				assert.strictEqual(credit.channel, channel);
				assert.ok(credit.consumedBytes > creditedBytes && credit.consumedBytes <= receivedBytes);
				creditedBytes = credit.consumedBytes;
			}
			assert.strictEqual(creditedBytes, receivedBytes);
			assert.ok(sent.length <= Math.ceil(receivedBytes / (agentHostTcpReceiveLimits.windowBytes / 4)));
		});
	}
});
