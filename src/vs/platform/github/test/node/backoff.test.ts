/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BackoffGate, BackoffPolicy } from '../../common/backoff.js';
import { FakeScheduler } from './fakeScheduler.js';


const policy: BackoffPolicy = { immediateRetries: 0, base: 10, maximum: 40, jitter: 0, decay: 100 };

suite('BackoffGate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const scheduler = store.add(new FakeScheduler());
		const gate = store.add(new BackoffGate('test', policy, scheduler));
		return { scheduler, gate };
	}

	test('reset releases all waiters and forgets consecutive failures', async () => {
		const { scheduler, gate } = setup();
		const cancellationToken = CancellationToken.None;
		gate.fail('subject');
		gate.fail('subject');
		const waiting = [gate.wait('subject', cancellationToken), gate.wait('subject', cancellationToken)];
		gate.reset();
		const released = await Promise.all(waiting);
		const ready = await gate.wait('subject', cancellationToken);
		gate.fail('subject');
		const retry = gate.wait('subject', cancellationToken);
		const due = scheduler.nextDueTime;
		scheduler.advanceBy(10);
		await retry;
		assert.deepStrictEqual({ released, ready, due, timers: scheduler.pendingCount }, {
			released: [true, true], ready: false, due: 10, timers: 0,
		});
	});

	for (const stop of ['cancel', 'dispose'] as const) {
		test(`${stop} stops a blocked waiter without rearming`, async () => {
			const { scheduler, gate } = setup();
			const controller = store.add(new CancellationTokenSource());
			gate.fail('subject');
			const pending = gate.wait('subject', controller.token);
			const rejected = assert.rejects(pending, error => stop === 'cancel'
				? isCancellationError(error) : error instanceof Error && error.message.includes('disposed'));
			if (stop === 'cancel') {
				controller.cancel();
			} else {
				gate.dispose();
			}
			await rejected;
			scheduler.advanceBy(1_000);
			assert.strictEqual(scheduler.pendingCount, 0);
		});
	}

	test('caps consecutive delays and resets the streak after decay', async () => {
		const { scheduler, gate } = setup();
		const cancellationToken = CancellationToken.None;
		const delays: (number | undefined)[] = [];
		for (let attempt = 0; attempt < 5; attempt++) {
			if (attempt === 4) {
				scheduler.advanceBy(101);
			}
			gate.fail('subject');
			const pending = gate.wait('subject', cancellationToken);
			const due = scheduler.nextDueTime;
			delays.push(due === undefined ? undefined : due - scheduler.now());
			scheduler.advanceBy(40);
			await pending;
		}
		assert.deepStrictEqual({ delays, timers: scheduler.pendingCount }, { delays: [10, 20, 40, 40, 10], timers: 0 });
	});

	test('server minimum delay overrides immediate retries and the computed backoff ceiling', async () => {
		const scheduler = store.add(new FakeScheduler());
		const gate = store.add(new BackoffGate('test', { ...policy, immediateRetries: 1 }, scheduler));
		gate.fail('subject', 120_000);
		let released = false;
		const pending = gate.wait('subject', CancellationToken.None).then(() => { released = true; });
		scheduler.advanceBy(119_999);
		await Promise.resolve();
		const beforeDeadline = released;
		scheduler.advanceBy(1);
		await pending;
		assert.deepStrictEqual({ beforeDeadline, released, timers: scheduler.pendingCount }, {
			beforeDeadline: false, released: true, timers: 0,
		});
	});

	test('an additional failure extends an existing wait', async () => {
		const { scheduler, gate } = setup();
		gate.fail('subject');
		const waiting = gate.wait('subject', CancellationToken.None);
		scheduler.advanceBy(5);
		gate.fail('subject');
		await Promise.resolve();
		const due = scheduler.nextDueTime;
		scheduler.advanceBy(20);
		const waited = await waiting;
		assert.deepStrictEqual({ due, waited, timers: scheduler.pendingCount }, { due: 25, waited: true, timers: 0 });
	});
});
