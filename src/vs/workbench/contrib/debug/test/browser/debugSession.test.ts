/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createMockDebugModel } from './mockDebugModel.js';
import { createTestSession } from './callStack.test.js';
import { DebugSession, ThreadStatusScheduler } from '../../browser/debugSession.js';
import { RawDebugSession } from '../../browser/rawDebugSession.js';
import { IRawStoppedDetails } from '../../common/debug.js';


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

suite('DebugSession - stopped details', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	interface TestRawSession {
		readonly session: DebugSession;
		fireStopped(body: IRawStoppedDetails): void;
		fireContinued(threadId: number): void;
	}

	function createSessionWithRaw(): TestRawSession {
		const model = ds.add(createMockDebugModel(ds));
		const onDidStop = ds.add(new Emitter<DebugProtocol.StoppedEvent>());
		const onDidContinued = ds.add(new Emitter<DebugProtocol.ContinuedEvent>());
		const noEvent = () => Disposable.None;
		const raw = {
			onDidInitialize: noEvent,
			onDidStop: onDidStop.event,
			onDidThread: noEvent,
			onDidTerminateDebugee: noEvent,
			onDidContinued: onDidContinued.event,
			onDidOutput: noEvent,
			onDidBreakpoint: noEvent,
			onDidLoadedSource: noEvent,
			onDidCustomEvent: noEvent,
			onDidProgressStart: noEvent,
			onDidProgressUpdate: noEvent,
			onDidProgressEnd: noEvent,
			onDidInvalidated: noEvent,
			onDidInvalidateMemory: noEvent,
			onDidExitAdapter: noEvent,
			capabilities: {},
			threads: async () => ({ seq: 1, type: 'response' as const, request_seq: 1, success: true, command: 'threads', body: { threads: [] } })
		};
		const session = createTestSession(model);
		ds.add(session);
		session.initializeForTest(raw as unknown as RawDebugSession);
		return {
			session,
			fireStopped: body => onDidStop.fire({ seq: 1, type: 'event', event: 'stopped', body } as DebugProtocol.StoppedEvent),
			fireContinued: threadId => onDidContinued.fire({ seq: 1, type: 'event', event: 'continued', body: { threadId, allThreadsContinued: false } } as DebugProtocol.ContinuedEvent)
		};
	}

	async function flushAsync(): Promise<void> {
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	function getStoppedDetails(session: DebugSession): IRawStoppedDetails[] {
		return (session as unknown as { stoppedDetails: IRawStoppedDetails[] }).stoppedDetails;
	}

	test('a continued event does not remove a stop reported after it arrived (#339076)', async () => {
		const { session, fireStopped, fireContinued } = createSessionWithRaw();

		// 1. the session stops initially
		fireStopped({ reason: 'stopped', threadId: 2 });
		// 2. the user resumes; the adapter reports the continued event for the
		//    earlier stop, whose asynchronous cleanup has not run yet
		fireContinued(2);
		// 3. while the cleanup is pending the session stops again, this time on a breakpoint
		fireStopped({ reason: 'breakpoint', threadId: 2 });

		await flushAsync();

		const details = getStoppedDetails(session);
		assert.strictEqual(details.length, 1);
		assert.strictEqual(details[0].reason, 'breakpoint');
		assert.strictEqual(session.getStoppedDetails()?.reason, 'breakpoint');
	});

	test('a continued event still removes earlier stops on the thread', async () => {
		const { session, fireStopped, fireContinued } = createSessionWithRaw();

		fireStopped({ reason: 'stopped', threadId: 2 });
		await flushAsync();
		fireContinued(2);
		await flushAsync();

		assert.deepStrictEqual(getStoppedDetails(session), []);
		assert.strictEqual(session.getStoppedDetails(), undefined);
	});

	test('a continued event does not remove stops on other threads', async () => {
		const { session, fireStopped, fireContinued } = createSessionWithRaw();

		fireStopped({ reason: 'breakpoint', threadId: 2 });
		fireStopped({ reason: 'pause', threadId: 3 });
		fireContinued(2);
		await flushAsync();

		const details = getStoppedDetails(session);
		assert.strictEqual(details.length, 1);
		assert.strictEqual(details[0].threadId, 3);
	});
});
