/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ClaudePromptQueue, IPendingSdkMessage } from '../../node/claude/claudePromptQueue.js';

interface IQueueHarness {
	readonly queue: ClaudePromptQueue;
	readonly controller: AbortController;
	readonly steeringYielded: string[];
}

function createQueue(disposables: Pick<DisposableStore, 'add'>): IQueueHarness {
	const controller = new AbortController();
	const steeringYielded: string[] = [];
	const services = new ServiceCollection([ILogService, new NullLogService()]);
	const instantiationService = disposables.add(new InstantiationService(services));
	const queue = disposables.add(instantiationService.createInstance(
		ClaudePromptQueue,
		'sess-1',
		controller.signal,
	));
	disposables.add(queue.onDidYieldSteering(id => steeringYielded.push(id)));
	return { queue, controller, steeringYielded };
}

function makeEntry(id: string, opts?: { steeringPendingId?: string; turnId?: string }): IPendingSdkMessage {
	const sdkMessage: SDKUserMessage = {
		type: 'user',
		uuid: makeUuid(id),
		parent_tool_use_id: null,
		message: { role: 'user', content: id },
	};
	return {
		sdkMessage,
		sdkUuid: id,
		turnId: opts?.turnId ?? 'turn-1',
		stopWatch: StopWatch.create(false),
		deferred: new DeferredPromise<void>(),
		steeringPendingId: opts?.steeringPendingId,
	};
}

/** Build a SDK-shaped UUID from a short label so test ids stay readable. */
function makeUuid(label: string): `${string}-${string}-${string}-${string}-${string}` {
	const pad = (s: string, n: number) => s.padEnd(n, '0').slice(0, n);
	return `${pad(label, 8)}-0000-0000-0000-000000000000`;
}

async function drainOne(iter: AsyncIterator<SDKUserMessage>): Promise<SDKUserMessage | undefined> {
	const r = await iter.next();
	return r.done ? undefined : r.value;
}

