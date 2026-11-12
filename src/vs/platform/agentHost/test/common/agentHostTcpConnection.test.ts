/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { vNumber, vObj, vString } from '../../../../base/common/validation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostChannelScheduler } from '../../common/agentHostChannelDelivery.js';
import { AgentHostChannelError, AgentHostChannelErrorCode } from '../../common/agentHostChannelTelemetry.js';
import { AgentHostTcpBudget, AgentHostTcpConnection, agentHostTcpReceiveLimits } from '../../common/agentHostTcpConnection.js';
import { isJsonRpcNotification, type JsonRpcNotification } from '../../common/state/sessionProtocol.js';
import { getProtocolMessageSize, parseProtocolMessage, type IProtocolTransport } from '../../common/state/sessionTransport.js';

suite('AgentHostTcpConnection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function fixture(channel: string, isHost: boolean) {
		const sent: JsonRpcNotification[] = [];
		const errors: Error[] = [];
		let route: ((message: JsonRpcNotification) => void) | undefined;
		const transport: IProtocolTransport = {
			onMessage: Event.None, onClose: Event.None, dispose() { },
			send(message) {
				const parsed = parseProtocolMessage(JSON.stringify(message));
				assert.ok(isJsonRpcNotification(parsed));
				sent.push(parsed);
				route?.(parsed);
			},
		};
		const scheduler = store.add(new AgentHostChannelScheduler(transport, error => errors.push(error)));
		const stream = store.add(new AgentHostTcpConnection(channel, {
			clientReceive: agentHostTcpReceiveLimits, hostReceive: agentHostTcpReceiveLimits,
		}, isHost, transport, scheduler, error => errors.push(error), new AgentHostTcpBudget()));
		return {
			stream, sent, errors,
			route: (callback: (message: JsonRpcNotification) => void) => route = callback,
			receive(message: JsonRpcNotification) {
				const parsed = parseProtocolMessage(JSON.stringify(message));
				assert.ok(isJsonRpcNotification(parsed));
				scheduler.acceptMessage(parsed);
			},
		};
	}

	for (const pendingRead of [false, true]) {
		test(`consuming EOF ${pendingRead ? 'with a pending reader' : 'from the queue'} flushes credit and unblocks the peer drain`, async () => {
			const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
			store.add(toDisposable(() => clock.restore()));
			const channel = 'ahp-tcp:/eof';
			const sender = fixture(channel, true);
			const receiver = fixture(channel, false);
			sender.route(receiver.receive);
			receiver.route(sender.receive);
			await sender.stream.sendSnapshot(0);
			await receiver.stream.ready;
			const pending = pendingRead ? receiver.stream.read() : undefined;
			await sender.stream.end();
			const data = await (pending ?? receiver.stream.read());
			let drained = false;
			void sender.stream.drain().then(() => { drained = true; }, error => sender.errors.push(error));
			await clock.tickAsync(0);
			const consumedBytes = sender.sent.reduce((total, message) => total + getProtocolMessageSize(message), 0);
			assert.deepStrictEqual({ data, drained, credits: receiver.sent, errors: [...sender.errors, ...receiver.errors], elapsed: clock.now }, {
				data: undefined, drained: true,
				credits: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes } }],
				errors: [], elapsed: 0,
			});
		});
	}

	test('classifies invalid base64 and data after EOF as invalid messages', () => {
		const channel = 'ahp-tcp:/invalid';
		const malformed = fixture(channel, true);
		malformed.receive({ jsonrpc: '2.0', method: 'tcp/data', params: { channel, data: '%%%%' } });
		const noncanonical = fixture(channel, true);
		noncanonical.receive({ jsonrpc: '2.0', method: 'tcp/data', params: { channel, data: 'YR==' } });
		const ended = fixture(channel, true);
		ended.receive({ jsonrpc: '2.0', method: 'tcp/eof', params: { channel } });
		ended.receive({ jsonrpc: '2.0', method: 'tcp/data', params: { channel, data: 'YQ==' } });
		assert.deepStrictEqual([malformed, noncanonical, ended].map(h => h.errors.map(error => ({
			message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined,
		}))), [
			[{ message: 'Invalid TCP base64 data', code: AgentHostChannelErrorCode.InvalidMessage }],
			[{ message: 'Noncanonical TCP base64 data', code: AgentHostChannelErrorCode.InvalidMessage }],
			[{ message: 'TCP data outside the active receive direction', code: AgentHostChannelErrorCode.InvalidMessage }],
		]);
	});

	for (const isHost of [false, true]) {
		test(`resets the stream when a fragmented message exceeds the TCP ${isHost ? 'host' : 'client'} receive message bound`, async () => {
			const channel = 'ahp-tcp:/oversized';
			const sent: Parameters<IProtocolTransport['send']>[0][] = [];
			const failures: { error: Error; notifiedPeer: boolean }[] = [];
			const schedulerErrors: Error[] = [];
			let transportDisposed = false;
			const transport: IProtocolTransport = {
				onMessage: Event.None, onClose: Event.None,
				dispose() { transportDisposed = true; },
				send: message => { sent.push(message); },
			};
			const scheduler = store.add(new AgentHostChannelScheduler(transport, error => schedulerErrors.push(error)));
			const stream = store.add(new AgentHostTcpConnection(channel, {
				clientReceive: agentHostTcpReceiveLimits, hostReceive: agentHostTcpReceiveLimits,
			}, isHost, transport, scheduler, (error, notifiedPeer) => failures.push({ error, notifiedPeer }), new AgentHostTcpBudget()));
			if (!isHost) {
				const snapshot = parseProtocolMessage(JSON.stringify({
					jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: { resource: channel, state: {}, fromSeq: 0 } },
				}));
				assert.ok(isJsonRpcNotification(snapshot));
				scheduler.acceptMessage(snapshot);
				await stream.ready;
				stream.flushCredit();
				sent.length = 0;
			}
			const maximumMessageBytes = agentHostTcpReceiveLimits.windowBytes + agentHostTcpReceiveLimits.maximumFrameBytes + 64 * 1024;
			const text = JSON.stringify({ jsonrpc: '2.0', method: 'tcp/data', params: { channel, data: 'YWFh'.repeat(maximumMessageBytes / 8) } });
			const rejected = assert.rejects(stream.read(), /Channel reassembly capacity exceeded/);
			const fragmentCharacters = agentHostTcpReceiveLimits.maximumFrameBytes / 4;
			for (let offset = 0; offset < text.length; offset += fragmentCharacters) {
				const frame: JsonRpcNotification = {
					jsonrpc: '2.0', method: 'channel/frame',
					params: { channel, data: text.slice(offset, offset + fragmentCharacters), final: offset + fragmentCharacters >= text.length },
				};
				const parsed = parseProtocolMessage(JSON.stringify(frame));
				assert.ok(isJsonRpcNotification(parsed));
				scheduler.acceptMessage(parsed);
				stream.flushCredit();
			}
			await rejected;
			assert.deepStrictEqual({
				failures: failures.map(({ error, notifiedPeer }) => ({ message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined, notifiedPeer })),
				controls: sent.filter(message => hasKey(message, { method: true }) && (message.method === 'tcp/reset' || message.method === 'unsubscribe')),
				schedulerErrors, transportDisposed,
			}, {
				failures: [{ message: 'Channel reassembly capacity exceeded', code: AgentHostChannelErrorCode.MessageLimitExceeded, notifiedPeer: true }],
				controls: (isHost ? ['tcp/reset'] : ['tcp/reset', 'unsubscribe']).map(method => ({ jsonrpc: '2.0', method, params: { channel } })),
				schedulerErrors: [], transportDisposed: false,
			});
		});
	}

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
			}, isHost, transport, scheduler, error => failures.push(error), new AgentHostTcpBudget()));
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
			assert.ok(sent.length <= Math.ceil(receivedBytes / (agentHostTcpReceiveLimits.windowBytes * 0.75)));
		});
	}
});
