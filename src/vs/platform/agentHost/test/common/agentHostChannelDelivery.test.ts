/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { vObj, vString } from '../../../../base/common/validation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostChannelDelivery, AgentHostChannelScheduler } from '../../common/agentHostChannelDelivery.js';
import { AgentHostChannelError, AgentHostChannelErrorCode } from '../../common/agentHostChannelTelemetry.js';
import { isJsonRpcNotification, type JsonRpcNotification } from '../../common/state/sessionProtocol.js';
import { getProtocolMessageSize, parseProtocolMessage, type IProtocolTransport } from '../../common/state/sessionTransport.js';

suite('AgentHostChannelDelivery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const channel = 'test:/delivery';
	const limits = { windowBytes: 2048, maximumFrameBytes: 1024 };
	const notification = (data: string, method = 'example/data'): JsonRpcNotification => ({
		jsonrpc: '2.0', method, params: { channel, data },
	});

	function fixture(options: { windowBytes?: number; receiveWindowBytes?: number; maximumBufferedBytes?: number; maximumMessageBytes?: number; release?: boolean } = {}) {
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
			}, error => errors.push(error), options.maximumBufferedBytes, options.maximumMessageBytes));
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
		const receiver = fixture({ receiveWindowBytes: 256, release: true });
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
		store.add(toDisposable(() => clock.restore()));
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
	});

	test('replenishes control allowance without treating duplicate credit as invalid', () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
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
	});

	test('a paced sender stays within the peer receive budget when delivery is bunched', () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
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
			// Controls are paced with timers only, so ticking synchronously avoids a real
			// (and in browsers, clamped) timer per millisecond, which can exceed the test timeout
			clock.tick(1);
		}
		for (const text of queued.splice(0)) {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			receiver.scheduler.acceptMessage(message);
		}
		assert.deepStrictEqual({ senderErrors: sender.errors, receiverErrors: receiver.errors }, { senderErrors: [], receiverErrors: [] });
	});

	test('bounds aggregate control bytes independently of the message count', () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
		const h = fixture();
		const reset = parseProtocolMessage(JSON.stringify(notification('x'.repeat(7000), 'tcp/reset')));
		assert.ok(isJsonRpcNotification(reset));
		const allowance = Math.floor(1024 * 1024 / getProtocolMessageSize(reset));
		for (let i = 0; i < allowance; i++) {
			assert.strictEqual(h.scheduler.checkControl(reset), true);
		}
		assert.strictEqual(h.scheduler.checkControl(reset), false);
		assert.strictEqual(h.transportDisposed, true);
	});

	test('coalesces queued credits and preserves control ordering through transport congestion', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
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
	});

	test('bounds the outgoing control queue and throttles sends without dropping the latest credit', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
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
	});

	test('outgoing controls honor the individual size limit and reserved transport capacity', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
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
		store.add(toDisposable(() => clock.restore()));
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
		store.add(toDisposable(() => clock.restore()));
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
	});

	test('batches fragments fairly within a bounded burst before yielding to a timer', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
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
	});

	test('refills a channel from promise continuations without a timer per message', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
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
		receiver.delivery.flushCredit();
		await sender.delivery.drain();
		assert.deepStrictEqual(receiver.received, [message]);
		assert.deepStrictEqual([...sender.errors, ...receiver.errors], []);
		assert.ok(sender.sent.length > 2);
		assert.ok(sender.sent.every(frame => frame.method === 'channel/frame' && JSON.stringify(frame).length * 2 <= limits.maximumFrameBytes));
	});

	test('reassembles consecutive fragmented messages and rejects only a surrogate pair split across fragments', () => {
		const h = fixture({ release: true, receiveWindowBytes: 1024 * 1024 });
		const acceptFragments = (text: string, size: number) => {
			for (let offset = 0; offset < text.length; offset += size) {
				const frame: JsonRpcNotification = {
					jsonrpc: '2.0', method: 'channel/frame',
					params: { channel, data: text.slice(offset, offset + size), final: offset + size >= text.length },
				};
				h.delivery.accept(frame, JSON.stringify(frame).length * 2);
				h.delivery.flushCredit();
			}
		};
		const first = notification('a'.repeat(500));
		const second = notification('b\u00e9'.repeat(100));
		acceptFragments(JSON.stringify(first), 7);
		acceptFragments(JSON.stringify(second), 50);
		const pair = notification('\u{1F680}');
		const split = JSON.stringify(pair);
		acceptFragments(split, split.indexOf('\u{1F680}'));
		acceptFragments(split, split.indexOf('\u{1F680}') + 1);
		assert.deepStrictEqual({ received: h.received, errors: h.errors.map(error => error.message) }, {
			received: [first, second, pair], errors: ['Channel fragment split a surrogate pair'],
		});
	});

	test('control bypasses a full window and interrupts partial reassembly', () => {
		const h = fixture();
		const accept = (message: JsonRpcNotification) => h.delivery.accept(message, JSON.stringify(message).length * 2);
		accept(notification('{"jsonrpc":', 'channel/frame'));
		accept(notification('', 'tcp/reset'));
		assert.deepStrictEqual(h.received.map(message => message.method), ['tcp/reset']);
		assert.deepStrictEqual(h.errors, []);
	});

	test('batches incomplete fragments for five seconds below the credit threshold', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const h = fixture({ receiveWindowBytes: 256 * 1024 });
		const frame = notification('{"jsonrpc":', 'channel/frame');
		const bytes = JSON.stringify(frame).length * 2;
		h.delivery.accept(frame, bytes);
		clock.runMicrotasks();
		const immediate = [...h.sent];
		await clock.tickAsync(4999);
		const beforeDeadline = [...h.sent];
		await clock.tickAsync(1);
		assert.deepStrictEqual({ immediate, beforeDeadline, sent: h.sent, received: h.received, errors: h.errors }, {
			immediate: [], beforeDeadline: [],
			sent: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: bytes } }],
			received: [], errors: [],
		});
	});

	test('explicit fragment credit flushes respect the control rate limit and coalesce while throttled', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const h = fixture({ receiveWindowBytes: 256 * 1024 });
		const frame = notification('{', 'channel/frame');
		const bytes = JSON.stringify(frame).length * 2;
		for (let i = 0; i < 2050; i++) {
			h.delivery.accept(frame, bytes);
			h.delivery.flushCredit();
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
	});

	test('disposal cancels a queued prompt credit before a channel URI can be reused', () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const h = fixture({ receiveWindowBytes: 1 });
		const frame = notification('{', 'channel/frame');
		h.delivery.accept(frame, JSON.stringify(frame).length * 2);
		h.delivery.dispose();
		clock.runMicrotasks();
		assert.deepStrictEqual(h.sent, []);
	});

	test('credits three quarters of the window promptly', () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const message = notification('data');
		const bytes = JSON.stringify(message).length * 2;
		const h = fixture({ receiveWindowBytes: bytes * 4, release: true });
		h.delivery.accept(message, bytes);
		h.delivery.accept(message, bytes);
		clock.runMicrotasks();
		const belowThreshold = [...h.sent];
		h.delivery.accept(message, bytes);
		const beforeMicrotask = [...h.sent];
		clock.runMicrotasks();
		assert.deepStrictEqual({ belowThreshold, beforeMicrotask, sent: h.sent, errors: h.errors }, {
			belowThreshold: [], beforeMicrotask: [],
			sent: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: bytes * 3 } }],
			errors: [],
		});
	});

	test('does not restart the credit deadline when more bytes are released', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const h = fixture({ release: true });
		const message = notification('data');
		const bytes = JSON.stringify(message).length * 2;
		h.delivery.accept(message, bytes);
		await clock.tickAsync(4000);
		h.delivery.accept(message, bytes);
		await clock.tickAsync(999);
		const beforeDeadline = [...h.sent];
		await clock.tickAsync(1);
		assert.deepStrictEqual({ beforeDeadline, sent: h.sent, errors: h.errors }, {
			beforeDeadline: [],
			sent: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: bytes * 2 } }],
			errors: [],
		});
	});

	test('releasing exactly one outstanding window resumes the sender without a timer', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const message = notification('data');
		const bytes = JSON.stringify(message).length * 2;
		const windowBytes = bytes * 4;
		const sender = fixture({ windowBytes });
		const receiver = fixture({ receiveWindowBytes: windowBytes });
		const route = (target: ReturnType<typeof fixture>) => (text: string) => {
			const parsed = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(parsed));
			target.scheduler.acceptMessage(parsed);
		};
		sender.route(route(receiver));
		receiver.route(route(sender));
		const writes = Array.from({ length: 5 }, () => sender.delivery.send(message));
		clock.runMicrotasks();
		const whileFull = { sent: sender.sent.length, canSend: sender.delivery.canSend };
		for (const release of receiver.releases) { release(); }
		clock.runMicrotasks();
		await Promise.all(writes);
		assert.deepStrictEqual({ whileFull, sent: sender.sent.length, credits: receiver.sent, errors: [...sender.errors, ...receiver.errors] }, {
			whileFull: { sent: 4, canSend: false }, sent: 5,
			credits: [{ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes: windowBytes } }],
			errors: [],
		});
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

	test('rejects fragmented messages above the receive per-message bound even while fragments are credited', () => {
		const h = fixture({ maximumBufferedBytes: 128, maximumMessageBytes: 512 });
		const text = JSON.stringify(notification('x'.repeat(200)));
		const frameBytes: number[] = [];
		const observations = [];
		for (let offset = 0; offset < text.length; offset += 100) {
			const frame: JsonRpcNotification = {
				jsonrpc: '2.0', method: 'channel/frame',
				params: { channel, data: text.slice(offset, offset + 100), final: offset + 100 >= text.length },
			};
			const bytes = JSON.stringify(frame).length * 2;
			frameBytes.push(bytes);
			h.delivery.accept(frame, bytes);
			h.delivery.flushCredit();
			observations.push({ errors: h.errors.map(error => ({ message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined })), credited: h.sent.at(-1)?.params });
		}
		assert.deepStrictEqual({ observations, received: h.received }, {
			observations: [
				{ errors: [], credited: { channel, consumedBytes: frameBytes[0] } },
				{ errors: [], credited: { channel, consumedBytes: frameBytes[0] + frameBytes[1] } },
				{ errors: [{ message: 'Channel reassembly capacity exceeded', code: AgentHostChannelErrorCode.MessageLimitExceeded }], credited: { channel, consumedBytes: frameBytes[0] + frameBytes[1] } },
			],
			received: [],
		});
	});

	test('accepts a fragmented message larger than the backlog bound and waits for release', () => {
		const h = fixture({ maximumBufferedBytes: 128 });
		const message = notification('x'.repeat(1024));
		const text = JSON.stringify(message);
		let wireBytes = 0;
		let finalFrameBytes = 0;
		for (let offset = 0; offset < text.length; offset += 100) {
			const frame: JsonRpcNotification = {
				jsonrpc: '2.0', method: 'channel/frame',
				params: { channel, data: text.slice(offset, offset + 100), final: offset + 100 >= text.length },
			};
			finalFrameBytes = JSON.stringify(frame).length * 2;
			wireBytes += finalFrameBytes;
			h.delivery.accept(frame, finalFrameBytes);
			h.delivery.flushCredit();
		}
		const beforeRelease = h.sent.at(-1)?.params;
		h.releases[0]();
		h.delivery.flushCredit();
		assert.deepStrictEqual({ beforeRelease, afterRelease: h.sent.at(-1)?.params, received: h.received, errors: h.errors }, {
			beforeRelease: { channel, consumedBytes: wireBytes - finalFrameBytes },
			afterRelease: { channel, consumedBytes: wireBytes },
			received: [message], errors: [],
		});
	});

	test('rejects reassembly while unreleased retained data exceeds the backlog bound', () => {
		const h = fixture({ maximumBufferedBytes: 512 });
		const retained = notification('x'.repeat(256));
		h.delivery.accept(retained, JSON.stringify(retained).length * 2);
		const fragment = notification('{', 'channel/frame');
		h.delivery.accept(fragment, JSON.stringify(fragment).length * 2);
		h.delivery.flushCredit();
		assert.deepStrictEqual({ received: h.received, sent: h.sent, errors: h.errors.map(error => error.message) }, {
			received: [retained], sent: [], errors: ['Channel reassembly capacity exceeded'],
		});
	});

	test('complete messages enforce per-message and retained-backlog bounds', () => {
		const message = notification('x'.repeat(256));
		const bytes = JSON.stringify(message).length * 2;
		const consumer = fixture({ maximumBufferedBytes: 512 });
		consumer.delivery.accept(message, bytes);
		consumer.delivery.accept(notification('next'), JSON.stringify(notification('next')).length * 2);
		const bounded = fixture({ maximumBufferedBytes: 2048, maximumMessageBytes: bytes });
		bounded.delivery.accept(message, bytes);
		const oversized = notification('x'.repeat(257));
		bounded.delivery.accept(oversized, JSON.stringify(oversized).length * 2);
		assert.deepStrictEqual([consumer, bounded].map(h => ({ received: h.received, errors: h.errors.map(error => ({ message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined })) })), [
			{ received: [message], errors: [{ message: 'Channel consumer capacity exceeded', code: AgentHostChannelErrorCode.BacklogLimitExceeded }] },
			{ received: [message], errors: [{ message: 'Channel consumer capacity exceeded', code: AgentHostChannelErrorCode.MessageLimitExceeded }] },
		]);
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

	test('exposes typed delivery, control-limit, and deliberate-close failures', () => {
		const credit = fixture();
		credit.delivery.acceptCredit(1);
		const receive = fixture();
		receive.delivery.accept(notification('small'), limits.maximumFrameBytes + 1);
		const control = fixture();
		control.scheduler.sendControl(notification('x'.repeat(8192), 'tcp/reset'));
		const disposed = fixture();
		disposed.delivery.dispose();
		assert.deepStrictEqual([credit, receive, control, disposed].map(h => h.errors.map(error => ({
			message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined,
		}))), [
			[{ message: 'Invalid channel credit', code: AgentHostChannelErrorCode.InvalidCredit }],
			[{ message: 'Channel receive limit exceeded', code: AgentHostChannelErrorCode.ReceiveLimitExceeded }],
			[
				{ message: 'Invalid or oversized channel control', code: AgentHostChannelErrorCode.ControlLimitExceeded },
				{ message: 'Agent host transport closed', code: AgentHostChannelErrorCode.Closed },
			],
			[{ message: 'Channel disposed', code: AgentHostChannelErrorCode.Closed }],
		]);
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

	test('merges blocked tails and shares byte totals', async () => {
		const h = fixture({ windowBytes: 1 });
		const blocker = notification('block');
		const blocked = h.delivery.send(blocker);
		h.delivery.sendFrame();
		const blockerEnd = await blocked;
		const previous = notification('first');
		const merged = notification('firstsecond');
		const offered: JsonRpcNotification[] = [];
		const first = h.delivery.send(previous);
		const second = h.delivery.send(notification('second'), tail => {
			offered.push(tail);
			return merged;
		});
		const whileFull = { sent: [...h.sent], canSend: h.delivery.canSend };
		h.delivery.acceptCredit(blockerEnd);
		h.delivery.sendFrame();
		const mergedEnd = blockerEnd + JSON.stringify(merged).length * 2;
		assert.deepStrictEqual({ whileFull, offered, sent: h.sent, results: await Promise.all([first, second]), errors: h.errors }, {
			whileFull: { sent: [blocker], canSend: false },
			offered: [previous],
			sent: [blocker, merged],
			results: [mergedEnd, mergedEnd],
			errors: [],
		});
	});

	test('stops merging blocked tails at the frame size', async () => {
		const h = fixture({ windowBytes: 1 });
		const blocker = notification('block');
		const blocked = h.delivery.send(blocker);
		h.delivery.sendFrame();
		const blockerEnd = await blocked;
		const frameDataLength = limits.maximumFrameBytes / 2 - JSON.stringify(notification('')).length;
		const data = 'x'.repeat(frameDataLength - 2);
		const offeredBytes: number[] = [];
		const merge = (suffix: string) => (tail: JsonRpcNotification) => {
			offeredBytes.push(JSON.stringify(tail).length * 2);
			return notification(vObj({ data: vString() }).validateOrThrow(tail.params).data + suffix);
		};
		const first = h.delivery.send(notification(data));
		const second = h.delivery.send(notification('y'), merge('y'));
		const third = h.delivery.send(notification('z'), merge('z'));
		const next = notification('next');
		const fourth = h.delivery.send(next, merge('next'));
		const whileFull = { sent: [...h.sent], canSend: h.delivery.canSend };
		h.delivery.setSendLimits(limits);
		while (h.delivery.canSend) {
			h.delivery.sendFrame();
		}
		const mergedEnd = blockerEnd + limits.maximumFrameBytes;
		assert.deepStrictEqual({ whileFull, offeredBytes, sent: h.sent, results: await Promise.all([first, second, third, fourth]), errors: h.errors }, {
			whileFull: { sent: [blocker], canSend: false },
			offeredBytes: [limits.maximumFrameBytes - 4, limits.maximumFrameBytes - 2],
			sent: [blocker, notification(data + 'yz'), next],
			results: [mergedEnd, mergedEnd, mergedEnd, mergedEnd + JSON.stringify(next).length * 2],
			errors: [],
		});
	});

	test('skips merging without a tail', async () => {
		const h = fixture();
		const message = notification('first');
		const offered: JsonRpcNotification[] = [];
		const sent = h.delivery.send(message, previous => {
			offered.push(previous);
			return notification('merged');
		});
		h.delivery.sendFrame();
		assert.deepStrictEqual({ offered, sent: h.sent, result: await sent, errors: h.errors }, {
			offered: [], sent: [message], result: JSON.stringify(message).length * 2, errors: [],
		});
	});

	test('skips merging partial tails', async () => {
		const h = fixture({ windowBytes: 1 });
		const receiver = fixture({ receiveWindowBytes: 16 * 1024 });
		h.route(text => {
			const message = parseProtocolMessage(text);
			assert.ok(isJsonRpcNotification(message));
			receiver.scheduler.acceptMessage(message);
		});
		const large = notification('x'.repeat(800));
		const first = h.delivery.send(large);
		h.delivery.sendFrame();
		const firstFrame = h.sent[0];
		const offered: JsonRpcNotification[] = [];
		const next = notification('second');
		const second = h.delivery.send(next, previous => {
			offered.push(previous);
			return notification('merged');
		});
		h.delivery.setSendLimits({ ...limits, windowBytes: 16 * 1024 });
		while (h.delivery.canSend) {
			h.delivery.sendFrame();
		}
		await Promise.all([first, second]);
		assert.deepStrictEqual({
			firstFrame: { method: firstFrame.method, final: (firstFrame.params as { final: boolean }).final },
			offered, received: receiver.received, errors: [...h.errors, ...receiver.errors],
		}, {
			firstFrame: { method: 'channel/frame', final: false },
			offered: [], received: [large, next], errors: [],
		});
	});

	test('queues when merge returns undefined', async () => {
		const h = fixture({ windowBytes: 1 });
		const blocker = notification('block');
		const blocked = h.delivery.send(blocker);
		h.delivery.sendFrame();
		await blocked;
		const previous = notification('first');
		const next = notification('second');
		const offered: JsonRpcNotification[] = [];
		const first = h.delivery.send(previous);
		const second = h.delivery.send(next, tail => {
			offered.push(tail);
			return undefined;
		});
		h.delivery.setSendLimits(limits);
		while (h.delivery.canSend) {
			h.delivery.sendFrame();
		}
		const firstEnd = (JSON.stringify(blocker).length + JSON.stringify(previous).length) * 2;
		assert.deepStrictEqual({ offered, sent: h.sent, results: await Promise.all([first, second]), errors: h.errors }, {
			offered: [previous], sent: [blocker, previous, next],
			results: [firstEnd, firstEnd + JSON.stringify(next).length * 2], errors: [],
		});
	});

	test('accepts merges above the receive per-message bound without corrupting queued data', async () => {
		const previous = notification('queued');
		const next = notification('after');
		const maximumMessageBytes = (JSON.stringify(previous).length + JSON.stringify(next).length) * 2;
		const h = fixture({ windowBytes: 1, maximumBufferedBytes: 128, maximumMessageBytes });
		const blocker = notification('block');
		const blocked = h.delivery.send(blocker);
		h.delivery.sendFrame();
		await blocked;
		const merged = notification('x'.repeat(maximumMessageBytes));
		const first = h.delivery.send(previous);
		const second = h.delivery.send(notification('second'), () => merged);
		const third = h.delivery.send(next);
		h.delivery.setSendLimits(limits);
		while (h.delivery.canSend) {
			h.delivery.sendFrame();
		}
		const mergedEnd = (JSON.stringify(blocker).length + JSON.stringify(merged).length) * 2;
		assert.deepStrictEqual({ sent: h.sent, results: await Promise.all([first, second, third]), errors: h.errors }, {
			sent: [blocker, merged, next], results: [mergedEnd, mergedEnd, mergedEnd + JSON.stringify(next).length * 2], errors: [],
		});
	});

	test('replaces merged tail bytes in the send backlog', async () => {
		const head = notification('head');
		const previous = notification('x'.repeat(100));
		const merged = notification('merged');
		const next = notification('next');
		const h = fixture({ maximumBufferedBytes: JSON.stringify(merged).length * 2 });
		const writes = [
			h.delivery.send(head),
			h.delivery.send(previous),
			h.delivery.send(notification('replacement'), () => merged),
			h.delivery.send(next),
		];
		await assert.rejects(h.delivery.send(notification('overload')), {
			message: 'Channel send queue capacity exceeded', code: AgentHostChannelErrorCode.BacklogLimitExceeded,
		});
		while (h.delivery.canSend) {
			h.delivery.sendFrame();
		}
		const headEnd = JSON.stringify(head).length * 2;
		const mergedEnd = headEnd + JSON.stringify(merged).length * 2;
		assert.deepStrictEqual({ sent: h.sent, results: await Promise.all(writes), errors: h.errors }, {
			sent: [head, merged, next],
			results: [headEnd, mergedEnd, mergedEnd, mergedEnd + JSON.stringify(next).length * 2], errors: [],
		});
	});

	test('send queue and count bounds reject overload without corrupting accepted data', async () => {
		const observations = [];
		const expected = [];
		for (const count of [3, 1024]) {
			const messages = Array.from({ length: count }, (_, index) => notification(String(index)));
			const maximumBufferedBytes = count === 3
				? JSON.stringify(messages[1]).length * 2
				: Number.POSITIVE_INFINITY;
			const h = fixture({ windowBytes: 1, maximumBufferedBytes });
			const blocker = notification('block');
			const blocked = h.delivery.send(blocker);
			h.delivery.sendFrame();
			await blocked;
			const accepted = messages.map(message => h.delivery.send(message));
			await assert.rejects(h.delivery.send(notification('overload')), {
				message: 'Channel send queue capacity exceeded', code: AgentHostChannelErrorCode.BacklogLimitExceeded,
			});
			h.delivery.setSendLimits({ ...limits, windowBytes: 1024 * 1024 });
			while (h.delivery.canSend) {
				h.delivery.sendFrame();
			}
			await Promise.all(accepted);
			observations.push({ count, sent: h.sent, errors: h.errors });
			expected.push({ count, sent: [blocker, ...messages], errors: [] });
		}
		assert.deepStrictEqual(observations, expected);
	});

	test('accepts small sends behind an oversized in-flight head and rejects an overflowing backlog', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const later = notification('later');
		const sender = fixture({ windowBytes: 1, maximumBufferedBytes: JSON.stringify(later).length * 2 });
		const receiver = fixture({ receiveWindowBytes: 16 * 1024, release: true });
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
		const head = notification('x'.repeat(2048));
		const writes = [sender.delivery.send(head)];
		sender.delivery.sendFrame();
		const inFlight = { frames: sender.sent.length, canSend: sender.delivery.canSend, received: [...receiver.received] };
		writes.push(sender.delivery.send(later), sender.delivery.send(later));
		await assert.rejects(sender.delivery.send(notification('overload')), {
			message: 'Channel send queue capacity exceeded', code: AgentHostChannelErrorCode.BacklogLimitExceeded,
		});
		sender.delivery.setSendLimits({ ...limits, windowBytes: 16 * 1024 });
		clock.runMicrotasks();
		await Promise.all(writes);
		receiver.delivery.flushCredit();
		await sender.delivery.drain();
		assert.deepStrictEqual({ inFlight, received: receiver.received, errors: [...sender.errors, ...receiver.errors] }, {
			inFlight: { frames: 1, canSend: false, received: [] }, received: [head, later, later], errors: [],
		});
	});

	test('queues a message much larger than the backlog bound behind a small head', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
		store.add(toDisposable(() => clock.restore()));
		const sender = fixture({ maximumBufferedBytes: 128 });
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
		const head = notification('head');
		const large = notification('x'.repeat(2048));
		const writes = [sender.delivery.send(head), sender.delivery.send(large)];
		const whileQueued = [...sender.sent];
		clock.runMicrotasks();
		await Promise.all(writes);
		receiver.delivery.flushCredit();
		await sender.delivery.drain();
		assert.deepStrictEqual({ whileQueued, received: receiver.received, errors: [...sender.errors, ...receiver.errors] }, {
			whileQueued: [], received: [head, large], errors: [],
		});
	});

	test('sends fragmented messages above the receive per-message and backlog bounds', async () => {
		const sender = fixture({ maximumBufferedBytes: 128, maximumMessageBytes: 128 });
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
		const message = notification('x'.repeat(2048));
		const sent = sender.delivery.send(message);
		const whileQueued = { sent: [...sender.sent], canSend: sender.delivery.canSend };
		await sent;
		receiver.delivery.flushCredit();
		await sender.delivery.drain();
		assert.deepStrictEqual({
			whileQueued,
			received: receiver.received,
			fragmented: sender.sent.length > 1,
			bounded: sender.sent.every(frame => frame.method === 'channel/frame' && JSON.stringify(frame).length * 2 <= limits.maximumFrameBytes),
			errors: [...sender.errors, ...receiver.errors],
		}, {
			whileQueued: { sent: [], canSend: true },
			received: [message], fragmented: true, bounded: true, errors: [],
		});
	});

	test('rejects received messages above the per-message bound without corrupting accepted data', () => {
		const message = notification('allowed');
		const maximumMessageBytes = JSON.stringify(message).length * 2;
		const h = fixture({ maximumBufferedBytes: maximumMessageBytes * 2, maximumMessageBytes });
		h.delivery.accept(message, maximumMessageBytes);
		const oversized = notification('allowed!');
		h.delivery.accept(oversized, JSON.stringify(oversized).length * 2);
		assert.deepStrictEqual({ received: h.received, sent: h.sent, errors: h.errors.map(error => ({ message: error.message, code: error instanceof AgentHostChannelError ? error.code : undefined })) }, {
			received: [message], sent: [], errors: [{ message: 'Channel consumer capacity exceeded', code: AgentHostChannelErrorCode.MessageLimitExceeded }],
		});
	});
});
