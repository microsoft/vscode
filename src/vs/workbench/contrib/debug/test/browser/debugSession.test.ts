/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DebugSession, ThreadStatusScheduler } from '../../browser/debugSession.js';
import { RawDebugSession } from '../../browser/rawDebugSession.js';
import { MockDebugAdapter } from '../common/mockDebug.js';
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


suite('DebugSession - continued events', () => {
	let session: DebugSession | undefined;

	teardown(async () => {
		await session?.disconnect();
		session = undefined;
	});

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession() {
		const model = createMockDebugModel(ds);
		session = ds.add(createTestSession(model));
		model.addSession(session);
		const adapter = ds.add(new class extends MockDebugAdapter {
			override sendMessage(message: DebugProtocol.ProtocolMessage): void {
				if (message.type === 'request') {
					const request = message as DebugProtocol.Request;
					if (request.command === 'threads') {
						this.sendResponseBody(request, { threads: [{ id: 1, name: 'first' }, { id: 2, name: 'second' }] });
						return;
					}
					if (request.command === 'stackTrace') {
						this.sendResponseBody(request, { stackFrames: [], totalFrames: 0 });
						return;
					}
				}
				super.sendMessage(message);
			}
		});
		const raw = ds.add(new RawDebugSession(adapter, undefined!, '', '', undefined!, undefined!, undefined!, undefined!));
		session.initializeForTest(raw);
		return { session, adapter };
	}

	for (const allThreadsContinued of [false, true]) {
		test(`preserves a newer stop during ${allThreadsContinued ? 'all-thread' : 'single-thread'} continued cleanup`, async () => {
			const { session, adapter } = createSession();
			const initiallyStopped = Event.toPromise(session.onDidChangeState);
			adapter.sendEventBody('stopped', { reason: 'step', threadId: 1 });
			await initiallyStopped;
			assert.strictEqual(session.getStoppedDetails()?.reason, 'step');

			const stoppedAgain = Event.toPromise(Event.filter(session.onDidChangeState, () => session.getThread(1)?.stopped === true));
			// Adjacent adapter events are dispatched before continued cleanup resumes.
			adapter.sendEventBody('continued', { threadId: 1, allThreadsContinued });
			adapter.sendEventBody('stopped', { reason: 'breakpoint', threadId: 1 });
			await stoppedAgain;

			assert.deepStrictEqual(session.getStoppedDetails(), { reason: 'breakpoint', threadId: 1, totalFrames: 0 });
		});

		test(`clears an earlier stop on ${allThreadsContinued ? 'all-thread' : 'single-thread'} continuation`, async () => {
			const { session, adapter } = createSession();
			const stopped = Event.toPromise(session.onDidChangeState);
			adapter.sendEventBody('stopped', { reason: 'step', threadId: 1 });
			await stopped;

			const continued = Event.toPromise(session.onDidChangeState);
			adapter.sendEventBody('continued', { threadId: 1, allThreadsContinued });
			await continued;

			assert.strictEqual(session.getStoppedDetails(), undefined);
			assert.strictEqual(session.getThread(1)?.stopped, false);
		});
	}

	test('preserves a stopped thread when another thread continues', async () => {
		const { session, adapter } = createSession();
		const stopped = Event.toPromise(session.onDidChangeState);
		adapter.sendEventBody('stopped', { reason: 'breakpoint', threadId: 2 });
		await stopped;

		const continued = Event.toPromise(session.onDidChangeState);
		adapter.sendEventBody('continued', { threadId: 1, allThreadsContinued: false });
		await continued;

		assert.deepStrictEqual(session.getStoppedDetails(), { reason: 'breakpoint', threadId: 2, totalFrames: 0 });
		assert.strictEqual(session.getThread(2)?.stopped, true);
	});

	test('clears a stop without a thread ID when all threads continue', async () => {
		const { session, adapter } = createSession();
		const stopped = Event.toPromise(session.onDidChangeState);
		adapter.sendEventBody('stopped', { reason: 'pause', allThreadsStopped: true });
		await stopped;

		const continued = Event.toPromise(Event.filter(session.onDidChangeState, () => session.getAllThreads().every(thread => !thread.stopped)));
		adapter.sendEventBody('continued', { threadId: 1 });
		await continued;

		assert.strictEqual(session.getStoppedDetails(), undefined);
	});
});
