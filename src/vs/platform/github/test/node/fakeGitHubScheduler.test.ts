/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { schedulerDelay } from '../../common/githubScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

suite('FakeGitHubScheduler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('runs due callbacks in time then insertion order', () => {
		const scheduler = new FakeGitHubScheduler({ now: 100 });
		const events: string[] = [];

		disposables.add(scheduler.schedule(() => events.push(`late@${scheduler.now()}`), 50));
		disposables.add(scheduler.schedule(() => {
			events.push(`first@${scheduler.now()}`);
			disposables.add(scheduler.schedule(() => events.push(`nested@${scheduler.now()}`), 0));
		}, 10));
		disposables.add(scheduler.schedule(() => events.push(`second@${scheduler.now()}`), 10));

		scheduler.advanceBy(9);
		assert.deepStrictEqual({ now: scheduler.now(), events }, { now: 109, events: [] });

		scheduler.advanceBy(1);
		assert.deepStrictEqual(events, ['first@110', 'second@110', 'nested@110']);

		scheduler.advanceTo(150);
		assert.deepStrictEqual({ now: scheduler.now(), events }, {
			now: 150,
			events: ['first@110', 'second@110', 'nested@110', 'late@150'],
		});
	});

	test('returns deterministic positive jitter', () => {
		const scheduler = new FakeGitHubScheduler({ jitterValues: [7, 0, 99] });

		assert.deepStrictEqual([
			scheduler.jitter(10),
			scheduler.jitter(10),
			scheduler.jitter(5),
			scheduler.jitter(3),
			scheduler.jitter(3),
			scheduler.jitter(0),
		], [7, 1, 5, 1, 2, 0]);
	});

	test('schedulerDelay resolves only after time advances and honors abort', async () => {
		const scheduler = new FakeGitHubScheduler({ now: 1_000 });
		const controller = new AbortController();
		let resolved = false;

		const delay = schedulerDelay(scheduler, 25, controller.signal).then(() => {
			resolved = true;
		});

		scheduler.advanceBy(24);
		await Promise.resolve();
		assert.strictEqual(resolved, false);

		scheduler.advanceBy(1);
		await delay;
		assert.strictEqual(resolved, true);

		const aborted = new AbortController();
		const abortedDelay = schedulerDelay(scheduler, 10, aborted.signal);
		aborted.abort(new Error('stop'));
		await assert.rejects(() => abortedDelay, /stop/);
	});
});