suite('ClaudePromptQueue', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('push then iterable yields then settleHead resolves the deferred', async () => {
		const { queue } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		const e = makeEntry('a');
		const sendPromise = queue.push(e);
		const yielded = await drainOne(iter);
		assert.strictEqual(yielded?.uuid, makeUuid('a'));
		assert.strictEqual(e.deferred.isSettled, false, 'deferred unsettled until settleHead');
		const completed = queue.settleHead();
		assert.strictEqual(completed?.sdkUuid, 'a');
		await sendPromise;
		assert.strictEqual(e.deferred.isSettled, true);
		assert.strictEqual(queue.isEmpty, true);
	});

	test('intermediate settleHead while another entry is queued does NOT settle the popped entry — batches until full drain (M10 invariant)', async () => {
		const { queue } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();

		const a = makeEntry('a');
		const b = makeEntry('b');
		void queue.push(a);
		void queue.push(b);
		await drainOne(iter); // a yielded
		await drainOne(iter); // b yielded

		// First result drains 'a' but 'b' is still in flight → 'a' deferred MUST stay open
		queue.settleHead();
		assert.strictEqual(a.deferred.isSettled, false, 'a stays open while b in flight');
		assert.strictEqual(b.deferred.isSettled, false);

		// Second result drains 'b' → queue fully drains → BOTH deferreds settle in batch
		queue.settleHead();
		assert.strictEqual(a.deferred.isSettled, true, 'a batch-completes on full drain');
		assert.strictEqual(b.deferred.isSettled, true);
		assert.strictEqual(queue.isEmpty, true);
	});

	test('failAll rejects every pending, yielded, and popped entry and clears all lists', async () => {
		const { queue } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();

		const yielded = makeEntry('yielded');
		const popped = makeEntry('popped');
		const queued = makeEntry('queued');

		const yieldedPromise = queue.push(yielded);
		const poppedPromise = queue.push(popped);
		await drainOne(iter); // yielded → _yielded
		await drainOne(iter); // popped → _yielded
		queue.settleHead(); // pops 'yielded' into _popped (queue not empty: 'popped' still in _yielded)

		const queuedPromise = queue.push(queued);

		const fatal = new Error('boom');
		queue.failAll(fatal);

		await Promise.all([
			yieldedPromise.then(() => assert.fail('yielded should reject'), e => assert.strictEqual(e, fatal)),
			poppedPromise.then(() => assert.fail('popped should reject'), e => assert.strictEqual(e, fatal)),
			queuedPromise.then(() => assert.fail('queued should reject'), e => assert.strictEqual(e, fatal)),
		]);
		assert.strictEqual(queue.isEmpty, true);
	});

	test('aborted signal makes the iterable return done on the next next()', async () => {
		const { queue, controller } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		controller.abort();
		const r = await iter.next();
		assert.strictEqual(r.done, true);
	});

	test('aborting the bound signal wakes a parked next()', async () => {
		const { queue, controller } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		// Park next() with no entries queued.
		const parked = iter.next();
		// Abort + wake.
		controller.abort();
		const r = await parked;
		assert.strictEqual(r.done, true);
	});

	test('rebinding removes the old listener and observes the replacement signal', async () => {
		const { queue, controller } = createQueue(disposables);
		const replacement = new AbortController();
		const oldRemoved = sinon.spy(controller.signal, 'removeEventListener');
		const newAdded = sinon.spy(replacement.signal, 'addEventListener');
		const newRemoved = sinon.spy(replacement.signal, 'removeEventListener');
		queue.bindAbortSignal(replacement.signal);
		const iterator = queue.iterable[Symbol.asyncIterator]();
		const parked = iterator.next();
		controller.abort();
		const sent = queue.push(makeEntry('replacement'));
		const yielded = await parked;
		queue.settleHead();
		await sent;
		const next = iterator.next();
		replacement.abort();
		assert.deepStrictEqual({
			yielded: yielded.value?.uuid,
			done: (await next).done,
			listeners: { oldRemoved: oldRemoved.callCount, newAdded: newAdded.callCount, newRemoved: newRemoved.callCount },
		}, {
			yielded: makeUuid('replacement'),
			done: true,
			listeners: { oldRemoved: 1, newAdded: 1, newRemoved: 1 },
		});
	});

	for (const parked of [false, true]) {
		test(`rebind prevents a ${parked ? 'parked' : 'not-yet-started'} iterator from consuming the replacement prompt`, async () => {
			const { queue, controller, steeringYielded } = createQueue(disposables);
			const originalIterator = queue.iterable[Symbol.asyncIterator]();
			const originalRead = parked ? originalIterator.next() : undefined;
			const replacement = new AbortController();
			queue.bindAbortSignal(replacement.signal);
			queue.resetForRebind();
			const oldRead = originalRead ?? originalIterator.next();
			const newRead = queue.iterable[Symbol.asyncIterator]().next();
			const yielded = new DeferredPromise<void>();
			disposables.add(queue.onDidYieldSteering(() => yielded.complete()));
			const sent = queue.push(makeEntry('replacement', { steeringPendingId: 'pending-rebind' }));
			await yielded.p;
			queue.settleHead();
			await sent;
			replacement.abort();
			const [oldResult, newResult] = await Promise.all([oldRead, newRead]);
			assert.deepStrictEqual({
				old: { done: oldResult.done, uuid: oldResult.value?.uuid },
				replacement: { done: newResult.done, uuid: newResult.value?.uuid },
				originalAborted: controller.signal.aborted,
				steeringYielded,
			}, {
				old: { done: true, uuid: undefined },
				replacement: { done: false, uuid: makeUuid('replacement') },
				originalAborted: false,
				steeringYielded: ['pending-rebind'],
			});
		});
	}

	test('rebinding retires a parked iterator without waiting for reset or abort', async () => {
		const { queue, controller } = createQueue(disposables);
		const originalRead = queue.iterable[Symbol.asyncIterator]().next();
		queue.bindAbortSignal(new AbortController().signal);
		assert.deepStrictEqual({ done: (await originalRead).done, originalAborted: controller.signal.aborted }, {
			done: true,
			originalAborted: false,
		});
	});

	test('binding an already-aborted signal wakes a parked next() without registering a listener', async () => {
		const { queue } = createQueue(disposables);
		const parked = queue.iterable[Symbol.asyncIterator]().next();
		const replacement = new AbortController();
		replacement.abort();
		const added = sinon.spy(replacement.signal, 'addEventListener');
		queue.bindAbortSignal(replacement.signal);
		assert.deepStrictEqual({ done: (await parked).done, added: added.callCount }, { done: true, added: 0 });
	});

	test('dispose releases the current abort listener and a parked next()', async () => {
		const { queue, controller } = createQueue(disposables);
		const removed = sinon.spy(controller.signal, 'removeEventListener');
		const parked = queue.iterable[Symbol.asyncIterator]().next();
		queue.dispose();
		assert.deepStrictEqual({ done: (await parked).done, removed: removed.callCount }, { done: true, removed: 1 });
	});

	test('peekParent prefers the in-flight head over the latest queued entry (CONTEXT M10: steering inherits in-flight turnId)', async () => {
		const { queue } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();

		const inflight = makeEntry('inflight', { turnId: 'turn-A' });
		const queued = makeEntry('queued', { turnId: 'turn-B' });
		void queue.push(inflight);
		void queue.push(queued);
		await drainOne(iter); // inflight → _yielded; queued still in _toYield

		const parent = queue.peekParent();
		assert.strictEqual(parent?.turnId, 'turn-A', 'in-flight wins over queued');

		// Drain inflight; now only queued remains and peekParent falls back to it.
		queue.settleHead();
		assert.strictEqual(queue.peekParent()?.turnId, 'turn-B');
	});

	test('peekParent returns undefined on an empty queue', () => {
		const { queue } = createQueue(disposables);
		assert.strictEqual(queue.peekParent(), undefined);
	});

	test('steering event fires when an entry with steeringPendingId is YIELDED, not when it is pushed', async () => {
		const { queue, steeringYielded } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		const e = makeEntry('s1', { steeringPendingId: 'pending-42' });
		void queue.push(e);
		assert.deepStrictEqual(steeringYielded, [], 'no fire on push');
		await drainOne(iter);
		assert.deepStrictEqual(steeringYielded, ['pending-42'], 'fires on yield');
	});

	test('non-steering entries do not fire the steering event', async () => {
		const { queue, steeringYielded } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		void queue.push(makeEntry('plain'));
		await drainOne(iter);
		assert.deepStrictEqual(steeringYielded, []);
	});

	test('steering listeners observe the yielded entry and can settle it reentrantly', async () => {
		const { queue } = createQueue(disposables);
		const notifications: { id: string; parent: string | undefined; empty: boolean }[] = [];
		disposables.add(queue.onDidYieldSteering(id => {
			notifications.push({ id, parent: queue.peekParent()?.sdkUuid, empty: queue.isEmpty });
			queue.settleHead();
		}));
		const sent = queue.push(makeEntry('steering', { steeringPendingId: 'pending-1' }));
		const yielded = await drainOne(queue.iterable[Symbol.asyncIterator]());
		await sent;
		assert.deepStrictEqual({ notifications, yielded: yielded?.uuid, empty: queue.isEmpty }, {
			notifications: [{ id: 'pending-1', parent: 'steering', empty: false }],
			yielded: makeUuid('steering'),
			empty: true,
		});
	});

	test('a steering listener can unsubscribe during emission without affecting other subscribers', async () => {
		const { queue, steeringYielded } = createQueue(disposables);
		const notifications: string[] = [];
		const subscriptions = disposables.add(new DisposableStore());
		const listener = subscriptions.add(queue.onDidYieldSteering(id => {
			notifications.push(id);
			subscriptions.delete(listener);
		}));
		const iterator = queue.iterable[Symbol.asyncIterator]();
		for (const id of ['first', 'second']) {
			const sent = queue.push(makeEntry(id, { steeringPendingId: id }));
			await drainOne(iterator);
			queue.settleHead();
			await sent;
		}
		assert.deepStrictEqual({ notifications, steeringYielded }, {
			notifications: ['first'],
			steeringYielded: ['first', 'second'],
		});
	});

	test('settleHead on an empty yielded list returns undefined and is a no-op', () => {
		const { queue } = createQueue(disposables);
		assert.strictEqual(queue.settleHead(), undefined);
		assert.strictEqual(queue.isEmpty, true);
	});

	test('resetForRebind keeps both old and new parked next() calls reachable by abort', async () => {
		const { queue, controller } = createQueue(disposables);
		const original = queue.iterable[Symbol.asyncIterator]().next();
		queue.resetForRebind();
		const replacement = queue.iterable[Symbol.asyncIterator]().next();
		await Promise.resolve();
		controller.abort();
		assert.deepStrictEqual((await Promise.all([original, replacement])).map(result => result.done), [true, true]);
	});

	test('isEmpty is true after every pushed entry has been yielded and settled', async () => {
		const { queue } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		const a = makeEntry('a');
		const b = makeEntry('b');
		void queue.push(a);
		void queue.push(b);
		await drainOne(iter);
		await drainOne(iter);
		queue.settleHead();
		assert.strictEqual(queue.isEmpty, false, 'yielded list still has b');
		queue.settleHead();
		assert.strictEqual(queue.isEmpty, true);
	});
});
