/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DebugSession, ThreadStatusScheduler, stoppedOnBreakpointOrException } from '../../browser/debugSession.js';
import { RawDebugSession } from '../../browser/rawDebugSession.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel } from './mockDebugModel.js';


suite('DebugSession - ThreadStatusScheduler', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancel base case', async () => {
		const scheduler = ds.add(new ThreadStatusScheduler());

		await scheduler.run(Promise.resolve([1]), async (threadId, token) => {
			assert.strictEqual(threadId, 1);
			assert.strictEqual(token.isCancellationRequested, false);
			scheduler.cancel([1]);
			assert.strictEqual(token.isCancellationRequested, true);
		});
	});

	test('cancel global', async () => {
		const scheduler = ds.add(new ThreadStatusScheduler());

		await scheduler.run(Promise.resolve([1]), async (threadId, token) => {
			assert.strictEqual(threadId, 1);
			assert.strictEqual(token.isCancellationRequested, false);
			scheduler.cancel(undefined);
			assert.strictEqual(token.isCancellationRequested, true);
		});
	});

	test('cancels when new work comes in', async () => {
		const scheduler = ds.add(new ThreadStatusScheduler());
		let innerCalled = false;

		await scheduler.run(Promise.resolve([1]), async (threadId, token1) => {
			assert.strictEqual(threadId, 1);
			assert.strictEqual(token1.isCancellationRequested, false);
			await scheduler.run(Promise.resolve([1]), async (_threadId, token2) => {
				innerCalled = true;
				assert.strictEqual(token1.isCancellationRequested, true);
				assert.strictEqual(token2.isCancellationRequested, false);
			});
		});

		assert.strictEqual(innerCalled, true);
	});

	test('cancels slower lookups when new lookup is made', async () => {
		const scheduler = ds.add(new ThreadStatusScheduler());
		const innerCalled1: number[] = [];
		const innerCalled2: number[] = [];

		await Promise.all([
			scheduler.run(Promise.resolve().then(() => { }).then(() => [1, 3]), async threadId => {
				innerCalled1.push(threadId);
			}),
			scheduler.run(Promise.resolve([1, 2]), async threadId => {
				innerCalled2.push(threadId);
			})
		]);

		assert.deepEqual(innerCalled1, [3]);
		assert.deepEqual(innerCalled2, [1, 2]);
	});

	test('allows work with other IDs', async () => {
		const scheduler = ds.add(new ThreadStatusScheduler());
		let innerCalled = false;

		await scheduler.run(Promise.resolve([1]), async (threadId, token1) => {
			assert.strictEqual(threadId, 1);
			assert.strictEqual(token1.isCancellationRequested, false);
			await scheduler.run(Promise.resolve([2]), async (_threadId, token2) => {
				innerCalled = true;
				assert.strictEqual(token1.isCancellationRequested, false);
				assert.strictEqual(token2.isCancellationRequested, false);
			});
		});

		assert.strictEqual(innerCalled, true);
	});

	test('cancels when called during reslution', async () => {
		const scheduler = ds.add(new ThreadStatusScheduler());
		let innerCalled = false;

		await scheduler.run(Promise.resolve().then(() => scheduler.cancel([1])).then(() => [1]), async () => {
			innerCalled = true;
		});

		assert.strictEqual(innerCalled, false);
	});

	test('global cancels when called during reslution', async () => {
		const scheduler = ds.add(new ThreadStatusScheduler());
		let innerCalled = false;

		await scheduler.run(Promise.resolve().then(() => scheduler.cancel(undefined)).then(() => [1]), async () => {
			innerCalled = true;
		});

		assert.strictEqual(innerCalled, false);
	});
});

suite('stoppedOnBreakpointOrException', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns true for breakpoint and exception reasons', () => {
		assert.deepStrictEqual(
			['breakpoint', 'function breakpoint', 'data breakpoint', 'instruction breakpoint', 'exception']
				.map(r => stoppedOnBreakpointOrException(r)),
			[true, true, true, true, true]
		);
	});

	test('returns false for non-breakpoint reasons', () => {
		assert.deepStrictEqual(
			['step', 'pause', 'goto', 'entry', undefined].map(r => stoppedOnBreakpointOrException(r)),
			[false, false, false, false, false]
		);
	});
});

suite('DebugSession - steppingThreadIds', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(): { session: DebugSession; fireContinued: (threadId: number) => void } {
		const model = createMockDebugModel(ds);
		const session = ds.add(createTestSession(model));

		// Use direct Emitters to avoid AbstractDebugAdapter.processQueue's timeout(0) calls
		// which create CancellationToken disposables that interfere with leak tracking.
		const onDidContinuedEmitter = ds.add(new Emitter<any>());
		const mockRaw = {
			onDidInitialize: Event.None,
			onDidStop: Event.None,
			onDidThread: Event.None,
			onDidTerminateDebugee: Event.None,
			onDidContinued: onDidContinuedEmitter.event,
			onDidOutput: Event.None,
			onDidBreakpoint: Event.None,
			onDidLoadedSource: Event.None,
			onDidCustomEvent: Event.None,
			onDidProgressStart: Event.None,
			onDidProgressUpdate: Event.None,
			onDidProgressEnd: Event.None,
			onDidInvalidateMemory: Event.None,
			onDidInvalidated: Event.None,
			onDidExitAdapter: Event.None,
			// eslint-disable-next-line local/code-no-any-casts
			next: (_args: any) => Promise.resolve({} as any),
			// eslint-disable-next-line local/code-no-any-casts
			threads: () => Promise.resolve({ seq: 0, type: 'response' as const, request_seq: 0, command: 'threads', success: true, body: { threads: [] } } as any),
			capabilities: {},
		} as unknown as RawDebugSession;

		session.initializeForTest(mockRaw);

		return {
			session,
			fireContinued: (threadId: number) => onDidContinuedEmitter.fire({ seq: 0, type: 'event', event: 'continued', body: { threadId, allThreadsContinued: false } }),
		};
	}

	test('step commands add thread id to steppingThreadIds', async () => {
		const { session } = setup();

		await session.next(1);

		// steppingThreadIds retains the id until the next stopped event clears it
		// eslint-disable-next-line local/code-no-any-casts
		assert.strictEqual((session as any).steppingThreadIds.has(1), true);
	});

	test('continued event while stepping suppresses passFocusScheduler', async () => {
		const { session, fireContinued } = setup();

		// Simulate a step being in progress for thread 1
		// eslint-disable-next-line local/code-no-any-casts
		(session as any).steppingThreadIds.add(1);

		const stateChanged = Event.toPromise(session.onDidChangeState);
		fireContinued(1);
		await stateChanged;

		// eslint-disable-next-line local/code-no-any-casts
		assert.strictEqual((session as any).passFocusScheduler.isScheduled(), false);
	});

	test('continued event without stepping schedules passFocusScheduler', async () => {
		const { session, fireContinued } = setup();

		// Thread 1 is NOT in steppingThreadIds (plain continue, not a step)
		const stateChanged = Event.toPromise(session.onDidChangeState);
		fireContinued(1);
		await stateChanged;

		// eslint-disable-next-line local/code-no-any-casts
		assert.strictEqual((session as any).passFocusScheduler.isScheduled(), true);
	});
});
