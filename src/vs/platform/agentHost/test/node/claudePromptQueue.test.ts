/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
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
	readonly steeringYielded: string[];
}

function createQueue(disposables: Pick<DisposableStore, 'add'>): IQueueHarness {
	const steeringYielded: string[] = [];
	const services = new ServiceCollection([ILogService, new NullLogService()]);
	const instantiationService = disposables.add(new InstantiationService(services));
	const queue = disposables.add(instantiationService.createInstance(ClaudePromptQueue, 'sess-1'));
	disposables.add(queue.onDidYieldSteering(id => steeringYielded.push(id)));
	return { queue, steeringYielded };
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

	test('notifyAborted latches the iterable to done on the next next()', async () => {
		const { queue } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		queue.notifyAborted();
		const r = await iter.next();
		assert.strictEqual(r.done, true);
	});

	test('notifyAborted wakes a parked next() so it returns done', async () => {
		const { queue } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		// Park next() with no entries queued.
		const parked = iter.next();
		queue.notifyAborted();
		const r = await parked;
		assert.strictEqual(r.done, true);
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

	test('onDidYieldSteering fires when an entry with steeringPendingId is YIELDED, not when it is pushed', async () => {
		const { queue, steeringYielded } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		const e = makeEntry('s1', { steeringPendingId: 'pending-42' });
		void queue.push(e);
		assert.deepStrictEqual(steeringYielded, [], 'no fire on push');
		await drainOne(iter);
		assert.deepStrictEqual(steeringYielded, ['pending-42'], 'fires on yield');
	});

	test('non-steering entries do not fire onDidYieldSteering', async () => {
		const { queue, steeringYielded } = createQueue(disposables);
		const iter = queue.iterable[Symbol.asyncIterator]();
		void queue.push(makeEntry('plain'));
		await drainOne(iter);
		assert.deepStrictEqual(steeringYielded, []);
	});

	test('settleHead on an empty yielded list returns undefined and is a no-op', () => {
		const { queue } = createQueue(disposables);
		assert.strictEqual(queue.settleHead(), undefined);
		assert.strictEqual(queue.isEmpty, true);
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
