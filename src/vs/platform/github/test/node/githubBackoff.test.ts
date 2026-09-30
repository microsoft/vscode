/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubBackoffGate, GitHubBackoffPolicy } from '../../common/githubBackoff.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

const policy: GitHubBackoffPolicy = { immediateRetries: 0, base: 10, maximum: 40, jitter: 0, decay: 100 };

suite('GitHubBackoffGate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const scheduler = store.add(new FakeGitHubScheduler());
		const gate = store.add(new GitHubBackoffGate('test', policy, scheduler));
		return { scheduler, gate };
	}

	test('reset releases all waiters and forgets consecutive failures', async () => {
		const { scheduler, gate } = setup();
		const signal = new AbortController().signal;
		gate.fail('subject');
		gate.fail('subject');
		const waiting = [gate.wait('subject', signal), gate.wait('subject', signal)];
		gate.reset();
		const released = await Promise.all(waiting);
		const ready = await gate.wait('subject', signal);
		gate.fail('subject');
		const retry = gate.wait('subject', signal);
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
			const controller = new AbortController();
			const reason = new Error('cancelled');
			gate.fail('subject');
			const pending = gate.wait('subject', controller.signal);
			const rejected = assert.rejects(pending, error => stop === 'cancel'
				? error === reason : error instanceof Error && error.message.includes('disposed'));
			if (stop === 'cancel') {
				controller.abort(reason);
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
		const signal = new AbortController().signal;
		const delays: (number | undefined)[] = [];
		for (let attempt = 0; attempt < 5; attempt++) {
			if (attempt === 4) {
				scheduler.advanceBy(101);
			}
			gate.fail('subject');
			const pending = gate.wait('subject', signal);
			const due = scheduler.nextDueTime;
			delays.push(due === undefined ? undefined : due - scheduler.now());
			scheduler.advanceBy(40);
			await pending;
		}
		assert.deepStrictEqual({ delays, timers: scheduler.pendingCount }, { delays: [10, 20, 40, 40, 10], timers: 0 });
	});

	test('server minimum delay overrides immediate retries and the computed backoff ceiling', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const gate = store.add(new GitHubBackoffGate('test', { ...policy, immediateRetries: 1 }, scheduler));
		gate.fail('subject', 120_000);
		let released = false;
		const pending = gate.wait('subject', new AbortController().signal).then(() => { released = true; });
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
		const waiting = gate.wait('subject', new AbortController().signal);
		scheduler.advanceBy(5);
		gate.fail('subject');
		await Promise.resolve();
		const due = scheduler.nextDueTime;
		scheduler.advanceBy(20);
		const waited = await waiting;
		assert.deepStrictEqual({ due, waited, timers: scheduler.pendingCount }, { due: 25, waited: true, timers: 0 });
	});
});
