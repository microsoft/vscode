/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubRequestContext, GitHubRequestError } from '../../common/githubTypes.js';
import { GitHubRequestQueue } from '../../common/githubRequestQueue.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

function context(overrides: Partial<GitHubRequestContext> = {}): GitHubRequestContext {
	return {
		kind: 'rest',
		account: { host: 'github.example.test', accountId: '1' },
		caller: 'first',
		resource: 'core',
		priority: 'interactive',
		deadline: 60_000,
		signal: new AbortController().signal,
		...overrides,
	};
}

suite('GitHubRequestQueue', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('prioritizes interactive work and fairly serves callers at the same priority', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler));
		const release = new DeferredPromise<void>();
		const order: string[] = [];
		const first = queue.enqueue(context(), async () => {
			order.push('first');
			await release.p;
		});
		const background = queue.enqueue(context({ priority: 'background' }), async () => { order.push('background'); });
		const firstAgain = queue.enqueue(context(), async () => { order.push('first again'); });
		const second = queue.enqueue(context({ caller: 'second' }), async () => { order.push('second'); });
		const secondAgain = queue.enqueue(context({ caller: 'second' }), async () => { order.push('second again'); });
		await release.complete();
		await Promise.all([first, background, firstAgain, second, secondAgain]);
		assert.deepStrictEqual({ order, timers: scheduler.pendingCount }, {
			order: ['first', 'second', 'first again', 'second again', 'background'],
			timers: 0,
		});
	});

	test('counts parked requests and reserves admission for interactive work', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler,
			request => request.account.accountId === '1' ? Math.max(0, 1_000 - scheduler.now()) : 0,
			{ maximumRequests: 4, maximumAccountRequests: 4, maximumCallerRequests: 4, reservedInteractiveRequests: 1 }));
		let dispatched = 0;
		const parked = Array.from({ length: 3 }, () => queue.enqueue(context({ priority: 'background' }), async () => { dispatched++; }));
		const completed = Promise.allSettled(parked);
		await assert.rejects(queue.enqueue(context({ priority: 'background' }), async () => { dispatched++; }), { kind: 'overloaded' });
		await queue.enqueue(context({ account: { host: 'github.example.test', accountId: '2' } }), async () => { dispatched++; });
		const beforeReset = dispatched;
		scheduler.advanceBy(1_000);
		await completed;
		assert.deepStrictEqual({ beforeReset, dispatched, timers: scheduler.pendingCount }, {
			beforeReset: 1, dispatched: 4, timers: 0,
		});
	});

	test('wakes parked work when its cooldown expires between drain scans', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		let samples = 0;
		const queue = store.add(new GitHubRequestQueue(scheduler, () => {
			const remaining = Math.max(0, 1 - scheduler.now());
			if (samples++ === 0) {
				scheduler.advanceWallClockBy(1);
			}
			return remaining;
		}));
		let dispatched = false;
		const result = queue.enqueue(context({ deadline: 100 }), async () => {
			dispatched = true;
			return 'completed';
		}).catch(error => error instanceof GitHubRequestError ? error.kind : 'unexpected');
		const wakeDelay = scheduler.nextDueTime! - scheduler.now();
		scheduler.advanceBy(1);
		await new Promise(resolve => setTimeout(resolve, 0));
		const dispatchedBeforeDeadline = dispatched;
		scheduler.advanceBy(100);
		assert.deepStrictEqual({ wakeDelay, dispatchedBeforeDeadline, result: await result, timers: scheduler.pendingCount }, {
			wakeDelay: 1, dispatchedBeforeDeadline: true, result: 'completed', timers: 0,
		});
	});

	test('bounds retained requests independently by account and caller', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler, () => 1_000, {
			maximumAccountRequests: 2, maximumCallerRequests: 2, reservedInteractiveRequests: 0,
		}));
		const first = queue.enqueue(context(), async () => { });
		const second = queue.enqueue(context({ caller: 'second' }), async () => { });
		const other = queue.enqueue(context({ account: { host: 'other.example.test', accountId: '2' } }), async () => { });
		const completed = Promise.allSettled([first, second, other]);
		const errors: string[] = [];
		for (const request of [
			context({ caller: 'third' }),
			context({ account: { host: 'third.example.test', accountId: '3' } }),
		]) {
			await assert.rejects(queue.enqueue(request, async () => { }), error => {
				if (!(error instanceof GitHubRequestError)) {
					return false;
				}
				errors.push(error.kind);
				return error.kind === 'overloaded';
			});
		}
		queue.clear();
		await completed;
		assert.deepStrictEqual({ errors, timers: scheduler.pendingCount }, { errors: ['overloaded', 'overloaded'], timers: 0 });
	});

	test('limits active requests per caller without blocking other callers', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler, undefined, {
			maximumConcurrency: 3, maximumHostConcurrency: 3, maximumCallerConcurrency: 1,
		}));
		const release = new DeferredPromise<void>();
		const order: string[] = [];
		const first = queue.enqueue(context(), async () => { order.push('first'); await release.p; });
		const second = queue.enqueue(context({ account: { host: 'github.example.test', accountId: '2' } }), async () => { order.push('second'); });
		await queue.enqueue(context({ caller: 'other', account: { host: 'github.example.test', accountId: '3' } }), async () => { order.push('other'); });
		const beforeRelease = [...order];
		await release.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({ beforeRelease, order }, {
			beforeRelease: ['first', 'other'], order: ['first', 'other', 'second'],
		});
	});

	test('enforces global and case-insensitive host concurrency limits', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler, undefined, {
			maximumConcurrency: 2, maximumHostConcurrency: 1,
		}));
		const release = new DeferredPromise<void>();
		const firstBatch = new DeferredPromise<void>();
		const started: number[] = [];
		const activeByHost = new Map<string, number>();
		let active = 0;
		let maximumActive = 0;
		let maximumHostActive = 0;
		const requests = [
			{ host: 'GITHUB.EXAMPLE.TEST', accountId: '1' },
			{ host: 'github.example.test', accountId: '2' },
			{ host: 'other.example.test', accountId: '1' },
			{ host: 'third.example.test', accountId: '1' },
		].map((account, index) => queue.enqueue(context({ account, caller: `caller-${index}` }), async () => {
			const host = account.host.toLowerCase();
			const hostActive = (activeByHost.get(host) ?? 0) + 1;
			activeByHost.set(host, hostActive);
			maximumActive = Math.max(maximumActive, ++active);
			maximumHostActive = Math.max(maximumHostActive, hostActive);
			started.push(index);
			if (started.length === 2) {
				await firstBatch.complete();
			}
			await release.p;
			active--;
			activeByHost.set(host, hostActive - 1);
		}));
		await firstBatch.p;
		const beforeRelease = [...started];
		await release.complete();
		await Promise.all(requests);
		assert.deepStrictEqual({ beforeRelease, maximumActive, maximumHostActive, completed: started.length, timers: scheduler.pendingCount }, {
			beforeRelease: [0, 2], maximumActive: 2, maximumHostActive: 1, completed: 4, timers: 0,
		});
	});

	test('expires queued requests without running them', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler));
		const release = new DeferredPromise<void>();
		const active = queue.enqueue(context(), () => release.p);
		let dispatched = false;
		const queued = queue.enqueue(context({ deadline: 10 }), async () => { dispatched = true; });
		const rejected = assert.rejects(queued, { kind: 'timeout' });
		scheduler.advanceBy(10);
		await rejected;
		await release.complete();
		await active;
		assert.deepStrictEqual({ dispatched, timers: scheduler.pendingCount }, { dispatched: false, timers: 0 });
	});

	test('rejects expired queued work after a wall-clock jump without waiting for timers', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler));
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const active = queue.enqueue(context(), async () => {
			await started.complete();
			await release.p;
		});
		await started.p;
		let ran = false;
		let outcome: string | undefined;
		const expired = queue.enqueue(context({ deadline: 100 }), async () => { ran = true; });
		const settled = expired.then(
			() => { outcome = 'success'; },
			error => { outcome = error instanceof GitHubRequestError ? error.kind : 'unexpected'; },
		);
		scheduler.advanceWallClockBy(1_000);
		await release.complete();
		await active;
		await Promise.resolve();
		assert.deepStrictEqual({ ran, outcome, timers: scheduler.pendingCount }, {
			ran: false, outcome: 'timeout', timers: 0,
		});
		await settled;
	});

	test('reclaims expired parked admission before rejecting a fresh request', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler, () => Math.max(0, 500 - scheduler.now()), {
			maximumRequests: 1, reservedInteractiveRequests: 0,
		}));
		const dispatched: string[] = [];
		const expired = queue.enqueue(context({ deadline: 100 }), async () => { dispatched.push('expired'); });
		const outcome = expired.then(() => 'success', error => error instanceof GitHubRequestError ? error.kind : 'unexpected');
		scheduler.advanceWallClockBy(1_000);
		await queue.enqueue(context({ deadline: 2_000 }), async () => { dispatched.push('fresh'); });
		assert.deepStrictEqual({ outcome: await outcome, dispatched, timers: scheduler.pendingCount }, {
			outcome: 'timeout', dispatched: ['fresh'], timers: 0,
		});
	});

	test('aborts active requests at their deadline and releases capacity', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler));
		const started = new DeferredPromise<AbortSignal>();
		const release = new DeferredPromise<void>();
		const active = queue.enqueue(context({ deadline: 10 }), async signal => {
			await started.complete(signal);
			await release.p;
		});
		const rejected = assert.rejects(active, { kind: 'timeout' });
		const signal = await started.p;
		scheduler.advanceBy(10);
		await rejected;
		const value = await queue.enqueue(context(), async () => 'next');
		await release.complete();
		assert.deepStrictEqual({ aborted: signal.aborted, value, timers: scheduler.pendingCount }, {
			aborted: true, value: 'next', timers: 0,
		});
	});

	test('cancels parked work and disposes active and pending work', async () => {
		const scheduler = store.add(new FakeGitHubScheduler());
		const queue = store.add(new GitHubRequestQueue(scheduler, request => request.resource === 'search' ? 1_000 : 0));
		const controller = new AbortController();
		let parkedRan = false;
		const parked = queue.enqueue(context({ resource: 'search', signal: controller.signal }), async () => { parkedRan = true; });
		const reason = new Error('cancelled');
		const rejected = assert.rejects(parked, error => error === reason);
		controller.abort(reason);
		await rejected;
		const started = new DeferredPromise<AbortSignal>();
		const release = new DeferredPromise<void>();
		const active = queue.enqueue(context(), async signal => { await started.complete(signal); await release.p; });
		const pending = queue.enqueue(context(), async () => { parkedRan = true; });
		const completed = Promise.allSettled([active, pending]);
		const signal = await started.p;
		queue.dispose();
		await completed;
		await release.complete();
		scheduler.advanceBy(100_000);
		await assert.rejects(queue.enqueue(context(), async () => { }), /disposed/);
		assert.deepStrictEqual({ parkedRan, aborted: signal.aborted, timers: scheduler.pendingCount }, {
			parkedRan: false, aborted: true, timers: 0,
		});
	});
});
