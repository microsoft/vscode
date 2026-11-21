/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OperationWaiters } from '../../common/operationWaiters.js';
import { systemRequestScheduler } from '../../common/scheduler.js';
import { RequestRateLimitError, RequestTimeoutError } from '../../common/types.js';


suite('Operation waiters', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('cancelling one caller removes only its waiter', async () => {
		const waiters = new OperationWaiters<string>();
		const first = new CancellationTokenSource();
		const peer = new CancellationTokenSource();
		const deadline = Date.now() + 1000;
		const rejected = assert.rejects(waiters.wait(first.token, deadline, systemRequestScheduler, () => new RequestTimeoutError()), isCancellationError);
		const result = waiters.wait(peer.token, deadline, systemRequestScheduler, () => new RequestTimeoutError());
		first.cancel();
		await rejected;
		assert.strictEqual(waiters.size, 1);
		waiters.resolve('result');
		assert.deepStrictEqual({ result: await result, size: waiters.size, peerCancelled: peer.token.isCancellationRequested }, {
			result: 'result', size: 0, peerCancelled: false,
		});
	});

	test('cooldown rejection preserves a caller that can wait longer', () => runWithFakedTimers({}, async () => {
		const waiters = new OperationWaiters<number>();
		const cancellationToken = CancellationToken.None;
		const start = Date.now();
		const cooldown = { error: (delay: number) => new RequestRateLimitError(delay) };
		const short = assert.rejects(waiters.wait(cancellationToken, start + 50, systemRequestScheduler, () => new RequestTimeoutError(), cooldown), { kind: 'rateLimit', retryAfterMs: 100 });
		const long = waiters.wait(cancellationToken, start + 200, systemRequestScheduler, () => new RequestTimeoutError(), cooldown);
		waiters.setBlockedUntil(start + 100);
		await short;
		assert.strictEqual(waiters.size, 1);
		await timeout(100);
		waiters.resolve(42);
		assert.strictEqual(await long, 42);
	}));

	test('a joining caller observes an already known cooldown', async () => {
		const waiters = new OperationWaiters<void>();
		const now = Date.now();
		waiters.setBlockedUntil(now + 60_000);
		const observed: number[] = [];
		await assert.rejects(waiters.wait(CancellationToken.None, now + 100, systemRequestScheduler, () => new RequestTimeoutError(), {
			error: delay => new RequestRateLimitError(delay),
			onBlockedUntil: time => observed.push(time),
		}), { kind: 'rateLimit', statusCode: 429 });
		assert.deepStrictEqual({ observed, size: waiters.size }, { observed: [now + 60_000], size: 0 });
	});

	test('timeout and owner failure release all waiter state', () => runWithFakedTimers({}, async () => {
		const waiters = new OperationWaiters<void>();
		const cancellationToken = CancellationToken.None;
		const now = Date.now();
		const expired = assert.rejects(waiters.wait(cancellationToken, now + 10, systemRequestScheduler, () => new RequestTimeoutError()), { kind: 'timeout' });
		const reason = new Error('Owner failed');
		const failed = assert.rejects(waiters.wait(cancellationToken, now + 100, systemRequestScheduler, () => new RequestTimeoutError()), error => error === reason);
		await timeout(10);
		await expired;
		assert.strictEqual(waiters.size, 1);
		waiters.reject(reason);
		await failed;
		assert.strictEqual(waiters.size, 0);
	}));
});
