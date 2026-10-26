/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { vObj, vString } from '../../../../base/common/validation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostChannelDelivery, AgentHostChannelScheduler } from '../../common/agentHostChannelDelivery.js';
import { isJsonRpcNotification, type JsonRpcNotification } from '../../common/state/sessionProtocol.js';
import { getProtocolMessageSize, parseProtocolMessage, type IProtocolTransport } from '../../common/state/sessionTransport.js';

suite('AgentHostChannelDelivery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const channel = 'test:/delivery';
	const limits = { windowBytes: 2048, maximumFrameBytes: 1024 };
	const notification = (data: string, method = 'example/data'): JsonRpcNotification => ({
		jsonrpc: '2.0', method, params: { channel, data },
	});

	function fixture(options: { windowBytes?: number; receiveWindowBytes?: number; maximumBufferedBytes?: number; release?: boolean } = {}) {
		const sent: JsonRpcNotification[] = [];
		const received: JsonRpcNotification[] = [];
		const releases: (() => void)[] = [];
		const errors: Error[] = [];
		let receive: ((text: string) => void) | undefined;
		let bufferedAmount = 0;
		let bufferChecks = 0;
		let transportDisposed = false;
		const transport: IProtocolTransport = {
			get bufferedAmount() { bufferChecks++; return bufferedAmount; },
			onMessage: Event.None, onClose: Event.None, dispose() { transportDisposed = true; },
			send(message) {
				const text = JSON.stringify(message);
				const parsed = parseProtocolMessage(text);
				assert.ok(isJsonRpcNotification(parsed));
				sent.push(parsed);
				receive?.(text);
			},
		};
		const scheduler = store.add(new AgentHostChannelScheduler(transport, error => errors.push(error)));
		const delivery = store.add(new AgentHostChannelDelivery(channel,
			{ ...limits, windowBytes: options.windowBytes ?? limits.windowBytes },
			{ ...limits, windowBytes: options.receiveWindowBytes ?? limits.windowBytes }, transport, scheduler,
			(message, release) => {
				received.push(message);
				releases.push(release);
				if (options.release) { release(); }
			}, error => errors.push(error), options.maximumBufferedBytes));
		return {
			transport, scheduler, delivery, sent, received, releases, errors,
			route: (callback: (text: string) => void) => receive = callback,
			setBufferedAmount: (bytes: number) => bufferedAmount = bytes,
			get bufferChecks() { return bufferChecks; },
			get transportDisposed() { return transportDisposed; },
		};
	}

	test('sizes fragments to the remaining credit, even below the frame limit', async () => {
		const sender = fixture();
		const receiver = fixture({ release: true });
		const receive = (text: string) => {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			receiver.scheduler.acceptMessage(message);
		};
		sender.route(receive);
		receiver.route(text => {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			sender.scheduler.acceptMessage(message);
		});
		sender.delivery.setSendLimits({ windowBytes: 256, maximumFrameBytes: 1024 });
		const message = notification('x'.repeat(300));
		await sender.delivery.send(message);
		assert.deepStrictEqual(receiver.received, [message]);
		assert.ok(sender.sent.length > 1);
		assert.ok(sender.sent.every(frame => frame.method === 'channel/frame' && JSON.stringify(frame).length * 2 <= 256));
		assert.deepStrictEqual([...sender.errors, ...receiver.errors], []);
	});

	test('tiny windows make progress through escaped and surrogate-pair fragments', async () => {
		const sender = fixture({ windowBytes: 1 });
		const receiver = fixture({ receiveWindowBytes: 1, release: true });
		sender.route(text => {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			receiver.scheduler.acceptMessage(message);
		});
		receiver.route(text => {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			sender.scheduler.acceptMessage(message);
		});
		const message = notification('\\\n\u0000\uD83D\uDE00'.repeat(10));
		await sender.delivery.send(message);
		assert.deepStrictEqual(receiver.received, [message]);
		assert.ok(sender.sent.length > 1);
		assert.deepStrictEqual([...sender.errors, ...receiver.errors], []);
	});

	test('limits duplicate and unknown-channel controls by transport, not subscription', () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			for (let i = 0; i < 4096; i++) {
				const message = parseProtocolMessage(JSON.stringify({
					jsonrpc: '2.0', method: 'channel/credit', params: { channel: i % 2 ? channel : 'test:/unknown', consumedBytes: 0 },
				}));
				assert.ok(isJsonRpcNotification(message));
				h.scheduler.acceptMessage(message);
			}
			assert.strictEqual(h.errors.length, 0);
			const excess = parseProtocolMessage(JSON.stringify({ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: 0 } }));
			assert.ok(isJsonRpcNotification(excess));
			h.scheduler.acceptMessage(excess);
			assert.match(h.errors[0].message, /control receive budget/);
			assert.strictEqual(h.transportDisposed, true);
		} finally {
			clock.restore();
		}
	});

	test('replenishes control allowance without treating duplicate credit as invalid', () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			const credit = parseProtocolMessage(JSON.stringify({ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: 0 } }));
			assert.ok(isJsonRpcNotification(credit));
			for (let second = 0; second < 2; second++) {
				for (let i = 0; i < 4096; i++) {
					h.scheduler.acceptMessage(credit);
				}
				clock.tick(1000);
			}
			assert.deepStrictEqual(h.errors, []);
		} finally {
			clock.restore();
		}
	});

	test('a paced sender stays within the peer receive budget when delivery is bunched', async () => {
		const clock = sinon.useFakeTimers();
		try {
			// The receiver checks controls when they arrive. A busy peer or congested
			// transport can deliver a second of paced controls from 256 streams at once.
			const receiver = fixture();
			const queued: string[] = [];
			const sender = fixture();
			sender.route(text => queued.push(text));
			for (let ms = 0; ms < 1000; ms++) {
				for (let i = 0; i < 16; i++) {
					sender.scheduler.sendControl({ jsonrpc: '2.0', method: 'channel/credit', params: { channel: `test:/${(ms * 16 + i) % 256}`, consumedBytes: ms } });
				}
				await clock.tickAsync(1);
			}
			for (const text of queued.splice(0)) {
				const message = parseProtocolMessage(text);
				assert.ok(isJsonRpcNotification(message));
				receiver.scheduler.acceptMessage(message);
			}
			assert.deepStrictEqual({ senderErrors: sender.errors, receiverErrors: receiver.errors }, { senderErrors: [], receiverErrors: [] });
		} finally {
			clock.restore();
		}
	});

	test('bounds aggregate control bytes independently of the message count', () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			const reset = parseProtocolMessage(JSON.stringify(notification('x'.repeat(7000), 'tcp/reset')));
			assert.ok(isJsonRpcNotification(reset));
			const allowance = Math.floor(1024 * 1024 / getProtocolMessageSize(reset));
			for (let i = 0; i < allowance; i++) {
				assert.strictEqual(h.scheduler.checkControl(reset), true);
			}
			assert.strictEqual(h.scheduler.checkControl(reset), false);
			assert.strictEqual(h.transportDisposed, true);
		} finally {
			clock.restore();
		}
	});

	test('coalesces queued credits and preserves control ordering through transport congestion', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			h.setBufferedAmount(1024 * 1024);
			const control = (method: string, consumedBytes?: number): JsonRpcNotification => ({
				jsonrpc: '2.0', method, params: { channel, ...(consumedBytes === undefined ? {} : { consumedBytes }) },
			});
			h.scheduler.sendControl(control('channel/credit', 10));
			h.scheduler.sendControl(control('channel/credit', 20));
			h.scheduler.sendControl(control('tcp/reset'));
			h.scheduler.sendControl(control('unsubscribe'));
			assert.deepStrictEqual(h.sent, []);
			h.setBufferedAmount(256 * 1024);
			await clock.tickAsync(25);
			assert.deepStrictEqual(h.sent, [control('channel/credit', 20), control('tcp/reset'), control('unsubscribe')]);
			assert.deepStrictEqual(h.errors, []);
		} finally {
			clock.restore();
		}
	});

	test('bounds the outgoing control queue and throttles sends without dropping the latest credit', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			// Controls are paced at half the peer's receive budget.
			for (let i = 0; i < 2049; i++) {
				h.scheduler.sendControl({ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: i } });
			}
			assert.strictEqual(h.sent.length, 2048);
			await clock.tickAsync(25);
			assert.strictEqual(h.sent.length, 2049);
			assert.deepStrictEqual(h.sent.at(-1)?.params, { channel, consumedBytes: 2048 });
			assert.deepStrictEqual(h.errors, []);

			const congested = fixture();
			congested.setBufferedAmount(1024 * 1024);
			for (let i = 0; i < 1024 && !congested.transportDisposed; i++) {
				congested.scheduler.sendControl({ jsonrpc: '2.0', method: 'tcp/reset', params: { channel: `ahp-tcp:/${i}` } });
			}
			assert.strictEqual(congested.sent.length, 0);
			assert.strictEqual(congested.transportDisposed, true);
			assert.match(congested.errors[0].message, /control send queue capacity/);
		} finally {
			clock.restore();
		}
	});

	test('outgoing controls honor the individual size limit and reserved transport capacity', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			const reset = notification('', 'tcp/reset');
			const bytes = JSON.stringify(reset).length * 2;
			h.setBufferedAmount(320 * 1024 - bytes + 1);
			h.scheduler.sendControl(reset);
			assert.strictEqual(h.sent.length, 0);
			h.setBufferedAmount(320 * 1024 - bytes);
			await clock.tickAsync(25);
			assert.deepStrictEqual(h.sent, [reset]);

			const oversized = fixture();
			oversized.scheduler.sendControl(notification('x'.repeat(8192), 'tcp/reset'));
			assert.strictEqual(oversized.sent.length, 0);
			assert.strictEqual(oversized.transportDisposed, true);
			assert.match(oversized.errors[0].message, /oversized channel control/);
		} finally {
			clock.restore();
		}
	});

	test('does not accept data against credit still queued behind transport backpressure', () => {
		const h = fixture({ receiveWindowBytes: 1, release: true });
		h.setBufferedAmount(1024 * 1024);
		const data = parseProtocolMessage(JSON.stringify(notification('data')));
		assert.ok(isJsonRpcNotification(data));
		h.scheduler.acceptMessage(data);
		h.delivery.flushCredit();
		assert.deepStrictEqual(h.sent, []);
		h.scheduler.acceptMessage(data);
		assert.match(h.errors[0].message, /receive limit/);
	});

	test('channel reuse cannot receive controls queued for the previous incarnation', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			h.setBufferedAmount(1024 * 1024);
			h.scheduler.sendControl({ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: 42 } });
			h.scheduler.sendControl({ jsonrpc: '2.0', method: 'tcp/reset', params: { channel } });
			h.delivery.dispose();
			const replacement = store.add(new AgentHostChannelDelivery(channel, limits, limits, h.transport, h.scheduler, () => { }, error => h.errors.push(error)));
			const sent = replacement.send(notification('replacement'));
			h.setBufferedAmount(0);
			await clock.tickAsync(25);
			await sent;
			assert.deepStrictEqual(h.sent, [notification('replacement')]);
		} finally {
			clock.restore();
		}
	});

	test('admits over 1024 small messages up to the negotiated byte window', () => {
		const windowBytes = 256 * 1024;
		const h = fixture({ receiveWindowBytes: windowBytes });
		const message = notification('YQ==', 'tcp/data');
		const bytes = JSON.stringify(message).length * 2;
		const count = Math.ceil(windowBytes / bytes);
		assert.ok(count > 1100);
		for (let i = 0; i < count; i++) {
			h.delivery.accept(message, bytes);
		}
		assert.deepStrictEqual(h.errors, []);
		assert.strictEqual(h.received.length, count);
		for (const release of h.releases.toReversed()) { release(); }
		h.delivery.flushCredit();
		assert.deepStrictEqual(h.sent.at(-1)?.params, { channel, consumedBytes: count * bytes });

		const overrun = fixture({ receiveWindowBytes: windowBytes });
		for (let i = 0; i <= count; i++) {
			overrun.delivery.accept(message, bytes);
		}
		assert.strictEqual(overrun.received.length, count);
		assert.match(overrun.errors[0].message, /receive limit/);
	});

	test('backs off transport-buffer polling and resumes queued sends after drain', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture();
			h.setBufferedAmount(256 * 1024);
			const sent = h.delivery.send(notification('data'));
			await clock.tickAsync(100);
			assert.ok(h.bufferChecks <= 5, `Polled ${h.bufferChecks} times in 100ms`);
			assert.strictEqual(h.sent.length, 0);
			h.setBufferedAmount(0);
			await clock.tickAsync(25);
			await sent;
			assert.strictEqual(h.sent.length, 1);
		} finally {
			clock.restore();
		}
	});

	test('batches fragments fairly within a bounded burst before yielding to a timer', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		try {
			const h = fixture({ windowBytes: 4 * 1024 * 1024 });
			const otherChannel = 'test:/other';
			const other = store.add(new AgentHostChannelDelivery(otherChannel,
				{ ...limits, windowBytes: 4 * 1024 * 1024 }, limits, h.transport, h.scheduler,
				() => { }, error => h.errors.push(error)));
			const first = h.delivery.send(notification('x'.repeat(256 * 1024)));
			const second = other.send({ jsonrpc: '2.0', method: 'example/data', params: { channel: otherChannel, data: 'y'.repeat(256 * 1024) } });
			const sent = Promise.allSettled([first, second]);
			clock.runMicrotasks();
			assert.ok(h.sent.length > 2, 'Available credit should allow more than one frame per channel before a timer');
			const bytes = h.sent.reduce((total, message) => total + JSON.stringify(message).length * 2, 0);
			assert.ok(bytes <= 256 * 1024, 'A burst must yield before exceeding the transport byte budget');
			assert.ok(bytes > 255 * 1024, 'A ready channel should use the available burst budget');
			const channels = h.sent.slice(0, 4).map(message => vObj({ channel: vString() }).validateOrThrow(message.params).channel);
			assert.deepStrictEqual(channels, [channel, otherChannel, channel, otherChannel]);
			await clock.runAllAsync();
			assert.ok((await sent).every(result => result.status === 'fulfilled'));
			assert.deepStrictEqual(h.errors, []);
		} finally {
			clock.restore();
		}
	});

	test('refills a channel from promise continuations without a timer per message', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const h = fixture({ windowBytes: 256 * 1024 });
			const message = notification('small');
			const writer = (async () => {
				for (let i = 0; i < 100; i++) {
					await h.delivery.send(message);
				}
			})();
			const done = Promise.allSettled([writer]);
			await clock.tickAsync(0);
			assert.strictEqual(h.sent.length, 100);
			assert.deepStrictEqual(await done, [{ status: 'fulfilled', value: undefined }]);
		} finally {
			clock.restore();
		}
	});

	test('direct messages account for the complete serialized notification and partial credit', async () => {
		const h = fixture({ windowBytes: 1 });
		const message = notification('hello');
		const first = h.delivery.send(message);
		h.delivery.sendFrame();
		const bytes = JSON.stringify(message).length * 2;
		assert.strictEqual(await first, bytes);
		const second = h.delivery.send(message);
		assert.strictEqual(h.delivery.canSend, false);
		h.delivery.acceptCredit(bytes - 1);
		assert.strictEqual(h.delivery.canSend, false);
		h.delivery.acceptCredit(bytes);
		h.delivery.sendFrame();
		assert.strictEqual(await second, bytes * 2);
		h.delivery.acceptCredit(bytes - 1);
		assert.deepStrictEqual(h.sent, [message, message]);
	});

	test('receive credit preserves original whitespace and escaping, and waits for release', () => {
		const h = fixture();
		const text = '{ "jsonrpc": "2.0", "method": "example/data", "params": { "channel": "test:/delivery", "data": "\\u0061" } }';
		const message = parseProtocolMessage(text);
		assert.ok(isJsonRpcNotification(message));
		assert.strictEqual(getProtocolMessageSize(message), text.length * 2);
		h.scheduler.acceptMessage(message);
		h.delivery.flushCredit();
		assert.deepStrictEqual(h.sent, []);
		h.releases[0]();
		h.releases[0]();
		h.delivery.flushCredit();
		assert.deepStrictEqual(h.sent, [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: text.length * 2 } }]);
	});

	test('fragmentation larger than the window progresses, preserves payloads, and bounds each frame', async () => {
		const sender = fixture();
		const receiver = fixture({ release: true });
		sender.route(text => {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			receiver.scheduler.acceptMessage(message);
		});
		receiver.route(text => {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			sender.scheduler.acceptMessage(message);
		});
		const message = notification(('a"\\\n' + '\u{1F680}' + '\ud800').repeat(3000));
		await sender.delivery.send(message);
		await sender.delivery.drain();
		assert.deepStrictEqual(receiver.received, [message]);
		assert.deepStrictEqual([...sender.errors, ...receiver.errors], []);
		assert.ok(sender.sent.length > 2);
		assert.ok(sender.sent.every(frame => frame.method === 'channel/frame' && JSON.stringify(frame).length * 2 <= limits.maximumFrameBytes));
	});

	test('control bypasses a full window and interrupts partial reassembly', () => {
		const h = fixture();
		const accept = (message: JsonRpcNotification) => h.delivery.accept(message, JSON.stringify(message).length * 2);
		accept(notification('{"jsonrpc":', 'channel/frame'));
		accept(notification('', 'tcp/reset'));
		assert.deepStrictEqual(h.received.map(message => message.method), ['tcp/reset']);
		assert.deepStrictEqual(h.errors, []);
	});

	test('credits incomplete fragments without a timer when the sender uses a smaller window', () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		try {
			const h = fixture({ receiveWindowBytes: 256 * 1024 });
			const frame = notification('{"jsonrpc":', 'channel/frame');
			const bytes = JSON.stringify(frame).length * 2;
			h.delivery.accept(frame, bytes);
			clock.runMicrotasks();
			assert.deepStrictEqual({
				sent: h.sent,
				received: h.received,
				errors: h.errors,
			}, {
				sent: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: bytes } }],
				received: [],
				errors: [],
			});
		} finally {
			clock.restore();
		}
	});

	test('prompt fragment credits still respect the control rate limit and coalesce while throttled', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'queueMicrotask'] });
		try {
			const h = fixture({ receiveWindowBytes: 256 * 1024 });
			const frame = notification('{', 'channel/frame');
			const bytes = JSON.stringify(frame).length * 2;
			for (let i = 0; i < 2050; i++) {
				h.delivery.accept(frame, bytes);
				clock.runMicrotasks();
			}
			const immediate = h.sent.length;
			await clock.tickAsync(25);
			assert.deepStrictEqual({
				immediate,
				afterRefill: h.sent.length,
				lastCredit: h.sent.at(-1)?.params,
				errors: h.errors,
			}, {
				immediate: 2048,
				afterRefill: 2049,
				lastCredit: { channel, consumedBytes: bytes * 2050 },
				errors: [],
			});
		} finally {
			clock.restore();
		}
	});

	test('disposal cancels a queued prompt credit before a channel URI can be reused', () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		try {
			const h = fixture();
			const frame = notification('{', 'channel/frame');
			h.delivery.accept(frame, JSON.stringify(frame).length * 2);
			h.delivery.dispose();
			clock.runMicrotasks();
			assert.deepStrictEqual(h.sent, []);
		} finally {
			clock.restore();
		}
	});

	test('credits a quarter of the window promptly and coalesces smaller releases', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		try {
			const h = fixture({ release: true });
			const message = notification('data');
			const bytes = JSON.stringify(message).length * 2;
			const credits = () => h.sent.filter(sent => sent.method === 'channel/credit').map(sent => (sent.params as { consumedBytes: number }).consumedBytes);
			h.delivery.accept(message, bytes);
			h.delivery.accept(message, bytes);
			clock.runMicrotasks();
			const small = credits();
			await clock.tickAsync(10);
			const coalesced = credits();
			const count = Math.ceil(limits.windowBytes / 4 / bytes);
			for (let i = 0; i < count; i++) {
				h.delivery.accept(message, bytes);
			}
			clock.runMicrotasks();
			assert.deepStrictEqual({ small, coalesced, prompt: credits() }, { small: [], coalesced: [bytes * 2], prompt: [bytes * 2, bytes * (2 + count)] });
		} finally {
			clock.restore();
		}
	});

	test('release receipts credit only the contiguous consumed prefix', () => {
		const h = fixture();
		const message = notification('data');
		const bytes = JSON.stringify(message).length * 2;
		h.delivery.accept(message, bytes);
		h.delivery.accept(message, bytes);
		h.releases[1]();
		h.delivery.flushCredit();
		assert.strictEqual(h.sent.length, 0);
		h.releases[0]();
		h.delivery.flushCredit();
		assert.deepStrictEqual(h.sent.at(-1)?.params, { channel, consumedBytes: bytes * 2 });
	});

	test('rejects oversized raw frames and unavailable receive-size metadata', () => {
		const h = fixture();
		h.delivery.accept(notification('small'), limits.maximumFrameBytes + 1);
		assert.match(h.errors[0].message, /receive limit/);
		const other = fixture();
		other.scheduler.acceptMessage(notification('small'));
		assert.match(other.errors[0].message, /preserve.*size/);
	});

	test('independent local bounds stop reassembly even while fragments are credited', () => {
		const h = fixture({ maximumBufferedBytes: 512 });
		for (let i = 0; i < 3; i++) {
			const fragment = notification('x'.repeat(100), 'channel/frame');
			h.delivery.accept(fragment, JSON.stringify(fragment).length * 2);
			h.delivery.flushCredit();
		}
		assert.match(h.errors[0].message, /reassembly capacity/);
	});

	test('rejects interleaving, recursive frames, exempt fragments, and mismatched channels', () => {
		for (const inner of [
			notification('x', 'channel/frame'), notification('', 'tcp/reset'),
			{ ...notification('x'), params: { channel: 'other:/' } },
			{ ...notification('x'), id: 1 },
		]) {
			const h = fixture();
			const frame = { jsonrpc: '2.0' as const, method: 'channel/frame', params: { channel, data: JSON.stringify(inner), final: true } };
			h.delivery.accept(frame, JSON.stringify(frame).length * 2);
			assert.strictEqual(h.errors.length, 1);
			assert.deepStrictEqual(h.received, []);
		}
		const h = fixture();
		const fragment = notification('{', 'channel/frame');
		h.delivery.accept(fragment, JSON.stringify(fragment).length * 2);
		const direct = notification('x');
		h.delivery.accept(direct, JSON.stringify(direct).length * 2);
		assert.match(h.errors[0].message, /interleaved/);
	});

	test('invalid credit fails pending writes and drains', async () => {
		const h = fixture({ windowBytes: 1 });
		const first = h.delivery.send(notification('first'));
		h.delivery.sendFrame();
		await first;
		const second = assert.rejects(h.delivery.send(notification('second')), /Invalid channel credit/);
		const drain = assert.rejects(h.delivery.drain(), /Invalid channel credit/);
		h.delivery.acceptCredit(Number.MAX_SAFE_INTEGER);
		await Promise.all([second, drain]);
	});

	test('live limit updates preserve queued messages and cumulative counters', async () => {
		const h = fixture({ windowBytes: 1 });
		const first = h.delivery.send(notification('first'));
		h.delivery.sendFrame();
		const firstEnd = await first;
		const second = h.delivery.send(notification('second'));
		h.delivery.setSendLimits(limits);
		h.delivery.sendFrame();
		assert.ok(await second > firstEnd);
		assert.deepStrictEqual(h.sent.map(message => message.params), [{ channel, data: 'first' }, { channel, data: 'second' }]);
	});

	test('synchronous transport failure rejects the final message instead of reporting success', async () => {
		const h = fixture();
		h.route(() => h.delivery.fail(new Error('Disconnected')));
		const sent = assert.rejects(h.delivery.send(notification('x')), /Disconnected/);
		h.delivery.sendFrame();
		await sent;
	});

	test('send queue and count bounds reject overload without corrupting accepted data', async () => {
		const h = fixture({ maximumBufferedBytes: 512 });
		await assert.rejects(h.delivery.send(notification('x'.repeat(512))), /capacity/);
		const accepted = h.delivery.send(notification('small'));
		h.delivery.sendFrame();
		await accepted;
		assert.deepStrictEqual(h.sent, [notification('small')]);
	});
});
